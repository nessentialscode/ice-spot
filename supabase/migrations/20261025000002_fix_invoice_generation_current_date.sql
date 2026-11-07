-- ==============================================================================
-- Icespot — Forward Migration: Fix Invoice Generation CURRENT_DATE Defect
-- File: supabase/migrations/20261025000002_fix_invoice_generation_current_date.sql
-- Target: icespot-dev Supabase project (Project Ref: punyeqlotfnvxhhugtud)
--
-- ROOT CAUSE & DEFECT DESCRIPTION:
-- --------------------------------
-- In supabase/migrations/20261024000000_invoice_and_dispatch_system.sql (line 216),
-- public.rpc_generate_invoice contained:
--     INSERT INTO public.invoices (..., invoice_date, ...)
--     VALUES (..., pg_catalog.current_date, ...)
--
-- In PostgreSQL, CURRENT_DATE is standard SQL syntax (a reserved keyword / special expression),
-- not a regular schema-qualified function. When prefixed as `pg_catalog.current_date`
-- without function parentheses, PostgreSQL's query parser interprets `pg_catalog` as a
-- relation (table/alias) name in the query's FROM clause. Because no such relation exists
-- in the INSERT statement, PostgreSQL raises at runtime:
--     ERROR: missing FROM-clause entry for table "pg_catalog"
--
-- This caused invoice generation to abort within public.rpc_approve_order(), rolling back
-- order approvals and causing downstream dispatch trips to reject unapproved orders.
--
-- REMEDIATION:
-- ------------
-- Replaces `pg_catalog.current_date` with the standard SQL expression `CURRENT_DATE`.
-- Preserves all other logic, return types, language, search_path, permissions,
-- and transactional integrity of public.rpc_generate_invoice.
-- ==============================================================================

BEGIN;

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
        CURRENT_DATE,
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

COMMENT ON FUNCTION public.rpc_generate_invoice(UUID) IS
    'Idempotent transactional invoice generator with valid CURRENT_DATE expression and Super Admin authorization.';

-- Establish postgres as function owner
ALTER FUNCTION public.rpc_generate_invoice(UUID) OWNER TO postgres;

-- Least-Privilege Permissions (PoLP)
REVOKE ALL ON FUNCTION public.rpc_generate_invoice(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_generate_invoice(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_generate_invoice(UUID) TO authenticated;

-- Notify PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';

COMMIT;
