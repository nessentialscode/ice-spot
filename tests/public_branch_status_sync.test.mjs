import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

test("1. BranchCard renders open/closed status badge based on branch.isOpen", () => {
  const file = fs.readFileSync(path.join(ROOT, "src/components/locations/BranchCard.tsx"), "utf-8");

  assert.ok(
    file.includes("branch-op-badge") && file.includes("op-open") && file.includes("op-closed"),
    "BranchCard must render operational status badges with op-open and op-closed classes"
  );
  assert.ok(
    file.includes("branch-header-badges"),
    "BranchCard must group header badges cleanly"
  );
  assert.ok(
    file.includes("branch.isOpen"),
    "BranchCard must inspect branch.isOpen property"
  );
});

test("2. BranchDirectory syncs branch operational status from storage, events, and database action", () => {
  const file = fs.readFileSync(path.join(ROOT, "src/components/locations/BranchDirectory.tsx"), "utf-8");

  assert.ok(
    file.includes("icespot_branch_status_update"),
    "BranchDirectory must listen for icespot_branch_status_update custom events"
  );
  assert.ok(
    file.includes("icespot_admin_demo_state_v2"),
    "BranchDirectory must read shared admin demo state from localStorage"
  );
  assert.ok(
    file.includes("getAllBranchStatusesAction"),
    "BranchDirectory must integrate getAllBranchStatusesAction for remote database status sync"
  );
  assert.ok(
    file.includes("isFactoryOpen"),
    "BranchDirectory must reflect operational status on the Varavoor Factory flagship card"
  );
});

test("3. AdminContext dispatches branch status synchronization events across portal and public views", () => {
  const file = fs.readFileSync(path.join(ROOT, "src/context/AdminContext.tsx"), "utf-8");

  assert.ok(
    file.includes('new CustomEvent("icespot_branch_status_update"'),
    "AdminContext must dispatch icespot_branch_status_update custom event on status toggles"
  );
  assert.ok(
    file.includes("toggleBranchOpenStatus"),
    "AdminContext must provide toggleBranchOpenStatus"
  );
  assert.ok(
    file.includes("setAllBranchesOpenStatus"),
    "AdminContext must provide setAllBranchesOpenStatus"
  );
});

test("4. Server actions in branches.ts provide batch status loading and support multi-identifier resolution", () => {
  const file = fs.readFileSync(path.join(ROOT, "src/lib/actions/branches.ts"), "utf-8");

  assert.ok(
    file.includes("export async function getAllBranchStatusesAction"),
    "branches.ts must export getAllBranchStatusesAction"
  );
  assert.ok(
    file.includes("BRANCH_CODE_LOOKUP"),
    "branches.ts must resolve branch slugs to canonical codes"
  );
});

test("5. CSS contains styles for branch open/closed pills and pulse dot animation", () => {
  const file = fs.readFileSync(path.join(ROOT, "src/app/globals.css"), "utf-8");

  assert.ok(
    file.includes(".branch-op-badge") && file.includes(".op-open") && file.includes(".op-closed"),
    "globals.css must define .branch-op-badge, .op-open, and .op-closed"
  );
  assert.ok(
    file.includes("branch-dot-pulse"),
    "globals.css must define branch-dot-pulse animation for open status dot"
  );
});

test("6. BranchAdminView uses native calendar date picker defaulting to today's date", () => {
  const file = fs.readFileSync(path.join(ROOT, "src/app/admin/branch/BranchAdminView.tsx"), "utf-8");

  assert.ok(
    file.includes('type="date"'),
    "Requested delivery date must use type='date' for calendar picking"
  );
  assert.ok(
    file.includes("getTodayDateString"),
    "Requested delivery date must initialize with today's date helper"
  );
  assert.ok(
    file.includes("showPicker"),
    "Input should invoke showPicker for enhanced calendar interaction"
  );
});

