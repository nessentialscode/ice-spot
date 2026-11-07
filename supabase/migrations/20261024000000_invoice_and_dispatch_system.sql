-- ==============================================================================
-- Icespot — Invoice Generation & Three-Column Dispatch System Migration
-- File: supabase/migrations/20261024000000_invoice_and_dispatch_system.sql
-- Target: icespot-dev Supabase project ONLY (Project Ref: punyeqlotfnvxhhugtud)
-- Description:
-- 1. Creates persistent 'invoices' and 'invoice_items' tables with unique sequence.
-- 2. Enforces idempotent 1-to-1 invoice generation per order (ON CONFLICT DO NOTHING / RETURN).
-- 3. Adds dispatch planning fields to 'dispatches' (vehicle_number, departure_time, loading_bay).
-- 4. Extends 'rpc_approve_order' to automatically trigger atomic invoice creation.
-- 5. Implements 'rpc_generate_invoice' and 'rpc_reorder_dispatch_stops'.
-- 6. Configures strict Row Level Security (RLS) isolating branch invoices to the owning branch.
-- ==============================================================================

BEGIN;

-- 1. INVOICE SEQUENCES & TABLES
CREATE SEQUENCE IF NOT EXISTS public.invoices_invoice_number_seq
    START WITH 10001
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number BIGINT NOT NULL DEFAULT nextval('public.invoices_invoice_number_seq') UNIQUE,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT UNIQUE,
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
    invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
    tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (tax_rate >= 0),
    tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (tax_amount >= 0),
    grand_total NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (grand_total >= 0),
    status TEXT NOT NULL DEFAULT 'provisional' CHECK (status IN ('provisional', 'issued', 'paid', 'cancelled')),
    notes TEXT DEFAULT 'PROVISIONAL COMMERCIAL INVOICE — GST not calculated; tax configuration pending confirmation.',
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_invoices_order ON public.invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_branch ON public.invoices(branch_id, invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);

CREATE TABLE IF NOT EXISTS public.invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    quantity NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
    line_total NUMERIC(12,2) NOT NULL CHECK (line_total >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_invoice_product UNIQUE (invoice_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON public.invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_product ON public.invoice_items(product_id);

-- 2. DISPATCH PLANNING FIELDS
ALTER TABLE public.dispatches
    ADD COLUMN IF NOT EXISTS vehicle_number TEXT,
    ADD COLUMN IF NOT EXISTS departure_time TEXT,
    ADD COLUMN IF NOT EXISTS loading_bay TEXT;

-- 3. ROW LEVEL SECURITY (RLS) POLICIES FOR INVOICES
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

-- 3a. Invoices Select: Super admin or branch admin for their assigned branch
DROP POLICY IF EXISTS "invoices_select" ON public.invoices;
CREATE POLICY "invoices_select" ON public.invoices
    FOR SELECT TO authenticated
    USING (
        public.is_super_admin() OR
        branch_id = public.current_branch_id()
    );

-- 3b. Invoices Admin Manage: Super admin only
DROP POLICY IF EXISTS "invoices_admin_manage" ON public.invoices;
CREATE POLICY "invoices_admin_manage" ON public.invoices
    FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- 3c. Invoice Items Select: Scope inherits from parent invoice
DROP POLICY IF EXISTS "invoice_items_select" ON public.invoice_items;
CREATE POLICY "invoice_items_select" ON public.invoice_items
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.invoices i
            WHERE i.id = invoice_items.invoice_id
              AND (public.is_super_admin() OR i.branch_id = public.current_branch_id())
        )
    );

-- 3d. Invoice Items Admin Manage: Super admin only
DROP POLICY IF EXISTS "invoice_items_admin_manage" ON public.invoice_items;
CREATE POLICY "invoice_items_admin_manage" ON public.invoice_items
    FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- 4. PRIVILEGE RESTRICTION (PoLP)
REVOKE ALL ON TABLE public.invoices, public.invoice_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.invoices, public.invoice_items TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.invoices_invoice_number_seq TO authenticated;

-- 5. TRANSACTIONAL RPC: rpc_generate_invoice (IDEMPOTENT)
CREATE OR REPLACE FUNCTION public.rpc_generate_invoice(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_order RECORD;
    v_existing_invoice RECORD;
    v_new_invoice_id UUID;
    v_new_invoice_number BIGINT;
    v_subtotal NUMERIC(12,2) := 0;
    v_tax_rate NUMERIC(5,2) := 0.00;
    v_tax_amount NUMERIC(12,2) := 0.00;
    v_grand_total NUMERIC(12,2) := 0;
    v_item RECORD;
    v_qty NUMERIC(12,2);
    v_price NUMERIC(10,2);
    v_line_total NUMERIC(12,2);
BEGIN
    -- Check caller authorization: Super Admin authority required
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Super Admin authority required to generate invoices';
    END IF;

    -- 1. Check if invoice already exists for this order (Idempotency Guard)
    SELECT id, invoice_number, subtotal, grand_total INTO v_existing_invoice
    FROM public.invoices
    WHERE order_id = p_order_id;

    IF v_existing_invoice.id IS NOT NULL THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', true,
            'invoice_id', v_existing_invoice.id,
            'invoice_number', v_existing_invoice.invoice_number,
            'already_exists', true,
            'subtotal', v_existing_invoice.subtotal,
            'grand_total', v_existing_invoice.grand_total,
            'message', 'Invoice already exists for this order'
        );
    END IF;

    -- 2. Fetch order details
    SELECT id, order_number, branch_id, status INTO v_order
    FROM public.orders
    WHERE id = p_order_id;

    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;

    IF v_order.status NOT IN ('approved', 'preparation', 'ready_for_dispatch', 'dispatched', 'partially_delivered', 'delivered') THEN
        RAISE EXCEPTION 'Cannot generate invoice for order in status %: must be approved', v_order.status;
    END IF;

    -- Validate that the order contains items with positive approved quantities
    IF NOT EXISTS (
        SELECT 1 FROM public.order_items
        WHERE order_id = p_order_id AND approved_quantity > 0
    ) THEN
        RAISE EXCEPTION 'Cannot generate invoice for order %: no positively approved items found', p_order_id;
    END IF;

    -- 3. Calculate subtotal strictly from positively approved order items and catalog prices
    FOR v_item IN
        SELECT
            oi.product_id,
            oi.approved_quantity AS quantity,
            COALESCE(oi.unit_price, p.selling_price, 0) AS unit_price
        FROM public.order_items oi
        JOIN public.products p ON p.id = oi.product_id
        WHERE oi.order_id = p_order_id
          AND oi.approved_quantity > 0
    LOOP
        v_qty := v_item.quantity;
        v_price := v_item.unit_price;
        v_line_total := pg_catalog.round(v_qty * v_price, 2);
        v_subtotal := v_subtotal + v_line_total;
    END LOOP;

    IF v_subtotal <= 0 THEN
        RAISE EXCEPTION 'Cannot generate invoice for order %: calculated subtotal must be positive', p_order_id;
    END IF;

    -- Tax calculation: 0.00 since tax is not configured in current business profile (Provisional document)
    v_tax_amount := pg_catalog.round(v_subtotal * (v_tax_rate / 100.0), 2);
    v_grand_total := v_subtotal + v_tax_amount;

    -- 4. Generate invoice number and insert header as provisional
    v_new_invoice_number := pg_catalog.nextval('public.invoices_invoice_number_seq'::pg_catalog.regclass);

    INSERT INTO public.invoices (
        invoice_number,
        order_id,
        branch_id,
        invoice_date,
        subtotal,
        tax_rate,
        tax_amount,
        grand_total,
        status,
        notes,
        created_by
    ) VALUES (
        v_new_invoice_number,
        p_order_id,
        v_order.branch_id,
        pg_catalog.current_date,
        v_subtotal,
        v_tax_rate,
        v_tax_amount,
        v_grand_total,
        'provisional',
        'PROVISIONAL COMMERCIAL INVOICE — GST not calculated; tax configuration pending confirmation.',
        v_caller_id
    )
    ON CONFLICT (order_id) DO NOTHING
    RETURNING id INTO v_new_invoice_id;

    IF v_new_invoice_id IS NULL THEN
        -- Handled concurrent insertion race condition
        SELECT id, invoice_number INTO v_existing_invoice
        FROM public.invoices
        WHERE order_id = p_order_id;

        RETURN pg_catalog.jsonb_build_object(
            'success', true,
            'invoice_id', v_existing_invoice.id,
            'invoice_number', v_existing_invoice.invoice_number,
            'already_exists', true,
            'message', 'Invoice was concurrently generated'
        );
    END IF;

    -- 5. Insert invoice line items strictly for positively approved items
    FOR v_item IN
        SELECT
            oi.product_id,
            oi.approved_quantity AS quantity,
            COALESCE(oi.unit_price, p.selling_price, 0) AS unit_price
        FROM public.order_items oi
        JOIN public.products p ON p.id = oi.product_id
        WHERE oi.order_id = p_order_id
          AND oi.approved_quantity > 0
    LOOP
        v_qty := v_item.quantity;
        v_price := v_item.unit_price;
        v_line_total := pg_catalog.round(v_qty * v_price, 2);

        INSERT INTO public.invoice_items (
            invoice_id,
            product_id,
            quantity,
            unit_price,
            line_total
        ) VALUES (
            v_new_invoice_id,
            v_item.product_id,
            v_qty,
            v_price,
            v_line_total
        );
    END LOOP;

    -- 6. Audit log
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (
        v_caller_id,
        'INVOICE_GENERATED',
        'invoice',
        v_new_invoice_id::TEXT,
        pg_catalog.jsonb_build_object(
            'invoice_number', v_new_invoice_number,
            'order_id', p_order_id,
            'order_number', v_order.order_number,
            'subtotal', v_subtotal,
            'grand_total', v_grand_total,
            'status', 'provisional'
        )
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'invoice_id', v_new_invoice_id,
        'invoice_number', v_new_invoice_number,
        'order_id', p_order_id,
        'subtotal', v_subtotal,
        'grand_total', v_grand_total,
        'status', 'provisional'
    );
END;
$$;

-- 6. EXTEND rpc_approve_order TO ATOMICALLY TRIGGER INVOICE GENERATION (HARDENED VALIDATION)
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
    v_product_id_raw TEXT;
    v_product_id UUID;
    v_app_qty_raw TEXT;
    v_app_qty NUMERIC;
    v_seen_product_ids UUID[] := ARRAY[]::UUID[];
    v_invoice_res JSONB;
BEGIN
    -- 1. Authorization check: Super Admin authority required
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Super Admin authority required to approve orders';
    END IF;

    -- 2. Input validation: order ID presence
    IF p_order_id IS NULL THEN
        RAISE EXCEPTION 'Order ID is required';
    END IF;

    -- 3. Lock order row and validate status transition
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

    -- 4. Update order status
    UPDATE public.orders
    SET status = 'approved'::public.order_status,
        approved_at = pg_catalog.now(),
        approved_by = v_caller_id,
        notes = COALESCE(p_notes, notes),
        updated_at = pg_catalog.now()
    WHERE id = p_order_id;

    -- 5. Validate and update approved quantities
    -- Accepted numeric format: non-negative integers or decimals with explicit leading and trailing digits (e.g. 5, 0.5, 12.75).
    -- Incomplete formats like .5 or 5. are intentionally rejected to maintain strict supply-chain data integrity.
    IF p_approved_items IS NOT NULL AND pg_catalog.jsonb_typeof(p_approved_items) != 'null' THEN
        -- Root must be a JSON array
        IF pg_catalog.jsonb_typeof(p_approved_items) != 'array' THEN
            RAISE EXCEPTION 'p_approved_items must be a JSON array';
        END IF;

        IF pg_catalog.jsonb_array_length(p_approved_items) > 0 THEN
            FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(p_approved_items)
            LOOP
                -- Validate each element is a JSON object
                IF pg_catalog.jsonb_typeof(v_item) != 'object' THEN
                    RAISE EXCEPTION 'Each item in p_approved_items must be a JSON object';
                END IF;

                -- Extract and validate product_id UUID
                v_product_id_raw := v_item->>'product_id';
                IF v_product_id_raw IS NULL OR pg_catalog.trim(v_product_id_raw) = '' THEN
                    RAISE EXCEPTION 'Missing or empty product_id in approval item';
                END IF;

                IF v_product_id_raw !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
                    RAISE EXCEPTION 'Invalid UUID format for product_id: %', v_product_id_raw;
                END IF;

                v_product_id := v_product_id_raw::UUID;

                -- Reject duplicate product IDs in the payload
                IF v_product_id = ANY(v_seen_product_ids) THEN
                    RAISE EXCEPTION 'Duplicate product ID % supplied in approval items payload', v_product_id;
                END IF;
                v_seen_product_ids := pg_catalog.array_append(v_seen_product_ids, v_product_id);

                -- Verify product belongs to this order
                IF NOT EXISTS (
                    SELECT 1 FROM public.order_items
                    WHERE order_id = p_order_id AND product_id = v_product_id
                ) THEN
                    RAISE EXCEPTION 'Product % does not belong to order %', v_product_id, p_order_id;
                END IF;

                -- Extract and validate approved_quantity
                v_app_qty_raw := v_item->>'approved_quantity';
                IF v_app_qty_raw IS NULL OR pg_catalog.trim(v_app_qty_raw) = '' THEN
                    RAISE EXCEPTION 'Missing or empty approved_quantity for product %', v_product_id;
                END IF;

                IF v_app_qty_raw !~ '^[0-9]+(\.[0-9]+)?$' THEN
                    RAISE EXCEPTION 'Approved quantity must be a valid non-negative number for product %: %', v_product_id, v_app_qty_raw;
                END IF;

                v_app_qty := v_app_qty_raw::NUMERIC;

                -- Update line item
                UPDATE public.order_items
                SET approved_quantity = v_app_qty,
                    updated_at = pg_catalog.now()
                WHERE order_id = p_order_id AND product_id = v_product_id;
            END LOOP;
        ELSE
            -- Empty array [] defaults to full requested quantities
            UPDATE public.order_items
            SET approved_quantity = requested_quantity,
                updated_at = pg_catalog.now()
            WHERE order_id = p_order_id;
        END IF;
    ELSE
        -- SQL NULL or JSON 'null' defaults to full requested quantities
        UPDATE public.order_items
        SET approved_quantity = requested_quantity,
            updated_at = pg_catalog.now()
        WHERE order_id = p_order_id;
    END IF;

    -- 6. Enforce that at least one item has approved_quantity > 0
    IF NOT EXISTS (
        SELECT 1 FROM public.order_items
        WHERE order_id = p_order_id AND approved_quantity > 0
    ) THEN
        RAISE EXCEPTION 'Cannot approve order %: at least one line item must have an approved quantity greater than zero. If all products are unavailable, reject the order instead.', p_order_id;
    END IF;

    -- 7. Generate persistent invoice atomically
    v_invoice_res := public.rpc_generate_invoice(p_order_id);

    -- 8. Audit Log
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (
        v_caller_id,
        'ORDER_APPROVED',
        'order',
        p_order_id::TEXT,
        pg_catalog.jsonb_build_object(
            'order_number', v_order.order_number,
            'notes', p_notes,
            'invoice_id', v_invoice_res->>'invoice_id',
            'invoice_number', v_invoice_res->>'invoice_number'
        )
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'order_number', v_order.order_number,
        'status', 'approved',
        'invoice_id', v_invoice_res->>'invoice_id',
        'invoice_number', v_invoice_res->>'invoice_number'
    );
END;
$$;

-- 7. EXTEND rpc_create_dispatch WITH VEHICLE, DEPARTURE, & BAY PERSISTENCE
-- Drop legacy 4-argument signature to prevent PostgreSQL function overloading and PostgREST signature conflicts
DROP FUNCTION IF EXISTS public.rpc_create_dispatch(UUID[], UUID, TEXT, JSONB);

CREATE OR REPLACE FUNCTION public.rpc_create_dispatch(
    p_order_ids UUID[],
    p_delivery_staff_id UUID,
    p_notes TEXT,
    p_items JSONB,
    p_vehicle_number TEXT DEFAULT NULL,
    p_departure_time TEXT DEFAULT NULL,
    p_loading_bay TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role public.app_role;
    v_dispatch_id UUID;
    v_dispatch_number BIGINT;
    v_order_id UUID;
    v_order RECORD;
    v_seq INT := 1;
    v_item RECORD;
    v_prod_id UUID;
    v_load_qty NUMERIC;
    v_fac_on_hand NUMERIC;
    v_fac_reserved NUMERIC;
    v_total_approved NUMERIC;
BEGIN
    SELECT role INTO v_caller_role
    FROM public.profiles
    WHERE id = v_caller_id AND is_active = true;

    IF NOT (public.is_super_admin() OR v_caller_role = 'delivery_staff'::public.app_role) THEN
        RAISE EXCEPTION 'Unauthorized: Super Admin or Delivery Staff authority required to create dispatches';
    END IF;

    IF p_order_ids IS NULL OR pg_catalog.array_length(p_order_ids, 1) = 0 THEN
        RAISE EXCEPTION 'At least one order must be attached to the dispatch trip';
    END IF;

    -- Validate no duplicate order IDs in request
    IF (SELECT COUNT(DISTINCT id) FROM unnest(p_order_ids) AS id) != pg_catalog.array_length(p_order_ids, 1) THEN
        RAISE EXCEPTION 'Duplicate order IDs detected in dispatch trip orders';
    END IF;

    -- Validate delivery staff if provided
    IF p_delivery_staff_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = p_delivery_staff_id AND is_active = true AND role IN ('delivery_staff', 'super_admin')
        ) THEN
            RAISE EXCEPTION 'Assigned delivery staff % does not exist or is not active', p_delivery_staff_id;
        END IF;
    ELSIF v_caller_role = 'delivery_staff'::public.app_role THEN
        p_delivery_staff_id := v_caller_id;
    END IF;

    -- Validate all orders are in approved/ready status, have positive approved quantities, and lock them
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

        IF EXISTS (
            SELECT 1 FROM public.dispatch_orders do_link
            JOIN public.dispatches d ON d.id = do_link.dispatch_id
            WHERE do_link.order_id = v_order_id
              AND d.status NOT IN ('completed'::public.dispatch_status, 'cancelled'::public.dispatch_status, 'failed'::public.dispatch_status)
        ) THEN
            RAISE EXCEPTION 'Order % (ORD-%) is already attached to an active dispatch trip', v_order_id, v_order.order_number;
        END IF;

        -- Validate that each order has at least one positively approved item
        IF NOT EXISTS (
            SELECT 1 FROM public.order_items
            WHERE order_id = v_order_id AND approved_quantity > 0
        ) THEN
            RAISE EXCEPTION 'Order % (ORD-%) has no approved products to dispatch', v_order_id, v_order.order_number;
        END IF;
    END LOOP;

    -- Automatic product aggregation: produces exactly one JSON array across all selected orders
    IF p_items IS NULL OR pg_catalog.jsonb_array_length(p_items) = 0 THEN
        SELECT pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'product_id', sub.product_id,
                'quantity_loaded', sub.total_approved
            )
        ) INTO p_items
        FROM (
            SELECT
                oi.product_id,
                SUM(oi.approved_quantity) AS total_approved
            FROM public.order_items oi
            WHERE oi.order_id = ANY(p_order_ids)
              AND oi.approved_quantity > 0
            GROUP BY oi.product_id
        ) sub;
    END IF;

    IF p_items IS NULL OR pg_catalog.jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Attached orders contain no approved products to dispatch';
    END IF;

    -- Reject duplicate product entries explicitly before stock reservation
    IF EXISTS (
        SELECT (elem->>'product_id')
        FROM pg_catalog.jsonb_array_elements(p_items) elem
        GROUP BY (elem->>'product_id')
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Duplicate product entries detected in dispatch items payload';
    END IF;

    -- Validate supplied product loads against positively approved order quantities
    FOR v_item IN
        SELECT (elem->>'product_id')::UUID AS product_id,
               (elem->>'quantity_loaded')::NUMERIC AS quantity_loaded
        FROM pg_catalog.jsonb_array_elements(p_items) elem
    LOOP
        IF v_item.product_id IS NULL THEN
            RAISE EXCEPTION 'product_id cannot be null in dispatch items payload';
        END IF;

        IF v_item.quantity_loaded IS NULL OR v_item.quantity_loaded <= 0 THEN
            RAISE EXCEPTION 'Loaded quantity must be greater than zero for product %', v_item.product_id;
        END IF;

        SELECT COALESCE(SUM(approved_quantity), 0) INTO v_total_approved
        FROM public.order_items
        WHERE order_id = ANY(p_order_ids)
          AND product_id = v_item.product_id
          AND approved_quantity > 0;

        IF v_total_approved = 0 THEN
            RAISE EXCEPTION 'Product % is not approved on any of the selected orders', v_item.product_id;
        END IF;

        IF v_item.quantity_loaded > v_total_approved THEN
            RAISE EXCEPTION 'Loaded quantity % for product % exceeds total approved quantity % across selected orders',
                v_item.quantity_loaded, v_item.product_id, v_total_approved;
        END IF;
    END LOOP;

    -- Reserve Factory Stock with deterministic row-locking (ordered by product_id to prevent deadlocks)
    FOR v_item IN
        SELECT (elem->>'product_id')::UUID AS product_id,
               (elem->>'quantity_loaded')::NUMERIC AS quantity_loaded
        FROM pg_catalog.jsonb_array_elements(p_items) elem
        ORDER BY (elem->>'product_id')::UUID
    LOOP
        v_prod_id := v_item.product_id;
        v_load_qty := v_item.quantity_loaded;

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

        IF (v_fac_on_hand - v_fac_reserved) < v_load_qty THEN
            RAISE EXCEPTION 'Insufficient factory inventory for product %: on-hand %, reserved %, available %, requested %',
                v_prod_id, v_fac_on_hand, v_fac_reserved, (v_fac_on_hand - v_fac_reserved), v_load_qty;
        END IF;

        UPDATE public.inventory
        SET reserved_quantity = reserved_quantity + v_load_qty,
            updated_at = pg_catalog.now()
        WHERE product_id = v_prod_id AND branch_id IS NULL;

        INSERT INTO public.inventory_movements (
            branch_id, product_id, movement_type, quantity_delta, reference_type, notes, created_by
        ) VALUES (
            NULL, v_prod_id, 'dispatch_out'::public.inventory_movement_type, -v_load_qty, 'dispatch', 'Stock reserved for dispatch trip', v_caller_id
        );
    END LOOP;

    v_dispatch_number := pg_catalog.nextval('public.dispatches_dispatch_number_seq'::pg_catalog.regclass);

    INSERT INTO public.dispatches (
        dispatch_number,
        order_id,
        delivery_staff_id,
        status,
        dispatched_at,
        delivery_notes,
        vehicle_number,
        departure_time,
        loading_bay,
        created_by
    ) VALUES (
        v_dispatch_number,
        p_order_ids[1],
        p_delivery_staff_id,
        'scheduled'::public.dispatch_status,
        NULL, -- Do NOT set dispatched_at on scheduled dispatch; set at departure
        p_notes,
        p_vehicle_number,
        p_departure_time,
        p_loading_bay,
        v_caller_id
    )
    RETURNING id INTO v_dispatch_id;

    -- Attach stops
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

        UPDATE public.orders
        SET status = 'ready_for_dispatch'::public.order_status,
            updated_at = pg_catalog.now()
        WHERE id = v_order_id;

        v_seq := v_seq + 1;
    END LOOP;

    -- Attach items
    FOR v_item IN SELECT (elem->>'product_id')::UUID AS product_id, (elem->>'quantity_loaded')::NUMERIC AS quantity_loaded FROM pg_catalog.jsonb_array_elements(p_items) elem
    LOOP
        INSERT INTO public.dispatch_items (
            dispatch_id,
            product_id,
            quantity_loaded,
            quantity_delivered,
            quantity_short
        ) VALUES (
            v_dispatch_id,
            v_item.product_id,
            v_item.quantity_loaded,
            0,
            0
        )
        ON CONFLICT (dispatch_id, product_id) DO UPDATE SET
            quantity_loaded = EXCLUDED.quantity_loaded,
            updated_at = pg_catalog.now();
    END LOOP;

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (
        v_caller_id,
        'DISPATCH_CREATED',
        'dispatch',
        v_dispatch_id::TEXT,
        pg_catalog.jsonb_build_object(
            'dispatch_number', v_dispatch_number,
            'delivery_staff_id', p_delivery_staff_id,
            'vehicle_number', p_vehicle_number,
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

-- 8. TRANSACTIONAL RPC: rpc_reorder_dispatch_stops
CREATE OR REPLACE FUNCTION public.rpc_reorder_dispatch_stops(
    p_dispatch_id UUID,
    p_stop_sequences JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_assigned_staff UUID;
    v_disp_status public.dispatch_status;
    v_dispatched_at TIMESTAMPTZ;
    v_existing_count INT;
    v_input_count INT;
    v_seq_count INT;
    v_min_seq INT;
    v_max_seq INT;
BEGIN
    SELECT delivery_staff_id, status, dispatched_at
    INTO v_assigned_staff, v_disp_status, v_dispatched_at
    FROM public.dispatches
    WHERE id = p_dispatch_id
    FOR UPDATE;

    IF v_disp_status IS NULL THEN
        RAISE EXCEPTION 'Dispatch trip % does not exist', p_dispatch_id;
    END IF;

    -- Concurrently lock stop rows to prevent race conditions
    PERFORM 1
    FROM public.dispatch_orders
    WHERE dispatch_id = p_dispatch_id
    FOR UPDATE;

    IF NOT (public.is_super_admin() OR (v_caller_id IS NOT NULL AND v_caller_id = v_assigned_staff)) THEN
        RAISE EXCEPTION 'Unauthorized: Only assigned delivery staff or Super Admin can reorder stops';
    END IF;

    -- Reject reordering once dispatch has departed or entered later status
    IF v_disp_status NOT IN ('scheduled', 'loading') OR v_dispatched_at IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot reorder stops once dispatch trip is % or has departed', v_disp_status;
    END IF;

    IF p_stop_sequences IS NULL OR pg_catalog.jsonb_array_length(p_stop_sequences) = 0 THEN
        RAISE EXCEPTION 'p_stop_sequences cannot be empty';
    END IF;

    SELECT COUNT(*) INTO v_existing_count
    FROM public.dispatch_orders
    WHERE dispatch_id = p_dispatch_id;

    -- Validate exact stop count
    IF pg_catalog.jsonb_array_length(p_stop_sequences) != v_existing_count THEN
        RAISE EXCEPTION 'Supplied stop count (%) does not match dispatch stop count (%)',
            pg_catalog.jsonb_array_length(p_stop_sequences), v_existing_count;
    END IF;

    -- Validate no duplicate orders in payload
    SELECT COUNT(DISTINCT (elem->>'order_id')::UUID) INTO v_input_count
    FROM pg_catalog.jsonb_array_elements(p_stop_sequences) elem;

    IF v_input_count != v_existing_count THEN
        RAISE EXCEPTION 'Duplicate order entries detected in stop reordering payload';
    END IF;

    -- Validate no foreign orders
    IF EXISTS (
        SELECT 1
        FROM pg_catalog.jsonb_array_elements(p_stop_sequences) elem
        WHERE NOT EXISTS (
            SELECT 1 FROM public.dispatch_orders do_stop
            WHERE do_stop.dispatch_id = p_dispatch_id
              AND do_stop.order_id = (elem->>'order_id')::UUID
        )
    ) THEN
        RAISE EXCEPTION 'Payload contains order IDs not attached to dispatch %', p_dispatch_id;
    END IF;

    -- Validate unique, contiguous positive sequences from 1 to N
    SELECT COUNT(DISTINCT (elem->>'sequence')::INT),
           MIN((elem->>'sequence')::INT),
           MAX((elem->>'sequence')::INT)
    INTO v_seq_count, v_min_seq, v_max_seq
    FROM pg_catalog.jsonb_array_elements(p_stop_sequences) elem;

    IF v_seq_count != v_existing_count OR v_min_seq != 1 OR v_max_seq != v_existing_count THEN
        RAISE EXCEPTION 'Stop sequence numbers must be unique, contiguous positive integers from 1 to %', v_existing_count;
    END IF;

    -- Two-phase positive update to avoid transient unique-constraint collisions while strictly preserving CHECK (sequence >= 1)
    -- Phase 1: Set temporary positive offset sequences (> 100000), strictly satisfying sequence >= 1 and disjoint from 1..N
    UPDATE public.dispatch_orders do_stop
    SET sequence = 100000 + ((elem->>'sequence')::INT)
    FROM pg_catalog.jsonb_array_elements(p_stop_sequences) elem
    WHERE do_stop.dispatch_id = p_dispatch_id
      AND do_stop.order_id = (elem->>'order_id')::UUID;

    -- Phase 2: Shift back to final target sequences (1..N), strictly satisfying sequence >= 1
    UPDATE public.dispatch_orders
    SET sequence = sequence - 100000
    WHERE dispatch_id = p_dispatch_id
      AND sequence > 100000;

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (
        v_caller_id,
        'DISPATCH_STOPS_REORDERED',
        'dispatch',
        p_dispatch_id::TEXT,
        pg_catalog.jsonb_build_object(
            'stop_count', v_existing_count,
            'stops', p_stop_sequences
        )
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'dispatch_id', p_dispatch_id,
        'message', 'Route stops reordered successfully'
    );
END;
$$;

-- 9. LEAST-PRIVILEGE RPC PERMISSIONS (PoLP)
REVOKE ALL ON FUNCTION public.rpc_generate_invoice(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_reorder_dispatch_stops(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_create_dispatch(UUID[], UUID, TEXT, JSONB, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_approve_order(UUID, JSONB, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.rpc_generate_invoice(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_reorder_dispatch_stops(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_create_dispatch(UUID[], UUID, TEXT, JSONB, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_approve_order(UUID, JSONB, TEXT) TO authenticated;

-- 10. POLP TABLE PRIVILEGES & SEQUENCE GRANTS
REVOKE ALL ON TABLE public.invoices FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.invoice_items FROM PUBLIC, anon, authenticated;

-- Grant selective SELECT to authenticated users (RLS filters rows)
GRANT SELECT ON TABLE public.invoices TO authenticated;
GRANT SELECT ON TABLE public.invoice_items TO authenticated;

-- Sequence privileges
REVOKE ALL ON SEQUENCE public.invoices_invoice_number_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.invoices_invoice_number_seq TO authenticated;

-- 11. NOTIFY POSTGREST SCHEMA CACHE RELOAD
NOTIFY pgrst, 'reload schema';

COMMIT;

