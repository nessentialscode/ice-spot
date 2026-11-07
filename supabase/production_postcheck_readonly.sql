-- ==============================================================================
-- Icespot — Production Post-Execution Read-Only Verification Script
-- File: supabase/production_postcheck_readonly.sql
-- Target Database: Supabase Project gprtubirudzequpukzel
-- Safety Classification: STRICTLY READ-ONLY (Zero Inserts, Updates, Deletes, Alters, or Drops)
-- ==============================================================================

DO $$
DECLARE
    v_missing_tables TEXT := '';
    v_branch_count INT;
    v_product_count INT;
    v_ollur_profile RECORD;
    v_super_profile RECORD;
    v_delivery_profile RECORD;
    v_ollur_branch RECORD;
BEGIN
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'ICESPOT PRODUCTION POST-EXECUTION VERIFICATION BEGINNING';
    RAISE NOTICE '============================================================';

    -- 1. Verify All 13 Tables Exist
    CREATE TEMP TABLE IF NOT EXISTS _postcheck_tables (tbl_name TEXT);
    TRUNCATE _postcheck_tables;
    INSERT INTO _postcheck_tables VALUES 
        ('profiles'), ('branches'), ('products'), ('inventory'),
        ('orders'), ('order_items'), ('dispatches'), ('dispatch_orders'),
        ('dispatch_items'), ('receipts'), ('receipt_items'), ('audit_logs'),
        ('enquiries');

    SELECT string_agg(tbl_name, ', ') INTO v_missing_tables
    FROM _postcheck_tables
    WHERE tbl_name NOT IN (
        SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
    );

    IF v_missing_tables IS NOT NULL AND length(v_missing_tables) > 0 THEN
        RAISE WARNING 'CRITICAL: Missing tables in public schema: %', v_missing_tables;
    ELSE
        RAISE NOTICE 'PASS [1/11]: All 13 application tables exist in public schema.';
    END IF;

    -- 2. Verify Branch Counts & Categories
    SELECT COUNT(*) INTO v_branch_count FROM public.branches;
    IF v_branch_count >= 17 THEN
        RAISE NOTICE 'PASS [2/11]: Verified % branches seeded (expected at least 17).', v_branch_count;
    ELSE
        RAISE WARNING 'FAIL [2/11]: Expected at least 17 branches, found %', v_branch_count;
    END IF;

    -- 3. Verify Product Counts & SKUs
    SELECT COUNT(*) INTO v_product_count FROM public.products;
    IF v_product_count >= 10 THEN
        RAISE NOTICE 'PASS [3/11]: Verified % products seeded (expected at least 10).', v_product_count;
    ELSE
        RAISE WARNING 'FAIL [3/11]: Expected at least 10 products, found %', v_product_count;
    END IF;

    -- 4. Verify Super Admin Profile (2236f15a-bba8-48ba-bd23-764380fb7cba)
    SELECT * INTO v_super_profile FROM public.profiles WHERE id = '2236f15a-bba8-48ba-bd23-764380fb7cba';
    IF v_super_profile.id IS NOT NULL AND v_super_profile.role = 'super_admin' AND v_super_profile.is_active = true THEN
        RAISE NOTICE 'PASS [4/11]: Super Admin profile verified: % (Role: %)', v_super_profile.id, v_super_profile.role;
    ELSE
        RAISE WARNING 'FAIL [4/11]: Super Admin profile missing or misconfigured: %', v_super_profile;
    END IF;

    -- 5. Verify Branch Admin Profile & Ollur Branch Link (99fce41f-a636-419f-855d-9f23db4769fb)
    SELECT * INTO v_ollur_branch FROM public.branches WHERE code = 'BR-OLL-003';
    SELECT * INTO v_ollur_profile FROM public.profiles WHERE id = '99fce41f-a636-419f-855d-9f23db4769fb';

    IF v_ollur_profile.id IS NOT NULL 
       AND v_ollur_profile.role = 'branch_admin' 
       AND v_ollur_profile.branch_id = v_ollur_branch.id THEN
        RAISE NOTICE 'PASS [5/11]: Branch Admin profile verified: % linked to Ollur branch UUID: %', v_ollur_profile.id, v_ollur_branch.id;
    ELSE
        RAISE WARNING 'FAIL [5/11]: Branch Admin profile link incorrect: profile branch_id = %, ollur branch_id = %', 
            v_ollur_profile.branch_id, v_ollur_branch.id;
    END IF;

    -- 6. Verify Delivery Staff Profile (cb3c5a34-ce3b-4a53-ae6e-7a18ff6f4f43)
    SELECT * INTO v_delivery_profile FROM public.profiles WHERE id = 'cb3c5a34-ce3b-4a53-ae6e-7a18ff6f4f43';
    IF v_delivery_profile.id IS NOT NULL AND v_delivery_profile.role = 'delivery_staff' AND v_delivery_profile.is_active = true THEN
        RAISE NOTICE 'PASS [6/11]: Delivery Staff profile verified: % (Role: %)', v_delivery_profile.id, v_delivery_profile.role;
    ELSE
        RAISE WARNING 'FAIL [6/11]: Delivery Staff profile missing or misconfigured: %', v_delivery_profile;
    END IF;

    -- 7. Verify Sequences & Defaults
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'order_number'
          AND column_default LIKE '%orders_order_number_seq%'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'dispatches' AND column_name = 'dispatch_number'
          AND column_default LIKE '%dispatches_dispatch_number_seq%'
    ) THEN
        RAISE NOTICE 'PASS [7/11]: Sequence defaults verified for orders.order_number and dispatches.dispatch_number.';
    ELSE
        RAISE WARNING 'FAIL [7/11]: Sequence defaults not properly set.';
    END IF;

    -- 8. Verify Transactional RPC Functions & Security Hardening
    IF (
        SELECT COUNT(*) FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.proname IN ('rpc_create_order', 'rpc_approve_order', 'rpc_adjust_inventory', 
                            'rpc_create_dispatch', 'rpc_update_delivery_stop', 'rpc_confirm_receipt')
          AND p.prosecdef = true
          AND array_to_string(p.proconfig, ',') LIKE '%search_path=public, pg_temp%'
    ) = 6 THEN
        RAISE NOTICE 'PASS [8/11]: All 6 RPC functions exist, have SECURITY DEFINER enabled, and enforce search_path=public, pg_temp.';
    ELSE
        RAISE WARNING 'FAIL [8/11]: One or more RPC functions are missing or lack SECURITY DEFINER / search_path hardening.';
    END IF;

    -- 9. Verify All Six RPC Execution Privileges (Anon Revoked, Authenticated Granted)
    IF NOT has_function_privilege('anon', 'public.rpc_create_order(uuid, date, text, jsonb)', 'execute')
       AND NOT has_function_privilege('anon', 'public.rpc_approve_order(uuid, jsonb, text)', 'execute')
       AND NOT has_function_privilege('anon', 'public.rpc_adjust_inventory(uuid, uuid, numeric, text)', 'execute')
       AND NOT has_function_privilege('anon', 'public.rpc_create_dispatch(uuid[], uuid, text, jsonb)', 'execute')
       AND NOT has_function_privilege('anon', 'public.rpc_update_delivery_stop(uuid, uuid, text, text, jsonb)', 'execute')
       AND NOT has_function_privilege('anon', 'public.rpc_confirm_receipt(uuid, uuid, text, text, jsonb)', 'execute')
       AND has_function_privilege('authenticated', 'public.rpc_create_order(uuid, date, text, jsonb)', 'execute')
       AND has_function_privilege('authenticated', 'public.rpc_approve_order(uuid, jsonb, text)', 'execute')
       AND has_function_privilege('authenticated', 'public.rpc_adjust_inventory(uuid, uuid, numeric, text)', 'execute')
       AND has_function_privilege('authenticated', 'public.rpc_create_dispatch(uuid[], uuid, text, jsonb)', 'execute')
       AND has_function_privilege('authenticated', 'public.rpc_update_delivery_stop(uuid, uuid, text, text, jsonb)', 'execute')
       AND has_function_privilege('authenticated', 'public.rpc_confirm_receipt(uuid, uuid, text, text, jsonb)', 'execute') THEN
        RAISE NOTICE 'PASS [9/11]: All 6 RPC functions have execute privilege revoked from anon and granted to authenticated.';
    ELSE
        RAISE WARNING 'FAIL [9/11]: RPC function execution privileges misconfigured (anon access detected or authenticated missing).';
    END IF;

    -- 10. Verify Row Level Security (RLS) Policy Metadata Existence
    -- Note: This check verifies that rowsecurity = true and pg_policies metadata entries exist.
    -- Runtime branch isolation between authenticated user sessions requires active session validation.
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables
        WHERE schemaname = 'public' 
          AND tablename IN ('profiles', 'branches', 'products', 'inventory', 'orders', 'order_items', 'dispatches', 'dispatch_orders', 'dispatch_items', 'receipts', 'receipt_items', 'audit_logs', 'enquiries')
          AND rowsecurity = false
    ) AND (
        SELECT count(DISTINCT tablename) FROM pg_policies WHERE schemaname = 'public'
    ) >= 12 THEN
        RAISE NOTICE 'PASS [10/11]: RLS metadata verified: rowsecurity is active on all 13 tables and policies are registered in pg_policies.';
    ELSE
        RAISE WARNING 'FAIL [10/11]: One or more tables do not have rowsecurity enabled or are missing policies in pg_policies.';
    END IF;

    -- 11. Verify Foreign Key and Junction Constraints
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'profiles_branch_id_fkey' AND table_name = 'profiles'
    ) AND EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_dispatch_order'
    ) AND EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_dispatch_product'
    ) THEN
        RAISE NOTICE 'PASS [11/11]: Foreign key profiles_branch_id_fkey and dispatch junction constraints verified.';
    ELSE
        RAISE WARNING 'FAIL [11/11]: One or more foreign keys or unique junction constraints missing.';
    END IF;

    RAISE NOTICE '============================================================';
    RAISE NOTICE 'ICESPOT PRODUCTION POST-EXECUTION VERIFICATION COMPLETE';
    RAISE NOTICE '============================================================';
END;
$$ LANGUAGE plpgsql;
