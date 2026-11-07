-- Migration: 20261023000001_grant_branches_products_table_privileges.sql
-- Description: Corrective migration granting table-level UPDATE on public.branches
-- and INSERT, UPDATE on public.products to authenticated users.
-- Security: Preserves least privilege. Mutations remain restricted strictly to
-- Super Admin via existing RLS policies ("branches_admin_manage" and "products_admin_manage").
-- Explicitly omits DELETE privileges.

BEGIN;

-- Grant required operational mutations to authenticated role
GRANT UPDATE ON public.branches TO authenticated;
GRANT INSERT, UPDATE ON public.products TO authenticated;

COMMIT;
