-- ==============================================================================
-- Icespot — Forward Migration: Fix Infinite RLS Recursion between Orders & Dispatch Orders
-- File: supabase/migrations/20261025000001_fix_orders_dispatch_rls_recursion.sql
-- Target: icespot-dev Supabase project (Project Ref: punyeqlotfnvxhhugtud)
--
-- PROBLEM ANALYSIS (ROOT CAUSE OF INFINITE RECURSION):
-- ----------------------------------------------------
-- In supabase/migrations/20261023000000_icespot_initial_schema.sql:
--  1. Policy "orders_select_policy" on public.orders contains an inline subquery:
--     EXISTS (
--         SELECT 1 FROM public.dispatches d
--         WHERE d.delivery_staff_id = (SELECT auth.uid())
--           AND (d.order_id = orders.id OR EXISTS (
--               SELECT 1 FROM public.dispatch_orders do_stop
--               WHERE do_stop.dispatch_id = d.id AND do_stop.order_id = orders.id
--           ))
--     )
--  2. Policy "dispatch_orders_select" on public.dispatch_orders contains an inline subquery:
--     EXISTS (
--         SELECT 1 FROM public.orders o
--         WHERE o.id = dispatch_orders.order_id AND o.branch_id = public.current_branch_id()
--     )
--
--  When PostgreSQL's query rewriter processes a query on public.orders (e.g. from a branch
--  administrator), it expands the RLS policy on public.orders. That policy references
--  public.dispatch_orders, prompting the rewriter to expand the RLS policy on dispatch_orders.
--  That policy references public.orders, triggering the rewriter to re-expand public.orders.
--  PostgreSQL's rewriter detects this circular dependency and immediately raises:
--    ERROR: infinite recursion detected in policy for relation "orders"
--
-- REMEDIATION STRATEGY:
-- ---------------------
--  1. Encapsulate the delivery staff dispatch assignment check inside a dedicated,
--     narrowly-scoped helper function: public.can_delivery_staff_view_order(p_order_id UUID).
--  2. Define the helper function with `SECURITY DEFINER` and `SET search_path = ''`.
--     Inside the function body, queries against public.dispatches and public.dispatch_orders
--     execute under definer privileges, bypassing RLS expansion on dispatch_orders and breaking
--     the parse-time rewriter cycle.
--  3. Narrow scope & Defense-in-Depth:
--     - It explicitly verifies auth.uid() is NOT NULL and current_app_role() is not distinct from 'delivery_staff'.
--     - It returns false immediately if the caller is not an active delivery_staff user (handling NULL/inactive correctly).
--     - It exposes no row data, secrets, or arbitrary query capability.
--  4. Rewrite "orders_select_policy" on public.orders:
--     - Retains Super Admin access (public.is_super_admin()).
--     - Retains Branch Admin access limited to authorized branch (branch_id = public.current_branch_id()).
--     - Retains order creator visibility (created_by = (SELECT auth.uid())).
--     - Evaluates delivery staff access via public.can_delivery_staff_view_order(id).
--  5. Harden "dispatch_orders_select" on public.dispatch_orders:
--     - Retains Super Admin access (public.is_super_admin()).
--     - Scopes delivery staff checks strictly to delivery_staff role.
--     - Scopes branch order checks strictly to branch_admin role.
--     - Prevents cross-role subquery evaluation.
--  6. Principle of Least Privilege (PoLP):
--     - Revoke execution of public.can_delivery_staff_view_order from PUBLIC and anon.
--     - Grant execution strictly to authenticated and service_role.
-- ==============================================================================

BEGIN;

-- 1. NARROWLY SCOPED SECURITY DEFINER HELPER FUNCTION
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
        ELSE EXISTS (
            SELECT 1
            FROM public.dispatches d
            WHERE d.delivery_staff_id = (SELECT auth.uid())
              AND (
                  d.order_id = p_order_id
                  OR EXISTS (
                      SELECT 1
                      FROM public.dispatch_orders do_stop
                      WHERE do_stop.dispatch_id = d.id
                        AND do_stop.order_id = p_order_id
                  )
              )
        )
    END;
$$;

COMMENT ON FUNCTION public.can_delivery_staff_view_order(UUID) IS
    'Narrowly scoped RLS helper: returns true if the authenticated delivery staff caller is assigned to a dispatch containing the given order ID.';

-- Explicitly establish helper ownership as postgres
ALTER FUNCTION public.can_delivery_staff_view_order(UUID) OWNER TO postgres;

-- 2. LEAST-PRIVILEGE FUNCTION GRANTS
REVOKE ALL ON FUNCTION public.can_delivery_staff_view_order(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_delivery_staff_view_order(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_delivery_staff_view_order(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_delivery_staff_view_order(UUID) TO service_role;

-- 3. RECREATE ORDERS SELECT POLICY (BREAKS THE REWRITER RECURSION CYCLE)
DROP POLICY IF EXISTS "orders_select_policy" ON public.orders;
CREATE POLICY "orders_select_policy" ON public.orders
    FOR SELECT TO authenticated
    USING (
        public.is_super_admin() OR
        branch_id = public.current_branch_id() OR
        created_by = (SELECT auth.uid()) OR
        (
            public.current_app_role() = 'delivery_staff'::public.app_role AND
            public.can_delivery_staff_view_order(id)
        )
    );

-- 4. RECREATE DISPATCH_ORDERS SELECT POLICY (ROLE-HARDENED)
DROP POLICY IF EXISTS "dispatch_orders_select" ON public.dispatch_orders;
CREATE POLICY "dispatch_orders_select" ON public.dispatch_orders
    FOR SELECT TO authenticated
    USING (
        public.is_super_admin() OR
        (
            public.current_app_role() = 'delivery_staff'::public.app_role AND
            EXISTS (
                SELECT 1 FROM public.dispatches d
                WHERE d.id = dispatch_orders.dispatch_id
                  AND d.delivery_staff_id = (SELECT auth.uid())
            )
        ) OR
        (
            public.current_app_role() = 'branch_admin'::public.app_role AND
            EXISTS (
                SELECT 1 FROM public.orders o
                WHERE o.id = dispatch_orders.order_id
                  AND o.branch_id = public.current_branch_id()
            )
        )
    );

-- 5. NOTIFY POSTGREST TO RELOAD SCHEMA CACHE
NOTIFY pgrst, 'reload schema';

COMMIT;
