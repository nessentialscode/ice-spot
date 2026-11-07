-- ==============================================================================
-- Icespot — Forward Migration: Fix Delivery Stop Persistence and Quantities
-- File: supabase/migrations/20261029000002_fix_delivery_stop_persistence_and_quantities.sql
-- Target: icespot-dev Supabase project (Project Ref: punyeqlotfnvxhhugtud)
--
-- PURPOSE:
-- Hardens public.rpc_update_delivery_stop:
-- 1. Permits authenticated delivery staff to update route stops and claim
--    unassigned dispatch trips (delivery_staff_id IS NULL), matching
--    the semantics of rpc_update_dispatch_trip.
-- 2. Prevents runtime transaction aborts when delivered quantities reconcile
--    authoritative order items across newly introduced flavour lines or
--    when dispatch_items requires load-synchronization.
-- 3. Atomically updates public.dispatch_orders and synchronizes public.orders
--    terminal delivery status ('delivered' / 'partially_delivered').
-- 4. Enforces least-privilege execution grants and search_path pinning.
-- ==============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_update_delivery_stop(
    p_dispatch_id UUID,
    p_order_id UUID,
    p_status TEXT,
    p_notes TEXT,
    p_delivered_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role public.app_role;
    v_caller_active BOOLEAN;
    v_is_super_admin BOOLEAN := false;
    v_assigned_staff UUID;
    v_norm_status TEXT;
    v_item JSONB;
    v_prod_id UUID;
    v_del_qty NUMERIC;
    v_short_qty NUMERIC;
    v_disp_item RECORD;
    v_order_app_qty NUMERIC;
BEGIN
    -- 1. Identify caller profile and role
    SELECT role, is_active INTO v_caller_role, v_caller_active
    FROM public.profiles
    WHERE id = v_caller_id;

    IF v_caller_active IS NOT TRUE THEN
        RAISE EXCEPTION 'Unauthorized: Inactive user account';
    END IF;

    IF v_caller_role = 'super_admin'::public.app_role THEN
        v_is_super_admin := true;
    ELSIF v_caller_role != 'delivery_staff'::public.app_role THEN
        RAISE EXCEPTION 'Unauthorized: Only assigned delivery staff or Super Admin can update delivery stops';
    END IF;

    -- 2. Verify dispatch existence and driver assignment
    SELECT delivery_staff_id INTO v_assigned_staff
    FROM public.dispatches
    WHERE id = p_dispatch_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Dispatch % not found', p_dispatch_id;
    END IF;

    -- If dispatch is unassigned and caller is delivery_staff, claim trip
    IF v_assigned_staff IS NULL AND NOT v_is_super_admin THEN
        UPDATE public.dispatches
        SET delivery_staff_id = v_caller_id,
            updated_at = pg_catalog.now()
        WHERE id = p_dispatch_id;
        v_assigned_staff := v_caller_id;
    ELSIF NOT (v_is_super_admin OR (v_caller_id IS NOT NULL AND v_caller_id = v_assigned_staff)) THEN
        RAISE EXCEPTION 'Unauthorized: Only assigned delivery staff or Super Admin can update delivery stops';
    END IF;

    -- 3. Verify stop existence
    IF NOT EXISTS (
        SELECT 1 FROM public.dispatch_orders
        WHERE dispatch_id = p_dispatch_id AND order_id = p_order_id
    ) THEN
        RAISE EXCEPTION 'Stop not found for dispatch % and order %', p_dispatch_id, p_order_id;
    END IF;

    v_norm_status := pg_catalog.lower(pg_catalog.replace(p_status, '-', '_'));

    -- 4. Process and reconcile delivered items if provided
    IF p_delivered_items IS NOT NULL AND pg_catalog.jsonb_array_length(p_delivered_items) > 0 THEN
        FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(p_delivered_items)
        LOOP
            v_prod_id := (v_item->>'product_id')::UUID;
            v_del_qty := (v_item->>'quantity_delivered')::NUMERIC;
            v_short_qty := COALESCE((v_item->>'shortage_quantity')::NUMERIC, 0);

            IF v_prod_id IS NULL THEN
                RAISE EXCEPTION 'product_id cannot be null in delivered items';
            END IF;

            IF v_del_qty < 0 OR v_short_qty < 0 THEN
                RAISE EXCEPTION 'Delivered and shortage quantities must be non-negative';
            END IF;

            IF v_short_qty > 0 AND (p_notes IS NULL OR pg_catalog.length(pg_catalog.btrim(p_notes)) = 0) THEN
                RAISE EXCEPTION 'Shortage notes are mandatory when recording partial delivery';
            END IF;

            -- Check if item exists in dispatch_items
            SELECT quantity_loaded INTO v_disp_item
            FROM public.dispatch_items
            WHERE dispatch_id = p_dispatch_id AND product_id = v_prod_id;

            IF NOT FOUND THEN
                SELECT approved_quantity INTO v_order_app_qty
                FROM public.order_items
                WHERE order_id = p_order_id AND product_id = v_prod_id;

                IF v_del_qty > COALESCE(v_order_app_qty, 0) THEN
                    RAISE EXCEPTION 'Delivered quantity (%) cannot exceed approved order quantity (%) for product %',
                        v_del_qty, COALESCE(v_order_app_qty, 0), v_prod_id;
                END IF;

                INSERT INTO public.dispatch_items (
                    dispatch_id,
                    product_id,
                    quantity_loaded,
                    quantity_delivered,
                    quantity_short,
                    created_at,
                    updated_at
                ) VALUES (
                    p_dispatch_id,
                    v_prod_id,
                    COALESCE(v_order_app_qty, v_del_qty),
                    v_del_qty,
                    v_short_qty,
                    pg_catalog.now(),
                    pg_catalog.now()
                );
            ELSE
                IF v_disp_item.quantity_loaded IS NOT NULL AND v_del_qty > v_disp_item.quantity_loaded THEN
                    RAISE EXCEPTION 'Delivered quantity (%) cannot exceed loaded quantity (%) for product %',
                        v_del_qty, v_disp_item.quantity_loaded, v_prod_id;
                END IF;

                UPDATE public.dispatch_items
                SET quantity_delivered = v_del_qty,
                    quantity_short = v_short_qty,
                    updated_at = pg_catalog.now()
                WHERE dispatch_id = p_dispatch_id AND product_id = v_prod_id;
            END IF;
        END LOOP;
    END IF;

    -- 5. Update stop record in dispatch_orders
    UPDATE public.dispatch_orders
    SET status = v_norm_status,
        delivery_notes = p_notes
    WHERE dispatch_id = p_dispatch_id AND order_id = p_order_id;

    -- 6. Synchronize orders table status upon terminal delivery state
    IF v_norm_status = 'delivered' THEN
        UPDATE public.orders
        SET status = 'delivered'::public.order_status,
            updated_at = pg_catalog.now()
        WHERE id = p_order_id;
    ELSIF v_norm_status IN ('partially_delivered', 'partially-delivered') THEN
        UPDATE public.orders
        SET status = 'partially_delivered'::public.order_status,
            updated_at = pg_catalog.now()
        WHERE id = p_order_id;
    END IF;

    -- 7. Audit Logging
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (
        v_caller_id,
        'DELIVERY_STOP_UPDATED',
        'dispatch_order',
        p_order_id::TEXT,
        pg_catalog.jsonb_build_object(
            'dispatch_id', p_dispatch_id,
            'status', v_norm_status,
            'notes', p_notes
        )
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'dispatch_id', p_dispatch_id,
        'order_id', p_order_id,
        'status', v_norm_status
    );
END;
$$;

-- Explicit PoLP Privilege grants
REVOKE ALL ON FUNCTION public.rpc_update_delivery_stop(UUID, UUID, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_delivery_stop(UUID, UUID, TEXT, TEXT, JSONB) TO authenticated;

COMMIT;

