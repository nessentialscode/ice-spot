# ICESPOT — PRODUCTION INCIDENT MITIGATION & ROLLBACK PLAN

**Document Identifier:** `docs/ICESPOT_ROLLBACK_PLAN.md`  
**Execution Date:** October 22, 2026  
**Target Environment:** Production Supabase Instance `gprtubirudzequpukzel`  
**Target Migration:** `supabase/production_minimal_recovery.sql`  

---

## 1. CORE ROLLBACK PHILOSOPHY & CRITICAL WARNINGS

> [!CAUTION]
> **NEVER USE DESTRUCTIVE ROLLBACKS ON PRODUCTION.**
> Destructive statements such as `DROP TABLE`, `DROP FUNCTION`, or blanket `DELETE FROM <table>` are strictly prohibited as automated or standard rollback steps. Dropping tables (`branches`, `products`, `orders`, `inventory`, `dispatch_orders`) permanently destroys business history and foreign-key integrity.

### Distinction: Circuit Breaker vs. Data Rollback
- **What Privilege Revocation Does:** Revoking `EXECUTE` privileges on RPC functions acts as an emergency **circuit breaker**. It immediately stops web clients and malicious actors from submitting new mutations through the API.
- **What Privilege Revocation Does NOT Do:** It does **NOT** undo, revert, or roll back data already committed to disk. 
- **Data Remediation:** Any data corrections require selective, tracked remediation queries or point-in-time restoration from pre-migration backup snapshots.

---

## 2. ROLLBACK TIER 1: AUTOMATIC TRANSACTIONAL ABORT (DURING MIGRATION)

The migration script [supabase/production_minimal_recovery.sql](file:///c:/Users/jasim/Web%20Project/Enterprises/Ice%20cream/Icespot/supabase/production_minimal_recovery.sql) is wrapped entirely within a single explicit transaction:

```sql
BEGIN;
-- All DDL, DML, Sequences, Seeds, RLS, and RPCs
COMMIT;
```

- **Behavior:** PostgreSQL natively supports transactional DDL. If any syntax error, foreign key violation, constraint mismatch, or network disconnection occurs prior to line 1174 (`COMMIT;`), PostgreSQL automatically executes a complete `ROLLBACK`.
- **Zero Partial State:** The database reverts 100% to its exact pre-execution state. No manual intervention is needed.

---

## 3. ROLLBACK TIER 2: POST-DEPLOYMENT INCIDENT CIRCUIT BREAKER

If an unexpected application defect, authentication loop, or client-side regression is identified after `COMMIT;`, immediately halt mutation access to prevent corrupted business records:

```sql
-- ============================================================================
-- EMERGENCY CIRCUIT BREAKER: SUSPEND MUTATION RPCS
-- Impact: Pauses mutation APIs without dropping tables or deleting data.
-- ============================================================================
REVOKE EXECUTE ON FUNCTION public.rpc_create_order(UUID, DATE, TEXT, JSONB) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_approve_order(UUID, JSONB, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_adjust_inventory(UUID, UUID, NUMERIC, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_create_dispatch(UUID[], UUID, TEXT, JSONB) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_update_delivery_stop(UUID, UUID, TEXT, TEXT, JSONB) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_confirm_receipt(UUID, UUID, TEXT, TEXT, JSONB) FROM authenticated;
```

### To Resume Normal Operations After Hotfix:
```sql
GRANT EXECUTE ON FUNCTION public.rpc_create_order(UUID, DATE, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_approve_order(UUID, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_adjust_inventory(UUID, UUID, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_create_dispatch(UUID[], UUID, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_update_delivery_stop(UUID, UUID, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_confirm_receipt(UUID, UUID, TEXT, TEXT, JSONB) TO authenticated;
```

---

## 4. ROLLBACK TIER 3: SELECTIVE INCIDENT REMEDIATION

If specific records require correction after migration:

### Scenario A: Sequence Offset Adjustment
If an external order was manually inserted out-of-band and causes collisions:
```sql
-- Read current max and advance sequence safely
SELECT COALESCE(MAX(order_number), 10000) FROM public.orders;
SELECT setval('public.orders_order_number_seq', (SELECT MAX(order_number) FROM public.orders) + 1, false);
```

### Scenario B: Profile Branch Reassignment
If the Branch Admin profile (`99fce41f-a636-419f-855d-9f23db4769fb`) needs reassignment to a different branch without modifying other users:
```sql
UPDATE public.profiles
SET branch_id = (SELECT id FROM public.branches WHERE code = '<NEW_BRANCH_CODE>')
WHERE id = '99fce41f-a636-419f-855d-9f23db4769fb'::uuid;
```

### Scenario C: Reverting RLS Policies to Lockdown Mode
If a policy permits broader read access than desired during an incident:
```sql
-- Lock down orders table reads to super_admin only during investigation
DROP POLICY IF EXISTS "orders_select_policy" ON public.orders;
CREATE POLICY "orders_select_policy" ON public.orders
    FOR SELECT TO authenticated
    USING (public.fn_is_super_admin());
```

---

## 5. ROLLBACK TIER 4: DISASTER RECOVERY & RESTORATION GOVERNANCE

> [!CAUTION]
> **PROHIBITION OF ROUTINE `pg_restore --clean` AGAINST PRODUCTION:**
> Never run `pg_restore --clean` or `--clean --if-exists` directly against the live Supabase production database. 
> 
> In a managed Supabase cluster, `--clean` issues `DROP` statements on database objects before recreating them. Because application tables have complex foreign keys, extension dependencies, and relationships with Supabase-managed infrastructure (`auth`, `storage`, `vault`), executing `--clean` against production risks dropping critical system objects, cascading unintended deletions, or failing halfway due to catalog privilege boundaries—leaving the production database in a corrupted, half-restored state.

### 5.1 Backup Scope & Boundaries

When creating and relying on pre-migration database dumps:
```bash
# Recommended pre-migration logical backup command (Scoped to public schema):
pg_dump -h db.gprtubirudzequpukzel.supabase.co -U postgres -d postgres -n public -F c -b -v -f icespot_pre_recovery_backup_20261022.dump
```

- **Included within Backup Scope (`-n public`):**
  - All 13 application tables (`branches`, `products`, `profiles`, `inventory`, `orders`, `order_items`, `dispatches`, `dispatch_orders`, `dispatch_items`, `receipts`, `receipt_items`, `audit_logs`, `enquiries`).
  - Table schemas, constraints (PK, FK, unique, check), indexes, triggers, and sequences.
  - Custom functions (`fn_is_super_admin`, `fn_user_branch_id`, all 6 RPCs) and public RLS policies.
  - All committed operational business data and row records.
- **Excluded from Backup Scope (Supabase-Managed System State):**
  - `auth` schema: User authentication records (`auth.users`), hashed passwords, SSO identities, and refresh tokens.
  - `storage` schema: Storage buckets, storage objects, and file storage permissions.
  - `vault` schema: Encrypted secrets and project-level cryptographic keys.
  - Infrastructure configuration: Project API keys, connection pooling settings, and platform extensions.

### 5.2 Safe Restoration Testing Procedure (Scratch Environment First)

To safely test or restore from a backup file without threatening production:

1. **Provision an Isolated Scratch Target:**
   - Launch a local PostgreSQL test container or a disposable Supabase development project:
     ```bash
     docker run --name icespot-restore-test -e POSTGRES_PASSWORD=postgres -p 5433:5432 -d postgres:15
     ```
2. **Execute Non-Destructive Restore into Scratch Target:**
   ```bash
   pg_restore --no-owner --no-privileges -h localhost -p 5433 -U postgres -d postgres -v icespot_pre_recovery_backup_20261022.dump
   ```
3. **Validate Restored Relational State:**
   - Verify table inventory: Ensure all 13 application tables exist.
   - Verify row count parity against the pre-migration audit logs.
   - Verify sequence values: Ensure `orders_order_number_seq` and `dispatches_dispatch_number_seq` match table maximums.
4. **Surgical Data Recovery (If Production Remediation is Required):**
   - If specific rows or tables were corrupted on production, extract only the affected tables from the scratch instance using `pg_dump -t public.<table_name> --data-only`.
   - Apply targeted, audited `INSERT ... ON CONFLICT DO UPDATE` or `COPY` statements to production under maintenance mode, avoiding blanket overwrites.

### 5.3 Point-in-Time Recovery (PITR) Operational Limitations

If utilizing Supabase Managed Backups or Point-in-Time Recovery:

- **Tier Prerequisite:** PITR requires continuous Write-Ahead Log (WAL) archiving, which is an enterprise/add-on feature on Supabase. Free tier projects only maintain daily logical snapshots.
- **Irreversible Data Loss Window:** PITR rewinds the *entire* database cluster back to the selected timestamp. Any valid orders, enquiries, or customer activity that occurred between the incident timestamp and the restoration timestamp will be permanently erased unless WAL logs are independently audited and extracted prior to the rewind.
- **Service Disruption:** PITR restores the database to a restored instance or triggers a database restart during log replay. Applications will experience temporary downtime, connection pool reconnections, and may require updating environment connection strings if restored to a fork.
