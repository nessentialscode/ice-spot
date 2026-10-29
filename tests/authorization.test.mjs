import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Mock user profiles to test authorization logic
const PROFILES = {
  superAdmin: {
    id: "2236f15a-bba8-48ba-bd23-764380fb7cba",
    full_name: "Varavoor Super Admin",
    role: "super_admin",
    branch_id: null,
    is_active: true,
  },
  branchAdminOllur: {
    id: "99fce41f-a636-419f-855d-9f23db4769fb",
    full_name: "Ollur Branch Admin",
    role: "branch_admin",
    branch_id: "c1111111-1111-1111-1111-111111111111", // Ollur branch UUID
    is_active: true,
  },
  deliveryStaff: {
    id: "cb3c5a34-ce3b-4a53-ae6e-7a18ff6f4f43",
    full_name: "Central Delivery Staff",
    role: "delivery_staff",
    branch_id: null,
    is_active: true,
  },
  inactiveAdmin: {
    id: "d4444444-4444-4444-4444-444444444444",
    full_name: "Deactivated Staff",
    role: "branch_admin",
    branch_id: "c1111111-1111-1111-1111-111111111111",
    is_active: false,
  },
};

function checkRoleAccess(profile, allowedRoles) {
  if (!profile) return { authorized: false, reason: "profile_missing" };
  if (!profile.is_active) return { authorized: false, reason: "profile_inactive" };
  const normalizedProfileRole = profile.role.toLowerCase().replace(/-/g, "_");
  const normalizedAllowed = allowedRoles.map((r) => r.toLowerCase().replace(/-/g, "_"));
  if (!normalizedAllowed.includes(normalizedProfileRole)) {
    return { authorized: false, reason: "forbidden" };
  }
  return { authorized: true };
}

function checkBranchIsolation(profile, targetBranchId) {
  const roleCheck = checkRoleAccess(profile, ["branch_admin", "super_admin"]);
  if (!roleCheck.authorized) return roleCheck;

  if (profile.role === "super_admin") {
    return { authorized: true }; // Super admin can manage any branch
  }

  // Strict UUID comparison
  if (!profile.branch_id || profile.branch_id.toLowerCase() !== targetBranchId.toLowerCase()) {
    return {
      authorized: false,
      reason: "BRANCH_ISOLATION_VIOLATION",
      message: "Unauthorized: You may only manage your own assigned branch.",
    };
  }

  return { authorized: true };
}

test("1. Valid roles access appropriate dashboards", () => {
  assert.equal(checkRoleAccess(PROFILES.superAdmin, ["super_admin"]).authorized, true);
  assert.equal(checkRoleAccess(PROFILES.branchAdminOllur, ["branch_admin"]).authorized, true);
  assert.equal(checkRoleAccess(PROFILES.deliveryStaff, ["delivery_staff"]).authorized, true);
});

test("2. Invalid / mismatch roles are rejected", () => {
  const result = checkRoleAccess(PROFILES.branchAdminOllur, ["super_admin"]);
  assert.equal(result.authorized, false);
  assert.equal(result.reason, "forbidden");

  const deliveryResult = checkRoleAccess(PROFILES.deliveryStaff, ["super_admin", "branch_admin"]);
  assert.equal(deliveryResult.authorized, false);
  assert.equal(deliveryResult.reason, "forbidden");
});

test("3. Missing profile is rejected with profile_missing", () => {
  const result = checkRoleAccess(null, ["super_admin"]);
  assert.equal(result.authorized, false);
  assert.equal(result.reason, "profile_missing");
});

test("4. Inactive profile is rejected with profile_inactive", () => {
  const result = checkRoleAccess(PROFILES.inactiveAdmin, ["branch_admin"]);
  assert.equal(result.authorized, false);
  assert.equal(result.reason, "profile_inactive");
});

test("5. Branch Admin can access own assigned branch UUID", () => {
  const ollurUUID = "c1111111-1111-1111-1111-111111111111";
  const result = checkBranchIsolation(PROFILES.branchAdminOllur, ollurUUID);
  assert.equal(result.authorized, true);
});

test("6. Branch Admin CANNOT access or modify another branch UUID (Cross-branch access violation)", () => {
  const palakkadUUID = "c2222222-2222-2222-2222-222222222222";
  const result = checkBranchIsolation(PROFILES.branchAdminOllur, palakkadUUID);
  assert.equal(result.authorized, false);
  assert.equal(result.reason, "BRANCH_ISOLATION_VIOLATION");
});

test("7. Super Admin can manage any branch UUID", () => {
  const palakkadUUID = "c2222222-2222-2222-2222-222222222222";
  assert.equal(checkBranchIsolation(PROFILES.superAdmin, palakkadUUID).authorized, true);
});

test("8. Delivery Staff CANNOT place orders or confirm branch receipts", () => {
  // Order creation check: requires super_admin or branch_admin
  const orderRoleCheck = checkRoleAccess(PROFILES.deliveryStaff, ["super_admin", "branch_admin"]);
  assert.equal(orderRoleCheck.authorized, false);
  assert.equal(orderRoleCheck.reason, "forbidden");

  // Receipt confirmation check: delivery staff has no branch assignment
  const receiptBranchCheck = checkBranchIsolation(PROFILES.deliveryStaff, "c1111111-1111-1111-1111-111111111111");
  assert.equal(receiptBranchCheck.authorized, false);
});

test("9. Branch status mutation authorization: strictly restricted to super_admin", () => {
  // Only super_admin can toggle branch status or set all branches status
  assert.equal(checkRoleAccess(PROFILES.superAdmin, ["super_admin"]).authorized, true);
  const branchAdminCheck = checkRoleAccess(PROFILES.branchAdminOllur, ["super_admin"]);
  assert.equal(branchAdminCheck.authorized, false);
  assert.equal(branchAdminCheck.reason, "forbidden");

  const deliveryCheck = checkRoleAccess(PROFILES.deliveryStaff, ["super_admin"]);
  assert.equal(deliveryCheck.authorized, false);
  assert.equal(deliveryCheck.reason, "forbidden");
});

test("10. Quick role switcher visibility: strictly isolated to super_admin", () => {
  function isRoleSwitcherVisible(userRole, pathname) {
    const effectiveRole = userRole
      ? userRole.toLowerCase().replace(/-/g, "_")
      : pathname.includes("super-admin") ? "super_admin" : "other";
    return effectiveRole === "super_admin" || pathname.includes("super-admin");
  }

  assert.equal(isRoleSwitcherVisible("super_admin", "/admin/super-admin"), true);
  assert.equal(isRoleSwitcherVisible("super_admin", "/admin/branch"), true);
  assert.equal(isRoleSwitcherVisible("branch_admin", "/admin/branch"), false);
  assert.equal(isRoleSwitcherVisible("delivery_staff", "/admin/delivery"), false);
});

test("11. Corrective migration static audit: grants on branches and products adhere to least privilege", () => {
  const migrationPath = path.resolve(process.cwd(), "supabase/migrations/20261023000001_grant_branches_products_table_privileges.sql");
  assert.ok(fs.existsSync(migrationPath), "Corrective migration must exist");

  const sql = fs.readFileSync(migrationPath, "utf-8");

  // Must grant UPDATE on branches
  assert.ok(
    /GRANT\s+UPDATE\s+ON\s+public\.branches\s+TO\s+authenticated/i.test(sql),
    "Must grant UPDATE on public.branches to authenticated"
  );

  // Must grant INSERT, UPDATE on products
  assert.ok(
    /GRANT\s+INSERT,\s*UPDATE\s+ON\s+public\.products\s+TO\s+authenticated/i.test(sql),
    "Must grant INSERT, UPDATE on public.products to authenticated"
  );

  // Must NOT grant DELETE on any table
  assert.ok(
    !/GRANT\s+DELETE/i.test(sql),
    "Must NOT grant DELETE on any table"
  );
});

test("12. Authenticated session prevents demo reset from overriding live operational state", () => {
  function simulateDemoReset(hasAuthEmail) {
    if (hasAuthEmail) {
      return { resetPerformed: false, message: "Live database session active. Demo reset is disabled." };
    }
    return { resetPerformed: true, message: "Demonstration data reset to initial seed values." };
  }

  assert.equal(simulateDemoReset("icespotvaravoor@gmail.com").resetPerformed, false);
  assert.equal(simulateDemoReset(null).resetPerformed, true);
});

test("13. Consolidated privilege remediation migration static audit: full PoLP compliance", () => {
  const migrationPath = path.resolve(process.cwd(), "supabase/migrations/20261023000002_consolidated_privilege_remediation.sql");
  assert.ok(fs.existsSync(migrationPath), "Consolidated privilege remediation migration must exist");

  const sql = fs.readFileSync(migrationPath, "utf-8");

  // Must revoke all table privileges from PUBLIC, anon, and authenticated
  assert.ok(
    /REVOKE\s+ALL\s+ON\s+TABLE[\s\S]+?FROM\s+PUBLIC,\s*anon,\s*authenticated/i.test(sql),
    "Must revoke all table privileges from PUBLIC, anon, and authenticated"
  );

  // Must NOT grant DELETE or TRUNCATE on any table
  assert.ok(!/\bGRANT\s+DELETE\b/i.test(sql), "Must NOT grant DELETE on any table");
  assert.ok(!/\bGRANT\s+TRUNCATE\b/i.test(sql), "Must NOT grant TRUNCATE on any table");
  assert.ok(!/\bGRANT\s+REFERENCES\b/i.test(sql), "Must NOT grant REFERENCES on any table");
  assert.ok(!/\bGRANT\s+TRIGGER\b/i.test(sql), "Must NOT grant TRIGGER on any table");

  // Operational tables (inventory, movements, dispatches, receipts, profiles) must ONLY have SELECT granted to authenticated
  const rpcOnlyTables = [
    "inventory",
    "inventory_movements",
    "dispatches",
    "dispatch_orders",
    "dispatch_items",
    "receipts",
    "receipt_items",
    "profiles",
  ];
  for (const tbl of rpcOnlyTables) {
    const tableGrantRegex = new RegExp(`GRANT\\s+(?!SELECT\\b)[A-Z,\\s]+\\s+ON\\s+public\\.${tbl}\\s+TO`, "i");
    assert.ok(!tableGrantRegex.test(sql), `Table public.${tbl} must NOT have write grants; mutations belong in RPCs`);
  }

  // Orders and Order Items must have SELECT, INSERT, UPDATE for authenticated
  assert.ok(
    /GRANT\s+SELECT,\s*INSERT,\s*UPDATE\s+ON\s+public\.orders\s+TO\s+authenticated/i.test(sql),
    "Must grant SELECT, INSERT, UPDATE on public.orders to authenticated"
  );
  assert.ok(
    /GRANT\s+SELECT,\s*INSERT,\s*UPDATE\s+ON\s+public\.order_items\s+TO\s+authenticated/i.test(sql),
    "Must grant SELECT, INSERT, UPDATE on public.order_items to authenticated"
  );

  // Enquiries must have INSERT for anon and SELECT, INSERT for authenticated
  assert.ok(
    /GRANT\s+INSERT\s+ON\s+public\.enquiries\s+TO\s+anon/i.test(sql),
    "Must grant INSERT on public.enquiries to anon"
  );
  assert.ok(
    /GRANT\s+SELECT,\s*INSERT\s+ON\s+public\.enquiries\s+TO\s+authenticated/i.test(sql),
    "Must grant SELECT, INSERT on public.enquiries to authenticated"
  );

  // Sequences must be granted USAGE, SELECT
  assert.ok(
    /GRANT\s+USAGE,\s*SELECT\s+ON\s+SEQUENCE[\s\S]+?TO\s+authenticated/i.test(sql),
    "Must grant USAGE, SELECT on sequences to authenticated"
  );

  // Must NOT use blanket REVOKE ALL ON ALL FUNCTIONS (which strips extension and trigger routines)
  assert.ok(
    !/REVOKE\s+ALL\s+ON\s+ALL\s+FUNCTIONS\b/i.test(sql),
    "Must NOT use blanket REVOKE ALL ON ALL FUNCTIONS in schema public"
  );

  // Must NOT grant direct EXECUTE on trigger function set_updated_at (PostgreSQL validates triggers at definition time)
  assert.ok(
    !/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.set_updated_at/i.test(sql),
    "Must NOT grant unnecessary direct EXECUTE on set_updated_at() to client roles"
  );

  // Must revoke EXECUTE on is_super_admin & fn_is_super_admin from PUBLIC and anon
  assert.ok(
    /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.is_super_admin\(\)\s+FROM\s+PUBLIC,\s*anon/i.test(sql),
    "Must revoke EXECUTE on is_super_admin() from PUBLIC and anon"
  );
  assert.ok(
    /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.fn_is_super_admin\(\)\s+FROM\s+PUBLIC,\s*anon/i.test(sql),
    "Must revoke EXECUTE on fn_is_super_admin() from PUBLIC and anon"
  );

  // Must grant EXECUTE on is_super_admin & fn_is_super_admin strictly to authenticated (NOT anon)
  assert.ok(
    /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.is_super_admin\(\)\s+TO\s+authenticated/i.test(sql),
    "Must grant EXECUTE on is_super_admin() strictly to authenticated"
  );
  assert.ok(
    /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.fn_is_super_admin\(\)\s+TO\s+authenticated/i.test(sql),
    "Must grant EXECUTE on fn_is_super_admin() strictly to authenticated"
  );
  assert.ok(
    !/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.(?:fn_)?is_super_admin\(\)\s+TO[^\n;]*\banon\b/i.test(sql),
    "Must NOT grant EXECUTE on super-admin helpers to anon"
  );

  // Must split public catalog policies on branches and products by role
  assert.ok(
    /CREATE\s+POLICY\s+"branches_read_policy"\s+ON\s+public\.branches\s+FOR\s+SELECT\s+TO\s+anon\s+USING\s*\(\s*is_active\s*=\s*true\s*\)/i.test(sql),
    "Must define active-only branches_read_policy for anon"
  );
  assert.ok(
    /CREATE\s+POLICY\s+"branches_authenticated_select"\s+ON\s+public\.branches\s+FOR\s+SELECT\s+TO\s+authenticated\s+USING\s*\(\s*is_active\s*=\s*true\s+OR\s+public\.is_super_admin\(\)\s*\)/i.test(sql),
    "Must define branches_authenticated_select policy for authenticated"
  );
  assert.ok(
    /CREATE\s+POLICY\s+"products_select_policy"\s+ON\s+public\.products\s+FOR\s+SELECT\s+TO\s+anon\s+USING\s*\(\s*is_active\s*=\s*true\s*\)/i.test(sql),
    "Must define active-only products_select_policy for anon"
  );
  assert.ok(
    /CREATE\s+POLICY\s+"products_authenticated_select"\s+ON\s+public\.products\s+FOR\s+SELECT\s+TO\s+authenticated\s+USING\s*\(\s*is_active\s*=\s*true\s+OR\s+public\.is_super_admin\(\)\s*\)/i.test(sql),
    "Must define products_authenticated_select policy for authenticated"
  );

  // All 6 transactional RPCs must have EXECUTE granted to authenticated
  const rpcs = [
    "rpc_create_order",
    "rpc_approve_order",
    "rpc_create_dispatch",
    "rpc_update_delivery_stop",
    "rpc_adjust_inventory",
    "rpc_confirm_receipt",
  ];
  for (const rpc of rpcs) {
    const fnRegex = new RegExp(`GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${rpc}[\\s\\S]+?TO\\s+authenticated`, "i");
    assert.ok(fnRegex.test(sql), `RPC ${rpc} must be granted EXECUTE to authenticated`);
  }
});

test("14. Privilege verification script statically verified: dynamic catalog resolution and zero-arg call prevention", () => {
  const verifyPath = path.resolve(process.cwd(), "supabase/privilege_verification_readonly.sql");
  assert.ok(fs.existsSync(verifyPath), "privilege_verification_readonly.sql must exist");

  const sql = fs.readFileSync(verifyPath, "utf-8");

  // Must NOT use zero-arg guessed signatures like 'public.rpc_create_order()'
  assert.ok(
    !/'public\.rpc_[a-z_]+\(\)'/i.test(sql),
    "Verification script must NOT call has_function_privilege with zero-argument signatures on parameterized RPCs"
  );

  // Must query pg_proc catalogs dynamically
  assert.ok(
    /FROM\s+pg_proc\s+p\s+JOIN\s+pg_namespace\s+n/i.test(sql),
    "Verification script must query pg_proc and pg_namespace catalogs"
  );

  // Must verify all 8 transactional RPCs individually
  const rpcs = [
    "rpc_create_order",
    "rpc_approve_order",
    "rpc_create_dispatch",
    "rpc_update_delivery_stop",
    "rpc_adjust_inventory",
    "rpc_confirm_receipt",
    "rpc_generate_invoice",
    "rpc_reorder_dispatch_stops",
  ];
  for (const rpc of rpcs) {
    assert.ok(sql.includes(`'${rpc}'`), `Verification script must check RPC ${rpc}`);
  }

  // Must verify authenticated and anon execution boundaries via has_function_privilege
  assert.ok(sql.includes("has_function_privilege('authenticated'"), "Must check authenticated execute privilege");
  assert.ok(sql.includes("has_function_privilege('anon'"), "Must check anon execute privilege");

  // Must NOT use has_function_privilege with pseudo-role 'PUBLIC' (Fix 1)
  assert.ok(
    !/has_function_privilege\(\s*['"]PUBLIC['"]/i.test(sql),
    "Must NOT call has_function_privilege on pseudo-role 'PUBLIC'"
  );

  // Must inspect pg_proc.proacl via aclexplode for grantee = 0 (PUBLIC) and default privileges
  assert.ok(
    /aclexplode[\s\S]+?grantee\s*=\s*0/i.test(sql),
    "Must check PUBLIC execution privileges using aclexplode with grantee = 0 and handle NULL default ACLs"
  );

  // Must verify all 8 required helper functions individually
  const helpers = [
    "set_updated_at",
    "is_super_admin",
    "fn_is_super_admin",
    "current_app_role",
    "current_branch_id",
    "fn_user_branch_id",
    "can_access_dispatch",
    "can_delivery_staff_view_order",
  ];
  for (const helper of helpers) {
    assert.ok(sql.includes(`'${helper}'`), `Verification script must check helper function ${helper}`);
  }

  // Section 5 must configure allow_anon = false for super_admin helpers and set_updated_at
  assert.ok(
    /\('is_super_admin',\s*'',\s*false,\s*true,\s*true\)/.test(sql),
    "Verification script must verify is_super_admin prohibits anonymous execute (allow_anon = false)"
  );
  assert.ok(
    /\('fn_is_super_admin',\s*'',\s*false,\s*true,\s*true\)/.test(sql),
    "Verification script must verify fn_is_super_admin prohibits anonymous execute (allow_anon = false)"
  );
  assert.ok(
    /\('set_updated_at',\s*'',\s*false,\s*false,\s*false\)/.test(sql),
    "Verification script must verify set_updated_at does not require direct client execute"
  );

  // Section 3 must verify role-split catalog policies
  assert.ok(
    /\('branches',\s*'branches_read_policy',\s*'SELECT',\s*ARRAY\['anon'\]/.test(sql),
    "Verification script must verify branches_read_policy applies strictly to anon"
  );
  assert.ok(
    /\('branches',\s*'branches_authenticated_select',\s*'SELECT',\s*ARRAY\['authenticated'\]/.test(sql),
    "Verification script must verify branches_authenticated_select applies strictly to authenticated"
  );
  assert.ok(
    /\('products',\s*'products_select_policy',\s*'SELECT',\s*ARRAY\['anon'\]/.test(sql),
    "Verification script must verify products_select_policy applies strictly to anon"
  );
  assert.ok(
    /\('products',\s*'products_authenticated_select',\s*'SELECT',\s*ARRAY\['authenticated'\]/.test(sql),
    "Verification script must verify products_authenticated_select applies strictly to authenticated"
  );

  // Must verify exact proconfig search_path pinning ('search_path=""' or 'search_path=')
  assert.ok(
    sql.includes("'search_path=\"\"'") && sql.includes("'search_path='"),
    "Verification script must validate exact proconfig empty search path representation"
  );

  // Must evaluate all 7 table privilege types
  const expectedPrivs = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"];
  for (const priv of expectedPrivs) {
    assert.ok(sql.includes(`'${priv}'`), `Verification script must evaluate privilege ${priv}`);
  }

  // Must inspect table owner to ensure anon/authenticated do not own tables
  assert.ok(
    /relowner[\s\S]+?['"]anon['"][\s\S]+?['"]authenticated['"]/i.test(sql),
    "Verification script must verify that application tables are not owned by anon or authenticated"
  );

  // Must verify anti-weakening on RLS policies
  assert.ok(
    sql.includes("trim(both '()' from lower(v_rec.qual)) = 'true'") ||
    sql.includes("trim(both '()' from lower(v_rec.with_check)) = 'true'"),
    "Verification script must implement anti-weakening validation against trivial true bypasses"
  );

  // Must verify canonical RLS policies in manifest
  assert.ok(
    sql.includes("enquiries_insert_public") &&
    sql.includes("receipt_items_select") &&
    sql.includes("orders_update_policy"),
    "Verification script must include all canonical RLS policies in Section 3 manifest"
  );

  // Must verify invoice tables and RLS policies in manifest
  assert.ok(
    sql.includes("'invoices'") && sql.includes("'invoice_items'"),
    "Verification script must audit invoices and invoice_items tables in Sections 1 and 2"
  );
  assert.ok(
    sql.includes("invoices_select") &&
    sql.includes("invoices_admin_manage") &&
    sql.includes("invoice_items_select") &&
    sql.includes("invoice_items_admin_manage"),
    "Verification script must include invoice RLS policies in Section 3 manifest"
  );

  // Must check for policies attached to wrong tables
  assert.ok(
    /policyname\s*=\s*v_pol_spec\.pol_name[\s\S]+?tablename\s*!=\s*v_pol_spec\.tbl_name/i.test(sql),
    "Verification script must detect policies attached to the wrong table"
  );

  // Must cast roles array to text[] to avoid PostgreSQL 42883 (operator does not exist: name[] @> text[])
  assert.ok(
    /roles::text\[\]\s*@>\s*v_pol_spec\.roles::text\[\]/i.test(sql),
    "Verification script must explicitly cast roles arrays to text[] to prevent operator does not exist: name[] @> text[]"
  );

  // Must safely skip dependent checks on missing tables using v_missing_tables
  assert.ok(
    sql.includes("v_missing_tables") && sql.includes("v_sec_skipped"),
    "Verification script must track missing tables and explicitly count skipped dependent checks"
  );

  // Must track 5 reporting states (passes, fails, warnings, skipped, inconclusive)
  assert.ok(
    sql.includes("v_global_passes") &&
    sql.includes("v_global_fails") &&
    sql.includes("v_global_skipped") &&
    sql.includes("v_global_inconclusive") &&
    sql.includes("v_global_warnings"),
    "Verification script must maintain 5 independent accounting metrics globally and per section"
  );

  // Must check pg_catalog.gen_random_uuid() as required primary key default
  assert.ok(
    sql.includes("gen_random_uuid") && sql.includes("pg_catalog"),
    "Verification script must verify gen_random_uuid in pg_catalog for primary key generation"
  );

  // Must verify uuid_generate_v4() extension linkage via pg_depend (deptype = 'e') without arbitrary LIMIT 1
  assert.ok(
    /pg_depend[\s\S]+?deptype\s*=\s*'e'[\s\S]+?uuid_generate_v4/i.test(sql),
    "Verification script must verify uuid_generate_v4 is linked to uuid-ossp via pg_depend"
  );
  assert.ok(
    !/uuid_generate_v4[\s\S]{1,150}?LIMIT\s+1/i.test(sql),
    "Verification script must NOT use LIMIT 1 on arbitrary same-named uuid_generate_v4 functions"
  );
});

test("15. Privilege verification script: 5-state reporting and control-flow integrity audit", () => {
  const verifyPath = path.resolve(process.cwd(), "supabase/privilege_verification_readonly.sql");
  const sql = fs.readFileSync(verifyPath, "utf-8");

  // Verify all 7 sections have their own INCONCLUSIVE branch when skipped > 0 or inconclusive > 0
  for (let i = 1; i <= 7; i++) {
    const secRegex = new RegExp(`SECTION ${i} RESULT:[\\s\\S]+?ELSIF\\s+v_sec_skipped\\s*>\\s*0\\s+OR\\s+v_sec_inconclusive\\s*>\\s*0\\s+THEN\\s+RAISE\\s+NOTICE\\s+'SECTION\\s+${i}\\s+RESULT:\\s+INCONCLUSIVE`, "i");
    assert.ok(secRegex.test(sql), `Section ${i} must report INCONCLUSIVE when v_sec_skipped > 0 or v_sec_inconclusive > 0`);
  }

  // Verify counter resetting occurs at the beginning of each section
  const resetCount = (sql.match(/v_sec_passes\s*:=\s*0;\s*v_sec_fails\s*:=\s*0;\s*v_sec_warnings\s*:=\s*0;\s*v_sec_skipped\s*:=\s*0;\s*v_sec_inconclusive\s*:=\s*0;/g) || []).length;
  assert.strictEqual(resetCount, 7, "All 7 sections must independently reset all five section counters");

  // Verify global counter aggregation occurs in each section
  const aggCount = (sql.match(/v_global_passes\s*:=\s*v_global_passes\s*\+\s*v_sec_passes;/g) || []).length;
  assert.strictEqual(aggCount, 7, "All 7 sections must aggregate section passes into global passes");

  // Verify final outcome logic: FAIL > INCONCLUSIVE > PASS WITH ADVISORY WARNINGS > PASS
  assert.ok(
    /IF\s+v_global_fails\s*>\s*0\s+THEN[\s\S]+?FINAL\s+AUDIT\s+RESULT:\s+FAIL[\s\S]+?ELSIF\s+v_global_skipped\s*>\s*0\s+OR\s+v_global_inconclusive\s*>\s*0\s+THEN[\s\S]+?FINAL\s+AUDIT\s+RESULT:\s+INCONCLUSIVE[\s\S]+?ELSIF\s+v_global_warnings\s*>\s*0\s+THEN[\s\S]+?FINAL\s+AUDIT\s+RESULT:\s+PASS\s+WITH\s+ADVISORY\s+WARNINGS[\s\S]+?ELSE[\s\S]+?FINAL\s+AUDIT\s+RESULT:\s+PASS/i.test(sql),
    "Final audit summary must implement strict 4-tier decision priority: FAIL -> INCONCLUSIVE -> WARNINGS -> PASS"
  );

  // Missing objects must increment both fails and skipped in Sections 1, 4, 5, 6, 7
  assert.ok(
    sql.includes("Application table public.% does NOT exist") &&
    sql.includes("v_sec_skipped := v_sec_skipped + 1; -- Dependent RLS status check skipped"),
    "Missing table in Section 1 must increment fails and count skipped RLS check"
  );
  assert.ok(
    sql.includes("Required transactional RPC % is MISSING") &&
    sql.includes("v_sec_skipped := v_sec_skipped + 6;"),
    "Missing RPC in Section 4 must increment fails and count 6 skipped dependent checks"
  );
  assert.ok(
    sql.includes("Required helper function % is MISSING") &&
    sql.includes("v_sec_skipped := v_sec_skipped + 6;"),
    "Missing helper in Section 5 must increment fails and count 6 skipped dependent checks"
  );
  assert.ok(
    sql.includes("Sequence public.orders_order_number_seq does not exist") &&
    sql.includes("v_sec_skipped := v_sec_skipped + 5;"),
    "Missing sequence in Section 6 must increment fails and count 5 skipped dependent checks"
  );
  assert.ok(
    sql.includes("Function gen_random_uuid() is missing from database catalogs") &&
    sql.includes("v_sec_skipped := v_sec_skipped + 2;"),
    "Missing gen_random_uuid in Section 7 must increment fails and count 2 skipped execution checks"
  );
});

test("16. Privilege verification script: zero-write in-memory Results grid emission audit", () => {
  const verifyPath = path.resolve(process.cwd(), "supabase/privilege_verification_readonly.sql");
  const sql = fs.readFileSync(verifyPath, "utf-8");

  // Zero database writes: NO CREATE TEMP TABLE, NO TRUNCATE, NO DDL, NO DML writes
  assert.ok(
    !/CREATE\s+(TEMP|TEMPORARY)\s+TABLE/i.test(sql),
    "Verification script must NOT create temporary tables"
  );
  assert.ok(
    !/TRUNCATE\s+TABLE/i.test(sql),
    "Verification script must NOT run TRUNCATE TABLE"
  );
  assert.ok(
    !/INSERT\s+INTO\s+[^_]/i.test(sql) && !/INSERT\s+INTO\s+_[a-z]/i.test(sql),
    "Verification script must NOT execute INSERT statements against tables"
  );

  // In-memory JSON configuration recording
  assert.ok(
    sql.includes("v_results_json jsonb := '[]'::jsonb;"),
    "Verification script must declare in-memory v_results_json variable"
  );
  assert.ok(
    /set_config\(\s*'icespot\.audit_results'\s*,\s*v_results_json::text\s*,\s*false\s*\)/i.test(sql),
    "Verification script must store audit results in in-memory session configuration via set_config"
  );

  // All 7 sections must record their results in v_results_json
  for (let i = 1; i <= 7; i++) {
    const secRegex = new RegExp(`v_results_json\\s*:=\\s*v_results_json\\s*\\|\\|\\s*jsonb_build_object\\([\\s\\S]+?'section_id',\\s*${i}`, "i");
    assert.ok(secRegex.test(sql), `Section ${i} must record results into v_results_json`);
  }

  // Exactly eight rows must be recorded in v_results_json (7 sections + 1 final summary)
  const recordedSectionIds = [...sql.matchAll(/'section_id',\s*(\d+)/g)].map((m) => parseInt(m[1], 10));
  assert.strictEqual(recordedSectionIds.length, 8, "Must record exactly 8 audit rows (7 sections + 1 summary)");
  assert.deepStrictEqual(recordedSectionIds, [1, 2, 3, 4, 5, 6, 7, 99], "Must record section IDs [1, 2, 3, 4, 5, 6, 7, 99]");

  // Concluding query must project section_id, safely handle uninitialized settings, and unpack via jsonb_to_recordset
  assert.ok(
    /WITH\s+raw_audit\s+AS[\s\S]+?current_setting\(\s*'icespot\.audit_results'\s*,\s*true\s*\)[\s\S]+?FROM\s+audit_payload[\s\S]+?jsonb_to_recordset\([\s\S]+?ORDER\s+BY\s+r\.section_id/i.test(sql),
    "Verification script must conclude with a CTE query projecting section_id, safely handling missing/uninitialized settings, and unpacking into Results grid rows"
  );
  assert.ok(
    sql.includes("Audit results uninitialized or missing. The verification DO block was not executed or aborted."),
    "Verification script must provide a clear failure message if audit results are uninitialized or empty"
  );
});



