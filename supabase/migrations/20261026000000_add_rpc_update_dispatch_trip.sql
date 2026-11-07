-- ==============================================================================
-- Icespot — Forward Migration: Add Dispatch Trip Update RPC (Hardened)
-- File: supabase/migrations/20261026000000_add_rpc_update_dispatch_trip.sql
-- Target: icespot-dev Supabase project (Project Ref: punyeqlotfnvxhhugtud)
--
-- PURPOSE:
-- Implements public.rpc_update_dispatch_trip to provide a secure, transactional,
-- Principle of Least Privilege (PoLP) compliant mechanism for updating dispatch
-- trip headers (departure_time, delivery_notes, vehicle_number, status)
-- without granting broad direct table UPDATE privileges to authenticated users.
--
-- SECURITY & LIFECYCLE REVIEWS (PHASE 5B.1 & 5B.2):
-- 1. Receipt Confirmation Integrity (Issue 1): Rejects setting 'completed' unless every
--    attached route stop has an authoritative confirmed receipt in public.receipts:
--    (r.confirmed_by IS NOT NULL, r.receipt_status IN ('intact', 'discrepancy', 'confirmed'),
--    and r.receipt_status NOT IN ('pending', 'rejected')) and stop status = 'delivered'.
-- 2. Failed-Stop Policy (Issue 2): Rejects completion while any attached stops have
--    status = 'failed'. Prevents bypassing required factory stock reconciliation and leaves
--    no orphaned stock reservations.
-- 3. Transition Graph (Issue 3): Strictly enforces valid lifecycle transitions:
--    draft -> (scheduled, cancelled); scheduled -> (loading, in_transit, cancelled);
--    loading -> (in_transit, cancelled); in_transit -> (completed, failed, cancelled).
--    Terminal states (completed, cancelled, failed) reject all subsequent mutations.
-- 4. Delivery Isolation: Rejects setting 'delivered' or 'partially_delivered' on the trip
--    header because delivery is strictly verified at the stop level via rpc_confirm_receipt.
-- 5. Driver Isolation: Only assigned delivery staff or Super Admin can update the trip.
-- 6. Fleet Reassignment: Vehicle reassignment strictly requires Super Admin.
-- 7. Concurrency: Row-level lock FOR UPDATE on public.dispatches serializes concurrent requests.
-- 8. SECURITY DEFINER with pinned search_path = '' and fully qualified objects.
-- 9. Execution revoked from PUBLIC/anon; granted strictly to authenticated.
-- ==============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_update_dispatch_trip(
    p_dispatch_id UUID,
    p_vehicle_number TEXT DEFAULT NULL,
    p_departure_time TEXT DEFAULT NULL,
    p_status TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role public.app_role;
    v_caller_active BOOLEAN;
    v_is_super_admin BOOLEAN := false;
    v_dispatch RECORD;
    v_norm_status TEXT;
    v_target_status public.dispatch_status;
    v_new_vehicle TEXT := NULL;
    v_new_departure TEXT := NULL;
    v_new_notes TEXT := NULL;
    v_update_notes BOOLEAN := false;
    v_total_stops INT := 0;
    v_failed_stops INT := 0;
    v_unconfirmed_stops INT := 0;
BEGIN
    -- 1. Authenticated check
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Authentication required';
    END IF;

    -- 2. Verify caller role and active profile
    SELECT role, is_active INTO v_caller_role, v_caller_active
    FROM public.profiles
    WHERE id = v_caller_id;

    IF v_caller_role IS NULL OR NOT v_caller_active THEN
        RAISE EXCEPTION 'Unauthorized: Active user profile required';
    END IF;

    v_is_super_admin := public.is_super_admin();

    IF NOT (v_is_super_admin OR v_caller_role = 'delivery_staff'::public.app_role) THEN
        RAISE EXCEPTION 'Unauthorized: Delivery Staff or Super Admin authority required';
    END IF;

    -- 3. Lock target dispatch row FOR UPDATE to serialize concurrent mutations
    SELECT
        id,
        dispatch_number,
        delivery_staff_id,
        vehicle_number,
        departure_time,
        delivery_notes,
        status,
        dispatched_at,
        completed_at
    INTO v_dispatch
    FROM public.dispatches
    WHERE id = p_dispatch_id
    FOR UPDATE;

    IF v_dispatch.id IS NULL THEN
        RAISE EXCEPTION 'Dispatch % not found', p_dispatch_id;
    END IF;

    -- 4. Driver isolation: Only assigned delivery staff or Super Admin can update trip
    IF NOT (v_is_super_admin OR (v_dispatch.delivery_staff_id IS NOT NULL AND v_caller_id = v_dispatch.delivery_staff_id)) THEN
        RAISE EXCEPTION 'Unauthorized: Only assigned delivery staff or Super Admin can update dispatch trip';
    END IF;

    -- 5. Immutability: Completed, cancelled, or failed dispatches cannot be modified
    IF v_dispatch.status = 'completed'::public.dispatch_status THEN
        RAISE EXCEPTION 'Dispatch is already completed and cannot be modified';
    END IF;

    IF v_dispatch.status = 'cancelled'::public.dispatch_status THEN
        RAISE EXCEPTION 'Dispatch is cancelled and cannot be modified';
    END IF;

    IF v_dispatch.status = 'failed'::public.dispatch_status THEN
        RAISE EXCEPTION 'Dispatch has failed and cannot be modified';
    END IF;

    -- 6. Fleet vehicle reassignment: Strictly requires Super Admin
    IF p_vehicle_number IS NOT NULL AND pg_catalog.length(pg_catalog.btrim(p_vehicle_number)) > 0 THEN
        IF v_dispatch.vehicle_number IS NULL OR pg_catalog.btrim(p_vehicle_number) != v_dispatch.vehicle_number THEN
            IF NOT v_is_super_admin THEN
                RAISE EXCEPTION 'Unauthorized: Fleet vehicle reassignment requires Super Admin authority';
            END IF;
            v_new_vehicle := pg_catalog.btrim(p_vehicle_number);
        ELSE
            v_new_vehicle := v_dispatch.vehicle_number;
        END IF;
    END IF;

    -- 7. Departure time handling (preserves if omitted/NULL; updates if non-empty string)
    IF p_departure_time IS NOT NULL AND pg_catalog.length(pg_catalog.btrim(p_departure_time)) > 0 THEN
        v_new_departure := pg_catalog.btrim(p_departure_time);
    END IF;

    -- 8. Notes handling (preserves if omitted/NULL; clears if empty string; updates if string)
    IF p_notes IS NOT NULL THEN
        v_new_notes := pg_catalog.btrim(p_notes);
        v_update_notes := true;
    END IF;

    -- 9. Status validation & lifecycle transition rules
    IF p_status IS NOT NULL AND pg_catalog.length(pg_catalog.btrim(p_status)) > 0 THEN
        v_norm_status := pg_catalog.lower(pg_catalog.replace(pg_catalog.btrim(p_status), '-', '_'));

        -- Disallow direct setting of stop-level delivery states on trip header
        IF v_norm_status IN ('delivered', 'partially_delivered') THEN
            RAISE EXCEPTION 'Cannot set trip status to %: Stop delivery and receipt confirmation must occur via rpc_confirm_receipt', v_norm_status;
        END IF;

        IF v_norm_status NOT IN ('draft', 'scheduled', 'loading', 'in_transit', 'completed', 'failed', 'cancelled') THEN
            RAISE EXCEPTION 'Invalid dispatch trip status: %', p_status;
        END IF;

        -- Lifecycle Transition Rules:
        -- Rule 9a: Enforce forward dispatch progression and prevent unauthorized jumps or backward reverts
        IF v_dispatch.status = 'draft'::public.dispatch_status AND v_norm_status NOT IN ('draft', 'scheduled', 'cancelled') THEN
            RAISE EXCEPTION 'Invalid status transition: Cannot transition dispatch from draft directly to %', v_norm_status;
        END IF;

        IF v_dispatch.status = 'scheduled'::public.dispatch_status THEN
            IF v_norm_status = 'draft' THEN
                RAISE EXCEPTION 'Invalid status transition: Cannot revert dispatch from scheduled back to draft';
            ELSIF v_norm_status NOT IN ('scheduled', 'loading', 'in_transit', 'cancelled') THEN
                RAISE EXCEPTION 'Invalid status transition: Cannot transition dispatch from scheduled directly to %', v_norm_status;
            END IF;
        END IF;

        IF v_dispatch.status = 'loading'::public.dispatch_status THEN
            IF v_norm_status IN ('draft', 'scheduled') THEN
                RAISE EXCEPTION 'Invalid status transition: Cannot revert dispatch from loading back to %', v_norm_status;
            ELSIF v_norm_status NOT IN ('loading', 'in_transit', 'cancelled') THEN
                RAISE EXCEPTION 'Invalid status transition: Cannot transition dispatch from loading directly to %', v_norm_status;
            END IF;
        END IF;

        IF v_dispatch.status = 'in_transit'::public.dispatch_status THEN
            IF v_norm_status IN ('draft', 'scheduled', 'loading') THEN
                RAISE EXCEPTION 'Invalid status transition: Cannot revert dispatch in status in_transit back to %', v_norm_status;
            END IF;
        END IF;

        -- Rule 9b: Only Super Admin can cancel a dispatch trip
        IF v_norm_status = 'cancelled' AND NOT v_is_super_admin THEN
            RAISE EXCEPTION 'Unauthorized: Only Super Admin can cancel a dispatch trip';
        END IF;

        -- Rule 9c (COMPLETION INTEGRITY): Cannot mark completed unless in_transit AND all attached stops have confirmed receipts
        IF v_norm_status = 'completed' THEN
            IF v_dispatch.status != 'in_transit'::public.dispatch_status THEN
                RAISE EXCEPTION 'Invalid status transition: Cannot complete dispatch from status % (must be in_transit)', v_dispatch.status;
            END IF;

            SELECT pg_catalog.count(*) INTO v_total_stops
            FROM public.dispatch_orders
            WHERE dispatch_id = p_dispatch_id;

            IF v_total_stops = 0 THEN
                RAISE EXCEPTION 'Cannot complete dispatch %: No route stops are attached to this dispatch trip', p_dispatch_id;
            END IF;

            -- Reject completion if any attached stops have failed (requires explicit resolution & stock reconciliation)
            SELECT pg_catalog.count(*) INTO v_failed_stops
            FROM public.dispatch_orders do_stop
            WHERE do_stop.dispatch_id = p_dispatch_id
              AND do_stop.status = 'failed';

            IF v_failed_stops > 0 THEN
                RAISE EXCEPTION 'Cannot complete dispatch %: % stop(s) have failed. Failed stops must be resolved and reconciled before completion',
                    p_dispatch_id, v_failed_stops;
            END IF;

            -- Verify authoritative receipt confirmation status for all stops
            SELECT pg_catalog.count(*) INTO v_unconfirmed_stops
            FROM public.dispatch_orders do_stop
            WHERE do_stop.dispatch_id = p_dispatch_id
              AND (
                  do_stop.status != 'delivered'
                  OR NOT EXISTS (
                      SELECT 1 FROM public.receipts r
                      WHERE r.dispatch_id = p_dispatch_id
                        AND r.order_id = do_stop.order_id
                        AND r.confirmed_by IS NOT NULL
                        AND r.receipt_status IN ('intact'::public.receipt_status, 'discrepancy'::public.receipt_status, 'confirmed'::public.receipt_status)
                        AND r.receipt_status NOT IN ('pending'::public.receipt_status, 'rejected'::public.receipt_status)
                  )
              );

            IF v_unconfirmed_stops > 0 THEN
                RAISE EXCEPTION 'Cannot complete dispatch %: % stop(s) have not completed receipt confirmation and inventory reconciliation',
                    p_dispatch_id, v_unconfirmed_stops;
            END IF;
        END IF;

        v_target_status := v_norm_status::public.dispatch_status;
    END IF;

    -- 10. Execute transactional update
    UPDATE public.dispatches
    SET vehicle_number = COALESCE(v_new_vehicle, vehicle_number),
        departure_time = COALESCE(v_new_departure, departure_time),
        delivery_notes = CASE WHEN v_update_notes THEN NULLIF(v_new_notes, '') ELSE delivery_notes END,
        status = COALESCE(v_target_status, status),
        dispatched_at = CASE
            WHEN v_target_status = 'in_transit'::public.dispatch_status AND dispatched_at IS NULL THEN pg_catalog.now()
            ELSE dispatched_at
        END,
        completed_at = CASE
            WHEN v_target_status = 'completed'::public.dispatch_status AND completed_at IS NULL THEN pg_catalog.now()
            ELSE completed_at
        END,
        updated_at = pg_catalog.now()
    WHERE id = p_dispatch_id;

    -- 11. Immutable Audit Log
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (
        v_caller_id,
        'UPDATE_DISPATCH_TRIP',
        'dispatch',
        p_dispatch_id::TEXT,
        pg_catalog.jsonb_build_object(
            'dispatch_number', v_dispatch.dispatch_number,
            'previous_status', v_dispatch.status,
            'updated_status', COALESCE(v_target_status, v_dispatch.status),
            'vehicle_number', COALESCE(v_new_vehicle, v_dispatch.vehicle_number),
            'departure_time', COALESCE(v_new_departure, v_dispatch.departure_time),
            'delivery_notes', CASE WHEN v_update_notes THEN NULLIF(v_new_notes, '') ELSE v_dispatch.delivery_notes END
        )
    );

    -- 12. Return structured JSON result
    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'dispatch_id', p_dispatch_id,
        'dispatch_number', v_dispatch.dispatch_number,
        'manifest_number', pg_catalog.concat('DSP-VRV-', v_dispatch.dispatch_number::TEXT),
        'status', (COALESCE(v_target_status, v_dispatch.status))::TEXT,
        'vehicle_number', COALESCE(v_new_vehicle, v_dispatch.vehicle_number),
        'departure_time', COALESCE(v_new_departure, v_dispatch.departure_time),
        'delivery_notes', CASE WHEN v_update_notes THEN NULLIF(v_new_notes, '') ELSE v_dispatch.delivery_notes END,
        'updated_at', pg_catalog.now()
    );
END;
$$;

-- Revoke all execution permissions from PUBLIC and anon
REVOKE ALL ON FUNCTION public.rpc_update_dispatch_trip(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;

-- Grant execution strictly to authenticated role
GRANT EXECUTE ON FUNCTION public.rpc_update_dispatch_trip(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

COMMIT;
