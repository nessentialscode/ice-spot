-- ==============================================================================
-- Icespot Ollur / Varavoor — Enterprise Database Schema & Policy Reference
-- Target Database: PostgreSQL 15+ / Supabase (gprtubirudzequpukzel)
-- ==============================================================================

-- 1. Profiles (Linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT,
    role TEXT NOT NULL DEFAULT 'branch_admin' CHECK (role IN ('super_admin', 'super-admin', 'branch_admin', 'branch-admin', 'delivery_staff', 'delivery-staff')),
    branch_id TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- 2. Branches
CREATE TABLE IF NOT EXISTS public.branches (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    district TEXT NOT NULL,
    region TEXT NOT NULL,
    sub_region TEXT,
    status TEXT NOT NULL DEFAULT 'confirmed',
    is_factory_headquarters BOOLEAN NOT NULL DEFAULT false,
    phone TEXT,
    map_query TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Products
CREATE TABLE IF NOT EXISTS public.products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sku TEXT UNIQUE NOT NULL,
    category TEXT NOT NULL,
    pack_type TEXT NOT NULL,
    units_per_pack INTEGER NOT NULL DEFAULT 24,
    image_url TEXT,
    color TEXT,
    is_available BOOLEAN NOT NULL DEFAULT true,
    is_active BOOLEAN NOT NULL DEFAULT true,
    current_stock INTEGER NOT NULL DEFAULT 0,
    reserved_stock INTEGER NOT NULL DEFAULT 0,
    min_stock_alert INTEGER NOT NULL DEFAULT 50,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- 4. Inventory
CREATE TABLE IF NOT EXISTS public.inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    branch_id TEXT REFERENCES public.branches(id) ON DELETE CASCADE,
    stock_level INTEGER NOT NULL DEFAULT 0,
    reserved_level INTEGER NOT NULL DEFAULT 0,
    last_counted_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- 5. Orders
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT UNIQUE NOT NULL,
    branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
    branch_name TEXT NOT NULL,
    district TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'submitted',
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    requested_delivery_date DATE NOT NULL,
    branch_notes TEXT,
    factory_notes TEXT,
    total_units_requested INTEGER NOT NULL DEFAULT 0,
    total_units_approved INTEGER NOT NULL DEFAULT 0,
    amendment_notes TEXT,
    cancel_reason TEXT,
    assigned_dispatch_id UUID,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- 6. Order Items
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    product_name TEXT NOT NULL,
    sku TEXT NOT NULL,
    pack_type TEXT NOT NULL,
    requested_packs INTEGER NOT NULL DEFAULT 0,
    requested_units INTEGER NOT NULL DEFAULT 0,
    approved_packs INTEGER NOT NULL DEFAULT 0,
    approved_units INTEGER NOT NULL DEFAULT 0,
    packed_units INTEGER DEFAULT 0,
    received_units INTEGER DEFAULT 0,
    damaged_units INTEGER DEFAULT 0,
    missing_units INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 7. Order Amendments
CREATE TABLE IF NOT EXISTS public.order_amendments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    requested_by UUID REFERENCES auth.users(id),
    notes TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 8. Dispatches
CREATE TABLE IF NOT EXISTS public.dispatches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    manifest_number TEXT UNIQUE NOT NULL,
    vehicle_number TEXT NOT NULL,
    driver_id UUID REFERENCES auth.users(id),
    driver_name TEXT NOT NULL,
    driver_phone TEXT,
    dispatch_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT NOT NULL DEFAULT 'scheduled',
    total_units INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    departed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 9. Dispatch Items / Stops
CREATE TABLE IF NOT EXISTS public.dispatch_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispatch_id UUID NOT NULL REFERENCES public.dispatches(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
    sequence INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'pending',
    delivered_units INTEGER DEFAULT 0,
    delivery_notes TEXT,
    failure_reason TEXT,
    arrived_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 10. Receipts
CREATE TABLE IF NOT EXISTS public.receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
    branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
    received_by UUID REFERENCES auth.users(id),
    status TEXT NOT NULL DEFAULT 'completed',
    discrepancy_reported BOOLEAN NOT NULL DEFAULT false,
    discrepancy_notes TEXT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 11. Receipt Items
CREATE TABLE IF NOT EXISTS public.receipt_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id UUID NOT NULL REFERENCES public.receipts(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    received_units INTEGER NOT NULL DEFAULT 0,
    missing_units INTEGER NOT NULL DEFAULT 0,
    damaged_units INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 12. Audit Logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    changes JSONB,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
