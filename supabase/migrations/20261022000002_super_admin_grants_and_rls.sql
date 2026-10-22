-- ==============================================================================
-- Migration: 20261022000002_super_admin_grants_and_rls.sql
-- Description: Enables RLS, configures SQL grants, adds is_open column, and
--              enforces strict Super Admin and role-based policies.
-- ==============================================================================

-- 1. Ensure is_open column exists on public.branches
ALTER TABLE public.branches 
    ADD COLUMN IF NOT EXISTS is_open BOOLEAN NOT NULL DEFAULT true;

-- 2. Schema Privileges
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- 3. Enable RLS on Enterprise Tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 4. SQL Table Level Grants for PostgREST
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON TABLE public.branches, public.products TO anon;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- 5. Helper Function for Checking Active Super Admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE profiles.id = (SELECT auth.uid())
          AND profiles.role IN ('super_admin', 'super-admin')
          AND profiles.is_active = true
    );
$$;

-- Helper Function for Checking Active Profile
CREATE OR REPLACE FUNCTION public.is_active_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE profiles.id = (SELECT auth.uid())
          AND profiles.is_active = true
    );
$$;

-- 6. Row Level Security Policies

-- PROFILES
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (id = (SELECT auth.uid()) OR public.is_super_admin());

DROP POLICY IF EXISTS "Super Admin can manage profiles" ON public.profiles;
CREATE POLICY "Super Admin can manage profiles"
    ON public.profiles FOR ALL
    TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- BRANCHES
DROP POLICY IF EXISTS "Anyone can view branches" ON public.branches;
CREATE POLICY "Anyone can view branches"
    ON public.branches FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "Super Admin can update branches" ON public.branches;
CREATE POLICY "Super Admin can update branches"
    ON public.branches FOR ALL
    TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- PRODUCTS
DROP POLICY IF EXISTS "Anyone can view products" ON public.products;
CREATE POLICY "Anyone can view products"
    ON public.products FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "Super Admin can manage products" ON public.products;
CREATE POLICY "Super Admin can manage products"
    ON public.products FOR ALL
    TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- INVENTORY
DROP POLICY IF EXISTS "Staff can view inventory" ON public.inventory;
CREATE POLICY "Staff can view inventory"
    ON public.inventory FOR SELECT
    TO authenticated
    USING (public.is_active_staff());

DROP POLICY IF EXISTS "Super Admin can manage inventory" ON public.inventory;
CREATE POLICY "Super Admin can manage inventory"
    ON public.inventory FOR ALL
    TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- ORDERS
DROP POLICY IF EXISTS "Staff can view orders" ON public.orders;
CREATE POLICY "Staff can view orders"
    ON public.orders FOR SELECT
    TO authenticated
    USING (
        public.is_super_admin() OR
        created_by = (SELECT auth.uid()) OR
        branch_id IN (
            SELECT branch_id FROM public.profiles WHERE id = (SELECT auth.uid())
        )
    );

DROP POLICY IF EXISTS "Authenticated staff can insert orders" ON public.orders;
CREATE POLICY "Authenticated staff can insert orders"
    ON public.orders FOR INSERT
    TO authenticated
    WITH CHECK (public.is_active_staff());

DROP POLICY IF EXISTS "Super Admin can update orders" ON public.orders;
CREATE POLICY "Super Admin can update orders"
    ON public.orders FOR UPDATE
    TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- ORDER ITEMS
DROP POLICY IF EXISTS "Staff can view order items" ON public.order_items;
CREATE POLICY "Staff can view order items"
    ON public.order_items FOR SELECT
    TO authenticated
    USING (public.is_active_staff());

DROP POLICY IF EXISTS "Staff can insert order items" ON public.order_items;
CREATE POLICY "Staff can insert order items"
    ON public.order_items FOR INSERT
    TO authenticated
    WITH CHECK (public.is_active_staff());

DROP POLICY IF EXISTS "Super Admin can update order items" ON public.order_items;
CREATE POLICY "Super Admin can update order items"
    ON public.order_items FOR UPDATE
    TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- DISPATCHES
DROP POLICY IF EXISTS "Staff can view dispatches" ON public.dispatches;
CREATE POLICY "Staff can view dispatches"
    ON public.dispatches FOR SELECT
    TO authenticated
    USING (public.is_active_staff());

DROP POLICY IF EXISTS "Super Admin can manage dispatches" ON public.dispatches;
CREATE POLICY "Super Admin can manage dispatches"
    ON public.dispatches FOR ALL
    TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- DISPATCH ITEMS
DROP POLICY IF EXISTS "Staff can view dispatch items" ON public.dispatch_items;
CREATE POLICY "Staff can view dispatch items"
    ON public.dispatch_items FOR SELECT
    TO authenticated
    USING (public.is_active_staff());

DROP POLICY IF EXISTS "Staff can update assigned dispatch items" ON public.dispatch_items;
CREATE POLICY "Staff can update assigned dispatch items"
    ON public.dispatch_items FOR ALL
    TO authenticated
    USING (public.is_active_staff())
    WITH CHECK (public.is_active_staff());

-- AUDIT LOGS
DROP POLICY IF EXISTS "Super Admin can view audit logs" ON public.audit_logs;
CREATE POLICY "Super Admin can view audit logs"
    ON public.audit_logs FOR SELECT
    TO authenticated
    USING (public.is_super_admin());

DROP POLICY IF EXISTS "Authenticated can insert audit logs" ON public.audit_logs;
CREATE POLICY "Authenticated can insert audit logs"
    ON public.audit_logs FOR INSERT
    TO authenticated
    WITH CHECK (public.is_active_staff());

-- ==============================================================================
-- 7. Initial Seed Data (Idempotent: ON CONFLICT DO NOTHING)
-- ==============================================================================

-- Seed Branches
INSERT INTO public.branches (id, name, location, district, region, sub_region, status, is_factory_headquarters, phone, is_open)
VALUES 
    ('varavoor-factory', 'Ice Spot Varavoor Factory', 'Main Production Factory & Central Franchise Hub, Varavoor, Wadakkanchery, Thrissur, Kerala 680585', 'Thrissur', 'thrissur', 'town', 'confirmed', true, '+91 94470 00000', true),
    ('thrissur-town', 'Ice Spot Thrissur Town', 'Round West, Thrissur Central, Kerala', 'Thrissur', 'thrissur', 'town', 'confirmed', false, '+91 94470 00001', true),
    ('ollur-branch', 'Ice Spot Ollur', 'Company Padi, Bus Stop, High Road, near Fun Movies, Ollur, Thrissur', 'Thrissur', 'thrissur', 'town', 'confirmed', false, '+91 94470 00002', true),
    ('thrissur-shakthan', 'Ice Spot Thrissur Shakthan', 'Shakthan Nagar, Thrissur Central', 'Thrissur', 'thrissur', 'town', 'confirmed', false, NULL, true),
    ('pudukad', 'Ice Spot Pudukad', 'Pudukad, Thrissur district', 'Thrissur', 'thrissur', 'town', 'confirmed', false, NULL, true),
    ('pallimoola', 'Ice Spot Pallimoola', 'Pallimoola Junction, Thrissur', 'Thrissur', 'thrissur', 'town', 'confirmed', false, NULL, true),
    ('guruvayur', 'Ice Spot Guruvayur', 'Near LF College, opposite Rajah Petrol Pump, Mammiyoor–Guruvayur Road', 'Thrissur', 'thrissur', 'coastal', 'confirmed', false, NULL, true),
    ('kechery', 'Ice Spot Kechery', 'Dubai Road, Kechery, Thrissur', 'Thrissur', 'thrissur', 'town', 'confirmed', false, NULL, true),
    ('vadanappally', 'Ice Spot Vadanappally', 'Vadanappally, Coastal Thrissur', 'Thrissur', 'thrissur', 'coastal', 'confirmed', false, NULL, true),
    ('chalakudy', 'Ice Spot Chalakudy', 'Junction, Tramway Lane, Chalakudy', 'Thrissur', 'thrissur', 'town', 'confirmed', false, NULL, true),
    ('triprayar', 'Ice Spot Triprayar', 'Triprayar Temple Road, Thrissur', 'Thrissur', 'thrissur', 'coastal', 'confirmed', false, NULL, true),
    ('kattoor', 'Ice Spot Kattoor', 'Kattoor Town, Thrissur', 'Thrissur', 'thrissur', 'coastal', 'confirmed', false, NULL, true),
    ('wadakkanchery-branch', 'Ice Spot Wadakkanchery', 'Wadakkanchery Junction', 'Thrissur', 'thrissur', 'town', 'confirmed', false, NULL, true),
    ('kanjani', 'Ice Spot Kanjani', 'Kanjani Road, Thrissur', 'Thrissur', 'thrissur', 'coastal', 'confirmed', false, NULL, true),
    ('palakkad', 'Ice Spot Palakkad', 'Palakkad Town', 'Palakkad', 'palakkad', NULL, 'confirmed', false, NULL, true),
    ('kadampuzha', 'Ice Spot Kadampuzha', 'Kadampuzha Temple Road', 'Malappuram', 'malappuram', NULL, 'confirmed', false, NULL, true),
    ('cusat-road', 'Ice Spot Cusat Road', 'Cusat Road, Kalamassery, Ernakulam', 'Ernakulam', 'ernakulam', NULL, 'confirmed', false, NULL, true)
ON CONFLICT (id) DO UPDATE SET
    region = EXCLUDED.region,
    district = EXCLUDED.district,
    is_open = EXCLUDED.is_open;

-- Seed Products
INSERT INTO public.products (id, name, sku, category, pack_type, units_per_pack, current_stock, reserved_stock, min_stock_alert, is_available, is_active)
VALUES
    ('prod-alphonso-mango', 'Alphonso Mango Real Fruit Stick', 'FLV-SIG-01', 'Signature Fruit Stick', 'Box of 10 Sticks', 10, 450, 40, 50, true, true),
    ('prod-wild-strawberry', 'Wild Strawberry Real Fruit Stick', 'FLV-SIG-02', 'Signature Fruit Stick', 'Box of 10 Sticks', 10, 380, 20, 50, true, true),
    ('prod-tender-coconut', 'Tender Coconut Artisanal Stick', 'FLV-SIG-03', 'Artisanal Cream Stick', 'Box of 10 Sticks', 10, 520, 60, 50, true, true),
    ('prod-spanish-delight', 'Spanish Delight Rich Cream Stick', 'FLV-SIG-04', 'Artisanal Cream Stick', 'Box of 10 Sticks', 10, 310, 30, 50, true, true),
    ('prod-sitaphal', 'Sitaphal (Custard Apple) Stick', 'FLV-SIG-05', 'Exotic Fruit Stick', 'Box of 10 Sticks', 10, 240, 20, 40, true, true),
    ('prod-pistachio-malai', 'Roasted Pistachio Malai Stick', 'FLV-SIG-06', 'Artisanal Cream Stick', 'Box of 10 Sticks', 10, 410, 50, 50, true, true),
    ('prod-dark-chocolate', 'Dark Belgian Chocolate Stick', 'FLV-SIG-07', 'Artisanal Cream Stick', 'Box of 10 Sticks', 10, 360, 30, 50, true, true),
    ('prod-blueberry-burst', 'Blueberry Burst Real Fruit Stick', 'FLV-SIG-08', 'Signature Fruit Stick', 'Box of 10 Sticks', 10, 290, 20, 40, true, true),
    ('prod-guava-chilli', 'Pink Guava with Chilli Spiced Stick', 'FLV-SIG-09', 'Exotic Fruit Stick', 'Box of 10 Sticks', 10, 220, 10, 40, true, true),
    ('prod-cold-coffee-cream', 'Cold Brew Coffee Cream Stick', 'FLV-SIG-10', 'Artisanal Cream Stick', 'Box of 10 Sticks', 10, 340, 20, 40, true, true)
ON CONFLICT (id) DO NOTHING;
