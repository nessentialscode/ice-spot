-- ==============================================================================
-- Icespot — Consolidated Initial Schema & Transactional Workflows Migration
-- File: supabase/migrations/20261023000000_icespot_initial_schema.sql
-- Target: icespot-dev Supabase project ONLY (Project Ref: punyeqlotfnvxhhugtud)
-- Status: Prepared for review; NOT executed against any database.
-- ==============================================================================

BEGIN;

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. ENUM TYPES
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
        CREATE TYPE public.app_role AS ENUM (
            'super_admin',
            'branch_admin',
            'delivery_staff'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'branch_category') THEN
        CREATE TYPE public.branch_category AS ENUM (
            'thrissur_town',
            'thrissur_coastal',
            'ernakulam',
            'palakkad',
            'malappuram'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_frequency') THEN
        CREATE TYPE public.order_frequency AS ENUM (
            'daily',
            'weekly'
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
            'draft',
            'scheduled',
            'loading',
            'in_transit',
            'dispatched',
            'partially_delivered',
            'delivered',
            'completed',
            'failed',
            'cancelled'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'delivery_item_status') THEN
        CREATE TYPE public.delivery_item_status AS ENUM (
            'pending',
            'loaded',
            'delivered',
            'partially_delivered',
            'shortage',
            'damaged',
            'failed'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'receipt_status') THEN
        CREATE TYPE public.receipt_status AS ENUM (
            'intact',
            'discrepancy',
            'rejected',
            'pending',
            'confirmed'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inventory_movement_type') THEN
        CREATE TYPE public.inventory_movement_type AS ENUM (
            'opening_balance',
            'receipt_in',
            'dispatch_out',
            'adjustment_in',
            'adjustment_out',
            'return_in',
            'write_off'
        );
    END IF;
END $$;

-- 3. TIMESTAMP UPDATE FUNCTION
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at := pg_catalog.timezone('utc'::pg_catalog.text, pg_catalog.now());
    RETURN NEW;
END;
$$;

-- 4. SEQUENCES
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

-- 5. OPERATIONAL TABLES (13 APPLICATION RELATIONS)

-- 5a. Branches
CREATE TABLE IF NOT EXISTS public.branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category public.branch_category NOT NULL,
    address TEXT NOT NULL,
    locality TEXT,
    district TEXT NOT NULL,
    contact_name TEXT,
    contact_phone TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT branches_code_nonblank CHECK (length(btrim(code)) > 0),
    CONSTRAINT branches_name_nonblank CHECK (length(btrim(name)) > 0)
);
CREATE INDEX IF NOT EXISTS idx_branches_category ON public.branches(category);
CREATE INDEX IF NOT EXISTS idx_branches_is_active ON public.branches(is_active);

-- 5b. Profiles (references auth.users, keyed by id)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    role public.app_role NOT NULL DEFAULT 'branch_admin',
    branch_id UUID REFERENCES public.branches(id) ON DELETE RESTRICT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT profiles_branch_role_consistency CHECK (
        (role = 'branch_admin' AND branch_id IS NOT NULL) OR
        (role IN ('super_admin', 'delivery_staff') AND branch_id IS NULL)
    )
);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_one_active_branch_admin_per_branch
    ON public.profiles(branch_id) WHERE role = 'branch_admin' AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_profiles_role_active ON public.profiles(role, is_active);
CREATE INDEX IF NOT EXISTS idx_profiles_branch_id ON public.profiles(branch_id);

-- 5c. Products
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    unit TEXT NOT NULL DEFAULT 'pack',
    selling_price NUMERIC(10,2) DEFAULT 0 CHECK (selling_price IS NULL OR selling_price >= 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT products_sku_nonblank CHECK (length(btrim(sku)) > 0),
    CONSTRAINT products_name_nonblank CHECK (length(btrim(name)) > 0)
);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON public.products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_display_order ON public.products(display_order);

-- 5d. Inventory (Dual Factory & Branch Stock Accounting with Reservation Invariant)
CREATE TABLE IF NOT EXISTS public.inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE, -- NULL indicates Central Factory Hub
    quantity NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    reserved_quantity NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT inventory_reserved_not_over_quantity CHECK (reserved_quantity <= quantity)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_product_branch_unique
    ON public.inventory(product_id, branch_id) NULLS NOT DISTINCT;
CREATE INDEX IF NOT EXISTS idx_inventory_product_id ON public.inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_branch_id ON public.inventory(branch_id);

-- 5e. Inventory Movements (Audited Double-Entry Stock Movement Ledger)
CREATE TABLE IF NOT EXISTS public.inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE, -- NULL indicates Factory Hub
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    movement_type public.inventory_movement_type NOT NULL,
    quantity_delta NUMERIC(12,2) NOT NULL CHECK (quantity_delta <> 0),
    reference_type TEXT,
    reference_id UUID,
    idempotency_key TEXT UNIQUE,
    notes TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_prod_time ON public.inventory_movements(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_branch_time ON public.inventory_movements(branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_ref ON public.inventory_movements(reference_type, reference_id);

-- 5f. Orders
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number BIGINT NOT NULL DEFAULT nextval('public.orders_order_number_seq') UNIQUE,
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
    week_start DATE NOT NULL,
    frequency public.order_frequency NOT NULL DEFAULT 'weekly',
    status public.order_status NOT NULL DEFAULT 'submitted',
    notes TEXT,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_orders_branch_created ON public.orders(branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_week_start ON public.orders(week_start);

-- 5g. Order Items
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    requested_quantity NUMERIC(12,2) NOT NULL CHECK (requested_quantity > 0),
    approved_quantity NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (approved_quantity >= 0),
    unit_price NUMERIC(10,2) CHECK (unit_price IS NULL OR unit_price >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT order_items_one_product_per_order UNIQUE (order_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items(product_id);

-- 5h. Dispatches
CREATE TABLE IF NOT EXISTS public.dispatches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispatch_number BIGINT NOT NULL DEFAULT nextval('public.dispatches_dispatch_number_seq') UNIQUE,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL, -- primary/initial order link
    delivery_staff_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    status public.dispatch_status NOT NULL DEFAULT 'scheduled',
    planned_dispatch_at TIMESTAMPTZ,
    dispatched_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    delivery_notes TEXT,
    proof_of_delivery_url TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_dispatches_status ON public.dispatches(status);
CREATE INDEX IF NOT EXISTS idx_dispatches_delivery_staff ON public.dispatches(delivery_staff_id);

-- 5i. Dispatch Orders (Multi-branch / Multi-stop Manifest Junction)
CREATE TABLE IF NOT EXISTS public.dispatch_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispatch_id UUID NOT NULL REFERENCES public.dispatches(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
    sequence INTEGER NOT NULL DEFAULT 1 CHECK (sequence >= 1),
    status TEXT NOT NULL DEFAULT 'pending',
    delivery_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_dispatch_order UNIQUE (dispatch_id, order_id)
);
CREATE INDEX IF NOT EXISTS idx_dispatch_orders_dispatch ON public.dispatch_orders(dispatch_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_orders_order ON public.dispatch_orders(order_id);

-- 5j. Dispatch Items (Aggregated Products Loaded for Trip)
CREATE TABLE IF NOT EXISTS public.dispatch_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispatch_id UUID NOT NULL REFERENCES public.dispatches(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    quantity_loaded NUMERIC(10,2) NOT NULL CHECK (quantity_loaded >= 0),
    quantity_delivered NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (quantity_delivered >= 0),
    quantity_short NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (quantity_short >= 0),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT dispatch_items_delivered_not_over_loaded CHECK (quantity_delivered <= quantity_loaded),
    CONSTRAINT uq_dispatch_product UNIQUE (dispatch_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_dispatch_items_dispatch ON public.dispatch_items(dispatch_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_items_product ON public.dispatch_items(product_id);

-- 5k. Receipts
CREATE TABLE IF NOT EXISTS public.receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_number BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
    dispatch_id UUID NOT NULL REFERENCES public.dispatches(id) ON DELETE CASCADE,
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    confirmed_by UUID NOT NULL REFERENCES auth.users(id),
    receipt_status public.receipt_status NOT NULL DEFAULT 'intact',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_receipts_dispatch_order UNIQUE (dispatch_id, order_id)
);
CREATE INDEX IF NOT EXISTS idx_receipts_dispatch ON public.receipts(dispatch_id);
CREATE INDEX IF NOT EXISTS idx_receipts_order ON public.receipts(order_id);
CREATE INDEX IF NOT EXISTS idx_receipts_confirmed_by ON public.receipts(confirmed_by);

-- 5l. Receipt Items
CREATE TABLE IF NOT EXISTS public.receipt_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id UUID NOT NULL REFERENCES public.receipts(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE RESTRICT,
    quantity_expected NUMERIC(10,2) NOT NULL CHECK (quantity_expected >= 0),
    quantity_received NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
    quantity_damaged NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (quantity_damaged >= 0),
    quantity_short NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (quantity_short >= 0),
    discrepancy_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_receipt_items_receipt ON public.receipt_items(receipt_id);
CREATE INDEX IF NOT EXISTS idx_receipt_items_product ON public.receipt_items(product_id);

-- 5m. Audit Logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL CHECK (length(btrim(action)) > 0),
    entity_type TEXT NOT NULL CHECK (length(btrim(entity_type)) > 0),
    entity_id TEXT,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id, created_at DESC);

-- 5n. Customer & Franchise Enquiries
CREATE TABLE IF NOT EXISTS public.enquiries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
    phone TEXT NOT NULL CHECK (length(btrim(phone)) > 0),
    email TEXT,
    flavour_interest TEXT,
    enquiry_type TEXT NOT NULL DEFAULT 'general',
    message TEXT NOT NULL CHECK (length(btrim(message)) > 0),
    status TEXT NOT NULL DEFAULT 'new',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_enquiries_status ON public.enquiries(status, created_at DESC);

-- 6. UPDATED_AT TRIGGERS
CREATE TRIGGER branches_set_updated_at BEFORE UPDATE ON public.branches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER inventory_set_updated_at BEFORE UPDATE ON public.inventory FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER orders_set_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER order_items_set_updated_at BEFORE UPDATE ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER dispatches_set_updated_at BEFORE UPDATE ON public.dispatches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER dispatch_items_set_updated_at BEFORE UPDATE ON public.dispatch_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER receipts_set_updated_at BEFORE UPDATE ON public.receipts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER receipt_items_set_updated_at BEFORE UPDATE ON public.receipt_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7. SECURITY & SCOPE HELPER FUNCTIONS
CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT p.role FROM public.profiles p
    WHERE p.id = (SELECT auth.uid()) AND p.is_active = true
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_branch_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT p.branch_id FROM public.profiles p
    WHERE p.id = (SELECT auth.uid()) AND p.is_active = true
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT COALESCE(public.current_app_role() = 'super_admin'::public.app_role, false);
$$;

CREATE OR REPLACE FUNCTION public.fn_is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT public.is_super_admin();
$$;

CREATE OR REPLACE FUNCTION public.fn_user_branch_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT public.current_branch_id();
$$;

CREATE OR REPLACE FUNCTION public.can_access_dispatch(p_dispatch_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.dispatches d
            WHERE d.id = p_dispatch_id AND d.delivery_staff_id = (SELECT auth.uid())
        )
        OR EXISTS (
            SELECT 1 FROM public.dispatch_orders do_stop
            JOIN public.orders o ON o.id = do_stop.order_id
            WHERE do_stop.dispatch_id = p_dispatch_id
              AND o.branch_id = public.current_branch_id()
              AND public.current_app_role() = 'branch_admin'::public.app_role
        );
$$;

-- 8. SIX ATOMIC TRANSACTIONAL RPC FUNCTIONS (SECURITY DEFINER WITH SEARCH_PATH HARDENING)

-- 8a. rpc_create_order
CREATE OR REPLACE FUNCTION public.rpc_create_order(
    p_branch_id UUID,
    p_week_start DATE,
    p_notes TEXT,
    p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role public.app_role;
    v_caller_branch UUID;
    v_new_order_id UUID;
    v_new_order_number BIGINT;
    v_item JSONB;
    v_product_id UUID;
    v_req_qty NUMERIC;
    v_unit_price NUMERIC;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to create orders';
    END IF;

    SELECT role, branch_id INTO v_caller_role, v_caller_branch
    FROM public.profiles
    WHERE id = v_caller_id AND is_active = true;

    IF v_caller_role IS NULL THEN
        RAISE EXCEPTION 'Active administrator profile required';
    END IF;

    IF v_caller_role NOT IN ('super_admin'::public.app_role, 'branch_admin'::public.app_role) THEN
        RAISE EXCEPTION 'Unauthorized: Only super_admin or branch_admin can create orders';
    END IF;

    IF v_caller_role = 'branch_admin'::public.app_role AND (v_caller_branch IS NULL OR v_caller_branch <> p_branch_id) THEN
        RAISE EXCEPTION 'Branch isolation violation: Branch admin can only place orders for their assigned branch';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = p_branch_id AND is_active = true) THEN
        RAISE EXCEPTION 'Target branch % does not exist or is inactive', p_branch_id;
    END IF;

    IF p_items IS NULL OR pg_catalog.jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Order must contain at least one product item';
    END IF;

    -- Insert Order
    v_new_order_number := pg_catalog.nextval('public.orders_order_number_seq'::pg_catalog.regclass);

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
        'submitted'::public.order_status,
        p_notes,
        v_caller_id,
        pg_catalog.now()
    )
    RETURNING id INTO v_new_order_id;

    -- Validate and Insert Line Items (handling duplicates gracefully)
    FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_req_qty := (v_item->>'requested_quantity')::NUMERIC;
        v_unit_price := NULLIF(v_item->>'unit_price', '')::NUMERIC;

        IF v_product_id IS NULL THEN
            RAISE EXCEPTION 'Missing product_id in order items';
        END IF;

        IF v_req_qty IS NULL OR v_req_qty <= 0 THEN
            RAISE EXCEPTION 'Requested quantity must be positive for product %', v_product_id;
        END IF;

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
            v_unit_price
        )
        ON CONFLICT (order_id, product_id) DO UPDATE SET
            requested_quantity = public.order_items.requested_quantity + EXCLUDED.requested_quantity,
            unit_price = COALESCE(EXCLUDED.unit_price, public.order_items.unit_price),
            updated_at = pg_catalog.now();
    END LOOP;

    -- Audit Log
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (
        v_caller_id,
        'ORDER_CREATED',
        'order',
        v_new_order_id::TEXT,
        pg_catalog.jsonb_build_object(
            'order_number', v_new_order_number,
            'branch_id', p_branch_id,
            'item_count', pg_catalog.jsonb_array_length(p_items)
        )
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'order_id', v_new_order_id,
        'order_number', v_new_order_number
    );
END;
$$;

-- 8b. rpc_approve_order
CREATE OR REPLACE FUNCTION public.rpc_approve_order(
    p_order_id UUID,
    p_approved_items JSONB,
    p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_order RECORD;
    v_item JSONB;
    v_product_id UUID;
    v_app_qty NUMERIC;
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Super Admin authority required to approve orders';
    END IF;

    SELECT id, order_number, status INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;

    IF v_order.status NOT IN ('submitted', 'under_review', 'amendment_requested') THEN
        RAISE EXCEPTION 'Invalid status transition: Cannot approve order in status %', v_order.status;
    END IF;

    -- Update order status
    UPDATE public.orders
    SET status = 'approved'::public.order_status,
        approved_at = pg_catalog.now(),
        approved_by = v_caller_id,
        notes = COALESCE(p_notes, notes),
        updated_at = pg_catalog.now()
    WHERE id = p_order_id;

    -- Update approved quantities
    IF p_approved_items IS NOT NULL AND pg_catalog.jsonb_array_length(p_approved_items) > 0 THEN
        FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(p_approved_items)
        LOOP
            v_product_id := (v_item->>'product_id')::UUID;
            v_app_qty := (v_item->>'approved_quantity')::NUMERIC;

            IF v_app_qty < 0 THEN
                RAISE EXCEPTION 'Approved quantity cannot be negative for product %', v_product_id;
            END IF;

            UPDATE public.order_items
            SET approved_quantity = v_app_qty,
                updated_at = pg_catalog.now()
            WHERE order_id = p_order_id AND product_id = v_product_id;
        END LOOP;
    ELSE
        -- Default: approve full requested quantities
        UPDATE public.order_items
        SET approved_quantity = requested_quantity,
            updated_at = pg_catalog.now()
        WHERE order_id = p_order_id;
    END IF;

    -- Audit Log
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (
        v_caller_id,
        'ORDER_APPROVED',
        'order',
        p_order_id::TEXT,
        pg_catalog.jsonb_build_object(
            'order_number', v_order.order_number,
            'notes', p_notes
        )
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'order_number', v_order.order_number,
        'status', 'approved'
    );
END;
$$;

-- 8c. rpc_create_dispatch (Supports Multi-Branch Orders and Enforces Stock Reservation Invariant)
CREATE OR REPLACE FUNCTION public.rpc_create_dispatch(
    p_order_ids UUID[],
    p_delivery_staff_id UUID,
    p_notes TEXT,
    p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_dispatch_id UUID;
    v_dispatch_number BIGINT;
    v_order_id UUID;
    v_order RECORD;
    v_seq INT := 1;
    v_item JSONB;
    v_prod_id UUID;
    v_load_qty NUMERIC;
    v_fac_on_hand NUMERIC;
    v_fac_reserved NUMERIC;
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Super Admin authority required to create dispatches';
    END IF;

    IF p_order_ids IS NULL OR pg_catalog.array_length(p_order_ids, 1) = 0 THEN
        RAISE EXCEPTION 'At least one order must be attached to the dispatch trip';
    END IF;

    -- Validate delivery staff if provided
    IF p_delivery_staff_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = p_delivery_staff_id AND is_active = true AND role IN ('delivery_staff', 'super_admin')
        ) THEN
            RAISE EXCEPTION 'Assigned delivery staff % does not exist or is not active', p_delivery_staff_id;
        END IF;
    END IF;

    -- Validate all orders are in approved status, not already in active dispatch, and lock them
    FOREACH v_order_id IN ARRAY p_order_ids
    LOOP
        SELECT id, order_number, status INTO v_order
        FROM public.orders
        WHERE id = v_order_id
        FOR UPDATE;

        IF v_order.id IS NULL THEN
            RAISE EXCEPTION 'Order % does not exist', v_order_id;
        END IF;

        IF v_order.status NOT IN ('approved', 'preparation', 'ready_for_dispatch') THEN
            RAISE EXCEPTION 'Order % (ORD-%) cannot be dispatched: current status is %',
                v_order_id, v_order.order_number, v_order.status;
        END IF;

        -- Prevent double-dispatching an order that is already in an active dispatch
        IF EXISTS (
            SELECT 1 FROM public.dispatch_orders do_link
            JOIN public.dispatches d ON d.id = do_link.dispatch_id
            WHERE do_link.order_id = v_order_id
              AND d.status NOT IN ('completed'::public.dispatch_status, 'cancelled'::public.dispatch_status, 'failed'::public.dispatch_status)
        ) THEN
            RAISE EXCEPTION 'Order % (ORD-%) is already attached to an active dispatch trip', v_order_id, v_order.order_number;
        END IF;
    END LOOP;

    -- If items omitted or empty, auto-aggregate approved quantities from attached orders
    IF p_items IS NULL OR pg_catalog.jsonb_array_length(p_items) = 0 THEN
        SELECT pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'product_id', oi.product_id,
                'quantity_loaded', SUM(CASE WHEN oi.approved_quantity > 0 THEN oi.approved_quantity ELSE oi.requested_quantity END)
            )
        ) INTO p_items
        FROM public.order_items oi
        WHERE oi.order_id = ANY(p_order_ids)
        GROUP BY oi.product_id;
    END IF;

    IF p_items IS NULL OR pg_catalog.jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Attached orders contain no products to dispatch';
    END IF;

    -- Enforce Stock Accounting Invariant: Reserve Factory Stock
    -- Available stock = quantity - reserved_quantity. Must be >= loaded quantity.
    FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(p_items)
    LOOP
        v_prod_id := (v_item->>'product_id')::UUID;
        v_load_qty := (v_item->>'quantity_loaded')::NUMERIC;

        IF v_load_qty < 0 THEN
            RAISE EXCEPTION 'Loaded quantity cannot be negative for product %', v_prod_id;
        END IF;

        IF v_load_qty > 0 THEN
            -- Lock factory stock row
            SELECT quantity, reserved_quantity INTO v_fac_on_hand, v_fac_reserved
            FROM public.inventory
            WHERE product_id = v_prod_id AND branch_id IS NULL
            FOR UPDATE;

            IF v_fac_on_hand IS NULL THEN
                v_fac_on_hand := 0;
                v_fac_reserved := 0;
                INSERT INTO public.inventory (product_id, branch_id, quantity, reserved_quantity)
                VALUES (v_prod_id, NULL, 0, 0);
            END IF;

            -- Check available stock
            IF (v_fac_on_hand - v_fac_reserved) < v_load_qty THEN
                RAISE EXCEPTION 'Insufficient factory inventory for product %: on-hand %, reserved %, available %, requested %',
                    v_prod_id, v_fac_on_hand, v_fac_reserved, (v_fac_on_hand - v_fac_reserved), v_load_qty;
            END IF;

            -- Increment reserved quantity at factory
            UPDATE public.inventory
            SET reserved_quantity = reserved_quantity + v_load_qty,
                updated_at = pg_catalog.now()
            WHERE product_id = v_prod_id AND branch_id IS NULL;

            -- Log movement
            INSERT INTO public.inventory_movements (
                branch_id, product_id, movement_type, quantity_delta, reference_type, notes, created_by
            ) VALUES (
                NULL, v_prod_id, 'dispatch_out'::public.inventory_movement_type, -v_load_qty, 'dispatch', 'Stock reserved for dispatch trip', v_caller_id
            );
        END IF;
    END LOOP;

    -- Insert Dispatch
    v_dispatch_number := pg_catalog.nextval('public.dispatches_dispatch_number_seq'::pg_catalog.regclass);

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
        'scheduled'::public.dispatch_status,
        pg_catalog.now(),
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
        SET status = 'ready_for_dispatch'::public.order_status,
            updated_at = pg_catalog.now()
        WHERE id = v_order_id;

        v_seq := v_seq + 1;
    END LOOP;

    -- Attach loaded items in dispatch_items
    FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(p_items)
    LOOP
        INSERT INTO public.dispatch_items (
            dispatch_id,
            product_id,
            quantity_loaded,
            quantity_delivered,
            quantity_short
        ) VALUES (
            v_dispatch_id,
            (v_item->>'product_id')::UUID,
            (v_item->>'quantity_loaded')::NUMERIC,
            0,
            0
        )
        ON CONFLICT (dispatch_id, product_id) DO UPDATE SET
            quantity_loaded = EXCLUDED.quantity_loaded,
            updated_at = pg_catalog.now();
    END LOOP;

    -- Audit Log
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (
        v_caller_id,
        'DISPATCH_CREATED',
        'dispatch',
        v_dispatch_id::TEXT,
        pg_catalog.jsonb_build_object(
            'dispatch_number', v_dispatch_number,
            'delivery_staff_id', p_delivery_staff_id,
            'order_count', pg_catalog.array_length(p_order_ids, 1)
        )
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'dispatch_id', v_dispatch_id,
        'dispatch_number', v_dispatch_number
    );
END;
$$;

-- 8d. rpc_update_delivery_stop
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
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_assigned_staff UUID;
    v_norm_status TEXT;
    v_item JSONB;
    v_prod_id UUID;
    v_del_qty NUMERIC;
    v_short_qty NUMERIC;
    v_disp_item RECORD;
BEGIN
    SELECT delivery_staff_id INTO v_assigned_staff
    FROM public.dispatches
    WHERE id = p_dispatch_id;

    IF NOT (public.is_super_admin() OR (v_caller_id IS NOT NULL AND v_caller_id = v_assigned_staff)) THEN
        RAISE EXCEPTION 'Unauthorized: Only assigned delivery staff or Super Admin can update delivery stops';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.dispatch_orders
        WHERE dispatch_id = p_dispatch_id AND order_id = p_order_id
    ) THEN
        RAISE EXCEPTION 'Stop not found for dispatch % and order %', p_dispatch_id, p_order_id;
    END IF;

    v_norm_status := pg_catalog.lower(pg_catalog.replace(p_status, '-', '_'));

    -- Validate items if provided
    IF p_delivered_items IS NOT NULL AND pg_catalog.jsonb_array_length(p_delivered_items) > 0 THEN
        FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(p_delivered_items)
        LOOP
            v_prod_id := (v_item->>'product_id')::UUID;
            v_del_qty := (v_item->>'quantity_delivered')::NUMERIC;
            v_short_qty := COALESCE((v_item->>'shortage_quantity')::NUMERIC, 0);

            SELECT quantity_loaded INTO v_disp_item
            FROM public.dispatch_items
            WHERE dispatch_id = p_dispatch_id AND product_id = v_prod_id;

            IF v_disp_item.quantity_loaded IS NOT NULL AND v_del_qty > v_disp_item.quantity_loaded THEN
                RAISE EXCEPTION 'Delivered quantity (%) cannot exceed loaded quantity (%) for product %',
                    v_del_qty, v_disp_item.quantity_loaded, v_prod_id;
            END IF;

            IF v_short_qty > 0 AND (p_notes IS NULL OR pg_catalog.length(pg_catalog.btrim(p_notes)) = 0) THEN
                RAISE EXCEPTION 'Shortage notes are mandatory when recording partial delivery';
            END IF;

            UPDATE public.dispatch_items
            SET quantity_delivered = v_del_qty,
                quantity_short = v_short_qty,
                updated_at = pg_catalog.now()
            WHERE dispatch_id = p_dispatch_id AND product_id = v_prod_id;
        END LOOP;
    END IF;

    -- Update stop record in dispatch_orders
    UPDATE public.dispatch_orders
    SET status = v_norm_status,
        delivery_notes = p_notes
    WHERE dispatch_id = p_dispatch_id AND order_id = p_order_id;

    -- Update order status safely
    IF v_norm_status = 'delivered' THEN
        UPDATE public.orders
        SET status = 'delivered'::public.order_status,
            updated_at = pg_catalog.now()
        WHERE id = p_order_id;
    ELSIF v_norm_status IN ('partially_delivered', 'partially-delivered') THEN
        UPDATE public.orders
        SET status = 'partially_delivered'::public.order_status,
            updated_at = pg_catalog.now()
        WHERE id = p_order_id;
    END IF;

    -- Audit Log
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (
        v_caller_id,
        'DELIVERY_STOP_UPDATED',
        'dispatch_order',
        p_order_id::TEXT,
        pg_catalog.jsonb_build_object(
            'dispatch_id', p_dispatch_id,
            'status', v_norm_status,
            'notes', p_notes
        )
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'dispatch_id', p_dispatch_id,
        'order_id', p_order_id,
        'status', v_norm_status
    );
END;
$$;

-- 8e. rpc_adjust_inventory (Supports Manual Adjustments and Shortage Reconciliation)
CREATE OR REPLACE FUNCTION public.rpc_adjust_inventory(
    p_product_id UUID,
    p_branch_id UUID,
    p_delta NUMERIC,
    p_reason TEXT,
    p_release_reserved NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_current_qty NUMERIC;
    v_current_reserved NUMERIC;
    v_new_qty NUMERIC;
    v_mov_type public.inventory_movement_type;
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Super Admin privileges required for inventory adjustments';
    END IF;

    IF p_delta = 0 AND (p_release_reserved IS NULL OR p_release_reserved = 0) THEN
        RAISE EXCEPTION 'Stock adjustment amount or reserved release must be non-zero';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_product_id AND is_active = true) THEN
        RAISE EXCEPTION 'Product % does not exist or is inactive', p_product_id;
    END IF;

    -- Row lock FOR UPDATE
    SELECT quantity, reserved_quantity INTO v_current_qty, v_current_reserved
    FROM public.inventory
    WHERE product_id = p_product_id
      AND (branch_id = p_branch_id OR (branch_id IS NULL AND p_branch_id IS NULL))
    FOR UPDATE;

    IF v_current_qty IS NULL THEN
        IF p_delta < 0 THEN
            RAISE EXCEPTION 'Cannot deduct % units: current inventory is 0', pg_catalog.abs(p_delta);
        END IF;
        v_current_qty := 0;
        v_current_reserved := 0;
        INSERT INTO public.inventory (product_id, branch_id, quantity, reserved_quantity)
        VALUES (p_product_id, p_branch_id, 0, 0);
    END IF;

    -- Shortage Reconciliation: Release reserved quantity if requested
    IF p_release_reserved IS NOT NULL AND p_release_reserved > 0 THEN
        IF p_release_reserved > v_current_reserved THEN
            RAISE EXCEPTION 'Cannot release % reserved units: only % units currently reserved',
                p_release_reserved, v_current_reserved;
        END IF;
        v_current_reserved := v_current_reserved - p_release_reserved;
    END IF;

    v_new_qty := v_current_qty + p_delta;
    IF v_new_qty < 0 THEN
        RAISE EXCEPTION 'Cannot deduct % units: current inventory is %', pg_catalog.abs(p_delta), v_current_qty;
    END IF;

    IF v_new_qty < v_current_reserved THEN
        RAISE EXCEPTION 'Cannot reduce inventory to % below reserved quantity %', v_new_qty, v_current_reserved;
    END IF;

    UPDATE public.inventory
    SET quantity = v_new_qty,
        reserved_quantity = v_current_reserved,
        updated_at = pg_catalog.now()
    WHERE product_id = p_product_id
      AND (branch_id = p_branch_id OR (branch_id IS NULL AND p_branch_id IS NULL));

    v_mov_type := CASE WHEN p_delta > 0 THEN 'adjustment_in'::public.inventory_movement_type ELSE 'adjustment_out'::public.inventory_movement_type END;

    -- Movement record
    IF p_delta <> 0 THEN
        INSERT INTO public.inventory_movements (
            branch_id, product_id, movement_type, quantity_delta, reference_type, notes, created_by
        ) VALUES (
            p_branch_id, p_product_id, v_mov_type, p_delta, 'manual_adjustment', p_reason, v_caller_id
        );
    END IF;

    -- Audit Log
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (
        v_caller_id,
        'INVENTORY_ADJUSTED',
        'inventory',
        p_product_id::TEXT,
        pg_catalog.jsonb_build_object(
            'branch_id', p_branch_id,
            'change_amount', p_delta,
            'released_reserved', COALESCE(p_release_reserved, 0),
            'previous_stock', v_current_qty,
            'new_stock', v_new_qty,
            'reserved_stock', v_current_reserved,
            'reason', p_reason
        )
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'product_id', p_product_id,
        'branch_id', p_branch_id,
        'quantity', v_new_qty,
        'reserved_quantity', v_current_reserved
    );
END;
$$;

-- 8f. rpc_confirm_receipt (Enforces Idempotency & Stock Accounting Invariant)
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
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_order RECORD;
    v_caller_branch UUID;
    v_receipt_id UUID;
    v_item JSONB;
    v_prod_id UUID;
    v_exp_qty NUMERIC;
    v_rec_qty NUMERIC;
    v_short_qty NUMERIC;
    v_disc_note TEXT;
    v_norm_status public.receipt_status;
    v_fac_on_hand NUMERIC;
    v_fac_reserved NUMERIC;
BEGIN
    -- Row-lock target order for update to serialize concurrent confirmations
    SELECT id, order_number, branch_id, status INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;

    v_caller_branch := public.current_branch_id();

    IF NOT (public.is_super_admin() OR (v_caller_branch IS NOT NULL AND v_caller_branch = v_order.branch_id)) THEN
        RAISE EXCEPTION 'Branch isolation violation: Cannot confirm receipt for another branch';
    END IF;

    -- Idempotency Check: if receipt already confirmed for this dispatch & order, return success safely
    SELECT r.id INTO v_receipt_id
    FROM public.receipts r
    WHERE r.dispatch_id = p_dispatch_id
      AND r.order_id = p_order_id
    LIMIT 1;

    IF v_receipt_id IS NOT NULL OR v_order.status = 'delivered'::public.order_status THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', true,
            'receipt_id', v_receipt_id,
            'order_id', p_order_id,
            'status', 'delivered',
            'already_confirmed', true,
            'message', 'Receipt was already confirmed'
        );
    END IF;

    -- Parse receipt status
    v_norm_status := CASE 
        WHEN pg_catalog.lower(p_receipt_status) = 'discrepancy' THEN 'discrepancy'::public.receipt_status
        WHEN pg_catalog.lower(p_receipt_status) = 'rejected' THEN 'rejected'::public.receipt_status
        ELSE 'intact'::public.receipt_status
    END;

    -- Insert into receipts with race-condition protection (ON CONFLICT DO NOTHING)
    INSERT INTO public.receipts (
        dispatch_id,
        order_id,
        confirmed_by,
        receipt_status,
        notes
    ) VALUES (
        p_dispatch_id,
        p_order_id,
        v_caller_id,
        v_norm_status,
        p_notes
    )
    ON CONFLICT (dispatch_id, order_id) DO NOTHING
    RETURNING id INTO v_receipt_id;

    IF v_receipt_id IS NULL THEN
        -- Concurrently inserted by a competing request
        SELECT r.id INTO v_receipt_id
        FROM public.receipts r
        WHERE r.dispatch_id = p_dispatch_id AND r.order_id = p_order_id;

        RETURN pg_catalog.jsonb_build_object(
            'success', true,
            'receipt_id', v_receipt_id,
            'order_id', p_order_id,
            'status', 'delivered',
            'already_confirmed', true,
            'message', 'Receipt was concurrently confirmed'
        );
    END IF;

    -- Process received line items and enforce stock accounting invariant
    IF p_items IS NOT NULL AND pg_catalog.jsonb_array_length(p_items) > 0 THEN
        FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(p_items)
        LOOP
            v_prod_id := (v_item->>'product_id')::UUID;
            v_exp_qty := (v_item->>'quantity_expected')::NUMERIC;
            v_rec_qty := COALESCE((v_item->>'quantity_received')::NUMERIC, v_exp_qty);
            v_disc_note := v_item->>'discrepancy_note';
            v_short_qty := GREATEST(v_exp_qty - v_rec_qty, 0);

            -- If product_id was not explicitly in item JSON, resolve from order_items
            IF v_prod_id IS NULL THEN
                SELECT product_id INTO v_prod_id
                FROM public.order_items
                WHERE order_id = p_order_id
                LIMIT 1;
            END IF;

            IF v_rec_qty > v_exp_qty THEN
                RAISE EXCEPTION 'Received quantity (%) cannot exceed expected quantity (%) for product %',
                    v_rec_qty, v_exp_qty, v_prod_id;
            END IF;

            -- Record receipt item
            INSERT INTO public.receipt_items (
                receipt_id,
                product_id,
                quantity_expected,
                quantity_received,
                quantity_short,
                discrepancy_note
            ) VALUES (
                v_receipt_id,
                v_prod_id,
                v_exp_qty,
                v_rec_qty,
                v_short_qty,
                v_disc_note
            );

            -- STOCK INVARIANT ENFORCEMENT:
            -- If factory stock is 100 and a dispatch reserves 30, on-hand remains 100 and reserved becomes 30 (available = 70).
            -- When branch receives 28:
            -- 1. Factory on-hand becomes 72 (quantity = quantity - 28)
            -- 2. Factory reserved becomes 2 (reserved_quantity = reserved_quantity - 28)
            -- 3. The remaining 2 remains explicitly reserved until authorized reconciliation!
            -- 4. Branch receives 28 (branch on-hand = branch on-hand + 28)
            IF v_prod_id IS NOT NULL AND v_rec_qty > 0 THEN
                -- Row-lock factory inventory to verify non-negativity
                SELECT quantity, reserved_quantity INTO v_fac_on_hand, v_fac_reserved
                FROM public.inventory
                WHERE product_id = v_prod_id AND branch_id IS NULL
                FOR UPDATE;

                IF v_fac_on_hand IS NULL OR v_fac_on_hand < v_rec_qty THEN
                    RAISE EXCEPTION 'Factory inventory deficit: on-hand % is less than confirmed received quantity % for product %',
                        COALESCE(v_fac_on_hand, 0), v_rec_qty, v_prod_id;
                END IF;

                -- 1 & 2: Deduct received amount from factory on-hand AND from factory reserved
                UPDATE public.inventory
                SET quantity = quantity - v_rec_qty,
                    reserved_quantity = GREATEST(reserved_quantity - v_rec_qty, 0),
                    updated_at = pg_catalog.now()
                WHERE product_id = v_prod_id AND branch_id IS NULL;

                -- Record factory movement
                INSERT INTO public.inventory_movements (
                    branch_id, product_id, movement_type, quantity_delta, reference_type, reference_id, notes, created_by
                ) VALUES (
                    NULL, v_prod_id, 'dispatch_out'::public.inventory_movement_type, -v_rec_qty, 'receipt', v_receipt_id, 'Stock confirmed delivered to branch', v_caller_id
                );

                -- 4: Credit branch inventory with received amount
                INSERT INTO public.inventory (product_id, branch_id, quantity, reserved_quantity)
                VALUES (v_prod_id, v_order.branch_id, v_rec_qty, 0)
                ON CONFLICT (product_id, branch_id) DO UPDATE SET
                    quantity = public.inventory.quantity + EXCLUDED.quantity,
                    updated_at = pg_catalog.now();

                -- Record branch movement
                INSERT INTO public.inventory_movements (
                    branch_id, product_id, movement_type, quantity_delta, reference_type, reference_id, notes, created_by
                ) VALUES (
                    v_order.branch_id, v_prod_id, 'receipt_in'::public.inventory_movement_type, v_rec_qty, 'receipt', v_receipt_id, 'Goods received from dispatch', v_caller_id
                );
            END IF;
        END LOOP;
    END IF;

    -- Update order status to delivered
    UPDATE public.orders
    SET status = 'delivered'::public.order_status,
        updated_at = pg_catalog.now()
    WHERE id = p_order_id;

    -- Update stop record in dispatch_orders
    UPDATE public.dispatch_orders
    SET status = 'delivered'
    WHERE dispatch_id = p_dispatch_id AND order_id = p_order_id;

    -- Audit Log
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (
        v_caller_id,
        'RECEIPT_CONFIRMED',
        'receipt',
        v_receipt_id::TEXT,
        pg_catalog.jsonb_build_object(
            'order_id', p_order_id,
            'dispatch_id', p_dispatch_id,
            'receipt_status', v_norm_status,
            'notes', p_notes
        )
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'receipt_id', v_receipt_id,
        'order_id', p_order_id,
        'status', 'delivered'
    );
END;
$$;

-- 9. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enquiries ENABLE ROW LEVEL SECURITY;

-- Branches Policies
DROP POLICY IF EXISTS "branches_read_policy" ON public.branches;
CREATE POLICY "branches_read_policy" ON public.branches
    FOR SELECT TO anon, authenticated
    USING (is_active = true OR public.is_super_admin());

DROP POLICY IF EXISTS "branches_admin_manage" ON public.branches;
CREATE POLICY "branches_admin_manage" ON public.branches
    FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- Profiles Policies
DROP POLICY IF EXISTS "profiles_select_self_or_admin" ON public.profiles;
CREATE POLICY "profiles_select_self_or_admin" ON public.profiles
    FOR SELECT TO authenticated
    USING (id = (SELECT auth.uid()) OR public.is_super_admin());

DROP POLICY IF EXISTS "profiles_admin_manage" ON public.profiles;
CREATE POLICY "profiles_admin_manage" ON public.profiles
    FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- Products Policies
DROP POLICY IF EXISTS "products_select_policy" ON public.products;
CREATE POLICY "products_select_policy" ON public.products
    FOR SELECT TO anon, authenticated
    USING (is_active = true OR public.is_super_admin());

DROP POLICY IF EXISTS "products_admin_manage" ON public.products;
CREATE POLICY "products_admin_manage" ON public.products
    FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- Inventory Policies
DROP POLICY IF EXISTS "inventory_select_policy" ON public.inventory;
CREATE POLICY "inventory_select_policy" ON public.inventory
    FOR SELECT TO authenticated
    USING (
        public.is_super_admin() OR
        branch_id IS NULL OR
        branch_id = public.current_branch_id()
    );

DROP POLICY IF EXISTS "inventory_admin_manage" ON public.inventory;
CREATE POLICY "inventory_admin_manage" ON public.inventory
    FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- Inventory Movements Policies
DROP POLICY IF EXISTS "inventory_movements_select" ON public.inventory_movements;
CREATE POLICY "inventory_movements_select" ON public.inventory_movements
    FOR SELECT TO authenticated
    USING (
        public.is_super_admin() OR
        branch_id = public.current_branch_id()
    );

-- Orders Policies
DROP POLICY IF EXISTS "orders_select_policy" ON public.orders;
CREATE POLICY "orders_select_policy" ON public.orders
    FOR SELECT TO authenticated
    USING (
        public.is_super_admin() OR
        branch_id = public.current_branch_id() OR
        created_by = (SELECT auth.uid()) OR
        EXISTS (
            SELECT 1 FROM public.dispatches d
            WHERE d.delivery_staff_id = (SELECT auth.uid())
              AND (d.order_id = orders.id OR EXISTS (
                  SELECT 1 FROM public.dispatch_orders do_stop
                  WHERE do_stop.dispatch_id = d.id AND do_stop.order_id = orders.id
              ))
        )
    );

DROP POLICY IF EXISTS "orders_insert_policy" ON public.orders;
CREATE POLICY "orders_insert_policy" ON public.orders
    FOR INSERT TO authenticated
    WITH CHECK (
        public.is_super_admin() OR
        (branch_id = public.current_branch_id() AND created_by = (SELECT auth.uid()))
    );

DROP POLICY IF EXISTS "orders_update_policy" ON public.orders;
CREATE POLICY "orders_update_policy" ON public.orders
    FOR UPDATE TO authenticated
    USING (
        public.is_super_admin() OR
        (branch_id = public.current_branch_id() AND status IN ('draft', 'submitted'))
    )
    WITH CHECK (
        public.is_super_admin() OR
        (branch_id = public.current_branch_id() AND status IN ('draft', 'submitted', 'cancelled'))
    );

-- Order Items Policies
DROP POLICY IF EXISTS "order_items_select" ON public.order_items;
CREATE POLICY "order_items_select" ON public.order_items
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = order_items.order_id
              AND (public.is_super_admin() OR o.branch_id = public.current_branch_id() OR o.created_by = (SELECT auth.uid()))
        )
    );

DROP POLICY IF EXISTS "order_items_insert" ON public.order_items;
CREATE POLICY "order_items_insert" ON public.order_items
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = order_items.order_id
              AND (public.is_super_admin() OR (o.branch_id = public.current_branch_id() AND o.status IN ('draft', 'submitted')))
        )
    );

DROP POLICY IF EXISTS "order_items_update" ON public.order_items;
CREATE POLICY "order_items_update" ON public.order_items
    FOR UPDATE TO authenticated
    USING (
        public.is_super_admin() OR
        EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = order_items.order_id
              AND o.branch_id = public.current_branch_id()
              AND o.status IN ('draft', 'submitted')
        )
    );

-- Dispatches Policies
DROP POLICY IF EXISTS "dispatches_select" ON public.dispatches;
CREATE POLICY "dispatches_select" ON public.dispatches
    FOR SELECT TO authenticated
    USING (public.is_super_admin() OR public.can_access_dispatch(id));

DROP POLICY IF EXISTS "dispatches_manage" ON public.dispatches;
CREATE POLICY "dispatches_manage" ON public.dispatches
    FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- Dispatch Orders Policies
DROP POLICY IF EXISTS "dispatch_orders_select" ON public.dispatch_orders;
CREATE POLICY "dispatch_orders_select" ON public.dispatch_orders
    FOR SELECT TO authenticated
    USING (
        public.is_super_admin() OR
        EXISTS (
            SELECT 1 FROM public.dispatches d
            WHERE d.id = dispatch_orders.dispatch_id AND d.delivery_staff_id = (SELECT auth.uid())
        ) OR
        EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = dispatch_orders.order_id AND o.branch_id = public.current_branch_id()
        )
    );

-- Dispatch Items Policies
DROP POLICY IF EXISTS "dispatch_items_select" ON public.dispatch_items;
CREATE POLICY "dispatch_items_select" ON public.dispatch_items
    FOR SELECT TO authenticated
    USING (
        public.is_super_admin() OR
        public.can_access_dispatch(dispatch_id)
    );

-- Receipts Policies
DROP POLICY IF EXISTS "receipts_select" ON public.receipts;
CREATE POLICY "receipts_select" ON public.receipts
    FOR SELECT TO authenticated
    USING (
        public.is_super_admin() OR
        confirmed_by = (SELECT auth.uid()) OR
        EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = receipts.order_id AND o.branch_id = public.current_branch_id()
        ) OR
        EXISTS (
            SELECT 1 FROM public.dispatch_orders do_stop
            JOIN public.orders o ON o.id = do_stop.order_id
            WHERE do_stop.dispatch_id = receipts.dispatch_id AND o.branch_id = public.current_branch_id()
        )
    );

-- Receipt Items Policies
DROP POLICY IF EXISTS "receipt_items_select" ON public.receipt_items;
CREATE POLICY "receipt_items_select" ON public.receipt_items
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.receipts r
            WHERE r.id = receipt_items.receipt_id AND (
                public.is_super_admin() OR
                r.confirmed_by = (SELECT auth.uid()) OR
                EXISTS (
                    SELECT 1 FROM public.orders o
                    WHERE o.id = r.order_id AND o.branch_id = public.current_branch_id()
                ) OR
                EXISTS (
                    SELECT 1 FROM public.dispatch_orders do_stop
                    JOIN public.orders o ON o.id = do_stop.order_id
                    WHERE do_stop.dispatch_id = r.dispatch_id AND o.branch_id = public.current_branch_id()
                )
            )
        )
    );

-- Audit Logs Policies
DROP POLICY IF EXISTS "audit_logs_select" ON public.audit_logs;
CREATE POLICY "audit_logs_select" ON public.audit_logs
    FOR SELECT TO authenticated
    USING (public.is_super_admin());

DROP POLICY IF EXISTS "audit_logs_insert" ON public.audit_logs;
CREATE POLICY "audit_logs_insert" ON public.audit_logs
    FOR INSERT TO authenticated
    WITH CHECK (actor_id = (SELECT auth.uid()) OR actor_id IS NULL);

-- Enquiries Policies
DROP POLICY IF EXISTS "enquiries_insert_public" ON public.enquiries;
CREATE POLICY "enquiries_insert_public" ON public.enquiries
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);

DROP POLICY IF EXISTS "enquiries_select_admin" ON public.enquiries;
CREATE POLICY "enquiries_select_admin" ON public.enquiries
    FOR SELECT TO authenticated
    USING (public.is_super_admin());

-- 10. GRANTS AND PRIVILEGES
GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT ON public.branches, public.products TO anon, authenticated;
GRANT INSERT ON public.enquiries TO anon, authenticated;

GRANT SELECT ON public.profiles, public.branches, public.products, public.inventory,
    public.inventory_movements, public.orders, public.order_items, public.dispatches,
    public.dispatch_orders, public.dispatch_items, public.receipts, public.receipt_items,
    public.audit_logs, public.enquiries TO authenticated;

GRANT INSERT, UPDATE ON public.orders, public.order_items TO authenticated;
GRANT INSERT ON public.audit_logs TO authenticated;

GRANT USAGE, SELECT ON SEQUENCE public.orders_order_number_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.dispatches_dispatch_number_seq TO authenticated;

-- Hardened function execution privileges (Strict Least Privilege)
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.current_app_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_branch_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_user_branch_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_dispatch(UUID) TO authenticated;

GRANT EXECUTE ON FUNCTION public.rpc_create_order(UUID, DATE, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_approve_order(UUID, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_create_dispatch(UUID[], UUID, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_update_delivery_stop(UUID, UUID, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_adjust_inventory(UUID, UUID, NUMERIC, TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_confirm_receipt(UUID, UUID, TEXT, TEXT, JSONB) TO authenticated;

-- 11. IDEMPOTENT CANONICAL SEED DATA

-- 11a. 17 Branches Across 5 Categories
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
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    address = EXCLUDED.address,
    locality = EXCLUDED.locality,
    district = EXCLUDED.district,
    contact_name = EXCLUDED.contact_name,
    contact_phone = EXCLUDED.contact_phone,
    is_active = EXCLUDED.is_active,
    updated_at = now();

-- 11b. 10 Catalogue Products
INSERT INTO public.products (sku, name, description, unit, selling_price, is_active, display_order)
VALUES
    ('SKU-STK-001', 'Sweet Strawberry', 'Sun-ripened strawberry indulgence with fresh fruit sweetness and Malabar cream', 'pack', 360.00, true, 1),
    ('SKU-STK-002', 'Creamy Guava & Mint', 'Exotic tropical pink guava pulp with herbal freshness and garden mint', 'pack', 360.00, true, 2),
    ('SKU-STK-003', 'Alphonso Mango', 'Pure Alphonso mango pulp blended into a luxurious golden ice bar', 'pack', 400.00, true, 3),
    ('SKU-STK-004', 'Tender Coconut', 'Malabar coastal coconut water and hand-scooped malai in velvety cream', 'pack', 380.00, true, 4),
    ('SKU-STK-005', 'Belgian Chocolate', 'Deep velvety 70% dark Belgian cocoa with roasted hazelnut and almond crunch', 'pack', 450.00, true, 5),
    ('SKU-STK-006', 'Fresh Watermelon', 'Cold-churned ruby red watermelon juice with artisanal chocolate micro-seeds', 'pack', 340.00, true, 6),
    ('SKU-STK-007', 'Zesty Kiwi', 'Bright emerald kiwi pulp with crunchy poppy seeds for balanced sweet-tart zing', 'pack', 380.00, true, 7),
    ('SKU-STK-008', 'Wild Blueberry', 'Antioxidant-rich wild forest blueberries swirled into silky artisanal cream', 'pack', 420.00, true, 8),
    ('SKU-STK-009', 'Sunshine Lemon', 'Mediterranean lemon aromatic citrus spark with candied peel ribboning', 'pack', 320.00, true, 9),
    ('SKU-STK-010', 'Royal Pomegranate', 'Ruby pomegranate arils pressed into an exquisitely layered sweet-tart treat', 'pack', 400.00, true, 10)
ON CONFLICT (sku) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    unit = EXCLUDED.unit,
    selling_price = EXCLUDED.selling_price,
    is_active = EXCLUDED.is_active,
    display_order = EXCLUDED.display_order,
    updated_at = now();

-- 11c. Initialize Factory Inventory Rows for all 10 Products
INSERT INTO public.inventory (product_id, branch_id, quantity, reserved_quantity)
SELECT id, NULL, 0, 0
FROM public.products
ON CONFLICT (product_id, branch_id) DO NOTHING;

-- 11d. Synchronize Sequence Positions with Existing Records
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

COMMIT;