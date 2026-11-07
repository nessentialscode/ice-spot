# ICESPOT — PRODUCTION FINAL EXECUTION CHECKLIST

**Document Identifier:** `docs/ICESPOT_FINAL_EXECUTION_CHECKLIST.md`  
**Execution Target:** Supabase Production Project `gprtubirudzequpukzel`  
**Target Migration:** `supabase/production_minimal_recovery.sql`  
**Lead Systems Engineer:** Senior PostgreSQL/Supabase Database Architect & Application Security Engineer  

---

## PHASE 0: PRE-EXECUTION PREREQUISITES

- [ ] **1. Business Decisions Formally Confirmed:**
  - Branch Admin (`99fce41f-a636-419f-855d-9f23db4769fb`) assigned to Ice Spot Ollur (`BR-OLL-003`).
  - Factory stock seeded at `0` only for missing products (never overwriting existing stock).
  - 17 branches categorized into 5 regions (`thrissur_town`, `thrissur_coastal`, `ernakulam`, `palakkad`, `malappuram`).
  - Preservation of all existing Auth users, profiles, products, branches, orders, and dispatches.
- [ ] **2. Production Backup Procured & Verified:**
  - Dump procured: `pg_dump -h db.gprtubirudzequpukzel.supabase.co -U postgres -d postgres -n public -F c -b -v -f icespot_pre_recovery_backup_20261022.dump`
  - File size verified non-zero; or verified healthy backup snapshot in Supabase Dashboard.
  - Review backup scope & recovery governance in [docs/ICESPOT_ROLLBACK_PLAN.md](file:///c:/Users/jasim/Web%20Project/Enterprises/Ice%20cream/Icespot/docs/ICESPOT_ROLLBACK_PLAN.md).
- [ ] **3. Quality Gate Pipeline Validated Locally:**
  - Automated tests: `npm test` &rarr; 19 / 19 passed.
  - Type checking: `npx tsc --noEmit` &rarr; 0 errors.
  - Production build: `npm run build` &rarr; 14 / 14 routes compiled cleanly.

---

## PHASE 1: READ-ONLY PRE-EXECUTION AUDIT

- [ ] **1. Open Supabase SQL Editor:**
  - Navigate to [https://supabase.com/dashboard/project/gprtubirudzequpukzel/sql/new](https://supabase.com/dashboard/project/gprtubirudzequpukzel/sql/new).
- [ ] **2. Execute Pre-Check Script:**
  - Copy and paste the complete contents of [supabase/production_precheck_readonly.sql](file:///c:/Users/jasim/Web%20Project/Enterprises/Ice%20cream/Icespot/supabase/production_precheck_readonly.sql).
  - Click **Run** (Ctrl + Enter).
- [ ] **3. Verify Pre-Check Findings:**
  - Check 1–2: 12 tables exist; note current row counts.
  - Check 3: `dispatch_orders_exists = false`.
  - Check 4: `orders.order_number` and `dispatches.dispatch_number` have `NULL` column defaults.
  - Check 7: Record current `max_order_number` and `max_dispatch_number`.
  - Check 9: Confirmed Auth users exist (`2236f15a-...`, `99fce41f-...`, `cb3c5a34-...`).
  - Check 10: Orphaned branch query returns `0` rows.

---

## PHASE 2: EXECUTION OF MINIMAL RECOVERY MIGRATION

> [!CAUTION]
> **Do not execute until Phase 0 and Phase 1 are completely checked off.**

- [ ] **1. Open New Tab in Supabase SQL Editor:**
  - Open a fresh query editor window.
- [ ] **2. Load Minimal Recovery Migration:**
  - Copy and paste the entire contents of [supabase/production_minimal_recovery.sql](file:///c:/Users/jasim/Web%20Project/Enterprises/Ice%20cream/Icespot/supabase/production_minimal_recovery.sql).
- [ ] **3. Execute Migration:**
  - Click **Run** (Ctrl + Enter).
- [ ] **4. Confirm Transaction Commit:**
  - Ensure the output displays: `Success. No rows returned`.
  - *(If any error is returned, the atomic `BEGIN ... COMMIT` automatically rolled back all changes. Refer to [docs/ICESPOT_ROLLBACK_PLAN.md](file:///c:/Users/jasim/Web%20Project/Enterprises/Ice%20cream/Icespot/docs/ICESPOT_ROLLBACK_PLAN.md).)*

---

## PHASE 3: READ-ONLY POST-EXECUTION VERIFICATION

- [ ] **1. Open New Tab in Supabase SQL Editor:**
  - Open a fresh query editor window.
- [ ] **2. Execute Post-Check Verification Script:**
  - Copy and paste the complete contents of [supabase/production_postcheck_readonly.sql](file:///c:/Users/jasim/Web%20Project/Enterprises/Ice%20cream/Icespot/supabase/production_postcheck_readonly.sql).
  - Click **Run** (Ctrl + Enter).
- [ ] **3. Inspect Verification Notices (Messages Tab):**
  - [ ] `PASS [1/11]: All 13 application tables exist in public schema.`
  - [ ] `PASS [2/11]: Verified >= 17 branches seeded.`
  - [ ] `PASS [3/11]: Verified >= 10 products seeded.`
  - [ ] `PASS [4/11]: Super Admin profile verified.`
  - [ ] `PASS [5/11]: Branch Admin profile verified and linked to Ollur branch UUID.`
  - [ ] `PASS [6/11]: Delivery Staff profile verified.`
  - [ ] `PASS [7/11]: Sequence defaults verified for orders.order_number and dispatches.dispatch_number.`
  - [ ] `PASS [8/11]: All 6 RPC functions exist, have SECURITY DEFINER enabled, and enforce search_path=public, pg_temp.`
  - [ ] `PASS [9/11]: Public / anon access to sensitive RPC functions is strictly revoked.`
  - [ ] `PASS [10/11]: Row Level Security (RLS) is active across all 13 tables with dedicated access policies.`
  - [ ] `PASS [11/11]: Foreign key profiles_branch_id_fkey and dispatch junction constraints verified.`

---

## PHASE 4: APPLICATION SMOKE TESTING & SIGN-OFF

- [ ] **1. Super Admin Portal:**
  - Log in as Super Admin (`2236f15a-...`).
  - Verify visibility of all 17 branches and global order manifests.
- [ ] **2. Branch Admin Portal:**
  - Log in as Branch Admin (`99fce41f-...`).
  - Verify dashboard loads with **Ice Spot Ollur** context without `profile_missing` error.
  - Verify ability to view and create orders for Ollur parlour.
- [ ] **3. Delivery Staff Portal:**
  - Log in as Delivery Staff (`cb3c5a34-...`).
  - Verify delivery dashboard loads without error.
- [ ] **4. Public Website & Catalogue:**
  - Verify `/flavours` displays 10 stick flavours.
  - Verify `/locations` displays franchise locator.
  - Test public franchise enquiry submission on `/contact`.
