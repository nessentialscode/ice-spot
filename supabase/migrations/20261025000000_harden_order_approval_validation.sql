-- ==============================================================================
-- Icespot — Forward Migration: Order Approval RPC Validation Hardening
-- File: supabase/migrations/20261025000000_harden_order_approval_validation.sql
-- Target: icespot-dev Supabase project (Project Ref: punyeqlotfnvxhhugtud)
--
-- PURPOSE:
-- Forward-only patch to harden public.rpc_approve_order against:
--  1. Unknown product IDs (verifies order item membership)
--  2. Duplicate product IDs in payload array
--  3. Malformed payload structures (non-array root, non-object elements)
--  4. Invalid UUID formats
--  5. Malformed or negative approved quantities (accepts non-negative integers/decimals;
--     intentionally rejects incomplete formats like .5 and 5.)
--
-- TECHNICAL & ARCHITECTURAL REVIEW NOTES:
-- ---------------------------------------
-- Null Representation Semantics in PostgreSQL & PostgREST:
--  - SQL NULL: Parameter is unassigned or passed as SQL NULL. Handled via `p_approved_items IS NULL`.
--    Triggers full-order default approval (setting approved_quantity = requested_quantity).
--  - JSONB null ('null'::jsonb): A valid JSONB value representing the JSON literal `null`.
--    `p_approved_items IS NOT NULL` is TRUE, but `jsonb_typeof(p_approved_items)` equals 'null'.
--    Triggers full-order default approval (setting approved_quantity = requested_quantity).
--  - Text String "null" ('"null"'::jsonb): A JSON string literal containing the characters "null".
--    `jsonb_typeof` equals 'string'. Since it is neither null nor an array, it is correctly and
--    strictly rejected ('p_approved_items must be a JSON array'). In test mocks, callers must
--    distinguish true null from the string literal "null".
--
-- COMPATIBILITY & INVARIANTS:
--  - Signature: public.rpc_approve_order(UUID, JSONB, TEXT) -> JSONB (Exact match)
--  - Security: SECURITY DEFINER with SET search_path = '' (Exact match)
--  - Concurrency: Row-level lock `FOR UPDATE` on public.orders preserved.
--  - Downstream: Atomically triggers public.rpc_generate_invoice(p_order_id) and writes audit log.
--  - Permissions: PoLP enforced (revoked from PUBLIC, anon; granted to authenticated).
-- ==============================================================================

BEGIN;

-- 1. HARDENED ORDER APPROVAL RPC
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
                IF v_product_id_raw IS NULL OR pg_catalog.btrim(v_product_id_raw) = '' THEN
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
                IF v_app_qty_raw IS NULL OR pg_catalog.btrim(v_app_qty_raw) = '' THEN
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

-- 2. LEAST-PRIVILEGE PERMISSIONS (PoLP)
REVOKE ALL ON FUNCTION public.rpc_approve_order(UUID, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_approve_order(UUID, JSONB, TEXT) TO authenticated;

-- 3. NOTIFY POSTGREST TO RELOAD SCHEMA CACHE
NOTIFY pgrst, 'reload schema';

COMMIT;
