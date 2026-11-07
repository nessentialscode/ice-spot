-- ==============================================================================
-- Icespot — Forward Migration: Fix Delivery Staff Order Visibility & Dispatch Planning
-- File: supabase/migrations/20261029000001_fix_delivery_staff_order_visibility.sql
-- Target: icespot-dev Supabase project (Project Ref: punyeqlotfnvxhhugtud)
--
-- PROBLEM SOLVED:
-- 1. Previously, "orders_select_policy" evaluated delivery staff access via
--    can_delivery_staff_view_order(), which only returned true IF an order was
--    ALREADY linked to an existing dispatch assigned to auth.uid().
-- 2. Because of this, Delivery Staff could NOT view newly approved branch requisitions
--    that had not yet been scheduled into a delivery trip.
-- 3. "Set Up Delivery Trip" reported "No approved branch requisitions available for dispatch"
--    and Section 4 displayed orders as awaiting review due to unrefreshed local cache.
-- 4. In addition, "order_items_select" completely omitted delivery_staff.
--
-- REMEDIATION:
-- 1. Grant SELECT on public.orders to delivery_staff so they can monitor incoming orders
--    and query approved requisitions for cold-chain trip scheduling.
-- 2. Grant SELECT on public.order_items to delivery_staff so crate quantities and items
--    can be verified during trip planning and loading.
-- 3. Provide SECURITY DEFINER RPCs (rpc_get_orders, rpc_get_eligible_orders_for_dispatch)
--    with strict role verification (super_admin, delivery_staff).
-- ==============================================================================

BEGIN;

-- 1. UPDATE ORDERS SELECT POLICY
DROP POLICY IF EXISTS "orders_select_policy" ON public.orders;
CREATE POLICY "orders_select_policy" ON public.orders
    FOR SELECT TO authenticated
    USING (
        public.is_super_admin() OR
        public.current_app_role() = 'delivery_staff'::public.app_role OR
        branch_id = public.current_branch_id() OR
        created_by = (SELECT auth.uid())
    );

-- 2. UPDATE ORDER_ITEMS SELECT POLICY
DROP POLICY IF EXISTS "order_items_select" ON public.order_items;
CREATE POLICY "order_items_select" ON public.order_items
    FOR SELECT TO authenticated
    USING (
        public.is_super_admin() OR
        public.current_app_role() = 'delivery_staff'::public.app_role OR
        EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = order_items.order_id
              AND (o.branch_id = public.current_branch_id() OR o.created_by = (SELECT auth.uid()))
        )
    );

-- 3. UPDATE can_delivery_staff_view_order HELPER
CREATE OR REPLACE FUNCTION public.can_delivery_staff_view_order(p_order_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT CASE
        WHEN p_order_id IS NULL THEN false
        WHEN (SELECT auth.uid()) IS NULL THEN false
        WHEN public.current_app_role() IS DISTINCT FROM 'delivery_staff'::public.app_role THEN false
        ELSE true
    END;
$$;

-- 4. SECURITY DEFINER RPC FOR ELIGIBLE DISPATCH ORDERS
CREATE OR REPLACE FUNCTION public.rpc_get_eligible_orders_for_dispatch()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_result JSONB;
BEGIN
    IF NOT (public.is_super_admin() OR public.current_app_role() = 'delivery_staff'::public.app_role) THEN
        RAISE EXCEPTION 'Unauthorized: Delivery Staff or Super Admin authority required to fetch eligible dispatch orders';
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_result
    FROM (
        SELECT 
            o.id,
            o.order_number,
            o.branch_id,
            o.status,
            o.created_at,
            to_jsonb(b) as branches,
            (
                SELECT COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'id', oi.id,
                        'product_id', oi.product_id,
                        'requested_quantity', oi.requested_quantity,
                        'approved_quantity', oi.approved_quantity,
                        'unit_price', oi.unit_price,
                        'products', to_jsonb(p)
                    )
                ), '[]'::jsonb)
                FROM public.order_items oi
                JOIN public.products p ON p.id = oi.product_id
                WHERE oi.order_id = o.id
            ) as order_items,
            (
                SELECT COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'dispatch_id', do_stop.dispatch_id,
                        'status', do_stop.status,
                        'dispatches', jsonb_build_object(
                            'id', d.id,
                            'status', d.status,
                            'dispatch_number', d.dispatch_number
                        )
                    )
                ), '[]'::jsonb)
                FROM public.dispatch_orders do_stop
                JOIN public.dispatches d ON d.id = do_stop.dispatch_id
                WHERE do_stop.order_id = o.id
            ) as dispatch_orders
        FROM public.orders o
        JOIN public.branches b ON b.id = o.branch_id
        WHERE o.status IN ('approved', 'preparation', 'ready_for_dispatch')
          AND NOT EXISTS (
              SELECT 1 
              FROM public.dispatch_orders do_stop
              JOIN public.dispatches d ON d.id = do_stop.dispatch_id
              WHERE do_stop.order_id = o.id
                AND d.status NOT IN ('completed', 'cancelled', 'failed')
          )
        ORDER BY o.created_at DESC
    ) t;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_get_eligible_orders_for_dispatch() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_eligible_orders_for_dispatch() TO authenticated;

-- 5. SECURITY DEFINER RPC FOR GET ORDERS
CREATE OR REPLACE FUNCTION public.rpc_get_orders()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_role public.app_role;
    v_caller_branch_id UUID;
    v_result JSONB;
BEGIN
    SELECT role, branch_id INTO v_caller_role, v_caller_branch_id
    FROM public.profiles
    WHERE id = auth.uid() AND is_active = true;

    IF v_caller_role IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Active user profile required';
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_result
    FROM (
        SELECT 
            o.id,
            o.order_number,
            o.branch_id,
            o.week_start,
            o.status,
            o.notes,
            o.submitted_at,
            o.created_at,
            to_jsonb(b) as branches,
            (
                SELECT COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'id', oi.id,
                        'product_id', oi.product_id,
                        'requested_quantity', oi.requested_quantity,
                        'approved_quantity', oi.approved_quantity,
                        'unit_price', oi.unit_price,
                        'products', to_jsonb(p)
                    )
                ), '[]'::jsonb)
                FROM public.order_items oi
                JOIN public.products p ON p.id = oi.product_id
                WHERE oi.order_id = o.id
            ) as order_items,
            (
                SELECT COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'dispatch_id', do_stop.dispatch_id,
                        'status', do_stop.status,
                        'dispatches', jsonb_build_object(
                            'id', d.id,
                            'status', d.status,
                            'dispatch_number', d.dispatch_number
                        )
                    )
                ), '[]'::jsonb)
                FROM public.dispatch_orders do_stop
                JOIN public.dispatches d ON d.id = do_stop.dispatch_id
                WHERE do_stop.order_id = o.id
            ) as dispatch_orders
        FROM public.orders o
        JOIN public.branches b ON b.id = o.branch_id
        WHERE (
            v_caller_role = 'super_admin'::public.app_role OR
            v_caller_role = 'delivery_staff'::public.app_role OR
            (v_caller_role = 'branch_admin'::public.app_role AND o.branch_id = v_caller_branch_id)
        )
        ORDER BY o.created_at DESC
    ) t;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_get_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_orders() TO authenticated;

COMMIT;

