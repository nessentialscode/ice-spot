# ICESPOT — PRE-DEPLOYMENT MIGRATION & SECURITY AUDIT REVIEW

**Document Identifier:** `docs/ICESPOT_PREDEPLOYMENT_REVIEW.md`  
**Execution Date:** October 22, 2026  
**Auditor:** Senior Full-Stack Engineer, PostgreSQL/Supabase Database Architect & Security Auditor  
**Scope:** Pre-deployment review of migration `supabase/migrations/20261022000004_recovery_schema_and_seed.sql`, verification script `supabase/verification_script.sql`, runbook `docs/ICESPOT_DEPLOYMENT_RUNBOOK.md`, report `docs/ICESPOT_RECOVERY_REPORT.md`, Server Actions (`orders.ts`, `dispatches.ts`, `inventory.ts`, `branches.ts`), `server-auth.ts`, and `database.types.ts`.  
**Target Database:** Supabase Remote Instance `gprtubirudzequpukzel` (`https://gprtubirudzequpukzel.supabase.co`)  
**Overall Migration Safety Verdict:** **SAFE TO APPLY (IDEMPOTENT & NON-DESTRUCTIVE)**

---

## 1. MANDATORY CHECKS EVALUATION MATRIX

| # | Mandatory Check Requirement | Audit Status | Primary Evidence / Reference |
| :---: | :--- | :---: | :--- |
| **1** | **Live Schema Compatibility:** Compare every SQL statement with actual live schema facts without assuming undocumented objects exist. | **PASS** | Strict adherence to the 13 live tables; obsolete fields (`profiles.email`, `branches.is_open`, `products.current_stock`) completely excluded. |
| **2** | **Junction Table Dependency Order:** `dispatch_orders` created before dependent functions, policies, and actions. | **PASS** | Table created at L181; foreign keys, unique constraint `(dispatch_id, order_id)`, indexes, RLS policies, and RPCs defined subsequently. |
| **3** | **Concurrency & Sequence Safety:** BigInt sequences safe, correctly owned, and synchronized with populated live data. | **PASS** | Sequences created with `CACHE 1`; dynamic sequence synchronization via `setval(..., GREATEST(MAX(...), base) + 1)` prevents key collisions. |
| **4** | **RPC Function Inspection:** Verify parameter types, return values, transaction boundaries, error handling, role checks, branch ownership, and grants. | **PASS** | All 6 RPCs inspect `auth.uid()`, enforce role/branch boundaries, execute atomically, revoke `PUBLIC` access, and grant strictly to `authenticated`. |
| **5** | **Privilege Escalation & Search Path:** Privileged functions use safe `search_path` and cannot be exploited via caller-supplied parameters. | **PASS** | All 8 database functions define `SECURITY DEFINER SET search_path = public, pg_temp`, preventing schema hijacking. |
| **6** | **RLS Policies & Table Grants:** No unrestricted authenticated writes, cross-branch access, or unauthorized status transitions. | **PASS** | Overly permissive `FOR ALL (true)` policies eliminated; replaced with role- and branch-scoped policies across all operational tables. |
| **7** | **Seed Idempotency & Profile Preservation:** Exact mappings for 17 branches, 5 categories, 10 products, 3 auth UUIDs. Preserves Super Admin. | **PASS** | `ON CONFLICT (id) DO NOTHING` on Super Admin; Ollur branch UUID dynamically bound; zero inventory seeded safely without expression syntax errors. |
| **8** | **Populated Schema Re-Run Safety:** Safe when executed multiple times against existing data; no errors or duplicates. | **PASS** | Guarded by `IF NOT EXISTS`, safe conflict handling, and dynamic sequence alignment; dropped weekly uniqueness constraint preserved. |
| **9** | **Action Payloads & UI Persistence:** Payload signatures match SQL parameters; UI success only reported upon confirmed database commit. | **PASS** | Parameter types match 1:1; `AdminContext.tsx` and admin views await Server Action responses before updating UI state or clearing inputs. |
| **10** | **Safe Non-Destructive Rollback:** No blind deletion of production data or dropping tables with `CASCADE`. | **PASS** | Runbook updated: destructive `DROP TABLE ... CASCADE` removed; replaced with safe RPC permission revocation and PITR snapshot recovery. |

---

## 2. DEFECT LOG & CORRECTIVE ACTIONS (RANKED BY SEVERITY)

During the adversarial pre-deployment audit, seven defects were identified across the migration, runbook, and verification scripts. All defects have been resolved with minimal, hardened code changes:

### Defect 1 — [CRITICAL] Overly Permissive RLS Policies on Dispatches and Receipts
- **Location:** [supabase/migrations/20261022000004_recovery_schema_and_seed.sql](file:///c:/Users/jasim/Web%20Project/Enterprises/Ice%20cream/Icespot/supabase/migrations/20261022000004_recovery_schema_and_seed.sql#L573-L706)
- **Vulnerability:** Initial policy drafts on `dispatch_orders`, `dispatch_items`, `receipts`, and `receipt_items` used `FOR ALL TO authenticated USING (true) WITH CHECK (true)`, which would allow any logged-in user to mutate or delete dispatches across all parlours.
- **Minimal Corrective Change:** Replaced with fine-grained policies restricting `INSERT`/`UPDATE` to `super_admin` or assigned `delivery_staff`, and restricting `receipts` to the `branch_admin` assigned to that specific destination parlour.

### Defect 2 — [HIGH] Dangerous Destructive Rollback Guidance in Runbook
- **Location:** [docs/ICESPOT_DEPLOYMENT_RUNBOOK.md](file:///c:/Users/jasim/Web%20Project/Enterprises/Ice%20cream/Icespot/docs/ICESPOT_DEPLOYMENT_RUNBOOK.md#L150-L186)
- **Vulnerability:** Section 7 recommended `DROP TABLE IF EXISTS public.dispatch_orders CASCADE;` during rollback, which would permanently delete all multi-order trip associations and drop dependent constraints in production.
- **Minimal Corrective Change:** Removed all `DROP TABLE ... CASCADE` commands. Replaced with safe application-level deployment revert, circuit-breaker RPC permission revocation (`REVOKE EXECUTE ... FROM authenticated`), and point-in-time snapshot recovery procedures.

### Defect 3 — [HIGH] Potential Sequence Collision with Populated Production Orders
- **Location:** [supabase/migrations/20261022000004_recovery_schema_and_seed.sql](file:///c:/Users/jasim/Web%20Project/Enterprises/Ice%20cream/Icespot/supabase/migrations/20261022000004_recovery_schema_and_seed.sql#L247-L259)
- **Vulnerability:** Starting `orders_order_number_seq` statically at `10001` would throw duplicate key violation errors if the live database already contained orders numbered >= 10001.
- **Minimal Corrective Change:** Added a dynamic synchronization block:
  ```sql
  SELECT COALESCE(MAX(order_number), 10000) INTO v_max_order FROM public.orders;
  PERFORM setval('public.orders_order_number_seq', GREATEST(v_max_order, 10000) + 1, false);
  ```

### Defect 4 — [MEDIUM] PostgreSQL Expression Syntax Error in Inventory Upsert
- **Location:** [supabase/migrations/20261022000004_recovery_schema_and_seed.sql](file:///c:/Users/jasim/Web%20Project/Enterprises/Ice%20cream/Icespot/supabase/migrations/20261022000004_recovery_schema_and_seed.sql#L365-L373)
- **Vulnerability:** PostgreSQL syntax forbids arbitrary expressions in `ON CONFLICT (product_id, COALESCE(branch_id, ...))` without a matching functional unique index, causing runtime syntax errors during migration application.
- **Minimal Corrective Change:** Converted to a clean, non-conflicting conditional subquery:
  ```sql
  INSERT INTO public.inventory (product_id, branch_id, quantity)
  SELECT p.id, NULL, 0 FROM public.products p
  WHERE NOT EXISTS (
      SELECT 1 FROM public.inventory i WHERE i.product_id = p.id AND i.branch_id IS NULL
  );
  ```

### Defect 5 — [MEDIUM] Mixed-Type Expression in RPC Order Status Evaluation
- **Location:** [supabase/migrations/20261022000004_recovery_schema_and_seed.sql](file:///c:/Users/jasim/Web%20Project/Enterprises/Ice%20cream/Icespot/supabase/migrations/20261022000004_recovery_schema_and_seed.sql#L1144-L1154)
- **Vulnerability:** A `CASE WHEN p_status = 'delivered' THEN 'delivered' ELSE status END` expression inside `rpc_update_delivery_stop` risked PostgreSQL type-coercion exceptions when `status` is evaluated against custom enum or text columns.
- **Minimal Corrective Change:** Replaced with explicit procedural `IF ... ELSIF ... END IF;` blocks targeting only valid status transitions.

### Defect 6 — [LOW] Overwrite Risk on Existing Super Admin Profile
- **Location:** [supabase/migrations/20261022000004_recovery_schema_and_seed.sql](file:///c:/Users/jasim/Web%20Project/Enterprises/Ice%20cream/Icespot/supabase/migrations/20261022000004_recovery_schema_and_seed.sql#L344-L348)
- **Vulnerability:** Using `ON CONFLICT (id) DO UPDATE` risked overwriting existing metadata, full name, or custom flags on the production Super Admin record.
- **Minimal Corrective Change:** Changed to strict `ON CONFLICT (id) DO NOTHING;` for the Super Admin UUID (`2236f15a-bba8-48ba-bd23-764380fb7cba`).

### Defect 7 — [LOW] Verification Script Missing RLS Enforcement Check
- **Location:** [supabase/verification_script.sql](file:///c:/Users/jasim/Web%20Project/Enterprises/Ice%20cream/Icespot/supabase/verification_script.sql#L107-L119)
- **Vulnerability:** The verification script verified table existence, counts, and profiles, but did not assert that Row Level Security was actively enabled on all 13 tables.
- **Minimal Corrective Change:** Added Check 9 in `verification_script.sql` querying `pg_tables.rowsecurity = false` for public tables and raising a failure notice if any table lacks RLS.

---

## 3. LIVE SCHEMA COMPATIBILITY & SAFETY VERDICT

### Safety Verdict: **SAFE TO APPLY**
The recovery migration is **fully idempotent, strictly additive, and safe** to apply to the populated production Supabase instance `gprtubirudzequpukzel`.

1. **Non-Destructive Guarantee:** Zero `DROP TABLE`, `DROP COLUMN`, or `TRUNCATE` operations are present.
2. **Backward Compatibility:** Existing operational columns (including legacy `dispatches.order_id`) are preserved, ensuring existing queries continue functioning.
3. **Weekly Constraint Alignment:** The migration respects that the legacy unique weekly constraint (`orders_branch_id_week_start_key`) was dropped, accommodating multiple replenishment orders per week.
4. **Idempotency Guarantee:** Can be run repeatedly without duplicating rows or resetting operational data.

---

## 4. REMAINING MANUAL STEPS BEFORE DEPLOYMENT

The local code and migrations are fully aligned, verified, and compiled. In accordance with execution restrictions, the following manual steps must be carried out in the production environment:

1. **Execute Pre-Deployment Backup:**
   - Log into [Supabase Dashboard for project gprtubirudzequpukzel](https://supabase.com/dashboard/project/gprtubirudzequpukzel).
   - Navigate to **Settings** → **Database** → **Backups** and ensure an automated snapshot exists, or run a manual `pg_dump` export per [docs/ICESPOT_DEPLOYMENT_RUNBOOK.md](file:///c:/Users/jasim/Web%20Project/Enterprises/Ice%20cream/Icespot/docs/ICESPOT_DEPLOYMENT_RUNBOOK.md#L26-L36).
2. **Apply Migration SQL:**
   - Open the **SQL Editor** in the Supabase Dashboard.
   - Paste the contents of [supabase/migrations/20261022000004_recovery_schema_and_seed.sql](file:///c:/Users/jasim/Web%20Project/Enterprises/Ice%20cream/Icespot/supabase/migrations/20261022000004_recovery_schema_and_seed.sql).
   - Execute the script and verify that `Success. No rows returned` is reported.
3. **Execute Verification Script:**
   - Paste the contents of [supabase/verification_script.sql](file:///c:/Users/jasim/Web%20Project/Enterprises/Ice%20cream/Icespot/supabase/verification_script.sql) into the SQL Editor.
   - Run the script and confirm that all 9 `PASS` notices are output in the Messages log.
4. **Deploy Application Frontend:**
   - Deploy the current master branch to Vercel or your production hosting provider.
5. **Execute Smoke Tests:**
   - Authenticate into the three respective accounts (`icespotvaravoor@gmail.com`, `icespotthrissur@gmail.com`, `icespotstaff@gmail.com`) and confirm that orders, stock adjustments, dispatches, and receipts persist across browser sessions.

---

## 5. QUALITY GATE VERIFICATION RESULTS

- **Test Suite (`npm test`):**
  - **18 / 18 tests PASSED** (0 failures, 128ms execution time).
  - Validates role access, inactive profile rejection, UUID-based cross-branch isolation, BigInt sequences, non-negative inventory constraints, shortage recording, and UI persistence error surfacing.
- **Type Checking (`npx tsc --noEmit`):**
  - **0 errors** (Clean TypeScript compilation).
- **Production Build (`npm run build`):**
  - **Compiled successfully in 3.3s**.
  - All 14 static and dynamic routes compiled without warnings or errors.
