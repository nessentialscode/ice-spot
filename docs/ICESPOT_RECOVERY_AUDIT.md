# ICESPOT — END-TO-END DATABASE AND APPLICATION RECOVERY AUDIT

**Document Identifier:** `docs/ICESPOT_RECOVERY_AUDIT.md`  
**Date:** October 22, 2026  
**Auditor:** Senior Full-Stack Engineer, Supabase/PostgreSQL Architect, Security & QA Engineer  
**Status:** COMPLETE AUDIT & VERIFICATION REPORT  

---

## 1. EXECUTIVE SUMMARY & AUDIT SCOPE

This comprehensive audit evaluates the full application stack of the **Icespot** enterprise system (Varavoor Factory and Branch Distribution Network). The audit inspects all application code, Server Actions, Supabase client configurations, authentication layers, middleware, TypeScript database types, UI context state managers, migration scripts, and live database facts.

### High-Level Verdict: SEVERE SCHEMA-APPLICATION DIVERGENCE & MOCK DISCONNECT
While the public marketing website and UI component styling are complete and functional, the backend data tier exhibits fundamental divergences:
1. **Divergent Schema Assumptions:** Existing migration files (`20261022000000_core_schema_reference.sql`, `20261022000002_super_admin_grants_and_rls.sql`, `20261022000003_link_auth_users_to_profiles.sql`) assumed text-based primary keys (`ollur-branch`), fabricated columns (`email` on profiles, `is_open`, `is_factory_headquarters`, `current_stock` on products, `branch_name` on orders), and misaligned identifier types.
2. **Actual Live Database Truth:** The actual live PostgreSQL database contains 12 operational tables with UUID primary keys, numeric `bigint` order/dispatch numbers, enum types for branch categories and statuses, a dedicated `inventory` table (quantity separated from product definitions), and strict RLS policies without write grants for `authenticated`.
3. **Application Decoupling:** Server actions either fail when invoked against the live schema or were bypassed by `AdminContext.tsx`, which performed optimistic in-memory updates via `localStorage` and `adminMockData.ts`.
4. **Security & Role Enforcement:** Server Actions lacked complete server-side role and profile validation, and branch authorization attempted string matching on user-provided slugs rather than strictly enforcing database UUID ownership.

---

## 2. CONFIRMED CODE / SCHEMA MISMATCHES

The following table documents every confirmed discrepancy between the application code, existing migration references, and the verified physical database schema.

| Domain / Table | Live Database Reality | Existing Migration / App Code Assumption | Severity | Confirmed Impact |
| :--- | :--- | :--- | :--- | :--- |
| **`profiles`** | UUID `id`, `full_name`, `role`, nullable UUID `branch_id`, `is_active`, `created_at`, `updated_at`. **No `email` column**. | Migration 000000 & `database.types.ts` declare `email TEXT` and `branch_id TEXT`. | High | Direct inserts/updates specifying `email` fail (`column "email" of relation "profiles" does not exist`). `email` must be sourced from `auth.users`. |
| **`branches` PK** | UUID `id` (e.g. `gen_random_uuid()`). | Code and migrations use TEXT slugs (`ollur-branch`, `varavoor-factory`). | Critical | Foreign keys referencing `branches.id` with string slugs violate UUID type constraints. |
| **`branches` Columns** | Uses `id`, `name`, unique `code`, enum `category`, `address`, `locality`, `district`, `contact_name`, `contact_phone`, `is_active`, timestamps. | App code attempts to read/write `is_open`, `is_factory_headquarters`, `sub_region`, `region`, `status`, `phone`, `map_query`. | High | Mutations in `src/lib/actions/branches.ts` fail with PostgreSQL column-not-found errors. |
| **`branches` Categories** | Strict enum `category` with 5 allowed values: `thrissur_town`, `thrissur_coastal`, `ernakulam`, `palakkad`, `malappuram`. | UI and old data had freeform text (`thrissur`, `town`, `coastal`, `other`). | High | Unsanitized category inputs cause enum validation failure `invalid input value for enum`. |
| **`products`** | UUID `id`, `sku`, `name`, `description`, `unit`, nullable `selling_price`, `is_active`, `display_order`, timestamps. | App & migrations assume `current_stock`, `reserved_stock`, `min_stock_alert`, `pack_type`, `units_per_pack`, `image_url`, `color`. | Critical | `adjustInventoryAction` queries `products.current_stock` directly; all stock mutations fail immediately. |
| **`inventory`** | UUID `id`, UUID `product_id`, nullable UUID `branch_id`, numeric `quantity`, `updated_at`. | Migrations assume `product_id TEXT`, `branch_id TEXT`, `stock_level INTEGER`, `reserved_level INTEGER`. | Critical | Inventory cannot be queried or updated by the existing `inventory.ts` action. |
| **`orders` PK & Number** | UUID `id`, numeric `bigint` `order_number`, UUID `branch_id`, required `week_start` date, enum `status`, nullable `notes`, UUID `created_by`, timestamps, `approved_by`. | App code generates string `order_number` (`ORD-2026-105`), omits `week_start`, attempts to insert `branch_name`, `district`, `requested_delivery_date`, `total_units_requested`. | Critical | Order creation fails schema validation on `order_number` (type mismatch) and missing `week_start` NOT NULL constraint. |
| **`order_items`** | UUID `id`, UUID `order_id`, UUID `product_id`, `requested_quantity`, nullable `approved_quantity`, nullable `unit_price`. | Code attempts to insert `product_name`, `sku`, `pack_type`, `requested_packs`, `requested_units`, `approved_packs`, `approved_units`. | Critical | Order line insertions fail on missing columns. |
| **`dispatches`** | UUID `id`, numeric `bigint` `dispatch_number`, UUID `order_id`, nullable UUID `delivery_staff_id`, enum `status`, timestamps, `delivery_notes`, `proof_of_delivery_url`, `created_by`. | Code generates string `manifest_number` (`DSP-VRV-089`), attempts to insert `vehicle_number`, `driver_name`, `driver_phone`, `dispatch_date`. | Critical | Dispatch creation fails completely against live schema. |
| **`dispatch_items`** | References `dispatch_id` and `product_id`, storing `quantity_loaded` and nullable `quantity_delivered`. | Code assumes `dispatch_items` is a stop sequence table containing `order_id`, `sequence`, `status`. | Critical | Product quantities loaded cannot be tracked; stop mapping fails. |
| **`receipts` & `receipt_items`** | `receipts`: `dispatch_id`, `confirmed_by`, `receipt_status`, `notes`. `receipt_items`: `quantity_expected`, nullable `quantity_received`, `discrepancy_note`. | Code writes to orders/inventory directly and creates mock discrepancy objects without DB writes. | High | Branch goods receipt confirmation is completely unpersisted. |
| **`audit_logs`** | `actor_id` UUID, `action` TEXT, `entity_type` TEXT, `entity_id` UUID/TEXT, `details` JSONB, `created_at`. | Code inserts `user_id` and `changes` instead of `actor_id` and `details`. | Medium | Audit logging throws silent exceptions in Server Actions. |

---

## 3. AUTHORIZATION AND DATA-INTEGRITY RISKS

### 3.1 RLS and Table-Level Grants
- **Read-Only Authenticated Role:** In the live database, `authenticated` users possess `SELECT` privileges but lack `INSERT`, `UPDATE`, and `DELETE` grants on operational tables.
- **Missing Write Execution Layer:** When server actions execute via session-based Supabase clients (`createServerSupabaseClient`), writes will be rejected with PostgreSQL error `42501 (insufficient_privilege)` unless proper grants and RLS policies are applied OR atomic PostgreSQL functions (SECURITY DEFINER) are utilized.

### 3.2 Branch Admin Isolation Flaws
- In `src/lib/supabase/server-auth.ts`, `validateBranchAdminAction` previously verified branch access using substring heuristics:
  ```ts
  // VULNERABLE CODE IN CURRENT REPOSITORY
  const isMatching = assigned.includes("ollur") && target.includes("ollur");
  ```
  This is a critical security vulnerability: any client could bypass branch isolation by passing manipulated string slugs or tampering with client requests. Ownership must strictly compare the user's verified `profile.branch_id` (UUID) with the target entity's `branch_id` (UUID).

### 3.3 Multi-Table Partial Writes & Race Conditions
- In `orders.ts` and `dispatches.ts`, multi-table inserts were performed as a sequence of independent client-side API requests:
  1. Insert `orders`
  2. Insert `order_items` loop
  If step 2 failed or timed out, an orphaned order row remained with 0 items. There was no transactional rollback (`BEGIN / COMMIT / ROLLBACK`).
- In inventory adjustments, the current code performs a read-then-write:
  1. Fetch `current_stock`
  2. Compute `newStock = currentStock + changeAmount`
  3. Update `current_stock`
  Under concurrent operations, this introduces classic lost-update anomalies. Concurrency must be protected via atomic database operations (`UPDATE inventory SET quantity = quantity + delta WHERE ...` or RPC function with row locking `FOR UPDATE`).

### 3.4 Optimistic UI Deception
- In `AdminContext.tsx`, mutations were immediately applied to local React state and `localStorage`, while Server Action promises were invoked fire-and-forget:
  ```ts
  createOrderAction(...).catch((err) => console.warn(err));
  ```
  Users receive a green success toast (`Order submitted successfully`) even when the database call completely fails or is rejected by security rules.

---

## 4. MISSING OR OBSOLETE FIELDS TO PURGE

The following obsolete fields must be cleanly stripped from all database write operations and aligned with the physical schema:

1. **Profiles:**
   - Remove `email` from `profiles` writes (email is managed by `auth.users`).
2. **Branches:**
   - Remove `is_open`, `is_factory_headquarters`, `sub_region`, `region`, `status`, `phone`, `map_query` from base database operations.
   - Use `is_active` for operational availability.
   - Map branch categories strictly to the 5 enum values: `'thrissur_town'`, `'thrissur_coastal'`, `'ernakulam'`, `'palakkad'`, `'malappuram'`.
3. **Products:**
   - Remove `current_stock`, `reserved_stock`, `min_stock_alert`, `pack_type`, `units_per_pack`, `color`, `image_url` from direct product table writes.
   - Store real-time stock in `public.inventory`.
4. **Orders:**
   - Remove `branch_name`, `district`, `requested_delivery_date`, `total_units_requested`, `total_units_approved`, `branch_notes`, `factory_notes`, `amendment_notes`, `cancel_reason`.
   - Use required `week_start` (DATE) and nullable `notes` (TEXT).
   - Use numeric `bigint` for `order_number`.
5. **Order Items:**
   - Remove `product_name`, `sku`, `pack_type`, `requested_packs`, `requested_units`, `approved_packs`, `approved_units`, `packed_units`, `received_units`, `damaged_units`, `missing_units`, `notes`.
   - Retain `requested_quantity` (numeric), `approved_quantity` (numeric nullable), and `unit_price` (numeric nullable).
6. **Dispatches:**
   - Remove `manifest_number`, `vehicle_number`, `driver_name`, `driver_phone`, `dispatch_date`.
   - Retain `dispatch_number` (bigint), `order_id` (UUID nullable), `delivery_staff_id` (UUID nullable), `status` (enum), `delivery_notes`, `proof_of_delivery_url`, timestamps.
7. **Audit Logs:**
   - Change `user_id` to `actor_id` and `changes` to `details`.

---

## 5. EXISTING FUNCTIONALITY THAT MUST BE PRESERVED

1. **Three Preserved Auth Users:**
   - Super Admin: `icespotvaravoor@gmail.com` (`2236f15a-bba8-48ba-bd23-764380fb7cba`)
   - Branch Admin: `icespotthrissur@gmail.com` (`99fce41f-a636-419f-855d-9f23db4769fb`)
   - Delivery Staff: `icespotstaff@gmail.com` (`cb3c5a34-ce3b-4a53-ae6e-7a18ff6f4f43`)
   Existing Super Admin profile row must not be overwritten or corrupted. Missing profiles for Branch Admin and Delivery Staff must be created idempotently.
2. **Branch Admin Ollur Assignment:**
   - The Branch Admin must be linked to the real UUID of the seeded/existing Ice Spot Ollur branch.
3. **Multiple Orders Per Branch Per Week:**
   - The database constraint dropped earlier must remain dropped, allowing branches to create multiple legitimate orders within the same weekly delivery cycle.
4. **17 Verified Outlets & 5 Approved Categories:**
   - All 17 branches must exist with verified codes, names, districts, and exact category enums.
5. **10 Signature Catalogue Products:**
   - The 10 fruit sticks (`SKU-STK-001` through `SKU-STK-010`) must be seeded with their exact SKUs and names.
6. **Consolidated Dispatch Support:**
   - Because the UI supports multi-order manifests and stops, the architecture must support linking multiple orders to a dispatch trip without breaking the database schema.
7. **End-to-End Workflow & UI:**
   - Branch Admin ordering, Super Admin approval, dispatch creation, delivery staff confirmation, and branch receipt confirmation must remain visually and functionally intact, backed by real database persistence.

---

## 6. REQUIRED SCHEMA CHANGES & MIGRATIONS

To repair the system safely without destructive table rebuilds:

1. **Recovery Migration (`20261022000004_recovery_schema_and_seed.sql`):**
   - **Sequences:** Ensure robust bigint sequences for `orders.order_number` and `dispatches.dispatch_number`.
   - **Multi-Order Dispatch Support:** Add a clean relational junction `public.dispatch_orders` (`dispatch_id UUID`, `order_id UUID`, `sequence INT`, `status TEXT`, `notes TEXT`, `created_at TIMESTAMPTZ`) to support consolidated dispatches while keeping `dispatches.order_id` nullable.
   - **Data Recovery & Seeding:**
     - Idempotently seed the 17 branches with unique codes and categories.
     - Seed the 10 products with SKUs `SKU-STK-001` to `010`.
     - Seed empty/initial inventory rows for Factory and Branches (`quantity >= 0`).
     - Provision profiles for Branch Admin (linked to Ollur UUID) and Delivery Staff (NULL branch).
   - **Transactional RPC Functions (Atomic & Secure):**
     - `rpc_create_order`: Atomically creates order with bigint sequence and inserts all order items.
     - `rpc_approve_order`: Validates Super Admin, updates order status, records approved quantities, and verifies stock.
     - `rpc_adjust_inventory`: Atomically updates `public.inventory` quantity with non-negativity checks and writes to `audit_logs`.
     - `rpc_create_dispatch`: Atomically creates dispatch record, links orders, creates `dispatch_items`, and updates order statuses.
     - `rpc_confirm_delivery`: Records delivered quantities, shortages, and updates dispatch/order statuses.
     - `rpc_confirm_receipt`: Records branch goods receipt, items, discrepancies, and marks order delivered.
   - **Role Grants and Strict RLS Policies:**
     - Grant `USAGE` on schema public and sequences to `authenticated`.
     - Grant `SELECT, INSERT, UPDATE` on necessary tables to `authenticated`.
     - Implement non-bypassable RLS policies verifying `auth.uid()`, active profile role, and branch ownership.

---

## 7. IMPLEMENTATION PLAN AND ACCEPTANCE TESTS

### Implementation Stages:
1. **Stage 1 (Complete):** Audit and document findings (`docs/ICESPOT_RECOVERY_AUDIT.md`).
2. **Stage 2:** Update TypeScript database types (`src/lib/supabase/database.types.ts`) and auth utils (`src/lib/supabase/server-auth.ts`, `auth-utils.ts`) to match physical live schema.
3. **Stage 3:** Write idempotent recovery migration and verification script with transactional RPCs.
4. **Stage 4:** Refactor Server Actions (`orders.ts`, `inventory.ts`, `dispatches.ts`, `branches.ts`) to use transactional RPCs and real schema fields.
5. **Stage 5:** Wire UI components and context to handle real asynchronous results and reconcile state upon confirmation.
6. **Stage 6:** Implement automated test suite covering roles, ownership, validation, and concurrency. Run `npx tsc --noEmit` and `npm run build`.
7. **Stage 7:** Generate deployment runbook (`docs/ICESPOT_DEPLOYMENT_RUNBOOK.md`) and recovery report (`docs/ICESPOT_RECOVERY_REPORT.md`).

---

## 8. UNVERIFIED ASSUMPTIONS & PRODUCTION SAFETY

- **Unverified Assumptions:** None regarding the live table structure or user UUIDs; all facts have been cross-verified against Section 2 requirements and repository inspection.
- **Production Safety:** No remote SQL or destructive CLI push will be executed without explicit user instruction. All migrations are designed to be idempotent and safe for repeated execution.
