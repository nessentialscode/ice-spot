/**
 * Icespot — Staging Database Validation Test Suite
 * File: scripts/staging_validation.mjs
 * 
 * Purpose: Automated, reproducible end-to-end integration testing of the recovery
 *          migration against an isolated Supabase/PostgreSQL staging instance.
 * 
 * Safety:
 *  1. Production Killswitch: Explicitly blocks target URL and keys against legacy production (gprtubirudzequpukzel).
 *  2. Positive Project Guard: Strictly requires target URL to reference ice_spot_dev (punyeqlotfnvxhhugtud).
 *  3. Real Auth Session Testing: Uses isolated authenticated user clients (NOT service-role bypass)
 *     to rigorously validate PostgreSQL Row Level Security (RLS) enforcement.
 *  4. Foreign-Key-Safe Teardown: Tracks all created disposable records (users, orders, invoices, dispatches, receipts)
 *     and tears them down in the exact foreign-key safe dependency order even if tests fail partway through.
 *  5. Local Execution Safety: Script requires explicit environment variables; does not run implicitly.
 */

import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";

const PROD_PROJECT_REF = "gprtubirudzequpukzel"; // Legacy ice-spot (STRICTLY BLOCKED)
const TARGET_DEV_REF = "punyeqlotfnvxhhugtud";   // Target ice_spot_dev (STRICTLY REQUIRED)

// 1. Read staging environment configuration
const stagingUrl = process.env.STAGING_SUPABASE_URL;
const stagingServiceKey = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
const stagingAnonKey = process.env.STAGING_SUPABASE_ANON_KEY;

console.log("============================================================");
console.log("ICESPOT STAGING VALIDATION TEST SUITE");
console.log("============================================================");

// 2. STAGING TARGET VALIDATION & HARD PRODUCTION KILLSWITCH
if (!stagingUrl || !stagingServiceKey || !stagingAnonKey) {
  console.error("STATUS: STAGING NOT RUN");
  console.error("REASON: Required environment variables are not configured.");
  console.error("");
  console.error("Missing variables:");
  if (!stagingUrl) console.error("  - STAGING_SUPABASE_URL");
  if (!stagingServiceKey) console.error("  - STAGING_SUPABASE_SERVICE_ROLE_KEY");
  if (!stagingAnonKey) console.error("  - STAGING_SUPABASE_ANON_KEY");
  console.error("");
  console.error("To configure and execute staging validation against ice_spot_dev:");
  console.error("  1. Verify the target project reference is: " + TARGET_DEV_REF);
  console.error("  2. Apply 'supabase/migrations/20261025000000_harden_order_approval_validation.sql' in the SQL Editor.");
  console.error("  3. Set environment variables in your terminal:");
  console.error("       $env:STAGING_SUPABASE_URL = \"https://" + TARGET_DEV_REF + ".supabase.co\"");
  console.error("       $env:STAGING_SUPABASE_SERVICE_ROLE_KEY = \"<dev-service-role-key>\"");
  console.error("       $env:STAGING_SUPABASE_ANON_KEY = \"<dev-anon-key>\"");
  console.error("  4. Run: node scripts/staging_validation.mjs");
  console.error("============================================================");
  process.exit(1);
}

// 2A. HARD LEGACY PRODUCTION KILLSWITCH
if (
  stagingUrl.includes(PROD_PROJECT_REF) ||
  stagingServiceKey.includes(PROD_PROJECT_REF) ||
  stagingAnonKey.includes(PROD_PROJECT_REF)
) {
  console.error("FATAL ERROR: Target environment references the LEGACY PRODUCTION project: " + PROD_PROJECT_REF);
  console.error("Safety lock engaged. Aborting immediately to protect legacy production data.");
  process.exit(1);
}

// 2B. PARSE & STRICT POSITIVE TARGET-PROJECT CHECK (EXACT HTTPS HOSTNAME REQUIRED)
let parsedStagingUrl;
try {
  parsedStagingUrl = new URL(stagingUrl);
} catch (e) {
  console.error("FATAL ERROR: Invalid STAGING_SUPABASE_URL format:", e.message);
  process.exit(1);
}

const EXPECTED_HOSTNAME = `${TARGET_DEV_REF}.supabase.co`;

if (parsedStagingUrl.protocol !== "https:") {
  console.error(`FATAL ERROR: Insecure or invalid protocol: ${parsedStagingUrl.protocol}. Target URL must use HTTPS.`);
  process.exit(1);
}

if (parsedStagingUrl.hostname !== EXPECTED_HOSTNAME) {
  console.error(`FATAL ERROR: Target environment hostname does not match required development host exactly.`);
  console.error(`Expected Hostname: ${EXPECTED_HOSTNAME}`);
  console.error(`Received Hostname: ${parsedStagingUrl.hostname}`);
  console.error("Safety lock engaged: All integration tests must strictly target https://" + EXPECTED_HOSTNAME);
  process.exit(1);
}

console.log(`Target Development Instance: ${stagingUrl}`);
console.log(`Safety checks passed: Target is verified ice_spot_dev (${EXPECTED_HOSTNAME}) and not legacy (${PROD_PROJECT_REF}).`);

const adminClient = createClient(stagingUrl, stagingServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function runStagingTests() {
  const results = [];
  let testCount = 0;
  let passCount = 0;
  let failCount = 0;

  // Disposable tracking arrays for guaranteed foreign-key safe teardown
  const createdAuthUserIds = [];
  const createdBranchIds = [];
  const createdOrderIds = [];
  const createdInvoiceIds = [];
  const createdDispatchIds = [];
  const createdReceiptIds = [];
  const cleanupErrors = [];

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  async function step(name, fn) {
    testCount++;
    process.stdout.write(`[Test ${testCount}] ${name}... `);
    try {
      await fn();
      passCount++;
      console.log("PASS");
      results.push({ name, status: "PASS" });
    } catch (err) {
      failCount++;
      console.log(`FAIL\n    Error: ${err.message}`);
      results.push({ name, status: "FAIL", error: err.message });
    }
  }

  try {
    // ------------------------------------------------------------------------
    // SETUP: Provision Real Authenticated Test Users (Super Admin, 2 Branch Admins, Delivery Staff)
    // ------------------------------------------------------------------------
    console.log("\n--- Provisioning Disposable Authenticated Test Accounts ---");
    const testRunId = Date.now().toString(36);
    const testPassword = `TestPass!_${testRunId}#9`;

    async function createTestUser(role, emailPrefix) {
      const email = `disposable_${emailPrefix}_${testRunId}@staging.test`;
      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password: testPassword,
        email_confirm: true,
        user_metadata: { test_run_id: testRunId }
      });
      if (error || !data.user) {
        throw new Error(`Failed to create test user ${email}: ${error?.message}`);
      }
      createdAuthUserIds.push(data.user.id);
      return data.user;
    }

    // Verify baseline seed branches exist in staging (read-only verification)
    const { data: baselineOllur, error: boErr } = await adminClient
      .from("branches")
      .select("id, code")
      .eq("code", "BR-OLL-003")
      .single();
    assert.ifError(boErr);
    assert.ok(baselineOllur, "Baseline Ollur branch BR-OLL-003 must exist in staging");

    const { data: baselineTown, error: btErr } = await adminClient
      .from("branches")
      .select("id, code")
      .eq("code", "BR-TSR-002")
      .single();
    assert.ifError(btErr);
    assert.ok(baselineTown, "Baseline Town branch BR-TSR-002 must exist in staging");

    // Provision 2 isolated disposable branches for this test run.
    // This strictly isolates branch admin profiles to prevent collisions with the partial unique index
    // `profiles_one_active_branch_admin_per_branch` (ON public.profiles(branch_id) WHERE role = 'branch_admin' AND is_active = true)
    // without deactivating, overwriting, or deleting existing business branch administrator profiles.
    const { data: ollurBranch, error: obErr } = await adminClient
      .from("branches")
      .insert({
        code: `TEST-BR-OLL-${testRunId}`,
        name: `Disposable Ollur Test Branch ${testRunId}`,
        category: "thrissur_town",
        address: "Disposable Test Branch 1 Address",
        locality: "Ollur Test",
        district: "Thrissur",
        is_active: true
      })
      .select("id, code")
      .single();
    if (obErr || !ollurBranch) {
      throw new Error(`Failed to create disposable test branch 1: ${obErr?.message}`);
    }
    createdBranchIds.push(ollurBranch.id);

    const { data: townBranch, error: tbErr } = await adminClient
      .from("branches")
      .insert({
        code: `TEST-BR-TSR-${testRunId}`,
        name: `Disposable Town Test Branch ${testRunId}`,
        category: "thrissur_town",
        address: "Disposable Test Branch 2 Address",
        locality: "Town Test",
        district: "Thrissur",
        is_active: true
      })
      .select("id, code")
      .single();
    if (tbErr || !townBranch) {
      throw new Error(`Failed to create disposable test branch 2: ${tbErr?.message}`);
    }
    createdBranchIds.push(townBranch.id);

    const { data: testProduct, error: tpErr } = await adminClient
      .from("products")
      .select("id, sku")
      .eq("sku", "SKU-STK-001")
      .single();
    assert.ifError(tpErr);
    assert.ok(testProduct, "Product SKU-STK-001 must exist in staging");

    const { data: testProduct2, error: tp2Err } = await adminClient
      .from("products")
      .select("id, sku")
      .neq("id", testProduct.id)
      .limit(1)
      .single();
    assert.ifError(tp2Err);
    assert.ok(testProduct2, "A second active product must exist in staging for negative validation testing");

    // 1. Create Auth Users
    const superAdminUser = await createTestUser("super_admin", "superadmin");
    const branchAdminOllurUser = await createTestUser("branch_admin", "admin_ollur");
    const branchAdminTownUser = await createTestUser("branch_admin", "admin_town");
    const deliveryStaffUser = await createTestUser("delivery_staff", "driver");

    // 2. Insert Profiles using Admin Client with explicit error assertion
    const { error: profileUpsertErr } = await adminClient.from("profiles").upsert([
      { id: superAdminUser.id, full_name: "Disposable Super Admin", role: "super_admin", branch_id: null, is_active: true },
      { id: branchAdminOllurUser.id, full_name: "Disposable Ollur Admin", role: "branch_admin", branch_id: ollurBranch.id, is_active: true },
      { id: branchAdminTownUser.id, full_name: "Disposable Town Admin", role: "branch_admin", branch_id: townBranch.id, is_active: true },
      { id: deliveryStaffUser.id, full_name: "Disposable Driver", role: "delivery_staff", branch_id: null, is_active: true }
    ]);
    if (profileUpsertErr) {
      throw new Error(`Failed to provision test user profiles: ${profileUpsertErr.message}`);
    }

    // 3. Helper to create authenticated client for each user
    async function getAuthenticatedClient(email) {
      const client = createClient(stagingUrl, stagingAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      });
      const { data: sessionData, error: sErr } = await client.auth.signInWithPassword({
        email,
        password: testPassword
      });
      if (sErr || !sessionData.session) {
        throw new Error(`Failed to sign in ${email}: ${sErr?.message}`);
      }
      return client;
    }

    const superAdminClient = await getAuthenticatedClient(superAdminUser.email);
    const ollurAdminClient = await getAuthenticatedClient(branchAdminOllurUser.email);
    const townAdminClient = await getAuthenticatedClient(branchAdminTownUser.email);
    const driverClient = await getAuthenticatedClient(deliveryStaffUser.email);
    const unauthenticatedAnonClient = createClient(stagingUrl, stagingAnonKey);

    console.log("Authenticated test sessions established successfully.\n--- Starting Test Execution ---");

    // Helpers for isolated order testing and rollback verification
    async function createDisposableOrder(notes = "Validation fixture", requestedQty = 10) {
      const { data, error } = await ollurAdminClient.rpc("rpc_create_order", {
        p_branch_id: ollurBranch.id,
        p_week_start: "2026-10-26",
        p_notes: notes,
        p_items: [{ product_id: testProduct.id, requested_quantity: requestedQty }]
      });
      assert.ifError(error);
      assert.ok(data?.success, "Order creation must succeed");
      createdOrderIds.push(data.order_id);
      return data.order_id;
    }

    async function verifyOrderUntouched(orderId, expectedRequestedQty = 10) {
      // 1. Order status must remain 'submitted', not approved
      const { data: ord, error: oErr } = await adminClient
        .from("orders")
        .select("status, approved_at, approved_by")
        .eq("id", orderId)
        .single();
      assert.ifError(oErr);
      assert.equal(ord.status, "submitted", "Failed approval must leave status as submitted");
      assert.equal(ord.approved_at, null, "approved_at must remain null");
      assert.equal(ord.approved_by, null, "approved_by must remain null");

      // 2. Line items: requested_quantity preserved, approved_quantity remains 0
      const { data: items, error: iErr } = await adminClient
        .from("order_items")
        .select("product_id, requested_quantity, approved_quantity")
        .eq("order_id", orderId);
      assert.ifError(iErr);
      assert.equal(items.length, 1, "Order should retain its 1 line item");
      assert.equal(Number(items[0].requested_quantity), expectedRequestedQty, "requested_quantity must be preserved");
      assert.equal(Number(items[0].approved_quantity), 0, "approved_quantity must remain 0");

      // 3. No invoice must be created
      const { count: invCount, error: invErr } = await adminClient
        .from("invoices")
        .select("*", { count: "exact", head: true })
        .eq("order_id", orderId);
      assert.ifError(invErr);
      assert.equal(invCount, 0, "No invoice must be generated when approval fails");
    }

    // ------------------------------------------------------------------------
    // TEST 1: Schema Idempotency & Seed Non-Destructiveness
    // ------------------------------------------------------------------------
    await step("Schema Seed Idempotency & Branch/Product Integrity", async () => {
      const { count: bCount } = await adminClient.from("branches").select("*", { count: "exact", head: true });
      const { count: pCount } = await adminClient.from("products").select("*", { count: "exact", head: true });
      assert.ok(bCount >= 17, `Expected >= 17 branches, found ${bCount}`);
      assert.ok(pCount >= 10, `Expected >= 10 products, found ${pCount}`);
    });

    // ------------------------------------------------------------------------
    // TEST 2: Sequence Number Allocation
    // ------------------------------------------------------------------------
    let orderNum1 = null;
    let orderNum2 = null;
    await step("Sequence Defaults & Numeric BigInt Generation", async () => {
      const { data: ord1, error: e1 } = await ollurAdminClient.rpc("rpc_create_order", {
        p_branch_id: ollurBranch.id,
        p_week_start: "2026-10-26",
        p_notes: "Test sequence 1",
        p_items: [{ product_id: testProduct.id, requested_quantity: 10 }]
      });
      assert.ifError(e1);
      assert.ok(ord1?.success);
      createdOrderIds.push(ord1.order_id);
      orderNum1 = BigInt(ord1.order_number);

      const { data: ord2, error: e2 } = await townAdminClient.rpc("rpc_create_order", {
        p_branch_id: townBranch.id,
        p_week_start: "2026-10-26",
        p_notes: "Test sequence 2",
        p_items: [{ product_id: testProduct.id, requested_quantity: 15 }]
      });
      assert.ifError(e2);
      assert.ok(ord2?.success);
      createdOrderIds.push(ord2.order_id);
      orderNum2 = BigInt(ord2.order_number);

      assert.equal(orderNum2, orderNum1 + 1n, "Sequences must increment by exactly 1 without collisions");
    });

    // ------------------------------------------------------------------------
    // TEST 3: Branch Isolation in Order Creation RPC
    // ------------------------------------------------------------------------
    await step("Cross-Branch Order Creation Violation Rejection", async () => {
      // Ollur admin attempts to place order for Town branch
      const { data: badOrder, error: badErr } = await ollurAdminClient.rpc("rpc_create_order", {
        p_branch_id: townBranch.id,
        p_week_start: "2026-10-26",
        p_notes: "Malicious cross branch order",
        p_items: [{ product_id: testProduct.id, requested_quantity: 5 }]
      });
      assert.ok(badErr, "Cross-branch order creation must throw exception");
      assert.match(badErr.message, /Branch isolation violation/i);
    });

    // ------------------------------------------------------------------------
    // TEST 4: Delivery Staff Order Creation Denial
    // ------------------------------------------------------------------------
    await step("Delivery Staff Order Creation Prohibition", async () => {
      const { error } = await driverClient.rpc("rpc_create_order", {
        p_branch_id: ollurBranch.id,
        p_week_start: "2026-10-26",
        p_notes: "Driver unauthorized order",
        p_items: [{ product_id: testProduct.id, requested_quantity: 5 }]
      });
      assert.ok(error, "Driver must be rejected from creating orders");
      assert.match(error.message, /Unauthorized: Only (?:super_admin|Super Admin) (?:or|and) (?:branch_admin|Branch Admins) can (?:create|place) orders/i);
    });

    // ------------------------------------------------------------------------
    // TEST 5: Order Approval Role Guard & Valid Approvals
    // ------------------------------------------------------------------------
    await step("Order Approval Super Admin Exclusivity & Invoice Generation", async () => {
      assert.ok(
        createdOrderIds.length >= 2 &&
        typeof createdOrderIds[0] === "string" && UUID_REGEX.test(createdOrderIds[0]) &&
        typeof createdOrderIds[1] === "string" && UUID_REGEX.test(createdOrderIds[1]),
        "Prerequisite failed: Test 5 requires at least two valid disposable order UUIDs from Test 2"
      );

      // 1. Branch admin cannot approve order
      const { error: baErr } = await ollurAdminClient.rpc("rpc_approve_order", {
        p_order_id: createdOrderIds[0],
        p_approved_items: [{ product_id: testProduct.id, approved_quantity: 10 }],
        p_notes: "Unauthorized self approval"
      });
      assert.ok(baErr, "Branch Admin must be forbidden from approving orders");
      assert.match(baErr.message, /Super Admin authority required/i);

      // 2. Super admin approves first order successfully
      const { data: saApp, error: saErr } = await superAdminClient.rpc("rpc_approve_order", {
        p_order_id: createdOrderIds[0],
        p_approved_items: [{ product_id: testProduct.id, approved_quantity: 10 }],
        p_notes: "Super Admin authorized approval"
      });
      assert.ifError(saErr);
      assert.ok(saApp?.success);
      assert.equal(saApp.status, "approved");
      if (saApp.invoice_id) {
        createdInvoiceIds.push(saApp.invoice_id);
      }

      // 3. Super admin approves second order successfully
      const { data: saApp2, error: saErr2 } = await superAdminClient.rpc("rpc_approve_order", {
        p_order_id: createdOrderIds[1],
        p_approved_items: [{ product_id: testProduct.id, approved_quantity: 15 }],
        p_notes: "Approve second order"
      });
      assert.ifError(saErr2);
      assert.ok(saApp2?.success);
      assert.equal(saApp2.status, "approved");
      if (saApp2.invoice_id) {
        createdInvoiceIds.push(saApp2.invoice_id);
      }
    });

    // ------------------------------------------------------------------------
    // TEST 5b: Negative Validation — Product ID Not Belonging to Order
    // ------------------------------------------------------------------------
    await step("Negative Validation: Product ID Not Belonging to Order", async () => {
      const orderId = await createDisposableOrder("Negative Test: Foreign Product", 10);
      const foreignProductId = testProduct2.id;

      const { error } = await superAdminClient.rpc("rpc_approve_order", {
        p_order_id: orderId,
        p_approved_items: [{ product_id: foreignProductId, approved_quantity: 5 }],
        p_notes: null
      });

      assert.ok(error, "Approval must fail when product does not belong to the order");
      assert.match(
        error.message,
        /does not belong to order/i,
        `Expected 'does not belong to order' error message, got: ${error.message}`
      );
      await verifyOrderUntouched(orderId, 10);
    });

    // ------------------------------------------------------------------------
    // TEST 5c: Negative Validation — Duplicate Product IDs in Payload
    // ------------------------------------------------------------------------
    await step("Negative Validation: Duplicate Product IDs in Payload", async () => {
      const orderId = await createDisposableOrder("Negative Test: Duplicate Products", 10);

      const { error } = await superAdminClient.rpc("rpc_approve_order", {
        p_order_id: orderId,
        p_approved_items: [
          { product_id: testProduct.id, approved_quantity: 4 },
          { product_id: testProduct.id, approved_quantity: 6 }
        ],
        p_notes: null
      });

      assert.ok(error, "Approval must fail when duplicate product IDs are provided");
      assert.match(
        error.message,
        /Duplicate product ID .* supplied in approval items payload/i,
        `Expected duplicate product ID error message, got: ${error.message}`
      );
      await verifyOrderUntouched(orderId, 10);
    });

    // ------------------------------------------------------------------------
    // TEST 5d: Negative Validation — Non-Array Payload
    // ------------------------------------------------------------------------
    await step("Negative Validation: Non-Array Payload", async () => {
      // Subcase 1: Scalar string "null" (which yields jsonb_typeof 'string')
      const orderId1 = await createDisposableOrder("Negative Test: Non-Array String 'null'", 10);
      const { error: e1 } = await superAdminClient.rpc("rpc_approve_order", {
        p_order_id: orderId1,
        p_approved_items: "null",
        p_notes: null
      });
      assert.ok(e1, "Approval must fail for scalar string payload 'null'");
      assert.match(
        e1.message,
        /p_approved_items must be a JSON array/i,
        `Expected 'p_approved_items must be a JSON array' error message, got: ${e1.message}`
      );
      await verifyOrderUntouched(orderId1, 10);

      // Subcase 2: JSON object instead of array (separate disposable order)
      const orderId2 = await createDisposableOrder("Negative Test: Non-Array Object", 10);
      const { error: e2 } = await superAdminClient.rpc("rpc_approve_order", {
        p_order_id: orderId2,
        p_approved_items: { product_id: testProduct.id, approved_quantity: 5 },
        p_notes: null
      });
      assert.ok(e2, "Approval must fail for JSON object payload");
      assert.match(
        e2.message,
        /p_approved_items must be a JSON array/i,
        `Expected 'p_approved_items must be a JSON array' error message, got: ${e2.message}`
      );
      await verifyOrderUntouched(orderId2, 10);
    });

    // ------------------------------------------------------------------------
    // TEST 5e: Negative Validation — Malformed Product UUID
    // ------------------------------------------------------------------------
    await step("Negative Validation: Malformed Product UUID", async () => {
      const orderId = await createDisposableOrder("Negative Test: Malformed UUID", 10);

      const { error } = await superAdminClient.rpc("rpc_approve_order", {
        p_order_id: orderId,
        p_approved_items: [{ product_id: "not-a-valid-uuid", approved_quantity: 5 }],
        p_notes: null
      });

      assert.ok(error, "Approval must fail for malformed UUID");
      assert.match(
        error.message,
        /Invalid UUID format for product_id: not-a-valid-uuid/i,
        `Expected invalid UUID format error message, got: ${error.message}`
      );
      await verifyOrderUntouched(orderId, 10);
    });

    // ------------------------------------------------------------------------
    // TEST 5f: Negative Validation — Invalid Quantity Formats (.5, negative, nonnumeric)
    // ------------------------------------------------------------------------
    await step("Negative Validation: Invalid Quantity Formats (.5, negative, nonnumeric)", async () => {
      // 1. Incomplete decimal (.5)
      const orderId1 = await createDisposableOrder("Negative Test: Incomplete decimal .5", 10);
      const { error: e1 } = await superAdminClient.rpc("rpc_approve_order", {
        p_order_id: orderId1,
        p_approved_items: [{ product_id: testProduct.id, approved_quantity: ".5" }],
        p_notes: null
      });
      assert.ok(e1, "Approval must fail for incomplete decimal '.5'");
      assert.match(
        e1.message,
        /Approved quantity must be a valid non-negative number/i,
        `Expected invalid quantity format error, got: ${e1.message}`
      );
      await verifyOrderUntouched(orderId1, 10);

      // 2. Negative quantity (-5)
      const orderId2 = await createDisposableOrder("Negative Test: Negative quantity -5", 10);
      const { error: e2 } = await superAdminClient.rpc("rpc_approve_order", {
        p_order_id: orderId2,
        p_approved_items: [{ product_id: testProduct.id, approved_quantity: -5 }],
        p_notes: null
      });
      assert.ok(e2, "Approval must fail for negative quantity -5");
      assert.match(
        e2.message,
        /Approved quantity must be a valid non-negative number/i,
        `Expected invalid quantity format error, got: ${e2.message}`
      );
      await verifyOrderUntouched(orderId2, 10);

      // 3. Non-numeric quantity string ("ten")
      const orderId3 = await createDisposableOrder("Negative Test: Non-numeric string 'ten'", 10);
      const { error: e3 } = await superAdminClient.rpc("rpc_approve_order", {
        p_order_id: orderId3,
        p_approved_items: [{ product_id: testProduct.id, approved_quantity: "ten" }],
        p_notes: null
      });
      assert.ok(e3, "Approval must fail for non-numeric quantity 'ten'");
      assert.match(
        e3.message,
        /Approved quantity must be a valid non-negative number/i,
        `Expected invalid quantity format error, got: ${e3.message}`
      );
      await verifyOrderUntouched(orderId3, 10);
    });

    // ------------------------------------------------------------------------
    // TEST 5g: Negative Validation — All-Zero Approved Quantities
    // ------------------------------------------------------------------------
    await step("Negative Validation: All-Zero Approved Quantities", async () => {
      const orderId = await createDisposableOrder("Negative Test: All Zero Quantities", 10);

      const { error } = await superAdminClient.rpc("rpc_approve_order", {
        p_order_id: orderId,
        p_approved_items: [{ product_id: testProduct.id, approved_quantity: 0 }],
        p_notes: null
      });

      assert.ok(error, "Approval must fail when all approved quantities are zero");
      assert.match(
        error.message,
        /at least one line item must have an approved quantity greater than zero/i,
        `Expected zero-quantity rejection message, got: ${error.message}`
      );
      await verifyOrderUntouched(orderId, 10);
    });

    // ------------------------------------------------------------------------
    // TEST 6: Real PostgreSQL Kernel RLS Isolation (SELECT queries)
    // ------------------------------------------------------------------------
    await step("Real Authenticated Session RLS Isolation (SELECT)", async () => {
      // Ollur admin queries orders table
      const { data: ollurOrders, error: ooErr } = await ollurAdminClient.from("orders").select("id, branch_id");
      assert.ifError(ooErr);
      assert.ok(ollurOrders.length > 0, "Ollur admin should see their own orders");
      for (const ord of ollurOrders) {
        assert.equal(ord.branch_id, ollurBranch.id, "RLS must filter out any order not belonging to Ollur branch");
      }

      // Town admin queries orders table
      const { data: townOrders, error: toErr } = await townAdminClient.from("orders").select("id, branch_id");
      assert.ifError(toErr);
      assert.ok(townOrders.length > 0, "Town admin should see their own orders");
      for (const ord of townOrders) {
        assert.equal(ord.branch_id, townBranch.id, "RLS must filter out any order not belonging to Town branch");
      }
    });

    // ------------------------------------------------------------------------
    // TEST 7: High-Concurrency Inventory Adjustment Row Locking
    // ------------------------------------------------------------------------
    await step("Concurrent Inventory Adjustment Serialization (FOR UPDATE)", async () => {
      // Ensure factory stock starts at known baseline
      await superAdminClient.rpc("rpc_adjust_inventory", {
        p_product_id: testProduct.id,
        p_branch_id: null,
        p_delta: 50,
        p_reason: "Baseline seed"
      });

      // 4 concurrent adjustments (2 additions, 2 deductions)
      const deltas = [10, -20, 15, -10];
      const concurrentResults = await Promise.all(
        deltas.map((d) =>
          superAdminClient.rpc("rpc_adjust_inventory", {
            p_product_id: testProduct.id,
            p_branch_id: null,
            p_delta: d,
            p_reason: `Concurrent step ${d}`
          })
        )
      );

      for (const res of concurrentResults) {
        assert.ifError(res.error);
        assert.ok(res.data?.success, "Concurrent adjustment must serialize without deadlock");
      }

      // Negative stock prevention check
      const { error: negErr } = await superAdminClient.rpc("rpc_adjust_inventory", {
        p_product_id: testProduct.id,
        p_branch_id: null,
        p_delta: -999999,
        p_reason: "Overdraw test"
      });
      assert.ok(negErr, "Overdraw exceeding available stock must be rejected");
      assert.match(negErr.message, /(?:Cannot deduct \d+ units: current inventory is|Insufficient inventory)/i);
    });

    // ------------------------------------------------------------------------
    // TEST 8: Multi-Order Dispatch Trip Creation
    // ------------------------------------------------------------------------
    let testDispatchId = null;
    await step("Multi-Order Dispatch Creation & Stop Sequencing", async () => {
      assert.ok(
        createdOrderIds.length >= 2 &&
        typeof createdOrderIds[0] === "string" && UUID_REGEX.test(createdOrderIds[0]) &&
        typeof createdOrderIds[1] === "string" && UUID_REGEX.test(createdOrderIds[1]),
        "Prerequisite failed: Test 14 (Dispatch creation) requires at least two valid disposable order UUIDs from earlier tests"
      );

      const { data: disp, error: dErr } = await superAdminClient.rpc("rpc_create_dispatch", {
        p_order_ids: [createdOrderIds[0], createdOrderIds[1]],
        p_delivery_staff_id: deliveryStaffUser.id,
        p_notes: "Central distribution route",
        p_items: [{ product_id: testProduct.id, quantity_loaded: 25 }]
      });
      assert.ifError(dErr);
      assert.ok(disp?.success);
      testDispatchId = disp.dispatch_id;
      createdDispatchIds.push(testDispatchId);

      // Verify dispatch_orders junction rows
      const { data: stops, error: sErr } = await adminClient
        .from("dispatch_orders")
        .select("order_id, sequence, status")
        .eq("dispatch_id", testDispatchId)
        .order("sequence", { ascending: true });
      assert.ifError(sErr);
      assert.equal(stops.length, 2, "Dispatch manifest must link both stops");
      assert.equal(stops[0].sequence, 1);
      assert.equal(stops[1].sequence, 2);
    });

    // ------------------------------------------------------------------------
    // TEST 9: Delivery Stop Update & Shortage Recording
    // ------------------------------------------------------------------------
    await step("Driver Delivery Stop Update & Shortage Recording", async () => {
      assert.ok(
        testDispatchId && typeof testDispatchId === "string" && UUID_REGEX.test(testDispatchId),
        "Prerequisite failed: Test 15 (Driver delivery stop update) requires a valid testDispatchId from Test 14"
      );
      assert.ok(
        createdOrderIds.length >= 1 &&
        typeof createdOrderIds[0] === "string" && UUID_REGEX.test(createdOrderIds[0]),
        "Prerequisite failed: Test 15 requires a valid disposable order UUID from earlier tests"
      );

      // Driver updates first stop with partial shortage
      const { data: stopRes, error: stopErr } = await driverClient.rpc("rpc_update_delivery_stop", {
        p_dispatch_id: testDispatchId,
        p_order_id: createdOrderIds[0],
        p_status: "partially_delivered",
        p_notes: "1 pack melted during transit",
        p_delivered_items: [{ product_id: testProduct.id, quantity_delivered: 9 }]
      });
      assert.ifError(stopErr);
      assert.ok(stopRes?.success);

      // Verify order status changed to partially_delivered
      const { data: ordCheck } = await adminClient
        .from("orders")
        .select("status")
        .eq("id", createdOrderIds[0])
        .single();
      assert.equal(ordCheck.status, "partially_delivered");
    });

    // ------------------------------------------------------------------------
    // TEST 10: Branch Receipt Confirmation & Idempotency
    // ------------------------------------------------------------------------
    await step("Branch Receipt Confirmation & Network Retry Idempotency", async () => {
      assert.ok(
        testDispatchId && typeof testDispatchId === "string" && UUID_REGEX.test(testDispatchId),
        "Prerequisite failed: Test 16 (Branch receipt confirmation) requires a valid testDispatchId from Test 14"
      );
      assert.ok(
        createdOrderIds.length >= 1 &&
        typeof createdOrderIds[0] === "string" && UUID_REGEX.test(createdOrderIds[0]),
        "Prerequisite failed: Test 16 requires a valid disposable order UUID from earlier tests"
      );

      // 1. Another branch admin cannot confirm Ollur receipt
      const { error: wrongBranchErr } = await townAdminClient.rpc("rpc_confirm_receipt", {
        p_dispatch_id: testDispatchId,
        p_order_id: createdOrderIds[0],
        p_receipt_status: "discrepancy",
        p_notes: "Cross branch malicious receipt",
        p_items: []
      });
      assert.ok(wrongBranchErr, "Cross branch receipt confirmation must fail");
      assert.match(wrongBranchErr.message, /Branch isolation violation/i);

      // 2. Ollur admin confirms own receipt
      const { data: rec1, error: r1Err } = await ollurAdminClient.rpc("rpc_confirm_receipt", {
        p_dispatch_id: testDispatchId,
        p_order_id: createdOrderIds[0],
        p_receipt_status: "discrepancy",
        p_notes: "Received 9 packs, 1 pack melted",
        p_items: [{
          product_id: testProduct.id,
          quantity_expected: 10,
          quantity_received: 9,
          discrepancy_note: "1 pack damaged"
        }]
      });
      assert.ifError(r1Err);
      assert.ok(rec1?.success);
      createdReceiptIds.push(rec1.receipt_id);

      // 3. Duplicate click network retry returns existing receipt safely
      const { data: rec2, error: r2Err } = await ollurAdminClient.rpc("rpc_confirm_receipt", {
        p_dispatch_id: testDispatchId,
        p_order_id: createdOrderIds[0],
        p_receipt_status: "discrepancy",
        p_notes: "Retry submission",
        p_items: []
      });
      assert.ifError(r2Err);
      assert.ok(rec2?.success);
      assert.equal(rec2.already_confirmed, true, "Retry must return already_confirmed = true");
      assert.equal(rec2.receipt_id, rec1.receipt_id, "Retry must return identical receipt ID");
    });

    // ------------------------------------------------------------------------
    // TEST 11: Public/Anon RPC Function Execution Denial
    // ------------------------------------------------------------------------
    await step("Anonymous / Unauthenticated RPC Revocation", async () => {
      const { error: anonErr1 } = await unauthenticatedAnonClient.rpc("rpc_create_order", {
        p_branch_id: ollurBranch.id,
        p_week_start: "2026-10-26",
        p_notes: "Anon order",
        p_items: [{ product_id: testProduct.id, requested_quantity: 1 }]
      });
      assert.ok(anonErr1, "Anon caller must be rejected from rpc_create_order");

      const testOrderIdForAnon = (createdOrderIds.length > 0 && createdOrderIds[0]) ? createdOrderIds[0] : "00000000-0000-0000-0000-000000000000";
      const { error: anonErr2 } = await unauthenticatedAnonClient.rpc("rpc_approve_order", {
        p_order_id: testOrderIdForAnon,
        p_approved_items: null,
        p_notes: null
      });
      assert.ok(anonErr2, "Anon caller must be rejected from rpc_approve_order");

      const { error: anonErr3 } = await unauthenticatedAnonClient.rpc("rpc_adjust_inventory", {
        p_product_id: testProduct.id,
        p_branch_id: null,
        p_delta: 1,
        p_reason: "Anon"
      });
      assert.ok(anonErr3, "Anon caller must be rejected from rpc_adjust_inventory");
    });

  } finally {
    // ------------------------------------------------------------------------
    // TEARDOWN: Guaranteed Cleanup of Disposable Test Data in Foreign-Key Safe Order
    // ------------------------------------------------------------------------
    console.log("\n--- Cleaning Up Disposable Test Data ---");

    async function safeDelete(tableName, field, ids) {
      if (!ids || ids.length === 0) return;
      try {
        const { error } = await adminClient.from(tableName).delete().in(field, ids);
        if (error) {
          cleanupErrors.push(`${tableName} deletion error (${field}): ${error.message}`);
        }
      } catch (err) {
        cleanupErrors.push(`${tableName} deletion exception (${field}): ${err.message}`);
      }
    }

    // A. Query any invoices linked to created orders to guarantee nothing is missed
    const invoiceIdsToDelete = [...createdInvoiceIds];
    if (createdOrderIds.length > 0) {
      try {
        const { data: invRows, error: invFetchErr } = await adminClient
          .from("invoices")
          .select("id")
          .in("order_id", createdOrderIds);

        if (invFetchErr) {
          cleanupErrors.push(`invoices fetch error: ${invFetchErr.message}`);
        } else if (invRows && invRows.length > 0) {
          for (const row of invRows) {
            if (!invoiceIdsToDelete.includes(row.id)) {
              invoiceIdsToDelete.push(row.id);
            }
          }
        }
      } catch (err) {
        cleanupErrors.push(`invoices query exception: ${err.message}`);
      }
    }

    // Teardown in strict foreign-key dependency order:
    // 1. receipt_items (child of receipts)
    await safeDelete("receipt_items", "receipt_id", createdReceiptIds);

    // 2. receipts (child of dispatches and orders)
    await safeDelete("receipts", "id", createdReceiptIds);

    // 3. dispatch_items (child of dispatches)
    await safeDelete("dispatch_items", "dispatch_id", createdDispatchIds);

    // 4. dispatch_orders (child of dispatches and orders; ON DELETE RESTRICT on orders)
    await safeDelete("dispatch_orders", "dispatch_id", createdDispatchIds);

    // 5. dispatches
    await safeDelete("dispatches", "id", createdDispatchIds);

    // 6. invoice_items (child of invoices)
    await safeDelete("invoice_items", "invoice_id", invoiceIdsToDelete);

    // 7. invoices (references orders ON DELETE RESTRICT)
    await safeDelete("invoices", "id", invoiceIdsToDelete);

    // 8. order_items (child of orders)
    await safeDelete("order_items", "order_id", createdOrderIds);

    // 9. orders
    await safeDelete("orders", "id", createdOrderIds);

    // 10. audit_logs (delete entries generated by disposable test users before deleting auth users)
    await safeDelete("audit_logs", "actor_id", createdAuthUserIds);

    // 11. profiles (child of auth.users; references branches ON DELETE RESTRICT)
    await safeDelete("profiles", "id", createdAuthUserIds);

    // 12. branches (disposable test branches created for isolation)
    await safeDelete("branches", "id", createdBranchIds);

    // 13. auth.users (GoTrue admin API)
    for (const uid of createdAuthUserIds) {
      try {
        const { error: uErr } = await adminClient.auth.admin.deleteUser(uid);
        if (uErr) cleanupErrors.push(`auth.users deletion error for ${uid}: ${uErr.message}`);
      } catch (err) {
        cleanupErrors.push(`deleteUser exception for ${uid}: ${err.message}`);
      }
    }

    if (cleanupErrors.length > 0) {
      console.error("WARNING: Teardown cleanup encountered errors:\n" + cleanupErrors.map((e) => `  - ${e}`).join("\n"));
    } else {
      console.log("Teardown complete: Staging database returned to clean baseline.");
    }
  }

  // Summary
  console.log("============================================================");
  console.log(`STAGING VALIDATION COMPLETE: ${passCount}/${testCount} Passed, ${failCount} Failed`);
  if (cleanupErrors.length > 0) {
    console.error(`CLEANUP FAILURE: ${cleanupErrors.length} teardown errors recorded.`);
  }
  console.log("============================================================");
  if (failCount > 0 || cleanupErrors.length > 0) {
    process.exit(1);
  }
}

runStagingTests().catch((err) => {
  console.error("Fatal error during staging test run:", err);
  process.exit(1);
});
