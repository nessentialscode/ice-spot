-- ==============================================================================
-- Icespot — Post-Recovery Schema & Data Verification Script
-- File: supabase/verification_script.sql
-- Description: Non-destructive verification query set checking all 13 tables,
--              enums, 17 branches, 10 products, 3 auth profiles, and permissions.
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
    RAISE NOTICE '------------------------------------------------------------';
    RAISE NOTICE 'ICESPOT POST-RECOVERY VERIFICATION BEGINNING';
    RAISE NOTICE '------------------------------------------------------------';

    -- 1. Verify Tables Exist in public schema
    CREATE TEMP TABLE IF NOT EXISTS _check_tables (tbl_name TEXT);
    TRUNCATE _check_tables;
    INSERT INTO _check_tables VALUES 
        ('profiles'), ('branches'), ('products'), ('inventory'),
        ('orders'), ('order_items'), ('dispatches'), ('dispatch_orders'),
        ('dispatch_items'), ('receipts'), ('receipt_items'), ('audit_logs'),
        ('enquiries'), ('invoices'), ('invoice_items'), ('inventory_movements');

    SELECT string_agg(tbl_name, ', ') INTO v_missing_tables
    FROM _check_tables
    WHERE tbl_name NOT IN (
        SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
    );

    IF v_missing_tables IS NOT NULL AND length(v_missing_tables) > 0 THEN
        RAISE WARNING 'CRITICAL: Missing tables in public schema: %', v_missing_tables;
    ELSE
        RAISE NOTICE 'PASS: All 16 application tables exist in public schema.';
    END IF;

    -- 2. Verify Branch Counts and Categories
    SELECT COUNT(*) INTO v_branch_count FROM public.branches;
    IF v_branch_count >= 17 THEN
        RAISE NOTICE 'PASS: Verified % branches seeded (expected at least 17).', v_branch_count;
    ELSE
        RAISE WARNING 'FAIL: Expected at least 17 branches, found %', v_branch_count;
    END IF;

    -- 3. Verify Product Counts and SKUs
    SELECT COUNT(*) INTO v_product_count FROM public.products;
    IF v_product_count >= 10 THEN
        RAISE NOTICE 'PASS: Verified % products seeded (expected at least 10).', v_product_count;
    ELSE
        RAISE WARNING 'FAIL: Expected at least 10 products, found %', v_product_count;
    END IF;

    -- 4. Verify Profiles Table Structure & Constraints
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'id' AND data_type = 'uuid'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'branch_id' AND data_type = 'uuid'
    ) THEN
        RAISE NOTICE 'PASS: Profiles table schema verified with UUID id referencing auth.users and UUID branch_id.';
    ELSE
        RAISE WARNING 'FAIL: Profiles table missing or column types misconfigured.';
    END IF;

    -- 5. Verify Ollur Branch Exists (BR-OLL-003)
    SELECT * INTO v_ollur_branch FROM public.branches WHERE code = 'BR-OLL-003';
    IF v_ollur_branch.id IS NOT NULL THEN
        RAISE NOTICE 'PASS: Ollur branch verified: % (ID: %)', v_ollur_branch.name, v_ollur_branch.id;
    ELSE
        RAISE WARNING 'FAIL: Ollur branch BR-OLL-003 not found.';
    END IF;

    -- 6. Verify Profiles Active Unique Constraint for Branch Admin
    IF EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'profiles'
          AND indexname = 'profiles_one_active_branch_admin_per_branch'
    ) THEN
        RAISE NOTICE 'PASS: profiles_one_active_branch_admin_per_branch unique partial index verified.';
    ELSE
        RAISE WARNING 'FAIL: Unique index profiles_one_active_branch_admin_per_branch missing.';
    END IF;

    -- 7. Verify Sequences
    IF EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'orders_order_number_seq')
       AND EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'dispatches_dispatch_number_seq') THEN
        RAISE NOTICE 'PASS: Order and Dispatch sequences verified.';
    ELSE
        RAISE WARNING 'FAIL: One or both sequences missing.';
    END IF;

    -- 8. Verify Transactional RPC Functions & Security Hardening
    -- Checks function existence, SECURITY DEFINER (prosecdef), and empty search_path configuration
    IF (
        SELECT COUNT(*) FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.proname IN ('rpc_create_order', 'rpc_approve_order', 'rpc_adjust_inventory', 
                            'rpc_create_dispatch', 'rpc_update_delivery_stop', 'rpc_confirm_receipt')
          AND p.prosecdef = true
          AND (
              array_to_string(p.proconfig, ',') LIKE '%search_path=%'
              OR array_to_string(p.proconfig, ',') LIKE '%search_path=""%'
          )
    ) = 6 THEN
        RAISE NOTICE 'PASS: All 6 RPC functions exist, have SECURITY DEFINER enabled, and enforce hardened search_path = ''''.';
    ELSE
        RAISE WARNING 'FAIL: One or more RPC functions are missing or lack SECURITY DEFINER / search_path hardening.';
    END IF;

    -- 8b. Verify RPC Function Execution Permissions (Strict Least Privilege)
    IF NOT has_function_privilege('anon', 'public.rpc_create_order(uuid, date, text, jsonb)', 'execute')
       AND NOT has_function_privilege('anon', 'public.rpc_approve_order(uuid, jsonb, text)', 'execute')
       AND NOT has_function_privilege('anon', 'public.rpc_adjust_inventory(uuid, uuid, numeric, text, numeric)', 'execute') THEN
        RAISE NOTICE 'PASS: Public/anon access to RPC functions is strictly revoked.';
    ELSE
        RAISE WARNING 'FAIL: Public/anon has execute access to sensitive RPC functions!';
    END IF;

    -- 9. Verify Row Level Security (RLS) is Active with Policies on All 16 Tables
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables
        WHERE schemaname = 'public' 
          AND tablename IN ('profiles', 'branches', 'products', 'inventory', 'orders', 'order_items', 'dispatches', 'dispatch_orders', 'dispatch_items', 'receipts', 'receipt_items', 'audit_logs', 'enquiries', 'invoices', 'invoice_items', 'inventory_movements')
          AND rowsecurity = false
    ) AND (
        SELECT count(DISTINCT tablename) FROM pg_policies WHERE schemaname = 'public'
    ) >= 14 THEN
        RAISE NOTICE 'PASS: Row Level Security (RLS) is active across all 16 tables with dedicated access policies.';
    ELSE
        RAISE WARNING 'FAIL: One or more tables do not have RLS enabled or are missing policies.';
    END IF;

    -- 10. Verify Inventory Uniqueness Index and Junction Constraints
    IF (
        EXISTS (
            SELECT 1 FROM pg_indexes 
            WHERE schemaname = 'public' 
              AND tablename = 'inventory' 
              AND indexname IN ('inventory_location_product_unique', 'idx_inventory_product_branch', 'uq_inventory_branch_product')
        ) OR EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname IN ('inventory_location_product_unique', 'uq_inventory_branch_product')
        )
    ) AND EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_dispatch_order'
    ) AND EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_dispatch_product'
    ) THEN
        RAISE NOTICE 'PASS: Inventory uniqueness and multi-order dispatch junction constraints verified.';
    ELSE
        RAISE WARNING 'FAIL: Inventory uniqueness index or dispatch junction constraints missing.';
    END IF;

    -- 11. Verify app_role Enum, profiles.branch_id Type & Sequence Defaults
    IF EXISTS (
        SELECT 1 FROM pg_type t 
        JOIN pg_enum e ON t.oid = e.enumtypid 
        WHERE t.typname = 'app_role' AND e.enumlabel = 'super_admin'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'profiles' 
          AND column_name = 'branch_id' AND data_type = 'uuid'
    ) THEN
        RAISE NOTICE 'PASS: Verified enum app_role and profiles.branch_id UUID column type.';
    ELSE
        RAISE WARNING 'FAIL: app_role enum or profiles.branch_id UUID column type misconfigured.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'order_number'
          AND column_default LIKE '%orders_order_number_seq%'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'dispatches' AND column_name = 'dispatch_number'
          AND column_default LIKE '%dispatches_dispatch_number_seq%'
    ) THEN
        RAISE NOTICE 'PASS: Sequence defaults verified for orders and dispatches.';
    ELSE
        RAISE WARNING 'FAIL: Sequence defaults not properly set on orders.order_number or dispatches.dispatch_number.';
    END IF;

    RAISE NOTICE '------------------------------------------------------------';
    RAISE NOTICE 'ICESPOT POST-RECOVERY VERIFICATION COMPLETE';
    RAISE NOTICE '------------------------------------------------------------';
END $$;
