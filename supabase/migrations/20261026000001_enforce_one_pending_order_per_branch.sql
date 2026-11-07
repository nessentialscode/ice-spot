-- ==============================================================================
-- Icespot — Forward Migration: Enforce One Pending Order Per Branch Rule
-- File: supabase/migrations/20261026000001_enforce_one_pending_order_per_branch.sql
-- Target: icespot-dev Supabase project (Project Ref: punyeqlotfnvxhhugtud)
--
-- PURPOSE:
-- 1. Enforces database-level constraint ensuring each branch can have at most ONE
--    order awaiting decision (in 'submitted' or 'under_review' status) at any time.
-- 2. Creates a partial unique index on public.orders (branch_id) WHERE status IN ('submitted', 'under_review').
-- 3. Updates public.rpc_create_order to enforce this business rule proactively with
--    an explicit error message and standard unique_violation error code (23505).
-- 4. Preserves PoLP and search_path hardening on public.rpc_create_order.
-- ==============================================================================

BEGIN;

-- 1. Partial Unique Index: Strictly one active pending-review order per branch
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_one_pending_per_branch
ON public.orders (branch_id)
WHERE status IN ('submitted', 'under_review');

-- 2. Update rpc_create_order to validate single pending order before inserting
CREATE OR REPLACE FUNCTION public.rpc_create_order(
    p_branch_id UUID,
    p_week_start DATE,
    p_notes TEXT,
    p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role public.app_role;
    v_caller_branch UUID;
    v_new_order_id UUID;
    v_new_order_number BIGINT;
    v_item JSONB;
    v_product_id UUID;
    v_req_qty NUMERIC;
    v_unit_price NUMERIC;
    v_pending_order_id UUID;
    v_pending_order_num BIGINT;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to create orders';
    END IF;

    SELECT role, branch_id INTO v_caller_role, v_caller_branch
    FROM public.profiles
    WHERE id = v_caller_id AND is_active = true;

    IF v_caller_role IS NULL THEN
        RAISE EXCEPTION 'Active administrator profile required';
    END IF;

    IF v_caller_role NOT IN ('super_admin'::public.app_role, 'branch_admin'::public.app_role) THEN
        RAISE EXCEPTION 'Unauthorized: Only super_admin or branch_admin can create orders';
    END IF;

    IF v_caller_role = 'branch_admin'::public.app_role AND (v_caller_branch IS NULL OR v_caller_branch <> p_branch_id) THEN
        RAISE EXCEPTION 'Branch isolation violation: Branch admin can only place orders for their assigned branch';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = p_branch_id AND is_active = true) THEN
        RAISE EXCEPTION 'Target branch % does not exist or is inactive', p_branch_id;
    END IF;

    -- Proactive Pending Order Check: Only one pending order allowed per branch
    SELECT id, order_number INTO v_pending_order_id, v_pending_order_num
    FROM public.orders
    WHERE branch_id = p_branch_id
      AND status IN ('submitted'::public.order_status, 'under_review'::public.order_status)
    LIMIT 1;

    IF v_pending_order_id IS NOT NULL THEN
        RAISE EXCEPTION 'A replenishment order (ORD-2026-%) is already pending review for this branch.', v_pending_order_num
            USING ERRCODE = '23505';
    END IF;

    IF p_items IS NULL OR pg_catalog.jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Order must contain at least one product item';
    END IF;

    -- Insert Order
    v_new_order_number := pg_catalog.nextval('public.orders_order_number_seq'::pg_catalog.regclass);

    INSERT INTO public.orders (
        order_number,
        branch_id,
        week_start,
        status,
        notes,
        created_by,
        submitted_at
    ) VALUES (
        v_new_order_number,
        p_branch_id,
        p_week_start,
        'submitted'::public.order_status,
        p_notes,
        v_caller_id,
        pg_catalog.now()
    )
    RETURNING id INTO v_new_order_id;

    -- Validate and Insert Line Items (handling duplicates gracefully)
    FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_req_qty := (v_item->>'requested_quantity')::NUMERIC;
        v_unit_price := NULLIF(v_item->>'unit_price', '')::NUMERIC;

        IF v_product_id IS NULL THEN
            RAISE EXCEPTION 'Missing product_id in order items';
        END IF;

        IF v_req_qty IS NULL OR v_req_qty <= 0 THEN
            RAISE EXCEPTION 'Requested quantity must be positive for product %', v_product_id;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = v_product_id AND is_active = true) THEN
            RAISE EXCEPTION 'Invalid or inactive product: %', v_product_id;
        END IF;

        INSERT INTO public.order_items (
            order_id,
            product_id,
            requested_quantity,
            approved_quantity,
            unit_price
        ) VALUES (
            v_new_order_id,
            v_product_id,
            v_req_qty,
            0,
            v_unit_price
        )
        ON CONFLICT (order_id, product_id) DO UPDATE SET
            requested_quantity = public.order_items.requested_quantity + EXCLUDED.requested_quantity,
            unit_price = COALESCE(EXCLUDED.unit_price, public.order_items.unit_price),
            updated_at = pg_catalog.now();
    END LOOP;

    -- Audit Log
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (
        v_caller_id,
        'ORDER_CREATED',
        'order',
        v_new_order_id::TEXT,
        pg_catalog.jsonb_build_object(
            'order_number', v_new_order_number,
            'branch_id', p_branch_id,
            'item_count', pg_catalog.jsonb_array_length(p_items)
        )
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'order_id', v_new_order_id,
        'order_number', v_new_order_number
    );
END;
$$;

-- 3. Maintain Privileges
REVOKE ALL ON FUNCTION public.rpc_create_order(UUID, DATE, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_order(UUID, DATE, TEXT, JSONB) TO authenticated;

COMMIT;
