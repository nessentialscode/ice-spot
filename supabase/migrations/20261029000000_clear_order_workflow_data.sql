-- ==============================================================================
-- ICE SPOT — PHASE 3: CLEAR ALL ORDER-BASED WORKFLOW DATA IN DEVELOPMENT
-- Target Project: ice_spot_dev (punyeqlotfnvxhhugtud)
-- Environment Guard: Strict Positive Dev Verification + Production Killswitch
-- Architecture: Single-Block In-Memory JSONB Snapshots (Zero Temporary Tables)
-- Transaction Mode: ATOMIC (Automatic Rollback on Any Assertion Failure)
-- ==============================================================================

BEGIN;

DO $$
DECLARE
    -- Step 1: Guard Variables
    v_has_prod_user BOOLEAN := false;
    v_has_dev_user BOOLEAN := false;
    v_has_dev_profile BOOLEAN := false;
    v_has_ollur_branch BOOLEAN := false;

    -- Step 2: Pre-Cleanup In-Memory Snapshots (JSONB)
    v_pre_inv JSONB;
    v_pre_mov JSONB;
    v_pre_audit JSONB;
    v_pre_branches JSONB;
    v_pre_products JSONB;
    v_pre_profiles JSONB;

    -- Step 5: Post-Cleanup In-Memory Snapshots (JSONB)
    v_post_inv JSONB;
    v_post_mov JSONB;
    v_post_audit JSONB;
    v_post_branches JSONB;
    v_post_products JSONB;
    v_post_profiles JSONB;

    -- Step 5: Workflow Post-Cleanup Row Counts (must all be 0)
    v_orders_cnt INT;
    v_order_items_cnt INT;
    v_dispatches_cnt INT;
    v_dispatch_orders_cnt INT;
    v_dispatch_items_cnt INT;
    v_invoices_cnt INT;
    v_invoice_items_cnt INT;
    v_receipts_cnt INT;
    v_receipt_items_cnt INT;
BEGIN
    -- --------------------------------------------------------------------------
    -- STEP 1: STRENGTHENED ENVIRONMENT & PROJECT VERIFICATION GUARDS
    -- --------------------------------------------------------------------------
    -- 1a. Secondary Production Killswitch: abort if legacy production account detected
    SELECT EXISTS (
        SELECT 1 FROM auth.users 
        WHERE email ILIKE '%faizal.operations@icespot.in%' 
           OR email ILIKE '%rahul.ollur@icespot.in%'
           OR email ILIKE '%suresh.logistics@icespot.in%'
    ) INTO v_has_prod_user;

    IF v_has_prod_user THEN
        RAISE EXCEPTION 'FATAL SAFETY ABORT: Legacy production user detected in auth.users! Execution prohibited.';
    END IF;

    -- 1b. Positive Dev Verification: auth.users development account
    SELECT EXISTS (
        SELECT 1 FROM auth.users 
        WHERE email ILIKE 'icespotvaravoor@gmail.com'
    ) INTO v_has_dev_user;

    IF NOT v_has_dev_user THEN
        RAISE EXCEPTION 'FATAL SAFETY ABORT: Development user icespotvaravoor@gmail.com not found in auth.users. Cannot verify target is ice_spot_dev!';
    END IF;

    -- 1c. Positive Dev Verification: public.profiles development super admin
    SELECT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = '04d9dfb2-98d3-408e-937c-1ab53629f3c3'::UUID 
          AND role = 'super_admin'
    ) INTO v_has_dev_profile;

    IF NOT v_has_dev_profile THEN
        RAISE EXCEPTION 'FATAL SAFETY ABORT: Development Super Admin profile (04d9dfb2-98d3-408e-937c-1ab53629f3c3) not found in public.profiles. Cannot verify target is ice_spot_dev!';
    END IF;

    -- 1d. Positive Dev Verification: public.branches development branch
    SELECT EXISTS (
        SELECT 1 FROM public.branches 
        WHERE code = 'BR-OLL-003' AND name ILIKE '%Ollur%'
    ) INTO v_has_ollur_branch;

    IF NOT v_has_ollur_branch THEN
        RAISE EXCEPTION 'FATAL SAFETY ABORT: Branch BR-OLL-003 (Ice Spot Ollur) not found in public.branches. Cannot verify target is ice_spot_dev!';
    END IF;

    RAISE NOTICE 'POSITIVE VERIFICATION: Target database verified as ice_spot_dev (punyeqlotfnvxhhugtud).';

    -- --------------------------------------------------------------------------
    -- STEP 2: PRE-CLEANUP IMMUTABLE DATA SNAPSHOTS (IN-MEMORY JSONB)
    -- Captures every relevant column in local variables within this execution scope.
    -- Completely eliminates dependency on temporary tables (pg_temp) across poolers.
    -- --------------------------------------------------------------------------
    SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]'::jsonb) INTO v_pre_inv
    FROM (
        SELECT id, product_id, branch_id, quantity, reserved_quantity, updated_at
        FROM public.inventory
    ) t;

    SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]'::jsonb) INTO v_pre_mov
    FROM (
        SELECT id, branch_id, product_id, movement_type, quantity_delta, reference_type, reference_id, idempotency_key, notes, created_by, created_at
        FROM public.inventory_movements
    ) t;

    SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]'::jsonb) INTO v_pre_audit
    FROM (
        SELECT id, actor_id, action, entity_type, entity_id, details, created_at
        FROM public.audit_logs
    ) t;

    SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]'::jsonb) INTO v_pre_branches
    FROM (
        SELECT id, code, name, category, address, locality, district, contact_name, contact_phone, is_active, created_at, updated_at
        FROM public.branches
    ) t;

    SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]'::jsonb) INTO v_pre_products
    FROM (
        SELECT id, sku, name, description, unit, selling_price, is_active, display_order, created_at, updated_at
        FROM public.products
    ) t;

    SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]'::jsonb) INTO v_pre_profiles
    FROM (
        SELECT id, full_name, role, branch_id, is_active, created_at, updated_at
        FROM public.profiles
    ) t;

    -- --------------------------------------------------------------------------
    -- STEP 3: PRE-DELETION SNAPSHOT INTEGRITY CHECK
    -- Asserts that all 6 datasets contain records BEFORE any DELETE runs.
    -- --------------------------------------------------------------------------
    IF jsonb_array_length(v_pre_inv) = 0 OR
       jsonb_array_length(v_pre_mov) = 0 OR
       jsonb_array_length(v_pre_audit) = 0 OR
       jsonb_array_length(v_pre_branches) = 0 OR
       jsonb_array_length(v_pre_products) = 0 OR
       jsonb_array_length(v_pre_profiles) = 0 THEN
        RAISE EXCEPTION 'FATAL PRE-CLEANUP ABORT: One or more pre-cleanup snapshot datasets are empty! inv=%, mov=%, audit=%, br=%, prod=%, prof=%',
            jsonb_array_length(v_pre_inv), jsonb_array_length(v_pre_mov), jsonb_array_length(v_pre_audit),
            jsonb_array_length(v_pre_branches), jsonb_array_length(v_pre_products), jsonb_array_length(v_pre_profiles);
    END IF;

    RAISE NOTICE 'PRE-DELETION VERIFICATION PASSED: All 6 snapshot datasets captured in-memory (inv=%, mov=%, audit=%, br=%, prod=%, prof=%).',
        jsonb_array_length(v_pre_inv), jsonb_array_length(v_pre_mov), jsonb_array_length(v_pre_audit),
        jsonb_array_length(v_pre_branches), jsonb_array_length(v_pre_products), jsonb_array_length(v_pre_profiles);

    -- --------------------------------------------------------------------------
    -- STEP 4: EXECUTE CLEANUP IN DEPENDENCY-SAFE ORDER
    -- --------------------------------------------------------------------------
    -- 4a. Remove Delivery Receipts and Line Items (Foreign key to dispatches & orders)
    DELETE FROM public.receipt_items;
    DELETE FROM public.receipts;

    -- 4b. Remove Commercial Invoices and Line Items (Clears ON DELETE RESTRICT on orders)
    DELETE FROM public.invoice_items;
    DELETE FROM public.invoices;

    -- 4c. Remove Dispatch Route Stops, Items, and Trip Manifests (Clears ON DELETE RESTRICT on orders)
    DELETE FROM public.dispatch_items;
    DELETE FROM public.dispatch_orders;
    DELETE FROM public.dispatches;

    -- 4d. Remove Order Line Items and Orders
    DELETE FROM public.order_items;
    DELETE FROM public.orders;

    -- --------------------------------------------------------------------------
    -- STEP 5: POST-CLEANUP INTEGRITY & INVARIANT ASSERTIONS
    -- --------------------------------------------------------------------------
    -- 5a. Assert all 9 workflow tables are completely empty
    SELECT COUNT(*) INTO v_orders_cnt FROM public.orders;
    SELECT COUNT(*) INTO v_order_items_cnt FROM public.order_items;
    SELECT COUNT(*) INTO v_dispatches_cnt FROM public.dispatches;
    SELECT COUNT(*) INTO v_dispatch_orders_cnt FROM public.dispatch_orders;
    SELECT COUNT(*) INTO v_dispatch_items_cnt FROM public.dispatch_items;
    SELECT COUNT(*) INTO v_invoices_cnt FROM public.invoices;
    SELECT COUNT(*) INTO v_invoice_items_cnt FROM public.invoice_items;
    SELECT COUNT(*) INTO v_receipts_cnt FROM public.receipts;
    SELECT COUNT(*) INTO v_receipt_items_cnt FROM public.receipt_items;

    IF v_orders_cnt > 0 OR v_order_items_cnt > 0 OR v_dispatches_cnt > 0 OR
       v_dispatch_orders_cnt > 0 OR v_dispatch_items_cnt > 0 OR v_invoices_cnt > 0 OR
       v_invoice_items_cnt > 0 OR v_receipts_cnt > 0 OR v_receipt_items_cnt > 0 THEN
        RAISE EXCEPTION 'POST-CLEANUP FAILURE: Residual workflow records remain! orders=%, dispatches=%, invoices=%, receipts=%',
            v_orders_cnt, v_dispatches_cnt, v_invoices_cnt, v_receipts_cnt;
    END IF;

    -- 5b. Capture post-cleanup states for all 6 preserved tables
    SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]'::jsonb) INTO v_post_inv
    FROM (
        SELECT id, product_id, branch_id, quantity, reserved_quantity, updated_at
        FROM public.inventory
    ) t;

    SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]'::jsonb) INTO v_post_mov
    FROM (
        SELECT id, branch_id, product_id, movement_type, quantity_delta, reference_type, reference_id, idempotency_key, notes, created_by, created_at
        FROM public.inventory_movements
    ) t;

    SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]'::jsonb) INTO v_post_audit
    FROM (
        SELECT id, actor_id, action, entity_type, entity_id, details, created_at
        FROM public.audit_logs
    ) t;

    SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]'::jsonb) INTO v_post_branches
    FROM (
        SELECT id, code, name, category, address, locality, district, contact_name, contact_phone, is_active, created_at, updated_at
        FROM public.branches
    ) t;

    SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]'::jsonb) INTO v_post_products
    FROM (
        SELECT id, sku, name, description, unit, selling_price, is_active, display_order, created_at, updated_at
        FROM public.products
    ) t;

    SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]'::jsonb) INTO v_post_profiles
    FROM (
        SELECT id, full_name, role, branch_id, is_active, created_at, updated_at
        FROM public.profiles
    ) t;

    -- 5c. Deep Invariant Comparisons: assert pre and post JSONB are 100% identical
    IF v_pre_inv IS DISTINCT FROM v_post_inv THEN
        RAISE EXCEPTION 'POST-CLEANUP FAILURE: public.inventory was modified or rows were altered! pre=%, post=%',
            jsonb_array_length(v_pre_inv), jsonb_array_length(v_post_inv);
    END IF;

    IF v_pre_mov IS DISTINCT FROM v_post_mov THEN
        RAISE EXCEPTION 'POST-CLEANUP FAILURE: public.inventory_movements was modified or rows were altered! pre=%, post=%',
            jsonb_array_length(v_pre_mov), jsonb_array_length(v_post_mov);
    END IF;

    IF v_pre_audit IS DISTINCT FROM v_post_audit THEN
        RAISE EXCEPTION 'POST-CLEANUP FAILURE: public.audit_logs was modified or rows were altered! pre=%, post=%',
            jsonb_array_length(v_pre_audit), jsonb_array_length(v_post_audit);
    END IF;

    IF v_pre_branches IS DISTINCT FROM v_post_branches THEN
        RAISE EXCEPTION 'POST-CLEANUP FAILURE: public.branches was modified or rows were altered! pre=%, post=%',
            jsonb_array_length(v_pre_branches), jsonb_array_length(v_post_branches);
    END IF;

    IF v_pre_products IS DISTINCT FROM v_post_products THEN
        RAISE EXCEPTION 'POST-CLEANUP FAILURE: public.products was modified or rows were altered! pre=%, post=%',
            jsonb_array_length(v_pre_products), jsonb_array_length(v_post_products);
    END IF;

    IF v_pre_profiles IS DISTINCT FROM v_post_profiles THEN
        RAISE EXCEPTION 'POST-CLEANUP FAILURE: public.profiles was modified or rows were altered! pre=%, post=%',
            jsonb_array_length(v_pre_profiles), jsonb_array_length(v_post_profiles);
    END IF;

    RAISE NOTICE 'SUCCESS: All 9 order workflow tables cleared to 0 rows.';
    RAISE NOTICE 'SUCCESS: Inventory balances (%), movements (%), audit logs (%), branches (%), products (%), and profiles (%) verified 100%% identical in-memory.',
        jsonb_array_length(v_post_inv), jsonb_array_length(v_post_mov), jsonb_array_length(v_post_audit),
        jsonb_array_length(v_post_branches), jsonb_array_length(v_post_products), jsonb_array_length(v_post_profiles);
END $$;

COMMIT;
