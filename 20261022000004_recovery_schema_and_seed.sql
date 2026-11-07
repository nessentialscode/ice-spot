-- ==============================================================================
-- Icespot — End-to-End Recovery Migration & Data Seeding
-- File: supabase/migrations/20261022000004_recovery_schema_and_seed.sql
-- Description: Idempotent schema verification, constraints, multi-order dispatch
--              support, sequences, seed data (17 branches, 10 products, profiles),
--              table grants, hardened RLS policies, and atomic transactional RPCs.
-- ==============================================================================

BEGIN;

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. ENUM TYPES CREATION / VERIFICATION
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'branch_category') THEN
        CREATE TYPE public.branch_category AS ENUM (
            'thrissur_town',
            'thrissur_coastal',
            'ernakulam',
            'palakkad',
            'malappuram'
        );
    END IF;

    -- Confirmed live role enum is public.app_role
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
        CREATE TYPE public.app_role AS ENUM (
            'super_admin',
            'branch_admin',
            'delivery_staff'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
        CREATE TYPE public.order_status AS ENUM (
            'draft',
            'submitted',
            'under_review',
            'approved',
            'preparation',
            'ready_for_dispatch',
            'dispatched',
            'partially_delivered',
            'delivered',
            'amendment_requested',
            'cancelled'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dispatch_status') THEN
        CREATE TYPE public.dispatch_status AS ENUM (
            'scheduled',
            'loading',
            'in_transit',
            'completed',
            'cancelled'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'receipt_status') THEN
        CREATE TYPE public.receipt_status AS ENUM (
            'intact',
            'discrepancy',
            'rejected'
        );
    END IF;
END $$;

-- 3. SEQUENCES FOR ORDERS AND DISPATCHES (WITH POPULATED DATA SYNCHRONIZATION)
CREATE SEQUENCE IF NOT EXISTS public.orders_order_number_seq
    START WITH 10001
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.dispatches_dispatch_number_seq
    START WITH 1001
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- 4. BASE TABLES CREATION (MATCHING LIVE SCHEMA)

-- Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    role public.app_role NOT NULL DEFAULT 'branch_admin',
    branch_id UUID,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- Branches
CREATE TABLE IF NOT EXISTS public.branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    category public.branch_category NOT NULL,
    address TEXT NOT NULL,
    locality TEXT,
    district TEXT NOT NULL,
    contact_name TEXT,
    contact_phone TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- Products
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    unit TEXT NOT NULL DEFAULT 'pack',
    selling_price NUMERIC(10,2),
    is_active BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- Inventory
CREATE TABLE IF NOT EXISTS public.inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
    quantity NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- Orders
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number BIGINT NOT NULL DEFAULT nextval('public.orders_order_number_seq') UNIQUE,
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
    week_start DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'submitted',
    notes TEXT,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    submitted_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- Order Items
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    requested_quantity NUMERIC(10,2) NOT NULL CHECK (requested_quantity > 0),
    approved_quantity NUMERIC(10,2) CHECK (approved_quantity IS NULL OR approved_quantity >= 0),
    unit_price NUMERIC(10,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- Dispatches
CREATE TABLE IF NOT EXISTS public.dispatches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispatch_number BIGINT NOT NULL DEFAULT nextval('public.dispatches_dispatch_number_seq') UNIQUE,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    delivery_staff_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'scheduled',
    dispatched_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    delivery_notes TEXT,
    proof_of_delivery_url TEXT,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- Multi-Order Junction Table for Dispatches
CREATE TABLE IF NOT EXISTS public.dispatch_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispatch_id UUID NOT NULL REFERENCES public.dispatches(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
    sequence INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'pending',
    delivery_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_dispatch_order UNIQUE (dispatch_id, order_id)
);

-- Dispatch Items
CREATE TABLE IF NOT EXISTS public.dispatch_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispatch_id UUID NOT NULL REFERENCES public.dispatches(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    quantity_loaded NUMERIC(10,2) NOT NULL CHECK (quantity_loaded >= 0),
    quantity_delivered NUMERIC(10,2) CHECK (quantity_delivered IS NULL OR quantity_delivered >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_dispatch_product UNIQUE (dispatch_id, product_id)
);

-- Receipts
CREATE TABLE IF NOT EXISTS public.receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispatch_id UUID NOT NULL REFERENCES public.dispatches(id) ON DELETE CASCADE,
    confirmed_by UUID NOT NULL REFERENCES auth.users(id),
    receipt_status TEXT NOT NULL DEFAULT 'intact',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Receipt Items
CREATE TABLE IF NOT EXISTS public.receipt_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id UUID NOT NULL REFERENCES public.receipts(id) ON DELETE CASCADE,
    quantity_expected NUMERIC(10,2) NOT NULL CHECK (quantity_expected >= 0),
    quantity_received NUMERIC(10,2) CHECK (quantity_received IS NULL OR quantity_received >= 0),
    discrepancy_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Customer & Franchise Enquiries
CREATE TABLE IF NOT EXISTS public.enquiries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    flavour_interest TEXT,
    enquiry_type TEXT NOT NULL DEFAULT 'general',
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Synchronize Sequences with Existing Populated Data
DO $$
DECLARE
    v_max_order BIGINT;
    v_max_disp BIGINT;
BEGIN
    SELECT COALESCE(MAX(order_number), 10000) INTO v_max_order FROM public.orders;
    PERFORM setval('public.orders_order_number_seq', GREATEST(v_max_order, 10000) + 1, false);

    SELECT COALESCE(MAX(dispatch_number), 1000) INTO v_max_disp FROM public.dispatches;
    PERFORM setval('public.dispatches_dispatch_number_seq', GREATEST(v_max_disp, 1000) + 1, false);
END $$;

-- Explicitly ensure existing tables inherit sequence defaults
ALTER TABLE public.orders ALTER COLUMN order_number SET DEFAULT nextval('public.orders_order_number_seq');
ALTER TABLE public.dispatches ALTER COLUMN dispatch_number SET DEFAULT nextval('public.dispatches_dispatch_number_seq');

-- Ensure dispatch_items columns and constraint exist on pre-existing tables
ALTER TABLE public.dispatch_items ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id) ON DELETE RESTRICT;
ALTER TABLE public.dispatch_items ADD COLUMN IF NOT EXISTS quantity_loaded NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.dispatch_items ADD COLUMN IF NOT EXISTS quantity_delivered NUMERIC(10,2);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_dispatch_product'
    ) THEN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'dispatch_items' AND column_name = 'product_id'
        ) THEN
            ALTER TABLE public.dispatch_items ADD CONSTRAINT uq_dispatch_product UNIQUE (dispatch_id, product_id);
        END IF;
    END IF;
END $$;

-- Indexes on foreign keys and lookup paths
CREATE INDEX IF NOT EXISTS idx_dispatch_orders_order_id ON public.dispatch_orders (order_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_orders_dispatch_id ON public.dispatch_orders (dispatch_id);
CREATE INDEX IF NOT EXISTS idx_orders_branch_id ON public.orders (branch_id);
CREATE INDEX IF NOT EXISTS idx_orders_week_start ON public.orders (week_start);
CREATE INDEX IF NOT EXISTS idx_inventory_product_id ON public.inventory (product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_branch_id ON public.inventory (branch_id);

-- Enforce inventory uniqueness (relying on existing inventory_location_product_unique, or creating if absent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE schemaname = 'public' 
          AND tablename = 'inventory' 
          AND indexname IN ('inventory_location_product_unique', 'idx_inventory_product_branch', 'uq_inventory_branch_product')
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname IN ('inventory_location_product_unique', 'uq_inventory_branch_product')
    ) THEN
        CREATE UNIQUE INDEX inventory_location_product_unique ON public.inventory (branch_id, product_id) NULLS NOT DISTINCT;
    END IF;
END $$;

-- 5. SEED DATA (STRICT NON-DESTRUCTIVE IDEMPOTENT SEEDING)

-- 5a. Seed 17 Branches (Preserves any business-managed modifications on existing branches)
INSERT INTO public.branches (code, name, category, address, locality, district, contact_name, contact_phone, is_active)
VALUES
    ('BR-VRV-001', 'Ice Spot Varavoor Factory', 'thrissur_town', 'Main Production Factory & Central Franchise Hub, Varavoor, Wadakkanchery, Thrissur, Kerala 680585', 'Varavoor', 'Thrissur', 'Factory Hub', '+91 94470 00000', true),
    ('BR-TSR-002', 'Ice Spot Thrissur Town', 'thrissur_town', 'Round West, Thrissur Central, Kerala', 'Round West', 'Thrissur', 'Town Manager', '+91 94470 00001', true),
    ('BR-OLL-003', 'Ice Spot Ollur', 'thrissur_town', 'Company Padi, Bus Stop, High Road, near Fun Movies, Ollur, Thrissur', 'Ollur', 'Thrissur', 'Ollur Manager', '+91 94470 00002', true),
    ('BR-SHK-004', 'Ice Spot Thrissur Shakthan', 'thrissur_town', 'Shakthan Nagar, Thrissur Central', 'Shakthan Nagar', 'Thrissur', 'Shakthan Manager', '+91 94470 00003', true),
    ('BR-PDK-005', 'Ice Spot Pudukad', 'thrissur_town', 'Pudukad, Thrissur district', 'Pudukad', 'Thrissur', 'Pudukad Manager', '+91 94470 00004', true),
    ('BR-PLM-006', 'Ice Spot Pallimoola', 'thrissur_town', 'Pallimoola Junction, Thrissur', 'Pallimoola', 'Thrissur', 'Pallimoola Manager', '+91 94470 00005', true),
    ('BR-KCH-007', 'Ice Spot Kechery', 'thrissur_town', 'Dubai Road, Kechery, Thrissur', 'Kechery', 'Thrissur', 'Kechery Manager', '+91 94470 00006', true),
    ('BR-CLK-008', 'Ice Spot Chalakudy', 'thrissur_town', 'Junction, Tramway Lane, Chalakudy', 'Chalakudy', 'Thrissur', 'Chalakudy Manager', '+91 94470 00007', true),
    ('BR-WDK-009', 'Ice Spot Wadakkanchery', 'thrissur_town', 'Wadakkanchery Junction, Thrissur', 'Wadakkanchery', 'Thrissur', 'Wadakkanchery Manager', '+91 94470 00008', true),
    ('BR-GVR-010', 'Ice Spot Guruvayur', 'thrissur_coastal', 'Near LF College, opposite Rajah Petrol Pump, Mammiyoor–Guruvayur Road', 'Guruvayur', 'Thrissur', 'Guruvayur Manager', '+91 94470 00009', true),
    ('BR-VDN-011', 'Ice Spot Vadanappally', 'thrissur_coastal', 'Vadanappally, Coastal Thrissur', 'Vadanappally', 'Thrissur', 'Vadanappally Manager', '+91 94470 00010', true),
    ('BR-TPR-012', 'Ice Spot Triprayar', 'thrissur_coastal', 'Triprayar Temple Road, Thrissur', 'Triprayar', 'Thrissur', 'Triprayar Manager', '+91 94470 00011', true),
    ('BR-KTR-013', 'Ice Spot Kattoor', 'thrissur_coastal', 'Kattoor Town, Thrissur', 'Kattoor', 'Thrissur', 'Kattoor Manager', '+91 94470 00012', true),
    ('BR-KNJ-014', 'Ice Spot Kanjani', 'thrissur_coastal', 'Kanjani Road, Thrissur', 'Kanjani', 'Thrissur', 'Kanjani Manager', '+91 94470 00013', true),
    ('BR-PLK-015', 'Ice Spot Palakkad', 'palakkad', 'Palakkad Town, Palakkad', 'Palakkad Town', 'Palakkad', 'Palakkad Manager', '+91 94470 00014', true),
    ('BR-KDM-016', 'Ice Spot Kadampuzha', 'malappuram', 'Kadampuzha Temple Road, Malappuram', 'Kadampuzha', 'Malappuram', 'Kadampuzha Manager', '+91 94470 00015', true),
    ('BR-CUS-017', 'Ice Spot Cusat Road', 'ernakulam', 'Cusat Road, Kalamassery, Ernakulam', 'Kalamassery', 'Ernakulam', 'Ernakulam Manager', '+91 94470 00016', true)
ON CONFLICT (code) DO NOTHING;

-- Add Foreign Key for Profiles -> Branches safely (after branches are seeded)
DO $$
BEGIN
    -- Nullify orphaned non-existent branch_id references before adding FK constraint
    UPDATE public.profiles
    SET branch_id = NULL
    WHERE branch_id IS NOT NULL 
      AND branch_id NOT IN (SELECT id FROM public.branches);

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'profiles_branch_id_fkey' AND table_name = 'profiles'
    ) THEN
        ALTER TABLE public.profiles
            ADD CONSTRAINT profiles_branch_id_fkey
            FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 5b. Seed 10 Catalogue Products (Preserves business-managed descriptions, prices, display orders, and active states)
INSERT INTO public.products (sku, name, description, unit, is_active, display_order)
VALUES
    ('SKU-STK-001', 'Sweet Strawberry', 'Sun-ripened strawberry indulgence with fresh fruit sweetness and Malabar cream', 'pack', true, 1),
    ('SKU-STK-002', 'Creamy Guava & Mint', 'Exotic tropical pink guava pulp with herbal freshness and garden mint', 'pack', true, 2),
    ('SKU-STK-003', 'Alphonso Mango', 'Pure Alphonso mango pulp blended into a luxurious golden ice bar', 'pack', true, 3),
    ('SKU-STK-004', 'Tender Coconut', 'Malabar coastal coconut water and hand-scooped malai in velvety cream', 'pack', true, 4),
    ('SKU-STK-005', 'Belgian Chocolate', 'Deep velvety 70% dark Belgian cocoa with roasted hazelnut and almond crunch', 'pack', true, 5),
    ('SKU-STK-006', 'Fresh Watermelon', 'Cold-churned ruby red watermelon juice with artisanal chocolate micro-seeds', 'pack', true, 6),
    ('SKU-STK-007', 'Zesty Kiwi', 'Bright emerald kiwi pulp with crunchy poppy seeds for balanced sweet-tart zing', 'pack', true, 7),
    ('SKU-STK-008', 'Wild Blueberry', 'Antioxidant-rich wild forest blueberries swirled into silky artisanal cream', 'pack', true, 8),
    ('SKU-STK-009', 'Sunshine Lemon', 'Mediterranean lemon aromatic citrus spark with candied peel ribboning', 'pack', true, 9),
    ('SKU-STK-010', 'Royal Pomegranate', 'Ruby pomegranate arils pressed into an exquisitely layered sweet-tart treat', 'pack', true, 10)
ON CONFLICT (sku) DO NOTHING;

-- 5c. Provision Profiles for 3 Auth Users (Strict DO NOTHING to preserve all administrator modifications)
DO $$
DECLARE
    v_ollur_id UUID;
    v_super_admin_id UUID := '2236f15a-bba8-48ba-bd23-764380fb7cba'::UUID;
    v_branch_admin_id UUID := '99fce41f-a636-419f-855d-9f23db4769fb'::UUID;
    v_delivery_staff_id UUID := 'cb3c5a34-ce3b-4a53-ae6e-7a18ff6f4f43'::UUID;
BEGIN
    -- Resolve Ollur branch UUID strictly: must match exactly one row
    BEGIN
        SELECT id INTO STRICT v_ollur_id FROM public.branches WHERE code = 'BR-OLL-003';
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RAISE EXCEPTION 'Fatal: Target branch code BR-OLL-003 does not exist in public.branches. Aborting profile provisioning.';
        WHEN TOO_MANY_ROWS THEN
            RAISE EXCEPTION 'Fatal: Target branch code BR-OLL-003 matched multiple branches in public.branches. Aborting profile provisioning.';
    END;

    -- 1. Super Admin: Strict DO NOTHING on conflict to preserve existing profile row
    IF EXISTS (SELECT 1 FROM auth.users WHERE id = v_super_admin_id) THEN
        INSERT INTO public.profiles (id, full_name, role, branch_id, is_active)
        VALUES (v_super_admin_id, 'Varavoor Super Admin', 'super_admin', NULL, true)
        ON CONFLICT (id) DO NOTHING;
    ELSE
        RAISE NOTICE 'Super Admin user % not present in auth.users; skipping profile insert', v_super_admin_id;
    END IF;

    -- 2. Branch Admin: Link to Ollur branch UUID (DO NOTHING preserves any admin reassignments or status)
    IF EXISTS (SELECT 1 FROM auth.users WHERE id = v_branch_admin_id) THEN
        INSERT INTO public.profiles (id, full_name, role, branch_id, is_active)
        VALUES (v_branch_admin_id, 'Ollur Branch Admin', 'branch_admin', v_ollur_id, true)
        ON CONFLICT (id) DO NOTHING;
    ELSE
        RAISE NOTICE 'Branch Admin user % not present in auth.users; skipping profile insert', v_branch_admin_id;
    END IF;

    -- 3. Delivery Staff: Link without arbitrary branch (DO NOTHING preserves any admin status changes)
    IF EXISTS (SELECT 1 FROM auth.users WHERE id = v_delivery_staff_id) THEN
        INSERT INTO public.profiles (id, full_name, role, branch_id, is_active)
        VALUES (v_delivery_staff_id, 'Central Delivery Staff', 'delivery_staff', NULL, true)
        ON CONFLICT (id) DO NOTHING;
    ELSE
        RAISE NOTICE 'Delivery Staff user % not present in auth.users; skipping profile insert', v_delivery_staff_id;
    END IF;
END $$;

-- 5d. Seed Zero Initial Factory Inventory Only If Absent (Safe Subquery, No Expression Conflict)
INSERT INTO public.inventory (product_id, branch_id, quantity)
SELECT p.id, NULL, 0
FROM public.products p
WHERE NOT EXISTS (
    SELECT 1 FROM public.inventory i
    WHERE i.product_id = p.id AND i.branch_id IS NULL
);

-- 6. SECURITY: GRANTS AND ROW LEVEL SECURITY (RLS)

-- Schema permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Table Grants (Strict Least Privilege)
GRANT SELECT ON public.branches, public.products TO anon, authenticated;
GRANT SELECT ON public.profiles, public.inventory, public.orders, public.order_items, 
                public.dispatches, public.dispatch_orders, public.dispatch_items, 
                public.receipts, public.receipt_items, public.audit_logs, public.enquiries 
                TO authenticated;
GRANT INSERT ON public.enquiries TO anon, authenticated;
GRANT INSERT, UPDATE ON public.orders, public.order_items, public.dispatches, 
                        public.dispatch_orders, public.dispatch_items, public.receipts, 
                        public.receipt_items, public.inventory, public.audit_logs 
                        TO authenticated;

-- Enable RLS on all operational tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enquiries ENABLE ROW LEVEL SECURITY;

-- Helper security functions
CREATE OR REPLACE FUNCTION public.fn_is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND role = 'super_admin'
          AND is_active = true
    );
$$;

CREATE OR REPLACE FUNCTION public.fn_user_branch_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT branch_id FROM public.profiles
    WHERE id = auth.uid()
      AND is_active = true;
$$;

-- PROFILES Policies
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_select_own_or_admin" ON public.profiles
    FOR SELECT TO authenticated
    USING (id = auth.uid() OR public.fn_is_super_admin());

DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
CREATE POLICY "profiles_update_admin" ON public.profiles
    FOR ALL TO authenticated
    USING (public.fn_is_super_admin())
    WITH CHECK (public.fn_is_super_admin());

-- BRANCHES Policies
DROP POLICY IF EXISTS "branches_select_all" ON public.branches;
CREATE POLICY "branches_select_all" ON public.branches
    FOR SELECT TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "branches_admin_manage" ON public.branches;
CREATE POLICY "branches_admin_manage" ON public.branches
    FOR ALL TO authenticated
    USING (public.fn_is_super_admin())
    WITH CHECK (public.fn_is_super_admin());

-- PRODUCTS Policies
DROP POLICY IF EXISTS "products_select_all" ON public.products;
CREATE POLICY "products_select_all" ON public.products
    FOR SELECT TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "products_admin_manage" ON public.products;
CREATE POLICY "products_admin_manage" ON public.products
    FOR ALL TO authenticated
    USING (public.fn_is_super_admin())
    WITH CHECK (public.fn_is_super_admin());

-- INVENTORY Policies
DROP POLICY IF EXISTS "inventory_select_authenticated" ON public.inventory;
CREATE POLICY "inventory_select_authenticated" ON public.inventory
    FOR SELECT TO authenticated
    USING (
        public.fn_is_super_admin() OR
        branch_id IS NULL OR
        branch_id = public.fn_user_branch_id()
    );

DROP POLICY IF EXISTS "inventory_admin_manage" ON public.inventory;
CREATE POLICY "inventory_admin_manage" ON public.inventory
    FOR ALL TO authenticated
    USING (public.fn_is_super_admin())
    WITH CHECK (public.fn_is_super_admin());

-- ORDERS Policies
DROP POLICY IF EXISTS "orders_select_policy" ON public.orders;
CREATE POLICY "orders_select_policy" ON public.orders
    FOR SELECT TO authenticated
    USING (
        public.fn_is_super_admin() OR
        branch_id = public.fn_user_branch_id() OR
        created_by = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.dispatches d
            WHERE (d.order_id = orders.id OR EXISTS (
                SELECT 1 FROM public.dispatch_orders do_stop
                WHERE do_stop.dispatch_id = d.id AND do_stop.order_id = orders.id
            ))
            AND d.delivery_staff_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "orders_insert_policy" ON public.orders;
CREATE POLICY "orders_insert_policy" ON public.orders
    FOR INSERT TO authenticated
    WITH CHECK (
        public.fn_is_super_admin() OR
        (branch_id = public.fn_user_branch_id() AND created_by = auth.uid())
    );

DROP POLICY IF EXISTS "orders_update_policy" ON public.orders;
CREATE POLICY "orders_update_policy" ON public.orders
    FOR UPDATE TO authenticated
    USING (
        public.fn_is_super_admin() OR
        (branch_id = public.fn_user_branch_id() AND status IN ('draft', 'submitted'))
    )
    WITH CHECK (
        public.fn_is_super_admin() OR
        (branch_id = public.fn_user_branch_id() AND status IN ('draft', 'submitted', 'cancelled'))
    );

-- ORDER ITEMS Policies
DROP POLICY IF EXISTS "order_items_select" ON public.order_items;
CREATE POLICY "order_items_select" ON public.order_items
    FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id)
    );

DROP POLICY IF EXISTS "order_items_insert" ON public.order_items;
CREATE POLICY "order_items_insert" ON public.order_items
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id)
    );

DROP POLICY IF EXISTS "order_items_update" ON public.order_items;
CREATE POLICY "order_items_update" ON public.order_items
    FOR UPDATE TO authenticated
    USING (
        public.fn_is_super_admin() OR
        EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = order_items.order_id
              AND o.branch_id = public.fn_user_branch_id()
              AND o.status IN ('draft', 'submitted')
        )
    );

-- DISPATCHES Policies
DROP POLICY IF EXISTS "dispatches_select" ON public.dispatches;
CREATE POLICY "dispatches_select" ON public.dispatches
    FOR SELECT TO authenticated
    USING (
        public.fn_is_super_admin() OR
        delivery_staff_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.dispatch_orders do_stop
            JOIN public.orders o ON o.id = do_stop.order_id
            WHERE do_stop.dispatch_id = dispatches.id AND o.branch_id = public.fn_user_branch_id()
        )
    );

DROP POLICY IF EXISTS "dispatches_manage" ON public.dispatches;
CREATE POLICY "dispatches_manage" ON public.dispatches
    FOR ALL TO authenticated
    USING (public.fn_is_super_admin() OR delivery_staff_id = auth.uid())
    WITH CHECK (public.fn_is_super_admin() OR delivery_staff_id = auth.uid());

-- HARDENED DISPATCH ORDERS Policies
DROP POLICY IF EXISTS "dispatch_orders_all" ON public.dispatch_orders;
DROP POLICY IF EXISTS "dispatch_orders_select" ON public.dispatch_orders;
CREATE POLICY "dispatch_orders_select" ON public.dispatch_orders
    FOR SELECT TO authenticated
    USING (
        public.fn_is_super_admin() OR
        EXISTS (
            SELECT 1 FROM public.dispatches d
            WHERE d.id = dispatch_orders.dispatch_id AND d.delivery_staff_id = auth.uid()
        ) OR
        EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = dispatch_orders.order_id AND o.branch_id = public.fn_user_branch_id()
        )
    );

DROP POLICY IF EXISTS "dispatch_orders_insert" ON public.dispatch_orders;
CREATE POLICY "dispatch_orders_insert" ON public.dispatch_orders
    FOR INSERT TO authenticated
    WITH CHECK (public.fn_is_super_admin());

DROP POLICY IF EXISTS "dispatch_orders_update" ON public.dispatch_orders;
CREATE POLICY "dispatch_orders_update" ON public.dispatch_orders
    FOR UPDATE TO authenticated
    USING (
        public.fn_is_super_admin() OR
        EXISTS (
            SELECT 1 FROM public.dispatches d
            WHERE d.id = dispatch_orders.dispatch_id AND d.delivery_staff_id = auth.uid()
        )
    )
    WITH CHECK (
        public.fn_is_super_admin() OR
        EXISTS (
            SELECT 1 FROM public.dispatches d
            WHERE d.id = dispatch_orders.dispatch_id AND d.delivery_staff_id = auth.uid()
        )
    );

-- HARDENED DISPATCH ITEMS Policies
DROP POLICY IF EXISTS "dispatch_items_all" ON public.dispatch_items;
DROP POLICY IF EXISTS "dispatch_items_select" ON public.dispatch_items;
CREATE POLICY "dispatch_items_select" ON public.dispatch_items
    FOR SELECT TO authenticated
    USING (
        public.fn_is_super_admin() OR
        EXISTS (
            SELECT 1 FROM public.dispatches d
            WHERE d.id = dispatch_items.dispatch_id AND d.delivery_staff_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "dispatch_items_insert" ON public.dispatch_items;
CREATE POLICY "dispatch_items_insert" ON public.dispatch_items
    FOR INSERT TO authenticated
    WITH CHECK (public.fn_is_super_admin());

DROP POLICY IF EXISTS "dispatch_items_update" ON public.dispatch_items;
CREATE POLICY "dispatch_items_update" ON public.dispatch_items
    FOR UPDATE TO authenticated
    USING (
        public.fn_is_super_admin() OR
        EXISTS (
            SELECT 1 FROM public.dispatches d
            WHERE d.id = dispatch_items.dispatch_id AND d.delivery_staff_id = auth.uid()
        )
    )
    WITH CHECK (
        public.fn_is_super_admin() OR
        EXISTS (
            SELECT 1 FROM public.dispatches d
            WHERE d.id = dispatch_items.dispatch_id AND d.delivery_staff_id = auth.uid()
        )
    );

-- HARDENED RECEIPTS Policies
DROP POLICY IF EXISTS "receipts_all" ON public.receipts;
DROP POLICY IF EXISTS "receipts_select" ON public.receipts;
CREATE POLICY "receipts_select" ON public.receipts
    FOR SELECT TO authenticated
    USING (
        public.fn_is_super_admin() OR
        confirmed_by = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.dispatch_orders do_stop
            JOIN public.orders o ON o.id = do_stop.order_id
            WHERE do_stop.dispatch_id = receipts.dispatch_id AND o.branch_id = public.fn_user_branch_id()
        )
    );

DROP POLICY IF EXISTS "receipts_insert" ON public.receipts;
CREATE POLICY "receipts_insert" ON public.receipts
    FOR INSERT TO authenticated
    WITH CHECK (
        public.fn_is_super_admin() OR
        (confirmed_by = auth.uid() AND EXISTS (
            SELECT 1 FROM public.dispatch_orders do_stop
            JOIN public.orders o ON o.id = do_stop.order_id
            WHERE do_stop.dispatch_id = receipts.dispatch_id AND o.branch_id = public.fn_user_branch_id()
        ))
    );

-- HARDENED RECEIPT ITEMS Policies
DROP POLICY IF EXISTS "receipt_items_all" ON public.receipt_items;
DROP POLICY IF EXISTS "receipt_items_select" ON public.receipt_items;
CREATE POLICY "receipt_items_select" ON public.receipt_items
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.receipts r
            WHERE r.id = receipt_items.receipt_id AND (
                public.fn_is_super_admin() OR
                r.confirmed_by = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM public.dispatch_orders do_stop
                    JOIN public.orders o ON o.id = do_stop.order_id
                    WHERE do_stop.dispatch_id = r.dispatch_id AND o.branch_id = public.fn_user_branch_id()
                )
            )
        )
    );

DROP POLICY IF EXISTS "receipt_items_insert" ON public.receipt_items;
CREATE POLICY "receipt_items_insert" ON public.receipt_items
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.receipts r
            WHERE r.id = receipt_items.receipt_id AND (
                public.fn_is_super_admin() OR r.confirmed_by = auth.uid()
            )
        )
    );

-- AUDIT LOGS Policies
DROP POLICY IF EXISTS "audit_logs_select" ON public.audit_logs;
CREATE POLICY "audit_logs_select" ON public.audit_logs
    FOR SELECT TO authenticated
    USING (public.fn_is_super_admin());

DROP POLICY IF EXISTS "audit_logs_insert" ON public.audit_logs;
CREATE POLICY "audit_logs_insert" ON public.audit_logs
    FOR INSERT TO authenticated
    WITH CHECK (actor_id = auth.uid() OR actor_id IS NULL);

-- ENQUIRIES Policies
DROP POLICY IF EXISTS "enquiries_insert_public" ON public.enquiries;
CREATE POLICY "enquiries_insert_public" ON public.enquiries
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);

DROP POLICY IF EXISTS "enquiries_select_admin" ON public.enquiries;
CREATE POLICY "enquiries_select_admin" ON public.enquiries
    FOR SELECT TO authenticated
    USING (public.fn_is_super_admin());

-- 7. ATOMIC TRANSACTIONAL RPC FUNCTIONS (SECURITY DEFINER WITH SEARCH_PATH HARDENING)

-- 7a. Atomic Order Creation
CREATE OR REPLACE FUNCTION public.rpc_create_order(
    p_branch_id UUID,
    p_week_start DATE,
    p_notes TEXT,
    p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role TEXT;
    v_caller_branch UUID;
    v_new_order_id UUID;
    v_new_order_number BIGINT;
    v_item JSONB;
    v_product_id UUID;
    v_req_qty NUMERIC;
    v_price NUMERIC;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to create orders';
    END IF;

    -- Validate caller role and branch ownership
    SELECT role, branch_id INTO v_caller_role, v_caller_branch
    FROM public.profiles
    WHERE id = v_caller_id AND is_active = true;

    IF v_caller_role IS NULL THEN
        RAISE EXCEPTION 'Active profile required';
    END IF;

    IF v_caller_role NOT IN ('super_admin', 'branch_admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only Super Admin and Branch Admins can place orders';
    END IF;

    IF v_caller_role = 'branch_admin' AND v_caller_branch != p_branch_id THEN
        RAISE EXCEPTION 'Branch isolation violation: Cannot place orders for another branch';
    END IF;

    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Order must contain at least one item';
    END IF;

    -- Generate sequence and insert order
    v_new_order_number := nextval('public.orders_order_number_seq');

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
        'submitted',
        p_notes,
        v_caller_id,
        now()
    )
    RETURNING id INTO v_new_order_id;

    -- Insert order items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_req_qty := (v_item->>'requested_quantity')::NUMERIC;
        v_price := NULLIF(v_item->>'unit_price', '')::NUMERIC;

        IF v_req_qty <= 0 THEN
            RAISE EXCEPTION 'Requested quantity must be positive for product %', v_product_id;
        END IF;

        -- Verify product exists and is active
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
            v_price
        );
    END LOOP;

    -- Audit Log
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (
        v_caller_id,
        'ORDER_CREATED',
        'order',
        v_new_order_id::TEXT,
        jsonb_build_object(
            'order_number', v_new_order_number,
            'branch_id', p_branch_id,
            'item_count', jsonb_array_length(p_items)
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_new_order_id,
        'order_number', v_new_order_number
    );
END;
$$;

-- 7b. Atomic Order Approval (Super Admin)
CREATE OR REPLACE FUNCTION public.rpc_approve_order(
    p_order_id UUID,
    p_approved_items JSONB,
    p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_item JSONB;
    v_product_id UUID;
    v_app_qty NUMERIC;
    v_order_num BIGINT;
BEGIN
    IF NOT public.fn_is_super_admin() THEN
        RAISE EXCEPTION 'Super Admin authority required for order approval';
    END IF;

    SELECT order_number INTO v_order_num FROM public.orders WHERE id = p_order_id;
    IF v_order_num IS NULL THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;

    -- Update order status
    UPDATE public.orders
    SET status = 'approved',
        approved_at = now(),
        approved_by = v_caller_id,
        notes = COALESCE(p_notes, notes),
        updated_at = now()
    WHERE id = p_order_id;

    -- Update line items if provided
    IF p_approved_items IS NOT NULL AND jsonb_array_length(p_approved_items) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_approved_items)
        LOOP
            v_product_id := (v_item->>'product_id')::UUID;
            v_app_qty := (v_item->>'approved_quantity')::NUMERIC;

            UPDATE public.order_items
            SET approved_quantity = v_app_qty,
                updated_at = now()
            WHERE order_id = p_order_id AND product_id = v_product_id;
        END LOOP;
    ELSE
        -- Default: approve full requested quantities
        UPDATE public.order_items
        SET approved_quantity = requested_quantity,
            updated_at = now()
        WHERE order_id = p_order_id;
    END IF;

    -- Audit Log
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (
        v_caller_id,
        'ORDER_APPROVED',
        'order',
        p_order_id::TEXT,
        jsonb_build_object('order_number', v_order_num, 'notes', p_notes)
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'order_number', v_order_num,
        'status', 'approved'
    );
END;
$$;

-- 7c. Atomic Inventory Adjustment with Non-Negativity Check
CREATE OR REPLACE FUNCTION public.rpc_adjust_inventory(
    p_product_id UUID,
    p_branch_id UUID,
    p_delta NUMERIC,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_current_qty NUMERIC;
    v_new_qty NUMERIC;
BEGIN
    IF NOT public.fn_is_super_admin() THEN
        RAISE EXCEPTION 'Super Admin authority required for inventory adjustments';
    END IF;

    -- Row locking FOR UPDATE to prevent concurrency lost updates
    SELECT quantity INTO v_current_qty
    FROM public.inventory
    WHERE product_id = p_product_id
      AND (branch_id = p_branch_id OR (branch_id IS NULL AND p_branch_id IS NULL))
    FOR UPDATE;

    IF v_current_qty IS NULL THEN
        v_current_qty := 0;
        INSERT INTO public.inventory (product_id, branch_id, quantity)
        VALUES (p_product_id, p_branch_id, 0);
    END IF;

    v_new_qty := v_current_qty + p_delta;
    IF v_new_qty < 0 THEN
        RAISE EXCEPTION 'Insufficient inventory: Current quantity %, cannot deduct %', v_current_qty, ABS(p_delta);
    END IF;

    UPDATE public.inventory
    SET quantity = v_new_qty,
        updated_at = now()
    WHERE product_id = p_product_id
      AND (branch_id = p_branch_id OR (branch_id IS NULL AND p_branch_id IS NULL));

    -- Audit Log
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (
        v_caller_id,
        'INVENTORY_ADJUSTED',
        'product',
        p_product_id::TEXT,
        jsonb_build_object(
            'branch_id', p_branch_id,
            'delta', p_delta,
            'old_quantity', v_current_qty,
            'new_quantity', v_new_qty,
            'reason', p_reason
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'product_id', p_product_id,
        'branch_id', p_branch_id,
        'quantity', v_new_qty
    );
END;
$$;

-- 7d. Atomic Dispatch Creation Supporting Multiple Orders
CREATE OR REPLACE FUNCTION public.rpc_create_dispatch(
    p_order_ids UUID[],
    p_delivery_staff_id UUID,
    p_notes TEXT,
    p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_dispatch_id UUID;
    v_dispatch_number BIGINT;
    v_order_id UUID;
    v_seq INT := 1;
    v_item JSONB;
BEGIN
    IF NOT public.fn_is_super_admin() THEN
        RAISE EXCEPTION 'Super Admin authority required to create dispatches';
    END IF;

    IF p_order_ids IS NULL OR array_length(p_order_ids, 1) = 0 THEN
        RAISE EXCEPTION 'At least one order must be attached to the dispatch';
    END IF;

    v_dispatch_number := nextval('public.dispatches_dispatch_number_seq');

    -- Insert dispatch (primary order_id references first order for legacy compatibility)
    INSERT INTO public.dispatches (
        dispatch_number,
        order_id,
        delivery_staff_id,
        status,
        dispatched_at,
        delivery_notes,
        created_by
    ) VALUES (
        v_dispatch_number,
        p_order_ids[1],
        p_delivery_staff_id,
        'scheduled',
        now(),
        p_notes,
        v_caller_id
    )
    RETURNING id INTO v_dispatch_id;

    -- Attach each order in dispatch_orders junction table
    FOREACH v_order_id IN ARRAY p_order_ids
    LOOP
        INSERT INTO public.dispatch_orders (
            dispatch_id,
            order_id,
            sequence,
            status
        ) VALUES (
            v_dispatch_id,
            v_order_id,
            v_seq,
            'pending'
        );

        -- Update order status to ready_for_dispatch
        UPDATE public.orders
        SET status = 'ready_for_dispatch',
            updated_at = now()
        WHERE id = v_order_id;

        v_seq := v_seq + 1;
    END LOOP;

    -- Insert loaded products in dispatch_items
    IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
        LOOP
            INSERT INTO public.dispatch_items (
                dispatch_id,
                product_id,
                quantity_loaded,
                quantity_delivered
            ) VALUES (
                v_dispatch_id,
                (v_item->>'product_id')::UUID,
                (v_item->>'quantity_loaded')::NUMERIC,
                0
            )
            ON CONFLICT (dispatch_id, product_id) DO UPDATE SET
                quantity_loaded = EXCLUDED.quantity_loaded;
        END LOOP;
    END IF;

    -- Audit Log
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (
        v_caller_id,
        'DISPATCH_CREATED',
        'dispatch',
        v_dispatch_id::TEXT,
        jsonb_build_object(
            'dispatch_number', v_dispatch_number,
            'delivery_staff_id', p_delivery_staff_id,
            'order_count', array_length(p_order_ids, 1)
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'dispatch_id', v_dispatch_id,
        'dispatch_number', v_dispatch_number
    );
END;
$$;

-- 7e. Atomic Delivery Stop Update & Shortage Recording (No Mixed-Type CASE)
CREATE OR REPLACE FUNCTION public.rpc_update_delivery_stop(
    p_dispatch_id UUID,
    p_order_id UUID,
    p_status TEXT,
    p_notes TEXT,
    p_delivered_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_assigned_staff UUID;
    v_item JSONB;
BEGIN
    SELECT delivery_staff_id INTO v_assigned_staff
    FROM public.dispatches
    WHERE id = p_dispatch_id;

    IF NOT (public.fn_is_super_admin() OR v_caller_id = v_assigned_staff) THEN
        RAISE EXCEPTION 'Unauthorized: Only assigned delivery staff or Super Admin can update delivery stops';
    END IF;

    -- Update stop record in dispatch_orders
    UPDATE public.dispatch_orders
    SET status = p_status,
        delivery_notes = p_notes
    WHERE dispatch_id = p_dispatch_id AND order_id = p_order_id;

    -- Update order status safely without mixed-type CASE expressions, restricting to active dispatch statuses
    IF p_status = 'delivered' THEN
        UPDATE public.orders
        SET status = 'delivered', updated_at = now()
        WHERE id = p_order_id AND status IN ('ready_for_dispatch', 'dispatched');
    ELSIF p_status IN ('partially-delivered', 'partially_delivered') THEN
        UPDATE public.orders
        SET status = 'partially_delivered', updated_at = now()
        WHERE id = p_order_id AND status IN ('ready_for_dispatch', 'dispatched');
    END IF;

    -- Record delivered quantities
    IF p_delivered_items IS NOT NULL AND jsonb_array_length(p_delivered_items) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_delivered_items)
        LOOP
            UPDATE public.dispatch_items
            SET quantity_delivered = (v_item->>'quantity_delivered')::NUMERIC
            WHERE dispatch_id = p_dispatch_id AND product_id = (v_item->>'product_id')::UUID;
        END LOOP;
    END IF;

    -- Audit Log
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (
        v_caller_id,
        'DELIVERY_STOP_UPDATED',
        'dispatch_order',
        p_order_id::TEXT,
        jsonb_build_object('dispatch_id', p_dispatch_id, 'status', p_status, 'notes', p_notes)
    );

    RETURN jsonb_build_object('success', true, 'dispatch_id', p_dispatch_id, 'order_id', p_order_id, 'status', p_status);
END;
$$;

-- 7f. Atomic Branch Receipt Confirmation
CREATE OR REPLACE FUNCTION public.rpc_confirm_receipt(
    p_dispatch_id UUID,
    p_order_id UUID,
    p_receipt_status TEXT,
    p_notes TEXT,
    p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_order_branch UUID;
    v_caller_branch UUID;
    v_receipt_id UUID;
    v_item JSONB;
BEGIN
    SELECT branch_id INTO v_order_branch FROM public.orders WHERE id = p_order_id;
    IF v_order_branch IS NULL THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;

    v_caller_branch := public.fn_user_branch_id();

    IF NOT (public.fn_is_super_admin() OR v_caller_branch = v_order_branch) THEN
        RAISE EXCEPTION 'Branch isolation violation: Cannot confirm receipt for another branch';
    END IF;

    -- Check for existing receipt to ensure retry idempotency
    SELECT id INTO v_receipt_id
    FROM public.receipts
    WHERE dispatch_id = p_dispatch_id AND confirmed_by = v_caller_id
    LIMIT 1;

    IF v_receipt_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'receipt_id', v_receipt_id,
            'order_id', p_order_id,
            'status', 'delivered',
            'already_confirmed', true
        );
    END IF;

    -- Insert into receipts
    INSERT INTO public.receipts (
        dispatch_id,
        confirmed_by,
        receipt_status,
        notes
    ) VALUES (
        p_dispatch_id,
        v_caller_id,
        p_receipt_status,
        p_notes
    )
    RETURNING id INTO v_receipt_id;

    -- Insert receipt items
    IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
        LOOP
            INSERT INTO public.receipt_items (
                receipt_id,
                quantity_expected,
                quantity_received,
                discrepancy_note
            ) VALUES (
                v_receipt_id,
                (v_item->>'quantity_expected')::NUMERIC,
                (v_item->>'quantity_received')::NUMERIC,
                v_item->>'discrepancy_note'
            );
        END LOOP;
    END IF;

    -- Mark order delivered
    UPDATE public.orders
    SET status = 'delivered',
        updated_at = now()
    WHERE id = p_order_id;

    -- Audit Log
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (
        v_caller_id,
        'RECEIPT_CONFIRMED',
        'receipt',
        v_receipt_id::TEXT,
        jsonb_build_object('order_id', p_order_id, 'status', p_receipt_status, 'notes', p_notes)
    );

    RETURN jsonb_build_object(
        'success', true,
        'receipt_id', v_receipt_id,
        'order_id', p_order_id,
        'status', 'delivered'
    );
END;
$$;

-- 8. FUNCTION EXECUTION PERMISSIONS (STRICT LEAST PRIVILEGE)
REVOKE EXECUTE ON FUNCTION public.fn_is_super_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_user_branch_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_create_order(UUID, DATE, TEXT, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_approve_order(UUID, JSONB, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_adjust_inventory(UUID, UUID, NUMERIC, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_create_dispatch(UUID[], UUID, TEXT, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_update_delivery_stop(UUID, UUID, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_confirm_receipt(UUID, UUID, TEXT, TEXT, JSONB) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fn_is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_user_branch_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_create_order(UUID, DATE, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_approve_order(UUID, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_adjust_inventory(UUID, UUID, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_create_dispatch(UUID[], UUID, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_update_delivery_stop(UUID, UUID, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_confirm_receipt(UUID, UUID, TEXT, TEXT, JSONB) TO authenticated;

COMMIT;
