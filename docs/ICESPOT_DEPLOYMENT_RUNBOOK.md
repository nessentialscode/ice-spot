# ICESPOT — PRODUCTION DEPLOYMENT & DATABASE RECOVERY RUNBOOK

**Document Identifier:** `docs/ICESPOT_DEPLOYMENT_RUNBOOK.md`  
**Execution Authority:** PostgreSQL/Supabase Database Architect & Lead Systems Engineer  
**Target Application Database:** `ice_spot_dev` (Reference: `punyeqlotfnvxhhugtud`)  
**Legacy Archive Source:** `ice-spot` (Reference: `gprtubirudzequpukzel`)  
**Deployment State:** READY FOR AUTHORIZATION — PENDING EXPLICIT OWNER APPROVAL  

---

## 1. PURPOSE & DEPLOYMENT OVERVIEW

This runbook specifies the step-by-step procedure for deploying the **Icespot End-to-End Recovery Migration** (`supabase/migrations/20261022000004_recovery_schema_and_seed.sql`) and running the post-deployment verification script (`supabase/verification_script.sql`).

### Core Safety Guarantee:
- **Zero Destructive Deletions:** No `DROP TABLE`, `TRUNCATE`, or column removals are executed.
- **Strict Idempotency:** The migration uses `CREATE ... IF NOT EXISTS`, `ON CONFLICT DO UPDATE / DO NOTHING`, and safe conditional checks. It is safe to run multiple times without data corruption or duplicate rows.
- **Preserves Existing Super Admin:** Does not overwrite the existing Super Admin profile record.
- **Zero Secret Exposure:** Credentials and service-role keys are never checked into git or printed in logs.

---

## 2. LEGACY DATABASE BACKUP RUNBOOK & MIGRATION SAFEGUARDS

### 2.1 Architectural Context & Migration Decision Preservation
- **Application Fresh Start on `ice_spot_dev`:** The Ice Spot application will start fresh on `ice_spot_dev` (Reference: `punyeqlotfnvxhhugtud`).
- **Legacy Database Archival (`gprtubirudzequpukzel`):** The legacy database (`gprtubirudzequpukzel`) is retained strictly for historical auditing, legal reference, and forensic verification through an independent, verified backup.
- **Prohibition on Bulk Import:** Do **NOT** bulk-import legacy operational orders, dispatches, invoices, or inventory into the target database. Schema mismatches (such as legacy `TEXT` keys, denormalized records, and missing `invoices`/`inventory_movements` ledgers) would corrupt the verified `ice_spot_dev` operational baseline.
- **Legacy Project Preservation:** Do **NOT** pause, delete, reset, or decommission the legacy Supabase project (`gprtubirudzequpukzel`) during or immediately following backup execution.

---

### 2.2 Safeguard A: Secure Credential Handling & Windows Secret Isolation
- **Strict Prohibition on Plaintext Credentials:** Database passwords must **never** be placed in:
  - Command-line arguments or flags (e.g., `-W` with inline password, or inline connection strings `postgresql://user:pass@host...`).
  - Inline scripts or scratch batch files.
  - Git repository files or version control commits.
  - System event logs, terminal logs, or generated markdown reports.
  - *Risk:* Command-line arguments leak into PowerShell history (`Get-History`, `$HOME\AppData\Roaming\Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt`), process monitors (`Get-Process`, Task Manager, Sysinternals Process Explorer), and third-party process audit logs.
- **Primary Mechanism: Restricted PostgreSQL Password File (`pgpass.conf`):**
  PostgreSQL client tools natively support password files without exposing credentials in the process table:
  - **Windows Path:** `%APPDATA%\postgresql\pgpass.conf` (`$env:APPDATA\postgresql\pgpass.conf`)
  - **Linux/macOS Path:** `~/.pgpass` (requires `chmod 0600 ~/.pgpass`)
  - **Mandatory Windows Access Control List (ACL) Hardening:**
    > [!CRITICAL]
    > **A password file on Windows is NOT secure without explicit, restrictive ACLs.**  
    > By default, newly created files in `%APPDATA%` inherit permissive access control lists that grant read access to all local accounts or authenticated users on the workstation. Restrictive ACLs must be applied using `icacls` *before* or immediately upon writing secret material.
  - **Safe Password-File Procedure (Avoiding Overwrites & Variable Expansion):**
    > [!WARNING]
    > **Do NOT use double-quoted PowerShell commands (`"<host>:...:$password" | Out-File ...`) to write credentials.**  
    > If a database password contains special characters such as `$` (e.g., `Ice$2026`), PowerShell interprets `$` as a variable prefix, silently replacing that portion of the password with empty text or expanding unrelated environment variables. Furthermore, running `Out-File` without `-Append` obliterates any pre-existing connection entries in `pgpass.conf`.

    #### Approved Method 1: Secure Manual Procedure via Editor (Recommended)
    This manual procedure eliminates shell escaping, variable expansion, and command-line history exposure:
    ```powershell
    # 1. Ensure the postgresql directory exists
    $pgpassDir = "$env:APPDATA\postgresql"
    if (-not (Test-Path $pgpassDir)) {
        New-Item -ItemType Directory -Path $pgpassDir -Force | Out-Null
    }
    $pgpassFile = "$pgpassDir\pgpass.conf"

    # 2. Ensure the file exists so ACLs can be locked down BEFORE pasting secrets
    if (-not (Test-Path $pgpassFile)) {
        New-Item -ItemType File -Path $pgpassFile -Force | Out-Null
    }

    # 3. Apply restrictive Windows ACLs (disable inheritance, grant current user Read/Write only)
    icacls $pgpassFile /inheritance:r /grant:r "$($env:USERNAME):(R,W)"

    # 4. Open in Notepad to securely paste the credential entry without shell history risk
    notepad.exe $pgpassFile
    ```
    In Notepad:
    - If `pgpass.conf` already contains entries for other databases, navigate to the bottom on a new line (do **not** overwrite existing lines).
    - Add the single-line entry formatted as:
      `<legacy-pooler-host>:5432:postgres:postgres.gprtubirudzequpukzel:<LEGACY_DB_PASSWORD>`
    - **PostgreSQL pgpass Escaping Rules:**
      - The colon (`:`) is the field delimiter in PostgreSQL password files. If your password contains a literal colon (`:`), it must be escaped as `\:`.
      - If your password contains a literal backslash (`\`), it must be escaped as `\\`.
      - Per official PostgreSQL documentation, no other characters (such as `$`, spaces, `@`, `#`, `%`) require escaping in `pgpass.conf`.
    - Ensure the line ends with a newline (`Enter`).
    - Save (`Ctrl+S`) and close Notepad.

    #### Approved Method 2: Masked Interactive PowerShell Prompt
    If appending via PowerShell without opening an editor, use masked interactive input, escape `:` and `\` according to PostgreSQL pgpass rules, and append with `-Append`:
    ```powershell
    # 1. Ensure directory and file exist with locked-down ACLs
    $pgpassDir = "$env:APPDATA\postgresql"
    if (-not (Test-Path $pgpassDir)) { New-Item -ItemType Directory -Path $pgpassDir -Force | Out-Null }
    $pgpassFile = "$pgpassDir\pgpass.conf"
    if (-not (Test-Path $pgpassFile)) { New-Item -ItemType File -Path $pgpassFile -Force | Out-Null }
    icacls $pgpassFile /inheritance:r /grant:r "$($env:USERNAME):(R,W)"

    # 2. Prompt for password without echoing characters to screen
    $securePass = Read-Host -Prompt "Enter Legacy Supabase DB Password (masked)" -AsSecureString
    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePass)
    $plainPass = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

    # 3. Escape PostgreSQL pgpass delimiters (: -> \: and \ -> \\)
    $escapedPass = $plainPass -replace '\\', '\\' -replace ':', '\:'

    # 4. Append to pgpass.conf without overwriting pre-existing entries (preserves trailing newline)
    Add-Content -Path $pgpassFile -Value "<legacy-pooler-host>:5432:postgres:postgres.gprtubirudzequpukzel:$escapedPass" -Encoding ascii
    $plainPass = $null
    $escapedPass = $null
    ```

- **Post-Execution Secure Credential Removal:**
  Immediately after `pg_dump` and verification tasks complete:
  - If `pgpass.conf` was created solely for this legacy task and contains no other entries:
    ```powershell
    Remove-Item -Path $pgpassFile -Force
    Write-Host "CLEANUP COMPLETE: Temporary pgpass.conf deleted."
    ```
  - If `pgpass.conf` contains pre-existing connection entries for other databases, open the file in `notepad.exe $pgpassFile`, manually delete only the `postgres.gprtubirudzequpukzel` line, and save. Do **not** run blanket deletion.
- **Secret Isolation Acknowledgment regarding Environment Variables:**
  - *Critical Security Reality:* Setting `$env:PGPASSWORD` in PowerShell is **not equivalent to secret isolation**.
  - Environment variables reside in the process environment block, are inherited by all child processes launched within the session, and remain readable in memory dumps, error reporting crashes, and by any process inspecting the session block.
  - While clearing `$env:PGPASSWORD` (`$env:PGPASSWORD = $null; Remove-Item Env:\PGPASSWORD`) removes the variable from future child processes, it does not sanitize previously allocated memory. Therefore, the restricted `pgpass.conf` file with immediate deletion is the approved, supported mechanism.
- **No Credentials Requested or Printed:**
  Neither this runbook nor any automated script shall request, retrieve, log, or display live database credentials.

---

### 2.3 Safeguard B: PostgreSQL Version Compatibility & Tool Selection
- **Mandatory Source Server Version Verification:**
  Before selecting or invoking local client tools (`pg_dump`, `pg_restore`), verify the exact PostgreSQL server version running on legacy `gprtubirudzequpukzel`.
  - **Method 1 (Supabase Dashboard):**
    Navigate to `https://supabase.com/dashboard/project/gprtubirudzequpukzel` $\rightarrow$ **Project Settings** $\rightarrow$ **Infrastructure** $\rightarrow$ inspect **PostgreSQL Version**.
  - **Method 2 (SQL Editor):**
    Run `SELECT version();` or `SHOW server_version;` in the legacy SQL Editor.
  - *Prohibition:* Do **not** assume PostgreSQL 15 (or any other version) without verified evidence from the live instance.
- **Client Tool Compatibility Rules:**
  - Standard PostgreSQL rule: The major version of `pg_dump` and `pg_restore` must be **greater than or equal to** the major version of the target database server:
    $$\text{MajorVersion}(\texttt{pg\_dump}) \ge \text{MajorVersion}(\text{PostgreSQL Server})$$
  - If legacy `gprtubirudzequpukzel` runs PostgreSQL 15.x, you must use `pg_dump` 15.x or 16.x. Invoking a PostgreSQL 14.x `pg_dump` against a PostgreSQL 15.x cluster will omit modern catalog definitions and risk dump failure.
  - Verify local tool version prior to execution:
    ```powershell
    pg_dump --version
    pg_restore --version
    ```
- **Version Mismatch Warnings and Safe Response:**
  - If `pg_dump` outputs a warning:
    `pg_dump: warning: server version: 15.x; pg_dump version: 14.x`
    or throws `aborting because of server version mismatch`:
  - **Safe Response:**
    1. **HALT IMMEDIATELY.** Do **not** pass `--ignore-version` or attempt to force completion.
    2. Older client tools lack knowledge of newer system catalog tables (`pg_catalog`), column types, and security attributes, which can result in silently incomplete backups.
    3. Update the local PostgreSQL client tools or use a container matching the server's major version before re-attempting the export.

---

### 2.4 Safeguard C1: Pre-Backup Source Baseline Row Count Audit (Manual Action — Do Not Run Now)
> [!IMPORTANT]
> **READ-ONLY SOURCE BASELINE PROCEDURE (LEGACY SUPABASE SQL EDITOR ONLY)**  
> **DO NOT EXECUTE AUTOMATICALLY.** This query is a manual preparation step to be executed strictly within the legacy Supabase Web SQL Editor (`https://supabase.com/dashboard/project/gprtubirudzequpukzel/sql/new`) **immediately before running `pg_dump`**. It does NOT mutate any data.

#### Exact Count vs. Statistical Estimates & Baseline Timing Limitations:
- **Limitation of `pg_stat_user_tables.n_live_tup`:** PostgreSQL's catalog view `pg_stat_user_tables.n_live_tup` provides approximate statistical estimates calculated during `ANALYZE` or `VACUUM`. On active, modified, or vacuum-pending tables, these estimates can deviate significantly from physical reality.
- **Timing & Concurrent Activity Caveat:**  
  The manual baseline count must be captured **immediately prior to invoking `pg_dump`**, preferably during off-peak hours or low network activity.  
  *Important Limitation:* In a live database where client connections remain active, exact `COUNT(*)` figures can change if new enquiries or records are inserted between the baseline query and the `pg_dump` snapshot transaction. This runbook does **not** disable writes, pause the database, or alter live server state. Therefore, minor discrepancies arising from concurrent activity must be investigated rather than assuming zero risk.
- **Authoritative Exact Count Method:** Execute an exact `COUNT(*)` across all 13 application tables in the `public` schema.

```sql
-- ============================================================================
-- ICE SPOT LEGACY SOURCE BASELINE ROW COUNT AUDIT (READ-ONLY)
-- Execute manually in legacy Supabase SQL Editor BEFORE running pg_dump.
-- Record the exact counts in: legacy_gprtubirudzequpukzel\source_baseline_counts.txt
-- ============================================================================
SELECT 'branches' AS table_name, count(*) AS row_count FROM public.branches
UNION ALL SELECT 'products', count(*) FROM public.products
UNION ALL SELECT 'profiles', count(*) FROM public.profiles
UNION ALL SELECT 'inventory', count(*) FROM public.inventory
UNION ALL SELECT 'orders', count(*) FROM public.orders
UNION ALL SELECT 'order_items', count(*) FROM public.order_items
UNION ALL SELECT 'dispatches', count(*) FROM public.dispatches
UNION ALL SELECT 'dispatch_orders', count(*) FROM public.dispatch_orders
UNION ALL SELECT 'dispatch_items', count(*) FROM public.dispatch_items
UNION ALL SELECT 'receipts', count(*) FROM public.receipts
UNION ALL SELECT 'receipt_items', count(*) FROM public.receipt_items
UNION ALL SELECT 'audit_logs', count(*) FROM public.audit_logs
UNION ALL SELECT 'enquiries', count(*) FROM public.enquiries
ORDER BY table_name;

-- Sequence Headroom Baseline:
-- Note: pg_sequences (PostgreSQL 10+) tracks sequence definition and last assigned value.
-- (ANSI information_schema.sequences lacks last_value; pg_sequences does not expose is_called).
-- Note: Sequence values only track monotonic counter states; they do NOT alone prove relational or transactional consistency.
SELECT sequencename AS sequence_name, last_value
FROM pg_sequences
WHERE schemaname = 'public'
ORDER BY sequencename;
```
- **Operator Action:** Copy and save the resulting table into a local file:  
  `C:\Users\jasim\Enterprise_Backups\IceSpot\legacy_gprtubirudzequpukzel\source_baseline_counts.txt`

---

### 2.5 Verified Connection Retrieval & Export Command Scoped to Application Schema
1. **Connection Details Retrieval (Supabase Dashboard):**
   - Log into [Supabase Dashboard](https://supabase.com/dashboard/project/gprtubirudzequpukzel).
   - Go to **Project Settings** $\rightarrow$ **Database** $\rightarrow$ **Connection parameters**.
   - Under **Connection string**, select **URI** $\rightarrow$ set Mode to **Session** (Port `5432`).
   - Retrieve: Host `<legacy-pooler-host>`, Port `5432`, User `postgres.gprtubirudzequpukzel`, Database `postgres`.
   - *Warning:* Do **not** use Transaction Mode (Port `6543`), which lacks session-level prepared statement support required by `pg_dump`.
2. **Designated Local Archive Directory (Outside Git Tree):**
   - The backup directory must reside strictly **outside** the application repository (`C:\Users\jasim\Web Project\Enterprises\Ice cream\Icespot`):
   - Target path: `C:\Users\jasim\Enterprise_Backups\IceSpot\legacy_gprtubirudzequpukzel\`
3. **Execution Command (Application Schema Only):**
   Using PostgreSQL Custom Archive format (`-F c`):
   ```powershell
   # Replace <TIMESTAMP> with the actual recorded execution timestamp (e.g., YYYYMMDD_HHMMSS)
   pg_dump `
     -h <legacy-pooler-host> `
     -p 5432 `
     -U postgres.gprtubirudzequpukzel `
     -d postgres `
     -n public `
     -F c `
     -b `
     -v `
     --no-owner `
     --no-privileges `
     -f "C:\Users\jasim\Enterprise_Backups\IceSpot\legacy_gprtubirudzequpukzel\icespot_legacy_public_archive_<TIMESTAMP>.dump"
   ```

---

### 2.6 Managed Auth Identity Scope & Privacy Safeguards
- **Application Data vs. Platform Identity Separation:**
  The `pg_dump` above is strictly scoped to `-n public` and captures all 13 application tables (`branches`, `products`, `profiles`, `inventory`, `orders`, `order_items`, `dispatches`, `dispatch_orders`, `dispatch_items`, `receipts`, `receipt_items`, `audit_logs`, `enquiries`).
- **Managed Auth Identity (`auth` schema):**
  - Managed Supabase Auth tables (`auth.users`, refresh tokens, identities) are platform-managed infrastructure.
  - **Mandatory Pre-Creation Purpose & Field Review:** Prior to generating any user export, the owner and client must review and approve the exact fields and specific legal/audit justification for retaining identity records.
  - **Strict Prohibition on Authentication Secrets:** Under no circumstances shall user passwords, password hashes (`encrypted_password`), access tokens, refresh tokens, session secrets, or service-role keys be exported, logged, or retained.
  - **Data Minimization Principle:** Personal data must be strictly restricted to the minimum required for the agreed 7-year historical retention purpose (e.g., internal user UUID `id`, `email`, `created_at`, `last_sign_in_at`). Extraneous personal identifiable information (PII) must be omitted.
  - **Supported Export Method:** Download a sanitized identity metadata report via [Supabase Dashboard $\rightarrow$ Authentication $\rightarrow$ Users $\rightarrow$ Export Users (CSV)](https://supabase.com/dashboard/project/gprtubirudzequpukzel/auth/users).
  - **Mandatory Encryption Before Transfer (No Standalone Unencrypted CSVs):** The identity metadata report must **never** be stored unencrypted on shared or network drives, nor uploaded as an unencrypted standalone `.csv` file to cloud storage. It must be encrypted using authenticated AES-256 (either bundled inside the encrypted archive package or encrypted alongside it with its own integrity tag) prior to transport.
  - **Prohibition on Independent Auth Restoration:** Never dump or restore the `auth` schema into another database cluster using `pg_restore`. Doing so breaks GoTrue platform constraints, causes foreign key recursion, and corrupts platform identity management. User synchronization to `ice_spot_dev` must be handled via authorized Admin Auth APIs or dedicated migration scripts.
  - **Planning Phase Restraint:** No user records shall be exported, viewed, or inspected during this planning phase.

---

### 2.7 Safeguard C2: Three Distinct Verification Levels & Four Approval Gates
Recoverability must be proven through three distinct, progressive verification levels governed by four explicit approval gates. No level or gate may be claimed as achieved without concrete, verifiable evidence:

| Verification Level | Technical Definition & Criteria | Evidence Required | Current Status |
| :--- | :--- | :--- | :--- |
| **Level 1: Export Completed** | `pg_dump` process exits cleanly with return code `0`; output file is written to disk without I/O truncation; file size is non-empty (`Length > 0`). | Process exit code `0`; non-empty `.dump` file on disk. | `[PENDING OWNER EXECUTION]` |
| **Level 2: Archive Verified** | Cryptographic integrity established; archive Table of Contents (TOC) parsed without block corruption; expected application objects verified. | Recorded SHA-256 hash; `pg_restore --list` output confirming presence of all 13 tables, sequences, indexes, and constraints. | `[PENDING LEVEL 1 COMPLETION]` |
| **Level 3: Restore Tested** | Raw archive restored into an isolated, disposable PostgreSQL container matching verified source version; relational integrity, row counts, sequences, and constraints audited. | Clean `pg_restore` execution in container; verification queries checking table counts, row counts, sequences, and catalog warnings. | `[PENDING LEVEL 2 COMPLETION]` |

#### End-to-End Backup Workflow & Approval Gates:
1. **Approval Gate 1 (Pre-Execution Authorization Gate):**
   - Confirm legacy connection parameters (`<legacy-pooler-host>`, port 5432, password).
   - Confirm local preflight checks: host disk encryption (BitLocker/FDE verified), NTFS ACLs applied, sufficient free disk space (minimum 3x estimated dump size), and confirmed availability of matching PostgreSQL client binaries (`pg_dump`, `pg_restore`) and isolated restore container tooling.
   - Confirm designated client-owned cloud storage provider, target private bucket/path, and transfer method.
   - Confirm separate key escrow location and authorized client contacts.
2. **Stage 1: Version & Source Baseline Capture:**
   - Execute read-only source baseline query in legacy Supabase SQL Editor immediately prior to `pg_dump` (Section 2.4).
   - Record exact table counts and sequence values in `source_baseline_counts.txt`.
3. **Stage 2: Restricted Credential Isolation:**
   - Configure `%APPDATA%\postgresql\pgpass.conf` with restricted Windows ACLs via Method 1 (Notepad manual paste).
4. **Stage 3: Level 1 Export:**
   - Run `pg_dump` to create raw archive: `icespot_legacy_public_archive_<TIMESTAMP>.dump`.
5. **Approval Gate 2 (Level 1 Export Verification Gate):**
   - Confirm exit code `0` and non-empty archive file on disk.
6. **Stage 4: Level 2 Archive Integrity & TOC Audit:**
   - Compute unencrypted SHA-256 checksum and audit Table of Contents using `pg_restore --list`.
7. **Stage 5: Level 3 Isolated Test Restore in Container:**
   - Replay raw `.dump` into an isolated, disposable PostgreSQL container matching source version.
   - Audit restored table counts and sequence headroom against `source_baseline_counts.txt`.
   - **Investigation of Discrepancies vs. Concurrent Activity:** In a live database where client connections remain active, if row counts differ between baseline and restore, the discrepancy must be investigated against transaction timestamps. **Do NOT treat unexplained row-count discrepancies as a successful verification.**
8. **Approval Gate 3 (Level 3 Parity & Integrity Verification Gate):**
   - Confirm row counts and sequence values match or discrepancies are fully explained by audited concurrent transactions.
   - Confirm zero catalog warnings or missing constraints.
9. **Stage 6: Artifact Consolidation Packaging & GnuPG Symmetric AES-256 Encryption:**
   - **Artifact Packaging:** Consolidate the verified raw database dump (`icespot_legacy_public_archive_<TIMESTAMP>.dump`), approved sanitized identity metadata (`users_export_sanitized.csv`), archive manifest (`archive_manifest.txt`), and source baseline counts (`source_baseline_counts.txt`) into a single uncompressed or compressed TAR archive: `icespot_legacy_archive_<TIMESTAMP>.tar`.
   - **GnuPG Symmetric AES-256 Encryption:** Encrypt the consolidated archive into `icespot_legacy_archive_<TIMESTAMP>.tar.gpg` using GnuPG symmetric encryption (`gpg --symmetric --cipher-algo AES256`).
   - **Precise Integrity Claim:** GnuPG symmetric encryption utilizes OpenPGP Modification Detection Code (MDC) packets (RFC 4880) to detect ciphertext tampering or truncation. (Note: Do not claim every GnuPG version provides AEAD; standard enterprise GnuPG 2.2.x uses MDC, while modern GnuPG 2.3+ can negotiate AEAD. Host version integrity behavior must be confirmed during preflight).
   - **Transmission Checksum:** Compute the SHA-256 hash of the final encrypted package (`checksum_encrypted_package.sha256`) for independent post-transfer verification.
   - **Controlled Pre-Transfer Test Decryption:** Perform a test decryption of `icespot_legacy_archive_<TIMESTAMP>.tar.gpg` to a temporary staging file (`test_decrypted_<TIMESTAMP>.tar`) using the escrowed passphrase, verify exit code 0, confirm MDC validation, verify its SHA-256 matches the original unencrypted `.tar`, and immediately remove `test_decrypted_<TIMESTAMP>.tar`.
10. **Stage 7: Decryption Key Escrow:**
    - Deliver the AES-256 decryption passphrase/key to the client's separate key management system.
11. **Stage 8: Secure Transfer to Client Cloud Storage:**
    - Transfer the encrypted package (`icespot_legacy_archive_<TIMESTAMP>.tar.gpg`), transmission checksum (`checksum_encrypted_package.sha256`), and unencrypted metadata manifest to client-owned private cloud storage.
12. **Approval Gate 4 (Client Acceptance & Governance Sign-Off Gate):**
    - Client independently verifies transmission checksums in cloud storage.
    - Client confirms separate key custody and signs formal archive acceptance manifest.
    - Formally record the **Retention Start Date** and set the **7-Year Expiry Review Date**.
13. **Stage 9: Staging Sanitization & Credential Cleanup:**
    - Delete temporary `pgpass.conf` entry.
    - Execute standard OS removal of local staging files on the encrypted volume only after Approval Gate 4 sign-off.

#### Level 2 Verification Procedure (Integrity & Table of Contents on Raw Dump):
```powershell
# 1. Record cryptographic SHA-256 checksum of raw archive
# (Note: SHA-256 provides unkeyed data integrity; it does NOT provide confidentiality or authenticated encryption)
Get-FileHash -Algorithm SHA256 "C:\Users\jasim\Enterprise_Backups\IceSpot\legacy_gprtubirudzequpukzel\icespot_legacy_public_archive_<TIMESTAMP>.dump" | Out-File "C:\Users\jasim\Enterprise_Backups\IceSpot\legacy_gprtubirudzequpukzel\checksum_unencrypted.sha256"

# 2. Extract and audit Table of Contents (TOC) without database connection
pg_restore --list "C:\Users\jasim\Enterprise_Backups\IceSpot\legacy_gprtubirudzequpukzel\icespot_legacy_public_archive_<TIMESTAMP>.dump" > "C:\Users\jasim\Enterprise_Backups\IceSpot\legacy_gprtubirudzequpukzel\archive_toc.txt"

# 3. Verify presence of expected core relations in TOC:
Select-String -Path "C:\Users\jasim\Enterprise_Backups\IceSpot\legacy_gprtubirudzequpukzel\archive_toc.txt" -Pattern "TABLE DATA public (branches|products|orders|dispatches|inventory)"
```

#### Level 3 Verification Procedure (Isolated Disposable Restore Test):
```bash
# 1. Start a disposable PostgreSQL container matching verified source major version (e.g., :<verified_version>)
docker run --name pg-legacy-verify -e POSTGRES_PASSWORD=verifytest -p 5433:5432 -d postgres:<verified_version>

# 2. Replay unencrypted archive into isolated container
pg_restore --no-owner --no-privileges -h localhost -p 5433 -U postgres -d postgres -v "C:\Users\jasim\Enterprise_Backups\IceSpot\legacy_gprtubirudzequpukzel\icespot_legacy_public_archive_<TIMESTAMP>.dump"

# 3. Audit restored schema, exact row counts, sequences, and constraints:
docker exec -it pg-legacy-verify psql -U postgres -d postgres -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"

# Exact row count query matching the source baseline (do NOT use approximate n_live_tup):
docker exec -it pg-legacy-verify psql -U postgres -d postgres -c "
SELECT 'branches' AS table_name, count(*) AS row_count FROM public.branches
UNION ALL SELECT 'products', count(*) FROM public.products
UNION ALL SELECT 'profiles', count(*) FROM public.profiles
UNION ALL SELECT 'inventory', count(*) FROM public.inventory
UNION ALL SELECT 'orders', count(*) FROM public.orders
UNION ALL SELECT 'order_items', count(*) FROM public.order_items
UNION ALL SELECT 'dispatches', count(*) FROM public.dispatches
UNION ALL SELECT 'dispatch_orders', count(*) FROM public.dispatch_orders
UNION ALL SELECT 'dispatch_items', count(*) FROM public.dispatch_items
UNION ALL SELECT 'receipts', count(*) FROM public.receipts
UNION ALL SELECT 'receipt_items', count(*) FROM public.receipt_items
UNION ALL SELECT 'audit_logs', count(*) FROM public.audit_logs
UNION ALL SELECT 'enquiries', count(*) FROM public.enquiries
ORDER BY table_name;
"

# Validate that output matches source_baseline_counts.txt:
docker exec -it pg-legacy-verify psql -U postgres -d postgres -c "SELECT sequencename AS sequence_name, last_value FROM pg_sequences WHERE schemaname = 'public' ORDER BY sequencename;"

# 4. Tear down disposable test container immediately
docker stop pg-legacy-verify && docker rm pg-legacy-verify
```

#### Important Limitations on Verification Claims:
- **Archive Inspection vs. Recoverability:** Parsing the TOC (`pg_restore --list`) confirms that the archive file is syntactically readable and internally uncorrupted. However, **archive inspection alone does not prove recoverability**, because it does not test constraint satisfaction, foreign key dependencies, or type reconstitution inside a live database engine.
- **Isolated Restore vs. Zero Risk:** Successfully completing a Level 3 test restore demonstrates that the database objects can be recreated in standard PostgreSQL. However, **an isolated test restore does not guarantee zero risk**. Residual risks remain, including undetected application-level data anomalies, latent logic bugs in legacy transactions, differences between local container configurations and managed cloud extensions, and unobserved data dependencies.
- **Cryptographic Hash vs. Encryption:** Recording a SHA-256 hash confirms unkeyed bit-level integrity, but does **not** provide confidentiality or authenticated encryption.
- **No Premature Verification Claims:** No verification level shall be recorded as passed until actual command execution yields verifiable output.

---

### 2.8 Safeguard D: Storage, Access Controls, Authenticated Encryption, and Governance (Approved Owner Policy)

The legacy database archive governance policies for `gprtubirudzequpukzel` have been established and approved by the owner. These policies govern the long-term retention period, storage custody, authenticated encryption standards, local staging security, and expiry review procedure:

#### 1. Approved Retention Policy: 7 Years
- **Approved Duration:** 7 years from the formal retention start date.
- **Retention Start Event:** Retention begins from a clearly defined, recorded milestone—specifically the documented date of formal client handover or another explicitly recorded retention start date (`[HANDOVER / RETENTION START DATE: PENDING FORMAL RECORDING AT EXECUTION]`).
- **No Fabricated Dates:** The formal handover date, archive creation date, and resulting expiry date must not be fabricated. They must be explicitly calculated and recorded in the archive acceptance manifest at the time the backup is executed and accepted:
  $$\text{Scheduled Expiry Date} = \text{Formal Retention Start Date} + 7\text{ years}$$
- **Statutory, Legal, and Contractual Overrides:** While the baseline owner policy is 7 years, any prevailing statutory tax/accounting obligations, contractual covenants, formal legal holds, or unresolved commercial disputes supersede this period and may require an extended retention timeframe.
- **Mandatory Recording at Acceptance:** When the backup is executed and accepted, the exact retention start date and calculated expiry date must be formally recorded in `archive_metadata.json` / `archive_manifest.txt` within the destination storage repository.

#### 2. Approved Storage Policy: Client-Owned Private Cloud Storage
- **Custody Boundary:** The final long-term archive must reside exclusively in **client-owned private cloud storage**.
- **Prohibition on Local or Repository Storage:** Storing the sole surviving copy of the legacy archive on a developer laptop, local workstation disk, or within the application Git repository is strictly prohibited. The local directory (`C:\Users\jasim\Enterprise_Backups\IceSpot\legacy_gprtubirudzequpukzel\`) serves only as a temporary staging location during initial export, checksum validation, test restoration, and encryption.
- **Pre-Execution Setup Requirements:** Prior to backup execution and transfer, the client and project owner must confirm and document:
  - Designated cloud storage provider: `[CLIENT-OWNED CLOUD PROVIDER: PENDING CLIENT DESIGNATION]` (e.g., AWS S3, Google Cloud Storage, Azure Blob Storage).
  - Target storage bucket/path: `[TARGET STORAGE PATH: PENDING CLIENT DESIGNATION]`.
  - Authorized client account and administrative owners: `[CLIENT ADMINISTRATIVE CONTACT: PENDING CLIENT DESIGNATION]`.
  - Authorized access protocol and transfer method: `[TRANSFER METHOD: PENDING CONFIRMATION]`.
- **Access Controls & Ownership Handover:**
  - Storage must enforce private access by default (public read/write disabled).
  - Least-privilege IAM policies must restrict access strictly to designated client administrators.
  - Multi-factor authentication (MFA) must be enforced on all accounts with administrative or read access to the archive storage.
  - A formal, documented ownership handover must accompany the archive delivery, recording transfer timestamp, receiving contact, and custodial acknowledgment.
- **Independent Post-Transfer Verification:** Upon transfer, the client must independently compute and verify the SHA-256 hash of the uploaded object in cloud storage against the recorded manifest before staging cleanup is authorized.

#### 3. Approved Encryption & Key Management Policy (GnuPG Symmetric AES-256)
- **Removal of Unsupported OpenSSL AEAD & Ad-Hoc Scripts:**
  OpenSSL's standard `enc` CLI does not support AEAD ciphers (`enc: AEAD ciphers not supported`). Furthermore, custom Encrypt-then-MAC scripts introduce implementation complexity and timing risks. Consequently, OpenSSL AEAD and ad-hoc scripts are rejected as executable recommendations.
- **Proposed Encryption Workflow: GnuPG Symmetric AES-256:**
  The approved archive-encryption workflow employs standard GnuPG symmetric encryption (`gpg --symmetric --cipher-algo AES256`).
- **Precise Integrity-Protection Behavior & Implementation Claim:**
  - **OpenPGP MDC (Modification Detection Code):** Standard GnuPG 2.2.x symmetric encryption protects integrity using OpenPGP Modification Detection Code (MDC) packets per RFC 4880. An MDC packet contains a SHA-1 digest calculated over the plaintext and encapsulated within the cipher stream. If ciphertext is altered, bit-flipped, or truncated, GnuPG detects the modification during decryption and outputs an explicit MDC error.
  - **No Blanket AEAD Claim:** *The runbook does NOT claim that every GnuPG version or configuration provides AEAD protection.* While modern GnuPG 2.3+ supports AEAD (OCB/EAX per RFC 4880bis / RFC 9580), standard enterprise builds rely on MDC.
  - **Mandatory Preflight Confirmation:** The exact GnuPG version and its documented integrity behavior must be confirmed on the executing workstation before backup execution:
    `[GNUPG VERSION & INTEGRITY MECHANISM: PENDING TECHNICAL CONFIRMATION AT PREFLIGHT]`.
    If the selected GnuPG version's integrity behavior cannot be established confidently, the workflow must be marked as awaiting technical confirmation rather than claimed as secure.
- **Pre-Encryption Packaging Requirement:**
  Before encryption, the verified database dump (`.dump`), approved sanitized identity metadata (`users_export_sanitized.csv`), manifest, and baseline counts must be packaged together into a single consolidated archive (`icespot_legacy_archive_<TIMESTAMP>.tar`). The entire package is then encrypted into `icespot_legacy_archive_<TIMESTAMP>.tar.gpg` so that database data and identity metadata are cryptographically bound and cannot be transferred or inspected unencrypted.
- **Clear Distinction on SHA-256 Checksums:**
  A SHA-256 checksum provides unkeyed bit-level integrity detection against transmission corruption or bit-rot. **A SHA-256 checksum is NOT authenticated encryption and provides zero confidentiality.** The final encrypted package hash (`checksum_encrypted_package.sha256`) is recorded solely for independent verification by the client after cloud transfer.
- **Controlled Pre-Transfer Test Decryption Procedure:**
  Before initiating cloud transfer, key recovery and integrity validation must be tested in a controlled local dry run:
  1. Decrypt `icespot_legacy_archive_<TIMESTAMP>.tar.gpg` to a temporary staging file (`test_decrypted_<TIMESTAMP>.tar`) using the escrowed passphrase.
  2. Verify that GnuPG exits with code `0` and confirms valid MDC/integrity status without warnings.
  3. Compute the SHA-256 hash of `test_decrypted_<TIMESTAMP>.tar` and confirm it matches the pre-encryption `.tar` checksum exactly.
  4. Immediately remove `test_decrypted_<TIMESTAMP>.tar`.
- **Multi-Tier Protection & Key Custody:**
  - **At-Rest Cloud Storage Encryption:** The destination client-owned cloud bucket must enforce server-side encryption at rest (SSE-KMS or customer-managed AES-256).
  - **Separate Decryption Key Custody:** Decryption passphrases/keys must be stored and managed **completely separately** from the encrypted archive file in a dedicated client key vault or enterprise password manager.
  - **Prohibition on Secret Exposure:** Decryption keys, passphrases, database credentials, and service-role keys must **never** be committed to Git, embedded in runbooks, placed in shell histories, or output to terminal logs.
- **Phase Constraint Note:** No encryption tools are chosen, installed, or executed, and no keys or passphrases are generated during this documentation phase.

#### 4. Approved Expiry & Destruction Policy: Formal Review & Explicit Authorization
- **No Automatic Deletion:** The legacy archive shall **not** be automatically deleted, purged by automated lifecycle scripts, or destroyed upon reaching the 7-year mark.
- **Scheduled Expiry Review Placeholder:** `[SCHEDULED EXPIRY REVIEW DATE: FORMAL RETENTION START DATE + 7 YEARS]` (Exact calendar date to be established when the retention start date is formally recorded upon archive acceptance).
- **Mandatory Expiry Review Process:** Upon reaching the 7-year expiry milestone, a formal review must be conducted. Permanent deletion requires explicit, written authorization from the business owner / client.
- **Pre-Deletion Audit Requirements:** Prior to authorizing deletion, the review must verify:
  1. No active legal holds, regulatory inquiries, or ongoing forensic audits exist.
  2. All statutory accounting, corporate, and tax retention obligations have been satisfied.
  3. No pending commercial disputes, unresolved warranty claims, or contractual retention covenants apply.
  4. Explicit, written client sign-off is obtained.
  5. Any required secondary archives or summaries have been verified if permanent purging is mandated.
- **Post-Authorization Destruction Documentation:** When an authorized deletion occurs, the execution team must record and archive a formal destruction manifest:
  - Exact deletion scope (file names, object versions, hashes).
  - Name and role of authorizing official.
  - Date and time of destruction.
  - Technical confirmation of authorized deletion from cloud storage (e.g. cloud storage audit logs or lifecycle deletion confirmation).

#### 5. Local Staging Security, Full-Disk Encryption, and Storage Cleanup Reality
- **Modern SSD/NVMe Storage Reality & No Software Erasure Guarantees:**
  > [!WARNING]
  > **Software deletion commands (`Remove-Item`), file overwriting, or multi-pass "shredding" tools CANNOT guarantee the destruction of physical flash remnants on modern SSDs or NVMe drives.**  
  > Modern flash storage controllers employ wear-leveling algorithms, Flash Translation Layers (FTL), and over-provisioned blocks. When an OS attempts to overwrite a file, the controller writes new data to fresh physical NAND blocks while marking the previous physical blocks as stale (awaiting background TRIM and garbage collection). Therefore, this runbook does **not** guarantee or claim reliable physical secure erasure of SSD physical remnants via software wiping.
- **Role and Limitations of Full-Disk Encryption (FDE):**
  - **Protection at Rest:** Full-Disk Encryption (BitLocker on Windows, FileVault on macOS, LUKS on Linux) is the primary cryptographic safeguard for data at rest. When temporary staging files are deleted on an FDE-encrypted volume, unallocated flash blocks remain encrypted under the volume master key, rendering physical NAND remnants unreadable if the drive is powered down, extracted, or stolen.
  - **Critical Limitation on Live Workstations:** *Full-disk encryption protects data at rest when the system is powered off or locked, subject to correct key management and device configuration. However, FDE does NOT make a live, unlocked workstation safe from compromise.* Running malicious processes, unauthorized local administrative sessions, or live memory inspection can access plaintext data while the volume is unlocked.
- **Mandatory Preflight Checks on Staging Host:**
  Prior to initiating `pg_dump` or handling staging files, the execution host must satisfy four preflight security requirements:
  1. **Full-Disk Encryption (FDE) Verification:** Verify that the host volume hosting the staging directory is actively encrypted with BitLocker or equivalent FDE. Do not assume FDE is active without independent verification.
  2. **Restrictive File Access Controls (ACLs):** Apply strict inheritance removal (`icacls`) restricting permissions exclusively to the current executing administrator account before creating dump files. Note that NTFS ACLs protect against unauthorized local users during OS execution, but ACLs alone do not protect data if the physical drive or workstation is lost or extracted.
  3. **Storage Capacity Verification:** Verify sufficient local free disk space (minimum 3x estimated dump size) to accommodate the raw `.dump`, consolidated `.tar`, encrypted `.tar.gpg`, container volume, and temporary dry-run test decryption artifacts.
  4. **Workstation Access Controls:** Ensure the workstation is physically secured, has active screen lock policies, and is operating in an authorized administrative session.
- **Tooling Availability Preflight:** Docker, PostgreSQL client binaries (`pg_dump`, `pg_restore`), and GnuPG utilities cannot be claimed as available without independent preflight verification on the execution host.
- **Minimized Staging Duration & Documented Cleanup Procedure:**
  Staging files (`.dump`, `.tar`, `.tar.gpg`) must be retained only as long as strictly necessary to complete verification and transfer. Staging files must be removed exclusively under the approved cleanup procedure after Approval Gate 4 (Client Acceptance Sign-Off) is formally completed:
```powershell
$backupPath = "C:\Users\jasim\Enterprise_Backups\IceSpot\legacy_gprtubirudzequpukzel"
if (Test-Path $backupPath) {
    $acl = Get-Acl $backupPath
    $acl.SetAccessRuleProtection($true, $false)
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule([System.Security.Principal.WindowsIdentity]::GetCurrent().Name, "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")
    $acl.AddAccessRule($rule)
    Set-Acl $backupPath $acl
}
```

---

### 2.9 Target Environment Verification (`ice_spot_dev`)
Ensure `.env.local` strictly points to the target application database:
```ini
NEXT_PUBLIC_SUPABASE_URL=https://punyeqlotfnvxhhugtud.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_p...
```
*(Confirm that zero local environment variables reference legacy project `gprtubirudzequpukzel`).*

---

## 3. SUMMARY OF DATABASE OBJECTS APPLIED

The recovery migration applies the following database objects:

| Object Type | Name / Scope | Description & Impact |
| :--- | :--- | :--- |
| **Enums** | `branch_category`, `app_role` (confirmed live enum), `order_status`, `dispatch_status`, `receipt_status` | Standardizes domain state values across PostgreSQL and TypeScript. |
| **Sequences** | `orders_order_number_seq` (start 10001), `dispatches_dispatch_number_seq` (start 1001) | Provides safe, monotonic numeric BigInt order and dispatch numbers with explicit column defaults. |
| **Table** | `public.dispatch_orders` | Junction table enabling dispatches to support multiple orders/stops while maintaining referential integrity. |
| **Table** | `public.enquiries` | Persistent storage for customer and franchise web inquiries. |
| **Constraints** | `inventory_location_product_unique` on `(branch_id, product_id) NULLS NOT DISTINCT`, `profiles_branch_id_fkey` | Enforces data integrity and prevents duplicate stock rows without redundant indexes. |
| **Seed Data** | **17 Outlets** | Seeds the 17 network branches with unique codes (`BR-VRV-001` to `BR-CUS-017`) and verified categories. |
| **Seed Data** | **10 Products** | Seeds the 10 legacy signature fruit sticks with unique SKUs (`SKU-STK-001` to `SKU-STK-010`). |
| **Seed Data** | **3 Profiles** | Preserves Super Admin (`2236f15a-...`), links Branch Admin (`99fce41f-...`) to Ollur UUID, provisions Delivery Staff (`cb3c5a34-...`). |
| **Grants & RLS** | All 13 operational tables | Grants `SELECT`, `INSERT`, `UPDATE` to `authenticated` with strict row-level security policies enforcing least privilege and branch isolation. |
| **RPC Functions** | `rpc_create_order` | Atomic creation of order and order items with validation. |
| **RPC Functions** | `rpc_approve_order` | Super Admin atomic order approval and item locking. |
| **RPC Functions** | `rpc_adjust_inventory` | Atomic inventory quantity adjustment with non-negativity constraint. |
| **RPC Functions** | `rpc_create_dispatch` | Atomic dispatch creation with multiple order linkage and status batching. |
| **RPC Functions** | `rpc_update_delivery_stop` | Delivery staff stop confirmation, delivered quantity recording, and shortage notes. |
| **RPC Functions** | `rpc_confirm_receipt` | Branch admin physical receipt confirmation and discrepancy recording. |

---

> [!CAUTION]
> # CRITICAL ENVIRONMENT BOUNDARY & PROHIBITION
> **DO NOT EXECUTE SECTIONS 4–7 AGAINST THE LEGACY PROJECT (`gprtubirudzequpukzel`)**
> 
> - **Archival Task Boundary:** This runbook contains historical recovery and deployment references from October 22, 2026. The procedures in Sections 4, 5, 6, and 7 are **NOT** part of the legacy database backup or archival task.
> - **Strict Prohibition on Legacy Execution:** Under **NO** circumstances should recovery migrations (`supabase/migrations/20261022000004_recovery_schema_and_seed.sql`), post-check verification scripts, CLI pushes, or frontend deployments be executed against the legacy project `gprtubirudzequpukzel`. The legacy database must remain completely un-mutated.
> - **Target Application Separation:** When application deployment or migration cutover is formally authorized by the owner in a subsequent phase, it applies strictly and exclusively to the modern target database **`ice_spot_dev` (`punyeqlotfnvxhhugtud`)**.

---

## 4. STEP-BY-STEP DEPLOYMENT EXECUTION (TARGET RECOVERY DEPLOYMENT REFERENCE ONLY)

### Method A: Via Supabase Web SQL Editor (Recommended for Target Application Database Only)
> [!CAUTION]
> **TARGET PROJECT ONLY — NEVER EXECUTE AGAINST LEGACY `gprtubirudzequpukzel`**  
> This deployment step applies strictly to the target application database (`ice_spot_dev`). Do NOT execute recovery migrations, schema changes, or seed scripts against the legacy archival project `gprtubirudzequpukzel`.

1. Open the **SQL Editor** in the Supabase Dashboard for the **TARGET project (`ice_spot_dev`)**:  
   `https://supabase.com/dashboard/project/punyeqlotfnvxhhugtud/sql/new`  
   *(Confirm that the active project in the Dashboard breadcrumb displays `ice_spot_dev`, reference: `punyeqlotfnvxhhugtud`).*
2. Open [supabase/migrations/20261022000004_recovery_schema_and_seed.sql](file:///c:/Users/jasim/Web%20Project/Enterprises/Ice%20cream/Icespot/supabase/migrations/20261022000004_recovery_schema_and_seed.sql) in your local editor.
3. Copy the entire file contents and paste them into the Supabase SQL Editor.
4. Click **Run** (Ctrl + Enter / Cmd + Enter).
5. Confirm that the execution status reports: `Success. No rows returned` (or notice messages).

### Method B: Via Supabase CLI (Optional / Staging Only)
```bash
# Push migration file directly using linked Supabase CLI project:
npx supabase db push
```

---

## 5. POST-DEPLOYMENT VERIFICATION PROCEDURE

Immediately after applying the migration, execute the verification script:

1. In the Supabase SQL Editor, paste the contents of [supabase/verification_script.sql](file:///c:/Users/jasim/Web%20Project/Enterprises/Ice%20cream/Icespot/supabase/verification_script.sql).
2. Click **Run**.
3. Inspect the execution output in the Messages panel. You must see:
   ```
   NOTICE: PASS: All 13 application tables exist in public schema.
   NOTICE: PASS: Verified 17 branches seeded (expected at least 17).
   NOTICE: PASS: Verified 10 products seeded (expected at least 10).
   NOTICE: PASS: Super Admin profile verified: 2236f15a-bba8-48ba-bd23-764380fb7cba (Role: super_admin)
   NOTICE: PASS: Branch Admin profile verified: 99fce41f-a636-419f-855d-9f23db4769fb linked to Ollur branch UUID: <UUID>
   NOTICE: PASS: Delivery Staff profile verified: cb3c5a34-ce3b-4a53-ae6e-7a18ff6f4f43 (Role: delivery_staff)
   NOTICE: PASS: Order and Dispatch sequences verified.
   NOTICE: PASS: All 6 atomic transactional RPC functions exist.
   NOTICE: PASS: Row Level Security (RLS) is active across all 13 tables.
   NOTICE: PASS: Inventory uniqueness index verified (prevents duplicate stock rows).
   NOTICE: PASS: Verified enum app_role exists in public schema.
   NOTICE: PASS: Sequence defaults verified for orders and dispatches.
   NOTICE: ICESPOT POST-RECOVERY VERIFICATION COMPLETE
   ```

---

## 6. APPLICATION DEPLOYMENT & SMOKE TESTING

Once the database migration and verification pass:

### 6.1 Deploy Application Build
```bash
# 1. Ensure clean TypeScript check
npx tsc --noEmit

# 2. Run automated test suite
npm test

# 3. Clean production build
npm run build

# 4. Deploy to Vercel / Production host
vercel --prod  # Or git push to deployment branch
```

### 6.2 Smoke Test Role Authentication & Actions
1. **Super Admin Login:**
   - Log into `/admin` as `icespotvaravoor@gmail.com`.
   - Verify redirect to `/admin/super-admin`.
   - Verify all 17 branches display in the Network Operations section.
   - Adjust stock on Sweet Strawberry (+10 crates); verify persistent update in `public.inventory`.
2. **Branch Admin Login:**
   - Log into `/admin` as `icespotthrissur@gmail.com`.
   - Verify redirect to `/admin/branch`.
   - Confirm parlour title displays `Franchise Parlour • Ice Spot Ollur`.
   - Place a weekly replenishment order; verify order number is generated monotonically.
3. **Delivery Staff Login:**
   - Log into `/admin` as `icespotstaff@gmail.com`.
   - Verify redirect to `/admin/delivery`.
   - Confirm active dispatches load; record a delivery stop with quantities.

---

## 7. ROLLBACK & RECOVERY PROCEDURE

If an operational anomaly or issue occurs during or after deployment:

### 7.1 Understanding Migration Reversibility Limitations
> [!IMPORTANT]
> **Additive migrations are NOT automatically "fully reversible" without data consequences.**  
> While the schema changes are additive, once live traffic begins, transactions will be generated:
> - Monotonic sequence counters (`orders_order_number_seq`, `dispatches_dispatch_number_seq`) advance and cannot be decremented without risking future key collisions.
> - New dispatches will populate the `dispatch_orders` junction table. Reverting code to the legacy single-order schema would orphan multi-order stops.
> - Seeded branch, product, and inventory rows may accumulate live order references.
> 
> Therefore, do NOT assume that restoring a pre-deployment snapshot is harmless: any new orders, dispatches, or adjustments created between migration and rollback will be permanently lost.

### 7.2 Safety-First Application Rollback
If an operational issue arises immediately after deploying the frontend, application rollback is the fastest mitigation while keeping database data intact:

1. **Revert Frontend Deployment:**
   ```bash
   git revert HEAD --no-edit
   npm run build
   # Redeploy previous stable release
   ```
2. The legacy application code can continue reading and writing to base tables because existing columns (`dispatches.order_id`, existing foreign keys, etc.) remain intact and functional.

### 7.3 Non-Destructive Database Mitigation
> [!CAUTION]
> **Never blindly delete production data or drop tables to roll back.**  
> Running `DROP TABLE ... CASCADE` or `DELETE` statements in production destroys transaction history, delivery records, and breaks referential integrity.

If an issue is traced to an RPC function or policy rather than the frontend:
1. **Temporarily Revoke Privileged Execution (Safest Immediate Circuit-Breaker):**
   ```sql
   -- Instantly disable new RPC calls without dropping functions or losing data:
   REVOKE EXECUTE ON FUNCTION public.rpc_create_order(UUID, DATE, TEXT, JSONB) FROM authenticated;
   REVOKE EXECUTE ON FUNCTION public.rpc_approve_order(UUID, JSONB, TEXT) FROM authenticated;
   REVOKE EXECUTE ON FUNCTION public.rpc_adjust_inventory(UUID, UUID, NUMERIC, TEXT) FROM authenticated;
   REVOKE EXECUTE ON FUNCTION public.rpc_create_dispatch(UUID[], UUID, TEXT, JSONB) FROM authenticated;
   REVOKE EXECUTE ON FUNCTION public.rpc_update_delivery_stop(UUID, UUID, TEXT, TEXT, JSONB) FROM authenticated;
   REVOKE EXECUTE ON FUNCTION public.rpc_confirm_receipt(UUID, UUID, TEXT, TEXT, JSONB) FROM authenticated;
   ```
2. **Point-in-Time Recovery (PITR) / Snapshot Restoration:**
   If catastrophic data corruption occurred prior to intervention:
   - Restore the pre-migration logical backup (`pre_recovery_backup_20261022.sql`) created in Section 2.1 to a staging instance to verify integrity.
   - Or utilize Supabase Dashboard **Database** → **Backups** to restore the verified pre-deployment snapshot.
   - Do NOT attempt manual ad-hoc dropping of tables or truncation of rows in production.
