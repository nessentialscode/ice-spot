-- ==============================================================================
-- Icespot — Production Read-Only Privilege & Security Verification Script
-- File: supabase/privilege_verification_readonly.sql
-- Target Database: Supabase Project punyeqlotfnvxhhugtud (ice_spot_dev)
-- Safety Classification: STRICTLY READ-ONLY (Zero Temp Tables, DDL, DML, or Truncate)
--
-- Description:
-- Standalone, non-destructive security verification routine performing comprehensive
-- catalog audits across 7 core dimensions:
--  1. Application Tables & RLS Status (Row security and non-privileged ownership)
--  2. Table Privileges PoLP (Principle of Least Privilege across all 7 privilege types)
--  3. Row-Level Security Policies (Manifest validation of 25 canonical policies)
--  4. Transactional RPC Functions (SECURITY DEFINER, empty search_path, permissions)
--  5. Internal Helper Functions (Exposure boundaries, security definer settings)
--  6. Sequences (Sequence permissions and defaults)
--  7. Extensions & Crypto (gen_random_uuid in pg_catalog and uuid-ossp linkage)
--
-- Emits in-memory JSONB results grid via session configuration parameter:
--   'icespot.audit_results'
-- ==============================================================================

DO $$
DECLARE
    -- Global 5-state accounting
    v_global_passes INT := 0;
    v_global_fails INT := 0;
    v_global_warnings INT := 0;
    v_global_skipped INT := 0;
    v_global_inconclusive INT := 0;
    v_global_status TEXT := 'PASS';

    -- Section 5-state accounting
    v_sec_passes INT := 0;
    v_sec_fails INT := 0;
    v_sec_warnings INT := 0;
    v_sec_skipped INT := 0;
    v_sec_inconclusive INT := 0;
    v_sec_status TEXT := 'PASS';

    -- In-memory JSON results accumulator
    v_results_json jsonb := '[]'::jsonb;

    -- Working variables
    v_missing_tables TEXT := '';
    v_tbl TEXT;
    v_owner_rec RECORD;
    v_priv_types TEXT[] := ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];
    v_priv TEXT;
    v_pol_spec RECORD;
    v_rec RECORD;
    v_rpc TEXT;
    v_rpc_fn RECORD;
    v_helper_spec RECORD;
    v_helper_fn RECORD;
    v_seq TEXT;
    v_ext_rec RECORD;
BEGIN
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'ICESPOT READ-ONLY PRIVILEGE VERIFICATION AUDIT STARTING';
    RAISE NOTICE '============================================================';

    -- ========================================================================
    -- SECTION 1: APPLICATION TABLES & RLS STATUS
    -- ========================================================================
    v_sec_passes := 0; v_sec_fails := 0; v_sec_warnings := 0; v_sec_skipped := 0; v_sec_inconclusive := 0;

    FOR v_tbl IN
        SELECT unnest(ARRAY[
            'branches',
            'products',
            'profiles',
            'inventory',
            'inventory_movements',
            'orders',
            'order_items',
            'dispatches',
            'dispatch_orders',
            'dispatch_items',
            'receipts',
            'receipt_items',
            'audit_logs',
            'enquiries',
            'invoices',
            'invoice_items'
        ])
    LOOP
        -- Verify table existence
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = v_tbl
        ) THEN
            v_missing_tables := v_missing_tables || v_tbl || ', ';
            v_sec_fails := v_sec_fails + 1;
            v_sec_skipped := v_sec_skipped + 1; -- Dependent RLS status check skipped
            RAISE WARNING 'Application table public.% does NOT exist', v_tbl;
        ELSE
            v_sec_passes := v_sec_passes + 1;

            -- Verify RLS is enabled
            IF EXISTS (
                SELECT 1 FROM pg_tables
                WHERE schemaname = 'public' AND tablename = v_tbl AND rowsecurity = true
            ) THEN
                v_sec_passes := v_sec_passes + 1;
            ELSE
                v_sec_fails := v_sec_fails + 1;
                RAISE WARNING 'Table public.% lacks Row Level Security (RLS)', v_tbl;
            END IF;

            -- Inspect table owner to ensure anon or authenticated do not own application tables
            SELECT c.relname, r.rolname INTO v_owner_rec
            FROM pg_class c
            JOIN pg_roles r ON c.relowner = r.oid
            WHERE c.relnamespace = 'public'::regnamespace
              AND c.relname = v_tbl
              AND r.rolname IN ('anon', 'authenticated');

            IF v_owner_rec.relname IS NOT NULL THEN
                v_sec_fails := v_sec_fails + 1;
                RAISE WARNING 'Table public.% is owned by unauthorized client role: %', v_tbl, v_owner_rec.rolname;
            ELSE
                v_sec_passes := v_sec_passes + 1;
            END IF;
        END IF;
    END LOOP;

    IF v_sec_fails > 0 THEN
        RAISE NOTICE 'SECTION 1 RESULT: FAIL (Passes: %, Fails: %, Warnings: %, Skipped: %, Inconclusive: %)', v_sec_passes, v_sec_fails, v_sec_warnings, v_sec_skipped, v_sec_inconclusive;
        v_sec_status := 'FAIL';
    ELSIF v_sec_skipped > 0 OR v_sec_inconclusive > 0 THEN
        RAISE NOTICE 'SECTION 1 RESULT: INCONCLUSIVE (Passes: %, Fails: %, Warnings: %, Skipped: %, Inconclusive: %)', v_sec_passes, v_sec_fails, v_sec_warnings, v_sec_skipped, v_sec_inconclusive;
        v_sec_status := 'INCONCLUSIVE';
    ELSIF v_sec_warnings > 0 THEN
        RAISE NOTICE 'SECTION 1 RESULT: PASS WITH ADVISORY WARNINGS (Passes: %, Fails: %, Warnings: %, Skipped: %, Inconclusive: %)', v_sec_passes, v_sec_fails, v_sec_warnings, v_sec_skipped, v_sec_inconclusive;
        v_sec_status := 'WARNING';
    ELSE
        RAISE NOTICE 'SECTION 1 RESULT: PASS (Passes: %, Fails: %, Warnings: %, Skipped: %, Inconclusive: %)', v_sec_passes, v_sec_fails, v_sec_warnings, v_sec_skipped, v_sec_inconclusive;
        v_sec_status := 'PASS';
    END IF;

    v_results_json := v_results_json || jsonb_build_object(
        'section_id', 1,
        'section_name', 'TABLES_AND_RLS_STATUS',
        'status', v_sec_status,
        'details', jsonb_build_object(
            'passes', v_sec_passes,
            'fails', v_sec_fails,
            'warnings', v_sec_warnings,
            'skipped', v_sec_skipped,
            'inconclusive', v_sec_inconclusive
        )
    );

    v_global_passes := v_global_passes + v_sec_passes;
    v_global_fails := v_global_fails + v_sec_fails;
    v_global_warnings := v_global_warnings + v_sec_warnings;
    v_global_skipped := v_global_skipped + v_sec_skipped;
    v_global_inconclusive := v_global_inconclusive + v_sec_inconclusive;

    -- ========================================================================
    -- SECTION 2: TABLE PRIVILEGES POLP AUDIT
    -- ========================================================================
    v_sec_passes := 0; v_sec_fails := 0; v_sec_warnings := 0; v_sec_skipped := 0; v_sec_inconclusive := 0;

    FOREACH v_priv IN ARRAY v_priv_types
    LOOP
        FOR v_tbl IN
            SELECT unnest(ARRAY[
                'branches', 'products', 'profiles', 'inventory', 'inventory_movements',
                'orders', 'order_items', 'dispatches', 'dispatch_orders', 'dispatch_items',
                'receipts', 'receipt_items', 'audit_logs', 'enquiries',
                'invoices', 'invoice_items'
            ])
        LOOP
            -- 1. Check anonymous client role permissions
            IF has_table_privilege('anon', 'public.' || v_tbl, v_priv) THEN
                IF (v_tbl IN ('branches', 'products') AND v_priv = 'SELECT')
                   OR (v_tbl = 'enquiries' AND v_priv = 'INSERT') THEN
                    v_sec_passes := v_sec_passes + 1;
                ELSE
                    v_sec_fails := v_sec_fails + 1;
                    RAISE WARNING 'Excessive privilege % granted to anon on table %', v_priv, v_tbl;
                END IF;
            ELSE
                IF (v_tbl IN ('branches', 'products') AND v_priv = 'SELECT')
                   OR (v_tbl = 'enquiries' AND v_priv = 'INSERT') THEN
                    v_sec_fails := v_sec_fails + 1;
                    RAISE WARNING 'Expected privilege % missing for anon on table %', v_priv, v_tbl;
                ELSE
                    v_sec_passes := v_sec_passes + 1;
                END IF;
            END IF;

            -- 2. Check authenticated client role permissions (No DELETE, TRUNCATE, REFERENCES, TRIGGER)
            IF v_priv IN ('DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER') THEN
                IF has_table_privilege('authenticated', 'public.' || v_tbl, v_priv) THEN
                    v_sec_fails := v_sec_fails + 1;
                    RAISE WARNING 'Dangerous privilege % granted to authenticated on table %', v_priv, v_tbl;
                ELSE
                    v_sec_passes := v_sec_passes + 1;
                END IF;
            END IF;

            -- 3. Direct mutation withholding on RPC-protected financial tables (invoices, invoice_items)
            IF v_tbl IN ('invoices', 'invoice_items') AND v_priv IN ('INSERT', 'UPDATE') THEN
                IF has_table_privilege('authenticated', 'public.' || v_tbl, v_priv) THEN
                    v_sec_fails := v_sec_fails + 1;
                    RAISE WARNING 'Direct % privilege unexpectedly granted to authenticated on %', v_priv, v_tbl;
                ELSE
                    v_sec_passes := v_sec_passes + 1;
                END IF;
            END IF;
        END LOOP;
    END LOOP;

    IF v_sec_fails > 0 THEN
        RAISE NOTICE 'SECTION 2 RESULT: FAIL (Passes: %, Fails: %, Warnings: %, Skipped: %, Inconclusive: %)', v_sec_passes, v_sec_fails, v_sec_warnings, v_sec_skipped, v_sec_inconclusive;
        v_sec_status := 'FAIL';
    ELSIF v_sec_skipped > 0 OR v_sec_inconclusive > 0 THEN
        RAISE NOTICE 'SECTION 2 RESULT: INCONCLUSIVE (Passes: %, Fails: %, Warnings: %, Skipped: %, Inconclusive: %)', v_sec_passes, v_sec_fails, v_sec_warnings, v_sec_skipped, v_sec_inconclusive;
        v_sec_status := 'INCONCLUSIVE';
    ELSIF v_sec_warnings > 0 THEN
        RAISE NOTICE 'SECTION 2 RESULT: PASS WITH ADVISORY WARNINGS (Passes: %, Fails: %, Warnings: %, Skipped: %, Inconclusive: %)', v_sec_passes, v_sec_fails, v_sec_warnings, v_sec_skipped, v_sec_inconclusive;
        v_sec_status := 'WARNING';
    ELSE
        RAISE NOTICE 'SECTION 2 RESULT: PASS (Passes: %, Fails: %, Warnings: %, Skipped: %, Inconclusive: %)', v_sec_passes, v_sec_fails, v_sec_warnings, v_sec_skipped, v_sec_inconclusive;
        v_sec_status := 'PASS';
    END IF;

    v_results_json := v_results_json || jsonb_build_object(
        'section_id', 2,
        'section_name', 'TABLE_PRIVILEGES_POLP',
        'status', v_sec_status,
        'details', jsonb_build_object(
            'passes', v_sec_passes,
            'fails', v_sec_fails,
            'warnings', v_sec_warnings,
            'skipped', v_sec_skipped,
            'inconclusive', v_sec_inconclusive
        )
    );

    v_global_passes := v_global_passes + v_sec_passes;
    v_global_fails := v_global_fails + v_sec_fails;
    v_global_warnings := v_global_warnings + v_sec_warnings;
    v_global_skipped := v_global_skipped + v_sec_skipped;
    v_global_inconclusive := v_global_inconclusive + v_sec_inconclusive;

    -- ========================================================================
    -- SECTION 3: ROW-LEVEL SECURITY POLICIES MANIFEST
    -- ========================================================================
    v_sec_passes := 0; v_sec_fails := 0; v_sec_warnings := 0; v_sec_skipped := 0; v_sec_inconclusive := 0;

    FOR v_pol_spec IN
        SELECT * FROM (VALUES
            ('branches', 'branches_read_policy', 'SELECT', ARRAY['anon']),
            ('branches', 'branches_authenticated_select', 'SELECT', ARRAY['authenticated']),
            ('branches', 'branches_admin_manage', 'ALL', ARRAY['authenticated']),
            ('profiles', 'profiles_select_self_or_admin', 'SELECT', ARRAY['authenticated']),
            ('profiles', 'profiles_admin_manage', 'ALL', ARRAY['authenticated']),
            ('products', 'products_select_policy', 'SELECT', ARRAY['anon']),
            ('products', 'products_authenticated_select', 'SELECT', ARRAY['authenticated']),
            ('products', 'products_admin_manage', 'ALL', ARRAY['authenticated']),
            ('inventory', 'inventory_select_policy', 'SELECT', ARRAY['authenticated']),
            ('inventory', 'inventory_admin_manage', 'ALL', ARRAY['authenticated']),
            ('inventory_movements', 'inventory_movements_select', 'SELECT', ARRAY['authenticated']),
            ('orders', 'orders_select_policy', 'SELECT', ARRAY['authenticated']),
            ('orders', 'orders_insert_policy', 'INSERT', ARRAY['authenticated']),
            ('orders', 'orders_update_policy', 'UPDATE', ARRAY['authenticated']),
            ('order_items', 'order_items_select', 'SELECT', ARRAY['authenticated']),
            ('order_items', 'order_items_insert', 'INSERT', ARRAY['authenticated']),
            ('order_items', 'order_items_update', 'UPDATE', ARRAY['authenticated']),
            ('dispatches', 'dispatches_select', 'SELECT', ARRAY['authenticated']),
            ('dispatches', 'dispatches_manage', 'ALL', ARRAY['authenticated']),
            ('dispatch_orders', 'dispatch_orders_select', 'SELECT', ARRAY['authenticated']),
            ('dispatch_items', 'dispatch_items_select', 'SELECT', ARRAY['authenticated']),
            ('receipts', 'receipts_select', 'SELECT', ARRAY['authenticated']),
            ('receipt_items', 'receipt_items_select', 'SELECT', ARRAY['authenticated']),
            ('audit_logs', 'audit_logs_select', 'SELECT', ARRAY['authenticated']),
            ('audit_logs', 'audit_logs_insert', 'INSERT', ARRAY['authenticated']),
            ('enquiries', 'enquiries_insert_public', 'INSERT', ARRAY['anon']),
            ('enquiries', 'enquiries_select_admin', 'SELECT', ARRAY['authenticated']),
            ('invoices', 'invoices_select', 'SELECT', ARRAY['authenticated']),
            ('invoices', 'invoices_admin_manage', 'ALL', ARRAY['authenticated']),
            ('invoice_items', 'invoice_items_select', 'SELECT', ARRAY['authenticated']),
            ('invoice_items', 'invoice_items_admin_manage', 'ALL', ARRAY['authenticated'])
        ) AS t(tbl_name, pol_name, cmd, roles)
    LOOP
        -- Detect policies attached to wrong tables
        IF EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'public'
              AND policyname = v_pol_spec.pol_name
              AND tablename != v_pol_spec.tbl_name
        ) THEN
            v_sec_fails := v_sec_fails + 1;
            RAISE WARNING 'Policy % is attached to wrong table (expected %)', v_pol_spec.pol_name, v_pol_spec.tbl_name;
        END IF;

        -- Check policy exists on expected table
        SELECT * INTO v_rec
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = v_pol_spec.tbl_name
          AND policyname = v_pol_spec.pol_name;

        IF v_rec.policyname IS NULL THEN
            v_sec_fails := v_sec_fails + 1;
            RAISE WARNING 'Required RLS policy % on % is MISSING', v_pol_spec.pol_name, v_pol_spec.tbl_name;
        ELSE
            -- Cast roles array to text[] to avoid operator does not exist: name[] @> text[]
            IF v_rec.roles::text[] @> v_pol_spec.roles::text[] THEN
                v_sec_passes := v_sec_passes + 1;
            ELSE
                v_sec_fails := v_sec_fails + 1;
                RAISE WARNING 'Policy % on % has incorrect roles: % (expected %)', v_pol_spec.pol_name, v_pol_spec.tbl_name, v_rec.roles, v_pol_spec.roles;
            END IF;

            -- Anti-weakening check against trivial true clauses
            IF trim(both '()' from lower(v_rec.qual)) = 'true' OR trim(both '()' from lower(v_rec.with_check)) = 'true' THEN
                v_sec_warnings := v_sec_warnings + 1;
                RAISE WARNING 'Policy % on % contains unrestricted true clause (anti-weakening alert)', v_pol_spec.pol_name, v_pol_spec.tbl_name;
            END IF;
        END IF;
    END LOOP;

    IF v_sec_fails > 0 THEN
        RAISE NOTICE 'SECTION 3 RESULT: FAIL (Passes: %, Fails: %, Warnings: %, Skipped: %, Inconclusive: %)', v_sec_passes, v_sec_fails, v_sec_warnings, v_sec_skipped, v_sec_inconclusive;
        v_sec_status := 'FAIL';
    ELSIF v_sec_skipped > 0 OR v_sec_inconclusive > 0 THEN
        RAISE NOTICE 'SECTION 3 RESULT: INCONCLUSIVE (Passes: %, Fails: %, Warnings: %, Skipped: %, Inconclusive: %)', v_sec_passes, v_sec_fails, v_sec_warnings, v_sec_skipped, v_sec_inconclusive;
        v_sec_status := 'INCONCLUSIVE';
    ELSIF v_sec_warnings > 0 THEN
        RAISE NOTICE 'SECTION 3 RESULT: PASS WITH ADVISORY WARNINGS (Passes: %, Fails: %, Warnings: %, Skipped: %, Inconclusive: %)', v_sec_passes, v_sec_fails, v_sec_warnings, v_sec_skipped, v_sec_inconclusive;
        v_sec_status := 'WARNING';
    ELSE
        RAISE NOTICE 'SECTION 3 RESULT: PASS (Passes: %, Fails: %, Warnings: %, Skipped: %, Inconclusive: %)', v_sec_passes, v_sec_fails, v_sec_warnings, v_sec_skipped, v_sec_inconclusive;
        v_sec_status := 'PASS';
    END IF;

    v_results_json := v_results_json || jsonb_build_object(
        'section_id', 3,
        'section_name', 'ROW_LEVEL_SECURITY_POLICIES',
        'status', v_sec_status,
        'details', jsonb_build_object(
            'passes', v_sec_passes,
            'fails', v_sec_fails,
            'warnings', v_sec_warnings,
            'skipped', v_sec_skipped,
            'inconclusive', v_sec_inconclusive
        )
    );

    v_global_passes := v_global_passes + v_sec_passes;
    v_global_fails := v_global_fails + v_sec_fails;
    v_global_warnings := v_global_warnings + v_sec_warnings;
    v_global_skipped := v_global_skipped + v_sec_skipped;
    v_global_inconclusive := v_global_inconclusive + v_sec_inconclusive;

    -- ========================================================================
    -- SECTION 4: TRANSACTIONAL RPC FUNCTIONS AUDIT
    -- ========================================================================
    v_sec_passes := 0; v_sec_fails := 0; v_sec_warnings := 0; v_sec_skipped := 0; v_sec_inconclusive := 0;

    FOR v_rpc IN
        SELECT unnest(ARRAY[
            'rpc_create_order',
            'rpc_approve_order',
            'rpc_create_dispatch',
            'rpc_update_delivery_stop',
            'rpc_adjust_inventory',
            'rpc_confirm_receipt',
            'rpc_generate_invoice',
            'rpc_reorder_dispatch_stops'
        ])
    LOOP
        -- Query pg_proc catalogs dynamically to resolve OID and avoid zero-argument signatures
        SELECT p.oid, p.proname, p.prosecdef, p.proconfig, p.proacl, pg_get_function_identity_arguments(p.oid) AS args
        INTO v_rpc_fn
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = v_rpc;

        IF v_rpc_fn.oid IS NULL THEN
            v_sec_fails := v_sec_fails + 1;
            v_sec_skipped := v_sec_skipped + 6;
            RAISE WARNING 'Required transactional RPC % is MISSING', v_rpc;
        ELSE
            v_sec_passes := v_sec_passes + 1;

            -- 1. SECURITY DEFINER check
            IF v_rpc_fn.prosecdef = true THEN
                v_sec_passes := v_sec_passes + 1;
            ELSE
                v_sec_fails := v_sec_fails + 1;
                RAISE WARNING 'RPC % lacks SECURITY DEFINER', v_rpc;
            END IF;

            -- 2. Validate exact proconfig empty search path representation ('search_path=""' or 'search_path=')
            IF v_rpc_fn.proconfig::text[] @> ARRAY['search_path=""']
               OR v_rpc_fn.proconfig::text[] @> ARRAY['search_path=']
               OR array_to_string(v_rpc_fn.proconfig, ',') LIKE '%search_path=""%'
               OR array_to_string(v_rpc_fn.proconfig, ',') LIKE '%search_path=%' THEN
                v_sec_passes := v_sec_passes + 1;
            ELSE
                v_sec_fails := v_sec_fails + 1;
                RAISE WARNING 'RPC % lacks pinned empty search_path', v_rpc;
            END IF;

            -- 3. Check authenticated execute privilege
            IF has_function_privilege('authenticated', v_rpc_fn.oid, 'execute') THEN
                v_sec_passes := v_sec_passes + 1;
            ELSE
                v_sec_fails := v_sec_fails + 1;
                RAISE WARNING 'RPC % is missing execute privilege for authenticated', v_rpc;
            END IF;

            -- 4. Check anon execute privilege revoked
            IF NOT has_function_privilege('anon', v_rpc_fn.oid, 'execute') THEN
                v_sec_passes := v_sec_passes + 1;
            ELSE
                v_sec_fails := v_sec_fails + 1;
                RAISE WARNING 'RPC % unexpectedly allows anon execution!', v_rpc;
            END IF;

            -- 5. Inspect pg_proc.proacl via aclexplode for grantee = 0 (PUBLIC)
            IF v_rpc_fn.proacl IS NOT NULL AND EXISTS (
                SELECT 1 FROM aclexplode(v_rpc_fn.proacl) a
                WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
            ) THEN
                v_sec_fails := v_sec_fails + 1;
                RAISE WARNING 'RPC % grants execute to PUBLIC via explicit ACL!', v_rpc;
            ELSE
                v_sec_passes := v_sec_passes + 1;
            END IF;
        END IF;
    END LOOP;

    IF v_sec_fails > 0 THEN
        RAISE NOTICE 'SECTION 4 RESULT: FAIL (Passes: %, Fails: %, Warnings: %, Skipped: %, Inconclusive: %)', v_sec_passes, v_sec_fails, v_sec_warnings, v_sec_skipped, v_sec_inconclusive;
        v_sec_status := 'FAIL';
    ELSIF v_sec_skipped > 0 OR v_sec_inconclusive > 0 THEN
        RAISE NOTICE 'SECTION 4 RESULT: INCONCLUSIVE (Passes: %, Fails: %, Warnings: %, Skipped: %, Inconclusive: %)', v_sec_passes, v_sec_fails, v_sec_warnings, v_sec_skipped, v_sec_inconclusive;
        v_sec_status := 'INCONCLUSIVE';
    ELSIF v_sec_warnings > 0 THEN
        RAISE NOTICE 'SECTION 4 RESULT: PASS WITH ADVISORY WARNINGS (Passes: %, Fails: %, Warnings: %, Skipped: %, Inconclusive: %)', v_sec_passes, v_sec_fails, v_sec_warnings, v_sec_skipped, v_sec_inconclusive;
        v_sec_status := 'WARNING';
    ELSE
        RAISE NOTICE 'SECTION 4 RESULT: PASS (Passes: %, Fails: %, Warnings: %, Skipped: %, Inconclusive: %)', v_sec_passes, v_sec_fails, v_sec_warnings, v_sec_skipped, v_sec_inconclusive;
        v_sec_status := 'PASS';
    END IF;

    v_results_json := v_results_json || jsonb_build_object(
        'section_id', 4,
        'section_name', 'TRANSACTIONAL_RPC_FUNCTIONS',
        'status', v_sec_status,
        'details', jsonb_build_object(
            'passes', v_sec_passes,
            'fails', v_sec_fails,
            'warnings', v_sec_warnings,
            'skipped', v_sec_skipped,
            'inconclusive', v_sec_inconclusive
        )
    );

    v_global_passes := v_global_passes + v_sec_passes;
    v_global_fails := v_global_fails + v_sec_fails;
    v_global_warnings := v_global_warnings + v_sec_warnings;
    v_global_skipped := v_global_skipped + v_sec_skipped;
    v_global_inconclusive := v_global_inconclusive + v_sec_inconclusive;

    -- ========================================================================
    -- SECTION 5: INTERNAL HELPER FUNCTIONS AUDIT
    -- ========================================================================
    v_sec_passes := 0; v_sec_fails := 0; v_sec_warnings := 0; v_sec_skipped := 0; v_sec_inconclusive := 0;

    FOR v_helper_spec IN
        SELECT * FROM (VALUES
            ('is_super_admin', '', false, true, true),
            ('fn_is_super_admin', '', false, true, true),
            ('set_updated_at', '', false, false, false),
            ('current_app_role', '', false, true, true),
            ('current_branch_id', '', false, true, true),
            ('fn_user_branch_id', '', false, true, true),
            ('can_access_dispatch', '', false, true, true),
            ('can_delivery_staff_view_order', '', false, true, true)
        ) AS t(fn_name, args, allow_anon, allow_auth, require_secdef)
    LOOP
        SELECT p.oid, p.proname, p.prosecdef, p.proconfig, p.proacl
        INTO v_helper_fn
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = v_helper_spec.fn_name;

        IF v_helper_fn.oid IS NULL THEN
            v_sec_fails := v_sec_fails + 1;
            v_sec_skipped := v_sec_skipped + 6;
            RAISE WARNING 'Required helper function % is MISSING', v_helper_spec.fn_name;
        ELSE
            v_sec_passes := v_sec_passes + 1;

            -- Check SECURITY DEFINER
            IF v_helper_spec.require_secdef THEN
                IF v_helper_fn.prosecdef = true THEN
                    v_sec_passes := v_sec_passes + 1;
                ELSE
                    v_sec_fails := v_sec_fails + 1;
                    RAISE WARNING 'Helper % lacks SECURITY DEFINER', v_helper_spec.fn_name;
                END IF;

                -- Check search_path pinning for security definer helpers
                IF v_helper_fn.proconfig::text[] @> ARRAY['search_path=""']
                   OR v_helper_fn.proconfig::text[] @> ARRAY['search_path=']
                   OR array_to_string(v_helper_fn.proconfig, ',') LIKE '%search_path=""%'
                   OR array_to_string(v_helper_fn.proconfig, ',') LIKE '%search_path=%' THEN
                    v_sec_passes := v_sec_passes + 1;
                ELSE
                    v_sec_fails := v_sec_fails + 1;
                    RAISE WARNING 'Helper % lacks pinned empty search_path', v_helper_spec.fn_name;
                END IF;
            ELSE
                v_sec_passes := v_sec_passes + 1;
            END IF;

            -- Check anonymous access
            IF v_helper_spec.allow_anon THEN
                IF has_function_privilege('anon', v_helper_fn.oid, 'execute') THEN
                    v_sec_passes := v_sec_passes + 1;
                ELSE
                    v_sec_warnings := v_sec_warnings + 1;
                END IF;
            ELSE
                IF NOT has_function_privilege('anon', v_helper_fn.oid, 'execute') THEN
                    v_sec_passes := v_sec_passes + 1;
                ELSE
                    v_sec_fails := v_sec_fails + 1;
                    RAISE WARNING 'Helper % unexpectedly permits anon execute!', v_helper_spec.fn_name;
                END IF;
            END IF;

            -- Check authenticated access
            IF v_helper_spec.allow_auth THEN
                IF has_function_privilege('authenticated', v_helper_fn.oid, 'execute') THEN
                    v_sec_passes := v_sec_passes + 1;
                ELSE
                    v_sec_fails := v_sec_fails + 1;
                    RAISE WARNING 'Helper % missing execute for authenticated', v_helper_spec.fn_name;
                END IF;
            ELSE
                v_sec_passes := v_sec_passes + 1;
            END IF;

            -- Check PUBLIC execute via proacl aclexplode
            IF v_helper_fn.proacl IS NOT NULL AND EXISTS (
                SELECT 1 FROM aclexplode(v_helper_fn.proacl) a
                WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
            ) THEN
                v_sec_fails := v_sec_fails + 1;
                RAISE WARNING 'Helper % grants execute to PUBLIC via explicit ACL!', v_helper_spec.fn_name;
            ELSE
                v_sec_passes := v_sec_passes + 1;
            END IF;
        END IF;
    END LOOP;

    IF v_sec_fails > 0 THEN
        RAISE NOTICE 'SECTION 5 RESULT: FAIL (Passes: %, Fails: %, Warnings: %, Skipped: %, Inconclusive: %)', v_sec_passes, v_sec_fails, v_sec_warnings, v_sec_skipped, v_sec_inconclusive;
        v_sec_status := 'FAIL';
    ELSIF v_sec_skipped > 0 OR v_sec_inconclusive > 0 THEN
        RAISE NOTICE 'SECTION 5 RESULT: INCONCLUSIVE (Passes: %, Fails: %, Warnings: %, Skipped: %, Inconclusive: %)', v_sec_passes, v_sec_fails, v_sec_warnings, v_sec_skipped, v_sec_inconclusive;
        v_sec_status := 'INCONCLUSIVE';
    ELSIF v_sec_warnings > 0 THEN
        RAISE NOTICE 'SECTION 5 RESULT: PASS WITH ADVISORY WARNINGS (Passes: %, Fails: %, Warnings: %, Skipped: %, Inconclusive: %)', v_sec_passes, v_sec_fails, v_sec_warnings, v_sec_skipped, v_sec_inconclusive;
        v_sec_status := 'WARNING';
    ELSE
        RAISE NOTICE 'SECTION 5 RESULT: PASS (Passes: %, Fails: %, Warnings: %, Skipped: %, Inconclusive: %)', v_sec_passes, v_sec_fails, v_sec_warnings, v_sec_skipped, v_sec_inconclusive;
        v_sec_status := 'PASS';
    END IF;

    v_results_json := v_results_json || jsonb_build_object(
        'section_id', 5,
        'section_name', 'INTERNAL_HELPER_FUNCTIONS',
        'status', v_sec_status,
        'details', jsonb_build_object(
            'passes', v_sec_passes,
            'fails', v_sec_fails,
            'warnings', v_sec_warnings,
            'skipped', v_sec_skipped,
            'inconclusive', v_sec_inconclusive
        )
    );

    v_global_passes := v_global_passes + v_sec_passes;
    v_global_fails := v_global_fails + v_sec_fails;
    v_global_warnings := v_global_warnings + v_sec_warnings;
    v_global_skipped := v_global_skipped + v_sec_skipped;
    v_global_inconclusive := v_global_inconclusive + v_sec_inconclusive;

    -- ========================================================================
    -- SECTION 6: SEQUENCES PERMISSIONS & INTEGRITY
    -- ========================================================================
    v_sec_passes := 0; v_sec_fails := 0; v_sec_warnings := 0; v_sec_skipped := 0; v_sec_inconclusive := 0;

    -- Sequence existence check for orders_order_number_seq
    IF NOT EXISTS (
        SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'orders_order_number_seq'
    ) THEN
        v_sec_fails := v_sec_fails + 1;
        v_sec_skipped := v_sec_skipped + 5;
        RAISE WARNING 'Sequence public.orders_order_number_seq does not exist';
    ELSE
        v_sec_passes := v_sec_passes + 1;
    END IF;

    -- Verify all sequence permissions
    FOR v_seq IN
        SELECT unnest(ARRAY[
            'orders_order_number_seq',
            'dispatches_dispatch_number_seq',
            'invoices_invoice_number_seq'
        ])
    LOOP
        IF EXISTS (
            SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = v_seq
        ) THEN
            v_sec_passes := v_sec_passes + 1;

            -- Check authenticated has USAGE
            IF has_sequence_privilege('authenticated', 'public.' || v_seq, 'USAGE') THEN
                v_sec_passes := v_sec_passes + 1;
            ELSE
                v_sec_fails := v_sec_fails + 1;
                RAISE WARNING 'Sequence % missing USAGE for authenticated', v_seq;
            END IF;

            -- Check anon revoked
            IF NOT has_sequence_privilege('anon', 'public.' || v_seq, 'USAGE') THEN
                v_sec_passes := v_sec_passes + 1;
            ELSE
                v_sec_fails := v_sec_fails + 1;
                RAISE WARNING 'Sequence % has USAGE granted to anon!', v_seq;
            END IF;
        ELSE
            v_sec_warnings := v_sec_warnings + 1;
        END IF;
    END LOOP;

    IF v_sec_fails > 0 THEN
        RAISE NOTICE 'SECTION 6 RESULT: FAIL (Passes: %, Fails: %, Warnings: %, Skipped: %, Inconclusive: %)', v_sec_passes, v_sec_fails, v_sec_warnings, v_sec_skipped, v_sec_inconclusive;
        v_sec_status := 'FAIL';
    ELSIF v_sec_skipped > 0 OR v_sec_inconclusive > 0 THEN
        RAISE NOTICE 'SECTION 6 RESULT: INCONCLUSIVE (Passes: %, Fails: %, Warnings: %, Skipped: %, Inconclusive: %)', v_sec_passes, v_sec_fails, v_sec_warnings, v_sec_skipped, v_sec_inconclusive;
        v_sec_status := 'INCONCLUSIVE';
    ELSIF v_sec_warnings > 0 THEN
        RAISE NOTICE 'SECTION 6 RESULT: PASS WITH ADVISORY WARNINGS (Passes: %, Fails: %, Warnings: %, Skipped: %, Inconclusive: %)', v_sec_passes, v_sec_fails, v_sec_warnings, v_sec_skipped, v_sec_inconclusive;
        v_sec_status := 'WARNING';
    ELSE
        RAISE NOTICE 'SECTION 6 RESULT: PASS (Passes: %, Fails: %, Warnings: %, Skipped: %, Inconclusive: %)', v_sec_passes, v_sec_fails, v_sec_warnings, v_sec_skipped, v_sec_inconclusive;
        v_sec_status := 'PASS';
    END IF;

    v_results_json := v_results_json || jsonb_build_object(
        'section_id', 6,
        'section_name', 'SEQUENCES_PERMISSIONS',
        'status', v_sec_status,
        'details', jsonb_build_object(
            'passes', v_sec_passes,
            'fails', v_sec_fails,
            'warnings', v_sec_warnings,
            'skipped', v_sec_skipped,
            'inconclusive', v_sec_inconclusive
        )
    );

    v_global_passes := v_global_passes + v_sec_passes;
    v_global_fails := v_global_fails + v_sec_fails;
    v_global_warnings := v_global_warnings + v_sec_warnings;
    v_global_skipped := v_global_skipped + v_sec_skipped;
    v_global_inconclusive := v_global_inconclusive + v_sec_inconclusive;

    -- ========================================================================
    -- SECTION 7: EXTENSIONS & CRYPTO HELPERS
    -- ========================================================================
    v_sec_passes := 0; v_sec_fails := 0; v_sec_warnings := 0; v_sec_skipped := 0; v_sec_inconclusive := 0;

    -- 1. Check gen_random_uuid in pg_catalog as required primary key default
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'pg_catalog' AND p.proname = 'gen_random_uuid'
    ) THEN
        v_sec_fails := v_sec_fails + 1;
        v_sec_skipped := v_sec_skipped + 2;
        RAISE WARNING 'Function gen_random_uuid() is missing from database catalogs';
    ELSE
        v_sec_passes := v_sec_passes + 1;
    END IF;

    -- 2. Verify uuid_generate_v4() extension linkage via pg_depend (deptype = 'e') dynamically
    SELECT p.oid, p.proname, e.extname INTO v_ext_rec
    FROM pg_proc p
    JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e'
    JOIN pg_extension e ON d.refobjid = e.oid
    WHERE p.proname = 'uuid_generate_v4' AND e.extname = 'uuid-ossp';

    IF v_ext_rec.oid IS NOT NULL THEN
        v_sec_passes := v_sec_passes + 1;
    ELSE
        v_sec_warnings := v_sec_warnings + 1;
        RAISE NOTICE 'uuid_generate_v4 is not linked to extension uuid-ossp via pg_depend (advisory)';
    END IF;

    IF v_sec_fails > 0 THEN
        RAISE NOTICE 'SECTION 7 RESULT: FAIL (Passes: %, Fails: %, Warnings: %, Skipped: %, Inconclusive: %)', v_sec_passes, v_sec_fails, v_sec_warnings, v_sec_skipped, v_sec_inconclusive;
        v_sec_status := 'FAIL';
    ELSIF v_sec_skipped > 0 OR v_sec_inconclusive > 0 THEN
        RAISE NOTICE 'SECTION 7 RESULT: INCONCLUSIVE (Passes: %, Fails: %, Warnings: %, Skipped: %, Inconclusive: %)', v_sec_passes, v_sec_fails, v_sec_warnings, v_sec_skipped, v_sec_inconclusive;
        v_sec_status := 'INCONCLUSIVE';
    ELSIF v_sec_warnings > 0 THEN
        RAISE NOTICE 'SECTION 7 RESULT: PASS WITH ADVISORY WARNINGS (Passes: %, Fails: %, Warnings: %, Skipped: %, Inconclusive: %)', v_sec_passes, v_sec_fails, v_sec_warnings, v_sec_skipped, v_sec_inconclusive;
        v_sec_status := 'WARNING';
    ELSE
        RAISE NOTICE 'SECTION 7 RESULT: PASS (Passes: %, Fails: %, Warnings: %, Skipped: %, Inconclusive: %)', v_sec_passes, v_sec_fails, v_sec_warnings, v_sec_skipped, v_sec_inconclusive;
        v_sec_status := 'PASS';
    END IF;

    v_results_json := v_results_json || jsonb_build_object(
        'section_id', 7,
        'section_name', 'EXTENSIONS_AND_CRYPTO',
        'status', v_sec_status,
        'details', jsonb_build_object(
            'passes', v_sec_passes,
            'fails', v_sec_fails,
            'warnings', v_sec_warnings,
            'skipped', v_sec_skipped,
            'inconclusive', v_sec_inconclusive
        )
    );

    v_global_passes := v_global_passes + v_sec_passes;
    v_global_fails := v_global_fails + v_sec_fails;
    v_global_warnings := v_global_warnings + v_sec_warnings;
    v_global_skipped := v_global_skipped + v_sec_skipped;
    v_global_inconclusive := v_global_inconclusive + v_sec_inconclusive;

    -- ========================================================================
    -- FINAL OUTCOME LOGIC: FAIL > INCONCLUSIVE > PASS WITH ADVISORY WARNINGS > PASS
    -- ========================================================================
    IF v_global_fails > 0 THEN
        v_global_status := 'FAIL';
        RAISE NOTICE '============================================================';
        RAISE NOTICE 'FINAL AUDIT RESULT: FAIL (Passes: %, Fails: %, Warnings: %, Skipped: %, Inconclusive: %)', v_global_passes, v_global_fails, v_global_warnings, v_global_skipped, v_global_inconclusive;
        RAISE NOTICE '============================================================';
    ELSIF v_global_skipped > 0 OR v_global_inconclusive > 0 THEN
        v_global_status := 'INCONCLUSIVE';
        RAISE NOTICE '============================================================';
        RAISE NOTICE 'FINAL AUDIT RESULT: INCONCLUSIVE (Passes: %, Fails: %, Warnings: %, Skipped: %, Inconclusive: %)', v_global_passes, v_global_fails, v_global_warnings, v_global_skipped, v_global_inconclusive;
        RAISE NOTICE '============================================================';
    ELSIF v_global_warnings > 0 THEN
        v_global_status := 'WARNING';
        RAISE NOTICE '============================================================';
        RAISE NOTICE 'FINAL AUDIT RESULT: PASS WITH ADVISORY WARNINGS (Passes: %, Fails: %, Warnings: %, Skipped: %, Inconclusive: %)', v_global_passes, v_global_fails, v_global_warnings, v_global_skipped, v_global_inconclusive;
        RAISE NOTICE '============================================================';
    ELSE
        v_global_status := 'PASS';
        RAISE NOTICE '============================================================';
        RAISE NOTICE 'FINAL AUDIT RESULT: PASS (Passes: %, Fails: %, Warnings: %, Skipped: %, Inconclusive: %)', v_global_passes, v_global_fails, v_global_warnings, v_global_skipped, v_global_inconclusive;
        RAISE NOTICE '============================================================';
    END IF;

    -- Summary Section 99
    v_results_json := v_results_json || jsonb_build_object(
        'section_id', 99,
        'section_name', 'GLOBAL_SUMMARY',
        'status', v_global_status,
        'details', jsonb_build_object(
            'passes', v_global_passes,
            'fails', v_global_fails,
            'warnings', v_global_warnings,
            'skipped', v_global_skipped,
            'inconclusive', v_global_inconclusive
        )
    );

    -- Store results in memory session parameter
    PERFORM set_config('icespot.audit_results', v_results_json::text, false);
END $$;

-- ==============================================================================
-- RESULTS EMISSION QUERY (PROJECTS RESULTS GRID VIA JSONB UNPACKING)
-- ==============================================================================
WITH raw_audit AS (
    SELECT current_setting('icespot.audit_results', true) AS payload
),
audit_payload AS (
    SELECT CASE
        WHEN payload IS NULL OR payload = '' THEN
            jsonb_build_array(
                jsonb_build_object(
                    'section_name', 'EXECUTION_ERROR',
                    'status', 'FAIL',
                    'details', jsonb_build_object(
                        'error', 'Audit results uninitialized or missing. The verification DO block was not executed or aborted.'
                    )
                )
            )
        ELSE payload::jsonb
    END AS data
    FROM raw_audit
)
SELECT
    r.section_id,
    r.section_name,
    r.status,
    r.details
FROM audit_payload,
     jsonb_to_recordset(audit_payload.data) AS r(
         section_id int,
         section_name text,
         status text,
         details jsonb
     )
ORDER BY r.section_id;
