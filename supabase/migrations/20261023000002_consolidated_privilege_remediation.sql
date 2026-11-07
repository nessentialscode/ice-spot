-- ==============================================================================
-- Icespot — Consolidated Privilege & Security Remediation Migration
-- File: supabase/migrations/20261023000002_consolidated_privilege_remediation.sql
-- Target: icespot-dev Supabase project ONLY (Project Ref: punyeqlotfnvxhhugtud)
-- Description: Consolidated PostgreSQL & Supabase Table, Sequence, Routine, and
--              RLS Policy Privilege Hardening adhering to the Principle of Least Privilege (PoLP).
--
-- Core Security Invariants:
-- 1. Table Access: Strips all default/inherited excessive privileges (DELETE, TRUNCATE,
--    REFERENCES, TRIGGER, and direct unauthorized writes) from PUBLIC, anon, and authenticated.
-- 2. Scoped Catalog RLS: Splits catalog read policies on branches and products by role:
--    - 'anon' receives strictly active-only access (is_active = true) without evaluating is_super_admin().
--    - 'authenticated' retains active access plus super_admin visibility into inactive records.
-- 3. Routine Hardening: Narrowly revokes execute from PUBLIC and anon on transactional RPCs
--    and security helpers (including is_super_admin & fn_is_super_admin). Grants execute on
--    required helpers and RPCs strictly to 'authenticated'.
-- 4. Trigger Function Precision: Avoids unnecessary direct execute grants on set_updated_at();
--    PostgreSQL validates trigger execution permissions at trigger creation time.
-- 5. Sequences: Strips all sequence permissions from PUBLIC and anon, granting strictly
--    USAGE and SELECT to 'authenticated' to support column nextval(...) defaults.
-- Safety: Non-destructive DDL. Does not drop tables, alter schema columns, or reset sequence counters.
-- ==============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: SCHEMA USAGE GRANTS
-- ============================================================================
-- Ensure client roles can resolve objects in schema 'public'.
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- ============================================================================
-- STEP 2: REVOKE EXCESSIVE TABLE PRIVILEGES FROM PUBLIC, ANON, & AUTHENTICATED
-- ============================================================================
-- Eliminates unintended DELETE, TRUNCATE, REFERENCES, TRIGGER, and direct write privileges
-- inherited through default role configurations or PUBLIC schema grants across all 14 tables.
REVOKE ALL ON TABLE
    public.branches,
    public.products,
    public.profiles,
    public.inventory,
    public.inventory_movements,
    public.orders,
    public.order_items,
    public.dispatches,
    public.dispatch_orders,
    public.dispatch_items,
    public.receipts,
    public.receipt_items,
    public.audit_logs,
    public.enquiries
FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- STEP 3: RESTORE MINIMUM REQUIRED APPLICATION TABLE PRIVILEGES
-- ============================================================================

-- 3a. Master Directory & Catalog (Read-mostly; controlled Super Admin management)
-- Anonymous users can read active branches and products on marketing pages.
-- Authenticated users (Super Admin via RLS) can update branch status and create/update products.
GRANT SELECT ON public.branches TO anon, authenticated;
GRANT UPDATE ON public.branches TO authenticated;

GRANT SELECT ON public.products TO anon, authenticated;
GRANT INSERT, UPDATE ON public.products TO authenticated;

-- 3b. Public Inbound Lead Generation
-- Anonymous users can submit customer/franchise enquiries (INSERT-only; no SELECT, UPDATE, DELETE).
-- Authenticated users (Super Admin via RLS) can read incoming enquiries.
GRANT INSERT ON public.enquiries TO anon;
GRANT SELECT, INSERT ON public.enquiries TO authenticated;

-- 3c. User Profiles (Auth & RBAC)
-- Authenticated users can read their own profile (or all profiles for Super Admin).
-- Profile modification is restricted; no direct INSERT, UPDATE, or DELETE permitted.
GRANT SELECT ON public.profiles TO authenticated;

-- 3d. Order Processing (Drafts & Status Updates)
-- Authenticated Branch Admins and Super Admins can query orders and insert/update draft/submitted orders.
-- All writes are strictly governed by 'orders_insert_policy' and 'orders_update_policy'.
GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.order_items TO authenticated;

-- 3e. Operational Inventory & Double-Entry Ledger (RPC-Protected Mutations)
-- Direct table INSERT, UPDATE, DELETE are strictly withheld.
-- Mutations occur exclusively through rpc_adjust_inventory, rpc_create_dispatch, and rpc_confirm_receipt.
-- Authenticated users are granted SELECT only, scoped by RLS.
GRANT SELECT ON public.inventory TO authenticated;
GRANT SELECT ON public.inventory_movements TO authenticated;

-- 3f. Dispatch Logistics & Manifest Trips (RPC-Protected Mutations)
-- Direct table INSERT, UPDATE, DELETE are strictly withheld.
-- Mutations occur exclusively through rpc_create_dispatch and rpc_update_delivery_stop.
-- Authenticated users are granted SELECT only, scoped by can_access_dispatch() in RLS.
GRANT SELECT ON public.dispatches TO authenticated;
GRANT SELECT ON public.dispatch_orders TO authenticated;
GRANT SELECT ON public.dispatch_items TO authenticated;

-- 3g. Branch Shipment Receipt Confirmations (RPC-Protected Mutations)
-- Direct table INSERT, UPDATE, DELETE are strictly withheld.
-- Confirmations and stock reconciliation occur exclusively through rpc_confirm_receipt.
-- Authenticated users are granted SELECT only, scoped by RLS.
GRANT SELECT ON public.receipts TO authenticated;
GRANT SELECT ON public.receipt_items TO authenticated;

-- 3h. Immutable Audit Ledger
-- Authenticated users can record application event logs (INSERT).
-- Only Super Admin can query audit records (SELECT) via 'audit_logs_select' RLS policy.
-- UPDATE and DELETE are strictly withheld to preserve audit immutability.
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;

-- ============================================================================
-- STEP 4: SEQUENCE PRIVILEGES (ORDER & DISPATCH NUMBER GENERATION)
-- ============================================================================
-- Revoke all default sequence permissions from PUBLIC and anon.
-- Grant strictly USAGE and SELECT to authenticated to support nextval(...) column defaults.
REVOKE ALL ON SEQUENCE
    public.orders_order_number_seq,
    public.dispatches_dispatch_number_seq
FROM PUBLIC, anon, authenticated;

GRANT USAGE, SELECT ON SEQUENCE
    public.orders_order_number_seq,
    public.dispatches_dispatch_number_seq
TO authenticated;

-- ============================================================================
-- STEP 5: ROUTINE / FUNCTION EXECUTION PRIVILEGES (NARROWLY SCOPED LEAST PRIVILEGE)
-- ============================================================================
-- Narrowly scope function permissions to protect sensitive RPCs and internal helpers
-- without blanket-revoking extension functions (e.g. uuid-ossp, pgcrypto).

-- 5a. Revoke EXECUTE from PUBLIC and anon on the six transactional RPC functions
REVOKE ALL ON FUNCTION public.rpc_create_order(UUID, DATE, TEXT, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_approve_order(UUID, JSONB, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_create_dispatch(UUID[], UUID, TEXT, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_update_delivery_stop(UUID, UUID, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_adjust_inventory(UUID, UUID, NUMERIC, TEXT, NUMERIC) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_confirm_receipt(UUID, UUID, TEXT, TEXT, JSONB) FROM PUBLIC, anon;

-- 5b. Revoke EXECUTE from PUBLIC and anon on internal RLS/security helpers
REVOKE ALL ON FUNCTION public.current_app_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_branch_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_user_branch_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_dispatch(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_is_super_admin() FROM PUBLIC, anon;

-- 5c. Grant EXECUTE on the six transactional RPCs to authenticated role
GRANT EXECUTE ON FUNCTION public.rpc_create_order(UUID, DATE, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_approve_order(UUID, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_create_dispatch(UUID[], UUID, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_update_delivery_stop(UUID, UUID, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_adjust_inventory(UUID, UUID, NUMERIC, TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_confirm_receipt(UUID, UUID, TEXT, TEXT, JSONB) TO authenticated;

-- 5d. Grant EXECUTE on internal RLS helpers strictly to authenticated role
GRANT EXECUTE ON FUNCTION public.current_app_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_branch_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_user_branch_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_dispatch(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_is_super_admin() TO authenticated;

-- Note on trigger functions: public.set_updated_at() does not require direct EXECUTE
-- to be granted to authenticated; PostgreSQL validates trigger execution rights when
-- the trigger is declared on the table.

-- ============================================================================
-- STEP 6: SPLIT PUBLIC CATALOG RLS POLICIES BY ROLE
-- ============================================================================
-- Eliminates the dependency of anonymous users on is_super_admin().
-- Anonymous users can SELECT active catalog records only.
-- Authenticated users retain active catalog access plus super_admin inactive access.

-- 6a. Branches Catalog Policy Split
DROP POLICY IF EXISTS "branches_read_policy" ON public.branches;
CREATE POLICY "branches_read_policy" ON public.branches
    FOR SELECT TO anon
    USING (is_active = true);

DROP POLICY IF EXISTS "branches_authenticated_select" ON public.branches;
CREATE POLICY "branches_authenticated_select" ON public.branches
    FOR SELECT TO authenticated
    USING (is_active = true OR public.is_super_admin());

-- 6b. Products Catalog Policy Split
DROP POLICY IF EXISTS "products_select_policy" ON public.products;
CREATE POLICY "products_select_policy" ON public.products
    FOR SELECT TO anon
    USING (is_active = true);

DROP POLICY IF EXISTS "products_authenticated_select" ON public.products;
CREATE POLICY "products_authenticated_select" ON public.products
    FOR SELECT TO authenticated
    USING (is_active = true OR public.is_super_admin());

COMMIT;
