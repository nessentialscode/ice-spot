import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

test("1. BranchAdminView uses server-provided initialProducts as authoritative product source", () => {
  const file = fs.readFileSync(path.join(ROOT, "src/app/admin/branch/BranchAdminView.tsx"), "utf-8");

  assert.match(
    file,
    /const\s+products\s*=\s*initialProducts\s*\?\?\s*\[\];/,
    "BranchAdminView must use 'initialProducts ?? []' and never fall back to mock contextProducts"
  );
  assert.ok(
    !file.includes("contextProducts && contextProducts.length > 0 ? contextProducts : initialProducts"),
    "BranchAdminView must not prioritize contextProducts over initialProducts"
  );
});

test("2. BranchAdminView validates product identifiers with UUID_REGEX before order submission", () => {
  const file = fs.readFileSync(path.join(ROOT, "src/app/admin/branch/BranchAdminView.tsx"), "utf-8");

  assert.ok(
    file.includes("invalidItem") && file.includes("UUID_REGEX.test(it.productId)"),
    "BranchAdminView must validate every item productId against UUID_REGEX before submission"
  );
  assert.ok(
    file.includes("console.error") && file.includes("Product UUID validation failed"),
    "BranchAdminView must log diagnostic error on invalid product identifier"
  );
});

test("3. BranchAdminView passes serverOrderId, serverOrderNumber, and skipServerSync to prevent duplicate DB writes", () => {
  const file = fs.readFileSync(path.join(ROOT, "src/app/admin/branch/BranchAdminView.tsx"), "utf-8");

  assert.ok(
    file.includes("serverOrderId: result.data?.orderId"),
    "submitOrder must receive serverOrderId from createOrderAction result"
  );
  assert.ok(
    file.includes("serverOrderNumber: result.data?.orderNumber"),
    "submitOrder must receive serverOrderNumber from createOrderAction result"
  );
  assert.ok(
    file.includes("skipServerSync: true"),
    "submitOrder must receive skipServerSync: true to prevent duplicate createOrderAction"
  );
});

test("4. BranchAdminView disables submission and renders appropriate error state when no database products exist", () => {
  const file = fs.readFileSync(path.join(ROOT, "src/app/admin/branch/BranchAdminView.tsx"), "utf-8");

  assert.ok(
    file.includes("products.length === 0") && file.includes("No Authoritative Database Products Available"),
    "BranchAdminView must render an empty/error state when products.length === 0"
  );
  assert.ok(
    file.includes("disabled={") && file.includes("products.length === 0"),
    "Order submission button must be disabled when products.length === 0"
  );
});

test("5. AdminContext.submitOrder respects skipServerSync and preserves server order ID and sequence number", () => {
  const file = fs.readFileSync(path.join(ROOT, "src/context/AdminContext.tsx"), "utf-8");

  assert.ok(
    file.includes("if (!data.skipServerSync)"),
    "AdminContext must check !data.skipServerSync before calling createOrderAction"
  );
  assert.ok(
    file.includes("const orderId = data.serverOrderId ||"),
    "AdminContext must preserve serverOrderId if provided"
  );
  assert.ok(
    file.includes("data.serverOrderNumber"),
    "AdminContext must preserve serverOrderNumber if provided"
  );
});

test("6. Product UUID format validation logic strictly rejects mock IDs and accepts valid UUIDs", () => {
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // Mock product IDs that previously caused failures:
  assert.equal(UUID_REGEX.test("mango"), false);
  assert.equal(UUID_REGEX.test("strawberry"), false);
  assert.equal(UUID_REGEX.test("guava"), false);
  assert.equal(UUID_REGEX.test("bulk-mango-tub"), false);
  assert.equal(UUID_REGEX.test("bulk-kulfi-pot"), false);

  // Authoritative database UUIDs from public.products:
  assert.equal(UUID_REGEX.test("1b3e4fae-f068-4f79-b519-76e77d876e32"), true); // Sweet Strawberry
  assert.equal(UUID_REGEX.test("527d9a84-1ab0-4a59-8f0d-7631a790b13e"), true); // Creamy Guava & Mint
  assert.equal(UUID_REGEX.test("809f5a73-19b1-481d-8dd8-3c3e19d9ec72"), true); // Alphonso Mango
  assert.equal(UUID_REGEX.test("43dcc294-eabd-43f4-957e-f099c5a6c638"), true); // Tender Coconut
  assert.equal(UUID_REGEX.test("984fe887-9811-402e-bca3-77622eaa27eb"), true); // Belgian Chocolate
  assert.equal(UUID_REGEX.test("77bc1298-848b-42f1-a680-092bfb3ae683"), true); // Fresh Watermelon
  assert.equal(UUID_REGEX.test("76ae70b4-03bc-4912-9de2-8d2380756305"), true); // Zesty Kiwi
  assert.equal(UUID_REGEX.test("788d0141-2c88-43f0-b696-bed4f2e0c6b1"), true); // Wild Blueberry
  assert.equal(UUID_REGEX.test("53f23e18-627c-4ab8-ad8a-24b5c2bbe6a6"), true); // Sunshine Lemon
  assert.equal(UUID_REGEX.test("fa781afc-0caa-45e6-b8ae-69447d7cb488"), true); // Royal Pomegranate
  assert.equal(UUID_REGEX.test("f1b73c73-fdfa-494c-bb2b-21ce6a07d79a"), true); // Orea Cream
});

