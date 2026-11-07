-- ==============================================================================
-- Icespot — Production Pre-Execution Read-Only Verification Script
-- File: supabase/production_precheck_readonly.sql
-- Target Database: Supabase Project gprtubirudzequpukzel
-- Safety Classification: STRICTLY READ-ONLY (Zero Inserts, Updates, Deletes, Alters, or Drops)
-- Guarantee: 100% Catalog-Driven & Dynamic. Zero static references to potentially
--            missing public or auth tables. Immune to SQLSTATE 42P01 (relation does not exist),
--            SQLSTATE 42703 (column does not exist), and SQLSTATE 42883 (type comparison mismatch).
-- ==============================================================================

-- 1. Catalog-Driven Operational Table Inventory (Existence & RLS State)
-- Evaluates all 13 canonical application tables against pg_tables and pg_class.
-- Distinguishes tables verified to be created by recovery migration (dispatch_orders)
-- from tables that must pre-exist in the production schema (requires schema review if missing).
SELECT 
    expected.table_name,
    CASE 
        WHEN t.tablename IS NOT NULL THEN 'PRESENT'
        WHEN expected.created_by_migration THEN 'MISSING (will be created by recovery migration)'
        ELSE 'MISSING (requires schema review)'
    END AS presence_status,
    expected.created_by_migration AS created_by_recovery_migration,
    t.rowsecurity AS rls_enabled,
    CASE 
        WHEN c.relname IS NOT NULL THEN GREATEST(c.reltuples::bigint, 0)
        ELSE NULL
    END AS catalog_estimated_rows
FROM (
    VALUES 
        ('branches', false),
        ('products', false),
        ('profiles', false),
        ('inventory', false),
        ('orders', false),
        ('order_items', false),
        ('dispatches', false),
        ('dispatch_orders', true),
        ('dispatch_items', false),
        ('receipts', false),
        ('receipt_items', false),
        ('audit_logs', false),
        ('enquiries', false)
) AS expected(table_name, created_by_migration)
LEFT JOIN pg_tables t 
    ON t.schemaname = 'public' AND t.tablename = expected.table_name
LEFT JOIN pg_class c 
    ON c.relname = expected.table_name AND c.relnamespace = 'public'::regnamespace
ORDER BY 
    CASE WHEN t.tablename IS NOT NULL THEN 1 ELSE 2 END,
    expected.table_name;

-- 2. Dynamic Live Row Counts Across All 13 Expected Operational Tables
-- Safely iterates through all expected tables via dynamic SQL; missing tables report as MISSING
-- Distinguishes tables created by recovery migration from those requiring schema review.
DO $$
DECLARE
    v_tbl text;
    v_cnt bigint;
    v_exists boolean;
    v_is_created_by_mig boolean;
    v_present_count integer := 0;
    v_missing_mig_count integer := 0;
    v_missing_review_count integer := 0;
    v_expected_tables text[] := ARRAY[
        'branches', 'products', 'profiles', 'inventory', 
        'orders', 'order_items', 'dispatches', 'dispatch_orders', 
        'dispatch_items', 'receipts', 'receipt_items', 'audit_logs', 'enquiries'
    ];
BEGIN
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'CHECK 2: DYNAMIC LIVE ROW COUNTS ACROSS OPERATIONAL TABLES';
    RAISE NOTICE '============================================================';

    FOREACH v_tbl IN ARRAY v_expected_tables LOOP
        SELECT (to_regclass('public.' || quote_ident(v_tbl)) IS NOT NULL) INTO v_exists;
        v_is_created_by_mig := (v_tbl = 'dispatch_orders');

        IF v_exists THEN
            EXECUTE 'SELECT count(*) FROM public.' || quote_ident(v_tbl) INTO v_cnt;
            v_present_count := v_present_count + 1;
            RAISE NOTICE 'PRESENT [Check 2]: public.% -> % rows', v_tbl, v_cnt;
        ELSE
            IF v_is_created_by_mig THEN
                v_missing_mig_count := v_missing_mig_count + 1;
                RAISE NOTICE 'MISSING [Check 2]: public.% is ABSENT from schema (will be created by recovery migration)', v_tbl;
            ELSE
                v_missing_review_count := v_missing_review_count + 1;
                RAISE WARNING 'MISSING [Check 2]: public.% is ABSENT from schema (requires schema review)', v_tbl;
            END IF;
        END IF;
    END LOOP;

    RAISE NOTICE 'Summary: % present, % missing (% to be created by migration, % requiring schema review) out of 13 expected tables.', 
        v_present_count, (v_missing_mig_count + v_missing_review_count), v_missing_mig_count, v_missing_review_count;
END;
$$ LANGUAGE plpgsql;

-- 3. Dedicated Check for Multi-Order Junction Table (dispatch_orders)
-- Safely inspects catalogs without triggering SQLSTATE 42P01 if the table is absent
SELECT 
    'dispatch_orders' AS table_name,
    CASE 
        WHEN to_regclass('public.dispatch_orders') IS NOT NULL THEN 'PRESENT (Will be preserved)'
        ELSE 'SKIPPED: ABSENT (Expected before recovery - will be created by recovery migration)'
    END AS status,
    EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'dispatch_orders'
    ) AS dispatch_orders_exists;

DO $$
DECLARE
    v_do_count bigint;
BEGIN
    IF to_regclass('public.dispatch_orders') IS NOT NULL THEN
        EXECUTE 'SELECT count(*) FROM public.dispatch_orders' INTO v_do_count;
        RAISE NOTICE 'PASS [Check 3]: dispatch_orders table exists with % records.', v_do_count;
    ELSE
        RAISE NOTICE 'SKIPPED [Check 3]: dispatch_orders table is absent in current production schema. Row count check skipped (table will be created by recovery migration).';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 4. Key Column Data Types & Defaults (Catalog Query)
SELECT 
    table_name,
    column_name,
    data_type,
    column_default,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND (
    (table_name = 'branches' AND column_name IN ('id', 'code', 'category')) OR
    (table_name = 'profiles' AND column_name IN ('id', 'role', 'branch_id')) OR
    (table_name = 'products' AND column_name IN ('id', 'sku', 'selling_price')) OR
    (table_name = 'orders' AND column_name IN ('id', 'order_number', 'branch_id')) OR
    (table_name = 'dispatches' AND column_name IN ('id', 'dispatch_number', 'order_id', 'delivery_staff_id')) OR
    (table_name = 'inventory' AND column_name IN ('id', 'quantity', 'branch_id', 'product_id')) OR
    (table_name = 'dispatch_items' AND column_name IN ('id', 'dispatch_id', 'product_id', 'quantity_loaded', 'quantity_delivered'))
  )
ORDER BY table_name, column_name;

-- 5. Uniqueness Constraints & Indexes on Critical Columns
-- Uses direct catalog joins (pg_class) to avoid ::regclass cast errors on missing tables
SELECT 
    c.relname AS table_name,
    con.conname AS constraint_name,
    con.contype AS constraint_type,
    pg_get_constraintdef(con.oid) AS constraint_definition
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
WHERE con.connamespace = 'public'::regnamespace
  AND (
    (c.relname = 'branches' AND pg_get_constraintdef(con.oid) LIKE '%code%') OR
    (c.relname = 'products' AND pg_get_constraintdef(con.oid) LIKE '%sku%') OR
    (c.relname = 'inventory' AND con.conname LIKE '%inventory%') OR
    (c.relname = 'profiles' AND con.conname LIKE '%branch%')
  );

-- Unique indexes on branches, products, and inventory
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND (
    (tablename = 'branches' AND indexdef LIKE '%code%') OR
    (tablename = 'products' AND indexdef LIKE '%sku%') OR
    (tablename = 'inventory' AND indexdef LIKE '%inventory%')
  );

-- 6. Dynamic Inspection of dispatch_items: Columns, Constraint State, and Duplicate Records
-- Evaluated dynamically to prevent SQLSTATE 42P01 and 42703 if table or columns do not exist yet
DO $$
DECLARE
    v_has_table boolean;
    v_has_disp_col boolean;
    v_has_prod_col boolean;
    v_disp_col_type text;
    v_prod_col_type text;
    v_has_constraint boolean;
    v_constraint_def text;
    v_missing_cols text[] := ARRAY[]::text[];
    v_dup_count bigint;
BEGIN
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'CHECK 6: DISPATCH_ITEMS COLUMNS, CONSTRAINT & DUPLICATE DIAGNOSTIC';
    RAISE NOTICE '============================================================';

    SELECT (to_regclass('public.dispatch_items') IS NOT NULL) INTO v_has_table;

    IF NOT v_has_table THEN
        RAISE NOTICE 'SKIPPED [Check 6]: Table public.dispatch_items is absent from schema (requires schema review).';
        RETURN;
    END IF;

    -- 6a. Inspect required columns separately
    SELECT 
        bool_or(column_name = 'dispatch_id'),
        bool_or(column_name = 'product_id')
    INTO 
        v_has_disp_col,
        v_has_prod_col
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'dispatch_items';

    SELECT data_type INTO v_disp_col_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dispatch_items' AND column_name = 'dispatch_id';

    SELECT data_type INTO v_prod_col_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dispatch_items' AND column_name = 'product_id';

    IF NOT COALESCE(v_has_disp_col, false) THEN
        v_missing_cols := array_append(v_missing_cols, 'dispatch_items.dispatch_id');
    END IF;
    IF NOT COALESCE(v_has_prod_col, false) THEN
        v_missing_cols := array_append(v_missing_cols, 'dispatch_items.product_id');
    END IF;

    -- 6b. Inspect existing constraint state separately
    SELECT EXISTS (
        SELECT 1 FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        WHERE con.connamespace = 'public'::regnamespace
          AND c.relname = 'dispatch_items'
          AND con.conname = 'uq_dispatch_product'
    ), (
        SELECT pg_get_constraintdef(con.oid)
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        WHERE con.connamespace = 'public'::regnamespace
          AND c.relname = 'dispatch_items'
          AND con.conname = 'uq_dispatch_product'
        LIMIT 1
    ) INTO v_has_constraint, v_constraint_def;

    IF v_has_constraint THEN
        RAISE NOTICE 'INFO [Check 6 - Constraint]: Constraint uq_dispatch_product already exists on public.dispatch_items (%).', v_constraint_def;
    ELSE
        RAISE NOTICE 'INFO [Check 6 - Constraint]: Constraint uq_dispatch_product is absent from public.dispatch_items (will be added by recovery migration if columns exist).';
    END IF;

    -- 6c. Assess required columns for duplicate check
    IF NOT COALESCE(v_has_prod_col, false) THEN
        RAISE NOTICE 'SKIPPED [Check 6 - Duplicates]: Column product_id is absent from public.dispatch_items (column will be added by recovery migration). Duplicate check skipped.';
        RETURN;
    END IF;

    IF NOT COALESCE(v_has_disp_col, false) THEN
        RAISE NOTICE 'SKIPPED [Check 6 - Duplicates]: Column dispatch_id is absent from public.dispatch_items (requires schema review). Duplicate check skipped.';
        RETURN;
    END IF;

    RAISE NOTICE 'INFO [Check 6 - Columns]: dispatch_id (type: %) and product_id (type: %) verified present.',
        v_disp_col_type, v_prod_col_type;

    -- 6d. Duplicate-group check: reports ONLY duplicate count without claiming complete constraint safety
    EXECUTE 'SELECT count(*) FROM (
        SELECT dispatch_id, product_id 
        FROM public.dispatch_items 
        WHERE product_id IS NOT NULL 
        GROUP BY dispatch_id, product_id 
        HAVING count(*) > 1
    ) sub' INTO v_dup_count;

    IF v_dup_count > 0 THEN
        RAISE WARNING 'FAIL [Check 6 - Duplicates]: Found % duplicate (dispatch_id, product_id) groups in public.dispatch_items.', v_dup_count;
    ELSE
        RAISE NOTICE 'PASS [Check 6 - Duplicates]: Zero duplicate (dispatch_id, product_id) groups found in public.dispatch_items. (Note: duplicate check evaluates existing rows only; complete constraint readiness requires verifying FK integrity and migration prerequisites).';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 7. Existing Enums & Allowed Labels (Catalog Query)
SELECT 
    t.typname AS enum_name,
    e.enumlabel AS enum_value
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
JOIN pg_namespace n ON t.typnamespace = n.oid
WHERE n.nspname = 'public'
ORDER BY enum_name, e.enumsortorder;

-- 8. Sequence Architecture, Ownership & State Synchronization Inspection
-- NOTE: All checks in Section 8 are POINT-IN-TIME DIAGNOSTICS.
-- Reading sequence state indicates value at the instant of inspection, but cannot guarantee
-- the next generated value if concurrent sessions are active or if sequence caching is enabled.

-- 8a. Guarded Column Default & Serial Sequence Linkage Diagnostic
-- Safely inspects table and column existence via catalog before calling pg_get_serial_sequence()
DO $$
DECLARE
    v_targets text[][] := ARRAY[
        ARRAY['orders', 'order_number'],
        ARRAY['dispatches', 'dispatch_number']
    ];
    v_tbl text;
    v_col text;
    v_has_table boolean;
    v_has_col boolean;
    v_col_default text;
    v_data_type text;
    v_seq text;
BEGIN
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'CHECK 8a: COLUMN DEFAULT & SERIAL SEQUENCE LINKAGE DIAGNOSTIC';
    RAISE NOTICE '============================================================';

    FOR i IN 1 .. array_length(v_targets, 1) LOOP
        v_tbl := v_targets[i][1];
        v_col := v_targets[i][2];

        SELECT (to_regclass('public.' || quote_ident(v_tbl)) IS NOT NULL) INTO v_has_table;

        IF NOT v_has_table THEN
            RAISE NOTICE 'SKIPPED [Check 8a - %.%]: Table public.% is ABSENT from schema (requires schema review).',
                v_tbl, v_col, v_tbl;
        ELSE
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_schema = 'public' AND table_name = v_tbl AND column_name = v_col
            ) INTO v_has_col;

            IF NOT v_has_col THEN
                RAISE NOTICE 'SKIPPED [Check 8a - %.%]: Column "%" is ABSENT from public.% (requires schema review).',
                    v_tbl, v_col, v_col, v_tbl;
            ELSE
                SELECT column_default, data_type 
                INTO v_col_default, v_data_type
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = v_tbl AND column_name = v_col;

                -- Safely call pg_get_serial_sequence only after verifying table and column exist
                v_seq := pg_get_serial_sequence('public.' || quote_ident(v_tbl), v_col);

                IF v_col_default IS NULL THEN
                    RAISE NOTICE 'INFO [Check 8a - %.%]: Column exists (type: %) with NO DEFAULT. Linked sequence: %. (Recovery migration will configure DEFAULT nextval(...)).',
                        v_tbl, v_col, v_data_type, COALESCE(v_seq, 'NONE');
                ELSIF v_col_default LIKE '%nextval%' THEN
                    RAISE NOTICE 'PASS [Check 8a - %.%]: Column exists (type: %) with ACTIVE DEFAULT: %. Linked sequence: %.',
                        v_tbl, v_col, v_data_type, v_col_default, COALESCE(v_seq, 'NONE');
                ELSE
                    RAISE NOTICE 'INFO [Check 8a - %.%]: Column exists (type: %) with OTHER DEFAULT: %. Linked sequence: %.',
                        v_tbl, v_col, v_data_type, v_col_default, COALESCE(v_seq, 'NONE');
                END IF;
            END IF;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 8b. Sequence Catalog Definitions, Parameters & Table Ownership
SELECT 
    s.sequencename AS sequence_name,
    s.sequenceowner,
    s.data_type,
    s.start_value,
    s.min_value,
    s.max_value,
    s.increment_by,
    s.cache_size,
    s.cycle,
    COALESCE((SELECT relname FROM pg_class WHERE oid = d.refobjid), 'UNOWNED (Standalone sequence)') AS owned_by_table,
    COALESCE(a.attname, 'NONE') AS owned_by_column
FROM pg_sequences s
JOIN pg_class c ON c.relname = s.sequencename AND c.relnamespace = 'public'::regnamespace
LEFT JOIN pg_depend d ON d.objid = c.oid AND d.classid = 'pg_class'::regclass AND d.refclassid = 'pg_class'::regclass AND d.deptype IN ('a', 'i')
LEFT JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
WHERE s.schemaname = 'public'
  AND s.sequencename IN ('orders_order_number_seq', 'dispatches_dispatch_number_seq');

-- 8c. Sequence Inventory vs Actual Table Maxima (Point-in-Time Matrix)
-- Pure catalog query; does not statically query public.orders or public.dispatches
SELECT 
    target.sequence_name,
    target.target_table,
    target.target_column,
    (s.sequencename IS NOT NULL) AS sequence_exists,
    (to_regclass('public.' || target.target_table) IS NOT NULL) AS target_table_exists,
    (d.objid IS NOT NULL) AS is_column_owned,
    (c.column_default LIKE '%' || target.sequence_name || '%') AS is_column_default,
    s.cache_size,
    s.increment_by,
    s.last_value AS catalog_last_value,
    CASE 
        WHEN s.sequencename IS NULL THEN 'SKIPPED: Sequence ABSENT (Expected - will be created by recovery migration)'
        WHEN to_regclass('public.' || target.target_table) IS NULL THEN 'WARNING: Target table does not exist in schema'
        WHEN c.column_default IS NULL OR c.column_default NOT LIKE '%' || target.sequence_name || '%' THEN 'WARNING: Sequence exists but is NOT set as column default'
        WHEN s.cache_size > 1 THEN 'INCONCLUSIVE: cache_size > 1 (Session cache limits certainty)'
        WHEN s.increment_by <= 0 THEN 'INCONCLUSIVE: increment_by <= 0 (Non-ascending sequence)'
        ELSE 'CONFIGURED: Active column default'
    END AS architectural_status
FROM (
    VALUES 
        ('orders_order_number_seq'::text, 'orders'::text, 'order_number'::text),
        ('dispatches_dispatch_number_seq'::text, 'dispatches'::text, 'dispatch_number'::text)
) AS target(sequence_name, target_table, target_column)
LEFT JOIN pg_sequences s 
    ON s.schemaname = 'public' AND s.sequencename = target.sequence_name
LEFT JOIN pg_class cls 
    ON cls.relname = target.sequence_name AND cls.relnamespace = 'public'::regnamespace
LEFT JOIN pg_depend d 
    ON d.objid = cls.oid AND d.classid = 'pg_class'::regclass AND d.refclassid = 'pg_class'::regclass AND d.deptype IN ('a', 'i')
LEFT JOIN information_schema.columns c 
    ON c.table_schema = 'public' AND c.table_name = target.target_table AND c.column_name = target.target_column;

-- 8d. Dynamic Point-in-Time Diagnostic of is_called & Next Generated Value
-- Evaluates sequence state at instant of execution without calling nextval() or setval()
DO $$
DECLARE
    -- Sequence existence, ownership, and configuration
    v_has_ord_seq boolean;
    v_has_disp_seq boolean;
    v_ord_default text;
    v_disp_default text;
    v_ord_cache integer;
    v_disp_cache integer;
    
    -- Table states
    v_max_ord bigint;
    v_max_disp bigint;
    v_ord_rows bigint;
    v_disp_rows bigint;
    
    -- Sequence internal runtime states (read-only)
    v_ord_last bigint;
    v_ord_called boolean;
    v_ord_inc bigint;
    v_ord_next bigint;
    
    v_disp_last bigint;
    v_disp_called boolean;
    v_disp_inc bigint;
    v_disp_next bigint;
BEGIN
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'CHECK 8: SEQUENCE SYNCHRONIZATION POINT-IN-TIME DIAGNOSTIC';
    RAISE NOTICE 'Notice: Evaluates state at instant of execution. Concurrent session mutations';
    RAISE NOTICE 'or client connections calling nextval() cannot be prevented by read-only checks.';
    RAISE NOTICE '============================================================';

    -- 1. Check sequence existence via catalog
    SELECT (to_regclass('public.orders_order_number_seq') IS NOT NULL) INTO v_has_ord_seq;
    SELECT (to_regclass('public.dispatches_dispatch_number_seq') IS NOT NULL) INTO v_has_disp_seq;

    -- 2. Inspect column defaults
    SELECT column_default INTO v_ord_default FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'order_number';
    
    SELECT column_default INTO v_disp_default FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'dispatches' AND column_name = 'dispatch_number';

    -- 3. Read true table maximums and row counts dynamically only if tables and columns exist
    IF to_regclass('public.orders') IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'order_number'
        ) THEN
            EXECUTE 'SELECT MAX(order_number), count(*) FROM public.orders' INTO v_max_ord, v_ord_rows;
        ELSE
            EXECUTE 'SELECT count(*) FROM public.orders' INTO v_ord_rows;
            v_max_ord := NULL;
            RAISE NOTICE 'SKIPPED [Check 8 - orders]: Column order_number is absent from public.orders (table has % rows).', v_ord_rows;
        END IF;
    ELSE
        v_max_ord := NULL;
        v_ord_rows := NULL;
        RAISE NOTICE 'SKIPPED [Check 8 - orders]: Table public.orders does not exist in production schema.';
    END IF;

    IF to_regclass('public.dispatches') IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'dispatches' AND column_name = 'dispatch_number'
        ) THEN
            EXECUTE 'SELECT MAX(dispatch_number), count(*) FROM public.dispatches' INTO v_max_disp, v_disp_rows;
        ELSE
            EXECUTE 'SELECT count(*) FROM public.dispatches' INTO v_disp_rows;
            v_max_disp := NULL;
            RAISE NOTICE 'SKIPPED [Check 8 - dispatches]: Column dispatch_number is absent from public.dispatches (table has % rows).', v_disp_rows;
        END IF;
    ELSE
        v_max_disp := NULL;
        v_disp_rows := NULL;
        RAISE NOTICE 'SKIPPED [Check 8 - dispatches]: Table public.dispatches does not exist in production schema.';
    END IF;

    -- =========================================================================
    -- EVALUATE ORDERS SEQUENCE
    -- =========================================================================
    IF NOT v_has_ord_seq THEN
        RAISE NOTICE 'SKIPPED [Check 8 - orders]: orders_order_number_seq is ABSENT from public schema (Expected - will be created by recovery migration). Table rows: %, MAX(order_number): %.',
            COALESCE(v_ord_rows::text, 'N/A'), COALESCE(v_max_ord::text, 'NULL');
    ELSE
        IF v_ord_default IS NULL OR v_ord_default NOT LIKE '%orders_order_number_seq%' THEN
            RAISE NOTICE 'WARNING [Check 8 - orders]: orders_order_number_seq exists, but orders.order_number default is NOT linked to it (current default: %).',
                COALESCE(v_ord_default, 'NULL');
        ELSE
            RAISE NOTICE 'INFO [Check 8 - orders]: orders.order_number default is actively linked to orders_order_number_seq.';
        END IF;

        SELECT increment_by, cache_size INTO v_ord_inc, v_ord_cache 
        FROM pg_sequences 
        WHERE schemaname = 'public' AND sequencename = 'orders_order_number_seq';

        IF v_ord_inc IS NULL OR v_ord_inc <= 0 THEN
            RAISE NOTICE 'INCONCLUSIVE [Check 8 - orders]: orders_order_number_seq increment_by is not positive (% <= 0). Ascending sequence collision formula cannot be applied.',
                COALESCE(v_ord_inc::text, 'NULL');
        ELSIF v_ord_cache > 1 THEN
            RAISE NOTICE 'INCONCLUSIVE [Check 8 - orders]: orders_order_number_seq has cache_size = % (> 1). Cached sequence values in concurrent sessions cannot be observed via catalog; next value cannot be established safely.',
                v_ord_cache;
        ELSE
            BEGIN
                EXECUTE 'SELECT last_value, is_called FROM public.orders_order_number_seq' 
                INTO v_ord_last, v_ord_called;
            EXCEPTION
                WHEN OTHERS THEN
                    v_ord_last := NULL;
                    v_ord_called := NULL;
            END;

            IF v_ord_last IS NULL OR v_ord_called IS NULL THEN
                RAISE NOTICE 'INCONCLUSIVE [Check 8 - orders]: orders_order_number_seq exists, but internal state (last_value or is_called) is NULL or unreadable due to permissions. Cannot establish next generated value.';
            ELSE
                IF v_ord_called THEN
                    v_ord_next := v_ord_last + v_ord_inc;
                ELSE
                    v_ord_next := v_ord_last;
                END IF;

                IF v_max_ord IS NULL THEN
                    RAISE NOTICE 'PASS [Check 8 - orders] (Point-in-time; assumes no concurrent writes): orders_order_number_seq verified (last_value: %, is_called: %, next value: %). Orders table has no numbered records (zero collision risk).',
                        v_ord_last, v_ord_called, v_ord_next;
                ELSIF v_ord_next <= v_max_ord THEN
                    RAISE WARNING 'FAIL [Check 8 - orders]: COLLISION RISK! Next generated value (%) is <= current MAX(order_number) (%) in orders table (last_value: %, is_called: %). Sequence requires setval synchronization!',
                        v_ord_next, v_max_ord, v_ord_last, v_ord_called;
                ELSE
                    RAISE NOTICE 'PASS [Check 8 - orders] (Point-in-time; assumes no concurrent writes): orders_order_number_seq is synchronized (last_value: %, is_called: %, next value: % > MAX: %).',
                        v_ord_last, v_ord_called, v_ord_next, v_max_ord;
                END IF;
            END IF;
        END IF;
    END IF;

    -- =========================================================================
    -- EVALUATE DISPATCHES SEQUENCE
    -- =========================================================================
    IF NOT v_has_disp_seq THEN
        RAISE NOTICE 'SKIPPED [Check 8 - dispatches]: dispatches_dispatch_number_seq is ABSENT from public schema (Expected - will be created by recovery migration). Table rows: %, MAX(dispatch_number): %.',
            COALESCE(v_disp_rows::text, 'N/A'), COALESCE(v_max_disp::text, 'NULL');
    ELSE
        IF v_disp_default IS NULL OR v_disp_default NOT LIKE '%dispatches_dispatch_number_seq%' THEN
            RAISE NOTICE 'WARNING [Check 8 - dispatches]: dispatches_dispatch_number_seq exists, but dispatches.dispatch_number default is NOT linked to it (current default: %).',
                COALESCE(v_disp_default, 'NULL');
        ELSE
            RAISE NOTICE 'INFO [Check 8 - dispatches]: dispatches.dispatch_number default is actively linked to dispatches_dispatch_number_seq.';
        END IF;

        SELECT increment_by, cache_size INTO v_disp_inc, v_disp_cache 
        FROM pg_sequences 
        WHERE schemaname = 'public' AND sequencename = 'dispatches_dispatch_number_seq';

        IF v_disp_inc IS NULL OR v_disp_inc <= 0 THEN
            RAISE NOTICE 'INCONCLUSIVE [Check 8 - dispatches]: dispatches_dispatch_number_seq increment_by is not positive (% <= 0). Ascending sequence collision formula cannot be applied.',
                COALESCE(v_disp_inc::text, 'NULL');
        ELSIF v_disp_cache > 1 THEN
            RAISE NOTICE 'INCONCLUSIVE [Check 8 - dispatches]: dispatches_dispatch_number_seq has cache_size = % (> 1). Cached sequence values in concurrent sessions cannot be observed via catalog; next value cannot be established safely.',
                v_disp_cache;
        ELSE
            BEGIN
                EXECUTE 'SELECT last_value, is_called FROM public.dispatches_dispatch_number_seq' 
                INTO v_disp_last, v_disp_called;
            EXCEPTION
                WHEN OTHERS THEN
                    v_disp_last := NULL;
                    v_disp_called := NULL;
            END;

            IF v_disp_last IS NULL OR v_disp_called IS NULL THEN
                RAISE NOTICE 'INCONCLUSIVE [Check 8 - dispatches]: dispatches_dispatch_number_seq exists, but internal state (last_value or is_called) is NULL or unreadable due to permissions. Cannot establish next generated value.';
            ELSE
                IF v_disp_called THEN
                    v_disp_next := v_disp_last + v_disp_inc;
                ELSE
                    v_disp_next := v_disp_last;
                END IF;

                IF v_max_disp IS NULL THEN
                    RAISE NOTICE 'PASS [Check 8 - dispatches] (Point-in-time; assumes no concurrent writes): dispatches_dispatch_number_seq verified (last_value: %, is_called: %, next value: %). Dispatches table has no numbered records (zero collision risk).',
                        v_disp_last, v_disp_called, v_disp_next;
                ELSIF v_disp_next <= v_max_disp THEN
                    RAISE WARNING 'FAIL [Check 8 - dispatches]: COLLISION RISK! Next generated value (%) is <= current MAX(dispatch_number) (%) in dispatches table (last_value: %, is_called: %). Sequence requires setval synchronization!',
                        v_disp_next, v_max_disp, v_disp_last, v_disp_called;
                ELSE
                    RAISE NOTICE 'PASS [Check 8 - dispatches] (Point-in-time; assumes no concurrent writes): dispatches_dispatch_number_seq is safely synchronized (last_value: %, is_called: %, next value: % > MAX: %).',
                        v_disp_last, v_disp_called, v_disp_next, v_max_disp;
                END IF;
            END IF;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 9. Current Maximum Order and Dispatch Numbers (Dynamic Diagnostic)
-- Evaluated dynamically to prevent SQLSTATE 42P01 and 42703 if tables or columns do not exist
DO $$
DECLARE
    v_max_ord bigint;
    v_max_disp bigint;
BEGIN
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'CHECK 9: MAXIMUM ORDER & DISPATCH NUMBER BASELINE';
    RAISE NOTICE '============================================================';

    IF to_regclass('public.orders') IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'order_number'
        ) THEN
            EXECUTE 'SELECT COALESCE(MAX(order_number), 10000) FROM public.orders' INTO v_max_ord;
            RAISE NOTICE 'orders: Current MAX(order_number) in table = %, Calculated next sequence value = %',
                v_max_ord, GREATEST(v_max_ord, 10000) + 1;
        ELSE
            RAISE NOTICE 'SKIPPED [Check 9]: Column order_number is absent from public.orders.';
        END IF;
    ELSE
        RAISE NOTICE 'SKIPPED [Check 9]: Table public.orders does not exist in production schema.';
    END IF;

    IF to_regclass('public.dispatches') IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'dispatches' AND column_name = 'dispatch_number'
        ) THEN
            EXECUTE 'SELECT COALESCE(MAX(dispatch_number), 1000) FROM public.dispatches' INTO v_max_disp;
            RAISE NOTICE 'dispatches: Current MAX(dispatch_number) in table = %, Calculated next sequence value = %',
                v_max_disp, GREATEST(v_max_disp, 1000) + 1;
        ELSE
            RAISE NOTICE 'SKIPPED [Check 9]: Column dispatch_number is absent from public.dispatches.';
        END IF;
    ELSE
        RAISE NOTICE 'SKIPPED [Check 9]: Table public.dispatches does not exist in production schema.';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 10. Target Auth Accounts vs Public Profiles Status
-- 10a. Catalog Diagnostic: Inspect Available Columns in public.profiles
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles'
ORDER BY ordinal_position;

-- 10b. Dynamic Status of Target Auth Accounts vs Public Profiles
-- Safely queries profiles without assuming table, columns, full_name, or is_active exist
-- Validates data type compatibility of auth.users.id and profiles.id before joining (no forced cast)
DO $$
DECLARE
    v_has_profiles boolean;
    v_has_auth_users boolean;
    v_has_id boolean;
    v_has_role boolean;
    v_has_branch_id boolean;
    v_has_full_name boolean;
    v_has_is_active boolean;
    v_auth_id_udt text;
    v_auth_id_type text;
    v_prof_id_udt text;
    v_prof_id_type text;
    v_missing_cols text[] := ARRAY[]::text[];
    v_sql text;
    v_rec record;
    v_missing_profiles integer := 0;
BEGIN
    SELECT (to_regclass('auth.users') IS NOT NULL) INTO v_has_auth_users;
    IF NOT v_has_auth_users THEN
        RAISE NOTICE 'SKIPPED [Check 10]: Table auth.users is absent or inaccessible in current session.';
        RETURN;
    END IF;

    SELECT (to_regclass('public.profiles') IS NOT NULL) INTO v_has_profiles;
    IF NOT v_has_profiles THEN
        RAISE NOTICE 'SKIPPED [Check 10]: Table public.profiles is absent from schema (requires schema review).';
        RETURN;
    END IF;

    -- Inspect all referenced columns in public.profiles
    SELECT 
        bool_or(column_name = 'id'),
        bool_or(column_name = 'role'),
        bool_or(column_name = 'branch_id'),
        bool_or(column_name = 'full_name'),
        bool_or(column_name = 'is_active')
    INTO 
        v_has_id,
        v_has_role,
        v_has_branch_id,
        v_has_full_name,
        v_has_is_active
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles';

    IF NOT COALESCE(v_has_id, false) THEN
        v_missing_cols := array_append(v_missing_cols, 'profiles.id');
    END IF;
    IF NOT COALESCE(v_has_role, false) THEN
        v_missing_cols := array_append(v_missing_cols, 'profiles.role');
    END IF;
    IF NOT COALESCE(v_has_branch_id, false) THEN
        v_missing_cols := array_append(v_missing_cols, 'profiles.branch_id');
    END IF;

    -- If required join or role/branch columns are absent, skip dynamic query
    IF cardinality(v_missing_cols) > 0 THEN
        RAISE NOTICE 'SKIPPED [Check 10]: Required column(s) (%) absent from public.profiles. Diagnostic query skipped.',
            array_to_string(v_missing_cols, ', ');
        RETURN;
    END IF;

    -- Verify data type compatibility between auth.users.id and public.profiles.id before joining
    SELECT udt_name, data_type INTO v_auth_id_udt, v_auth_id_type
    FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'id';

    SELECT udt_name, data_type INTO v_prof_id_udt, v_prof_id_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'id';

    IF v_auth_id_udt IS NULL OR v_prof_id_udt IS NULL THEN
        RAISE NOTICE 'SKIPPED [Check 10]: Could not resolve underlying ID data types for auth.users.id (%) or public.profiles.id (%). Diagnostic query skipped.',
            COALESCE(v_auth_id_udt, 'NULL'), COALESCE(v_prof_id_udt, 'NULL');
        RETURN;
    END IF;

    IF v_auth_id_udt <> v_prof_id_udt THEN
        RAISE NOTICE 'SKIPPED [Check 10]: Preliminary type check failed: auth.users.id (udt: %, type: %) does not match public.profiles.id (udt: %, type: %). Cannot safely join without type mismatch error (requires schema review). Values will not be cast.',
            v_auth_id_udt, v_auth_id_type, v_prof_id_udt, v_prof_id_type;
        RETURN;
    END IF;

    RAISE NOTICE 'INFO [Check 10]: Preliminary type check passed: auth.users.id and profiles.id share matching underlying type (udt: %).',
        v_auth_id_udt;

    -- Report optional column absences
    IF NOT COALESCE(v_has_full_name, false) THEN
        RAISE NOTICE 'SKIPPED [Check 10]: Column "full_name" is absent from public.profiles (diagnostic query adapted).';
    END IF;

    IF NOT COALESCE(v_has_is_active, false) THEN
        RAISE NOTICE 'SKIPPED [Check 10]: Column "is_active" is absent from public.profiles (diagnostic query adapted).';
    END IF;

    v_sql := 'SELECT au.id AS auth_user_id, au.email, p.id AS profile_id, p.role::text, p.branch_id::text'
        || CASE WHEN COALESCE(v_has_full_name, false) THEN ', p.full_name::text' ELSE ', ''[COLUMN ABSENT]''::text AS full_name' END
        || CASE WHEN COALESCE(v_has_is_active, false) THEN ', p.is_active::boolean' ELSE ', NULL::boolean AS is_active' END
        || ' FROM auth.users au LEFT JOIN public.profiles p ON p.id = au.id WHERE au.id IN ('
        || '''2236f15a-bba8-48ba-bd23-764380fb7cba''::uuid, '
        || '''99fce41f-a636-419f-855d-9f23db4769fb''::uuid, '
        || '''cb3c5a34-ce3b-4a53-ae6e-7a18ff6f4f43''::uuid)';

    FOR v_rec IN EXECUTE v_sql LOOP
        IF v_rec.profile_id IS NULL THEN
            v_missing_profiles := v_missing_profiles + 1;
            RAISE NOTICE 'INFO [Check 10]: Auth account % (%) has NO profile yet (expected before recovery migration).',
                v_rec.auth_user_id, v_rec.email;
        ELSE
            RAISE NOTICE 'PASS [Check 10]: Auth account % (%) linked to profile (role=%, branch=%, name=%, active=%).',
                v_rec.auth_user_id, v_rec.email, v_rec.role, v_rec.branch_id, v_rec.full_name, v_rec.is_active;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 10c. Target Auth Accounts Verification (Dynamic auth.users Inspection)
-- Safely queries auth.users dynamically to prevent SQLSTATE 42P01 if auth schema is restricted
DO $$
DECLARE
    v_has_auth_users boolean;
    v_rec record;
    v_user_count integer := 0;
BEGIN
    SELECT (to_regclass('auth.users') IS NOT NULL) INTO v_has_auth_users;

    IF NOT v_has_auth_users THEN
        RAISE NOTICE 'SKIPPED [Check 10c]: Table auth.users is absent or inaccessible in current session.';
        RETURN;
    END IF;

    FOR v_rec IN 
        EXECUTE 'SELECT au.id AS auth_user_id, au.email, au.created_at AS auth_created_at 
                 FROM auth.users au 
                 WHERE au.id IN (
                     ''2236f15a-bba8-48ba-bd23-764380fb7cba''::uuid,
                     ''99fce41f-a636-419f-855d-9f23db4769fb''::uuid,
                     ''cb3c5a34-ce3b-4a53-ae6e-7a18ff6f4f43''::uuid
                 )'
    LOOP
        v_user_count := v_user_count + 1;
        RAISE NOTICE 'PASS [Check 10c]: Auth account verified: id=%, email=%, created_at=%', 
            v_rec.auth_user_id, v_rec.email, v_rec.auth_created_at;
    END LOOP;

    IF v_user_count < 3 THEN
        RAISE WARNING 'WARNING [Check 10c]: Found only % of 3 target Auth accounts in auth.users!', v_user_count;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 11. Preview Orphaned Branch References in Profiles
-- Evaluated dynamically to prevent SQLSTATE 42P01, 42703, and 42883 if tables, columns, or types mismatch
DO $$
DECLARE
    v_has_profiles boolean;
    v_has_branches boolean;
    v_prof_has_id boolean;
    v_prof_has_role boolean;
    v_prof_has_branch_id boolean;
    v_branch_has_id boolean;
    v_prof_branch_udt text;
    v_prof_branch_type text;
    v_branch_id_udt text;
    v_branch_id_type text;
    v_missing_cols text[] := ARRAY[]::text[];
    v_orphan_count bigint;
    v_rec record;
BEGIN
    SELECT (to_regclass('public.profiles') IS NOT NULL) INTO v_has_profiles;
    SELECT (to_regclass('public.branches') IS NOT NULL) INTO v_has_branches;

    IF NOT v_has_profiles THEN
        RAISE NOTICE 'SKIPPED [Check 11]: Table public.profiles is absent from schema (requires schema review). Cannot evaluate orphaned branches.';
        RETURN;
    END IF;

    IF NOT v_has_branches THEN
        RAISE NOTICE 'SKIPPED [Check 11]: Table public.branches is absent from schema (requires schema review). Cannot evaluate orphaned branches.';
        RETURN;
    END IF;

    -- Verify all referenced columns in public.profiles
    SELECT 
        bool_or(column_name = 'id'),
        bool_or(column_name = 'role'),
        bool_or(column_name = 'branch_id')
    INTO 
        v_prof_has_id,
        v_prof_has_role,
        v_prof_has_branch_id
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles';

    IF NOT COALESCE(v_prof_has_branch_id, false) THEN
        v_missing_cols := array_append(v_missing_cols, 'profiles.branch_id');
    END IF;
    IF NOT COALESCE(v_prof_has_id, false) THEN
        v_missing_cols := array_append(v_missing_cols, 'profiles.id');
    END IF;
    IF NOT COALESCE(v_prof_has_role, false) THEN
        v_missing_cols := array_append(v_missing_cols, 'profiles.role');
    END IF;

    -- Verify all referenced columns in public.branches
    SELECT 
        bool_or(column_name = 'id')
    INTO 
        v_branch_has_id
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'branches';

    IF NOT COALESCE(v_branch_has_id, false) THEN
        v_missing_cols := array_append(v_missing_cols, 'branches.id');
    END IF;

    -- If any required column is absent, report SKIPPED with missing column names
    IF cardinality(v_missing_cols) > 0 THEN
        RAISE NOTICE 'SKIPPED [Check 11]: Required column(s) (%) absent from schema. Cannot evaluate orphaned branch references.',
            array_to_string(v_missing_cols, ', ');
        RETURN;
    END IF;

    -- Preliminary data type compatibility check between profiles.branch_id and branches.id
    SELECT udt_name, data_type INTO v_prof_branch_udt, v_prof_branch_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'branch_id';

    SELECT udt_name, data_type INTO v_branch_id_udt, v_branch_id_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'branches' AND column_name = 'id';

    IF v_prof_branch_udt IS NULL OR v_branch_id_udt IS NULL THEN
        RAISE NOTICE 'SKIPPED [Check 11]: Could not resolve underlying data types for profiles.branch_id (%) or branches.id (%). Diagnostic skipped.',
            COALESCE(v_prof_branch_udt, 'NULL'), COALESCE(v_branch_id_udt, 'NULL');
        RETURN;
    END IF;

    IF v_prof_branch_udt <> v_branch_id_udt THEN
        RAISE NOTICE 'SKIPPED [Check 11]: Preliminary type check failed: profiles.branch_id (udt: %, type: %) does not match branches.id (udt: %, type: %). Cannot safely evaluate orphaned references without explicit type casting (requires schema review).',
            v_prof_branch_udt, v_prof_branch_type, v_branch_id_udt, v_branch_id_type;
        RETURN;
    END IF;

    RAISE NOTICE 'INFO [Check 11]: Preliminary type check passed: underlying type names match (udt: %). (Note: matching type names indicate syntactic comparison compatibility, not a guarantee of domain or semantic compatibility).',
        v_prof_branch_udt;

    -- All required columns and types are verified present and preliminarily compatible; safely execute dynamic SQL
    EXECUTE 'SELECT count(*) FROM public.profiles p WHERE p.branch_id IS NOT NULL AND p.branch_id NOT IN (SELECT id FROM public.branches)' INTO v_orphan_count;

    IF v_orphan_count = 0 THEN
        RAISE NOTICE 'PASS [Check 11]: Zero orphaned branch references detected in profiles.';
    ELSE
        RAISE WARNING 'FAIL [Check 11]: Found % profiles referencing non-existent branches that would be set to NULL!', v_orphan_count;
        FOR v_rec IN EXECUTE 'SELECT p.id, p.role::text, p.branch_id::text FROM public.profiles p WHERE p.branch_id IS NOT NULL AND p.branch_id NOT IN (SELECT id FROM public.branches)' LOOP
            RAISE NOTICE 'Orphaned profile: id=%, role=%, invalid_branch_id=%', v_rec.id, v_rec.role, v_rec.branch_id;
        END LOOP;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 12. Existing RPC Functions in Public Schema (Catalog Query)
SELECT 
    p.proname AS function_name,
    pg_get_function_arguments(p.oid) AS arguments,
    p.prosecdef AS is_security_definer,
    array_to_string(p.proconfig, ', ') AS runtime_config
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname IN ('rpc_create_order', 'rpc_approve_order', 'rpc_adjust_inventory', 
                    'rpc_create_dispatch', 'rpc_update_delivery_stop', 'rpc_confirm_receipt');
