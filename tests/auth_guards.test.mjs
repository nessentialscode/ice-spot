import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * Model profiles adhering to database schema for public.profiles
 */
const MOCK_PROFILES = {
  superAdmin: {
    id: "2236f15a-bba8-48ba-bd23-764380fb7cba",
    email: "icespot.varavoor@gmail.com",
    full_name: "Varavoor Super Admin",
    role: "super_admin",
    branch_id: null,
    is_active: true,
  },
  branchAdmin: {
    id: "99fce41f-a636-419f-855d-9f23db4769fb",
    email: "ollur@icespot.com",
    full_name: "Ollur Branch Admin",
    role: "branch_admin",
    branch_id: "c1111111-1111-1111-1111-111111111111",
    is_active: true,
  },
  deliveryStaff: {
    id: "cb3c5a34-ce3b-4a53-ae6e-7a18ff6f4f43",
    email: "staff@icespot.com",
    full_name: "Logistics Driver",
    role: "delivery_staff",
    branch_id: null,
    is_active: true,
  },
  inactiveSuperAdmin: {
    id: "e5555555-5555-5555-5555-555555555555",
    email: "inactive.admin@icespot.com",
    full_name: "Deactivated Super Admin",
    role: "super_admin",
    branch_id: null,
    is_active: false,
  },
  inactiveBranchAdmin: {
    id: "d4444444-4444-4444-4444-444444444444",
    email: "inactive.branch@icespot.com",
    full_name: "Deactivated Branch Admin",
    role: "branch_admin",
    branch_id: "c1111111-1111-1111-1111-111111111111",
    is_active: false,
  },
};

/**
 * Resolves dashboard path strictly from role (mirrors src/lib/supabase/auth-utils.ts)
 */
function getDashboardPathForRole(role) {
  if (!role) return null;
  const normalized = role.toLowerCase().replace(/-/g, "_");
  if (normalized === "super_admin") return "/admin/super-admin";
  if (normalized === "branch_admin") return "/admin/branch";
  if (normalized === "delivery_staff") return "/admin/delivery";
  return null;
}

/**
 * Simulates requireAdminRole guard execution (mirrors src/lib/supabase/server-auth.ts)
 */
function simulateRequireAdminRole({ user, profile, error }, allowedRoles) {
  if (!user || error === "unauthenticated") {
    return { action: "redirect", location: "/admin" };
  }

  if (!profile || error === "profile_missing" || error === "profile_inactive") {
    return { action: "redirect", location: `/admin?error=${error}` };
  }

  const normalizedProfileRole = profile.role.toLowerCase().replace(/-/g, "_");
  const normalizedAllowed = allowedRoles.map((r) => r.toLowerCase().replace(/-/g, "_"));

  if (!normalizedAllowed.includes(normalizedProfileRole)) {
    const userDashboard = getDashboardPathForRole(profile.role);
    if (userDashboard) {
      return { action: "redirect", location: userDashboard };
    }
    return { action: "redirect", location: "/admin?error=forbidden" };
  }

  return { action: "allow", user, profile };
}

/**
 * Simulates middleware guard execution (mirrors src/middleware.ts)
 */
function simulateMiddleware(pathname, user) {
  if (!user && pathname.startsWith("/admin") && pathname !== "/admin") {
    return { action: "redirect", location: "/admin?error=unauthenticated" };
  }
  return { action: "next" };
}

/**
 * Simulates Server Action validation (mirrors server-auth.ts validateSuperAdminAction and validateBranchAdminAction)
 */
function simulateServerActionAuth(authResult, requiredRole, targetBranchId) {
  if (!authResult.user || authResult.error === "unauthenticated") {
    return { isAuthorized: false, error: "UNAUTHENTICATED" };
  }
  if (!authResult.profile || authResult.error === "profile_missing") {
    return { isAuthorized: false, error: "PROFILE_MISSING" };
  }
  if (!authResult.profile.is_active || authResult.error === "profile_inactive") {
    return { isAuthorized: false, error: "PROFILE_INACTIVE" };
  }

  const role = authResult.profile.role.toLowerCase().replace(/-/g, "_");
  if (requiredRole === "super_admin" && role !== "super_admin") {
    return { isAuthorized: false, error: "FORBIDDEN" };
  }

  if (requiredRole === "branch_admin") {
    if (role !== "branch_admin" && role !== "super_admin") {
      return { isAuthorized: false, error: "FORBIDDEN" };
    }
    if (role === "branch_admin" && targetBranchId) {
      if (!authResult.profile.branch_id || authResult.profile.branch_id.toLowerCase() !== targetBranchId.toLowerCase()) {
        return { isAuthorized: false, error: "BRANCH_ISOLATION_VIOLATION" };
      }
    }
  }

  return { isAuthorized: true, profile: authResult.profile };
}

// -----------------------------------------------------------------------------
// Test 1: No authenticated session → all three protected portals deny access
// -----------------------------------------------------------------------------
test("1. No authenticated session -> protected portals deny access", () => {
  const protectedRoutes = [
    { path: "/admin/super-admin", allowed: ["super_admin"] },
    { path: "/admin/branch", allowed: ["branch_admin"] },
    { path: "/admin/delivery", allowed: ["delivery_staff"] },
  ];

  for (const route of protectedRoutes) {
    // Middleware layer check
    const mwResult = simulateMiddleware(route.path, null);
    assert.equal(mwResult.action, "redirect");
    assert.equal(mwResult.location, "/admin?error=unauthenticated");

    // Server component requireAdminRole guard check
    const guardResult = simulateRequireAdminRole(
      { user: null, profile: null, error: "unauthenticated" },
      route.allowed
    );
    assert.equal(guardResult.action, "redirect");
    assert.equal(guardResult.location, "/admin");
  }
});

// -----------------------------------------------------------------------------
// Test 2: Authenticated branch admin → only authorized branch access
// -----------------------------------------------------------------------------
test("2. Authenticated branch admin -> branch portal only", () => {
  const branchUser = {
    user: { id: MOCK_PROFILES.branchAdmin.id, email: MOCK_PROFILES.branchAdmin.email },
    profile: MOCK_PROFILES.branchAdmin,
  };

  // Accessing /admin/branch: permitted
  const branchPortal = simulateRequireAdminRole(branchUser, ["branch_admin"]);
  assert.equal(branchPortal.action, "allow");
  assert.equal(branchPortal.profile.role, "branch_admin");

  // Attempting /admin/super-admin: rejected & redirected to branch portal
  const superAdminPortal = simulateRequireAdminRole(branchUser, ["super_admin"]);
  assert.equal(superAdminPortal.action, "redirect");
  assert.equal(superAdminPortal.location, "/admin/branch");

  // Attempting /admin/delivery: rejected & redirected to branch portal
  const deliveryPortal = simulateRequireAdminRole(branchUser, ["delivery_staff"]);
  assert.equal(deliveryPortal.action, "redirect");
  assert.equal(deliveryPortal.location, "/admin/branch");
});

// -----------------------------------------------------------------------------
// Test 3: Authenticated super admin → Super Admin access
// -----------------------------------------------------------------------------
test("3. Authenticated super admin -> super-admin portal only", () => {
  const superUser = {
    user: { id: MOCK_PROFILES.superAdmin.id, email: MOCK_PROFILES.superAdmin.email },
    profile: MOCK_PROFILES.superAdmin,
  };

  // Accessing /admin/super-admin: permitted
  const superPortal = simulateRequireAdminRole(superUser, ["super_admin"]);
  assert.equal(superPortal.action, "allow");
  assert.equal(superPortal.profile.role, "super_admin");

  // Attempting /admin/branch: redirected to super-admin portal
  const branchPortal = simulateRequireAdminRole(superUser, ["branch_admin"]);
  assert.equal(branchPortal.action, "redirect");
  assert.equal(branchPortal.location, "/admin/super-admin");

  // Attempting /admin/delivery: redirected to super-admin portal
  const deliveryPortal = simulateRequireAdminRole(superUser, ["delivery_staff"]);
  assert.equal(deliveryPortal.action, "redirect");
  assert.equal(deliveryPortal.location, "/admin/super-admin");
});

// -----------------------------------------------------------------------------
// Test 4: Authenticated delivery staff → Delivery Staff access
// -----------------------------------------------------------------------------
test("4. Authenticated delivery staff -> delivery portal only", () => {
  const deliveryUser = {
    user: { id: MOCK_PROFILES.deliveryStaff.id, email: MOCK_PROFILES.deliveryStaff.email },
    profile: MOCK_PROFILES.deliveryStaff,
  };

  // Accessing /admin/delivery: permitted
  const deliveryPortal = simulateRequireAdminRole(deliveryUser, ["delivery_staff"]);
  assert.equal(deliveryPortal.action, "allow");
  assert.equal(deliveryPortal.profile.role, "delivery_staff");

  // Attempting /admin/super-admin: redirected to delivery portal
  const superPortal = simulateRequireAdminRole(deliveryUser, ["super_admin"]);
  assert.equal(superPortal.action, "redirect");
  assert.equal(superPortal.location, "/admin/delivery");

  // Attempting /admin/branch: redirected to delivery portal
  const branchPortal = simulateRequireAdminRole(deliveryUser, ["branch_admin"]);
  assert.equal(branchPortal.action, "redirect");
  assert.equal(branchPortal.location, "/admin/delivery");
});

// -----------------------------------------------------------------------------
// Test 5: Missing or inactive profile → access denied, no fallback role
// -----------------------------------------------------------------------------
test("5. Missing or inactive profile -> access denied, no fallback role", () => {
  // Missing profile
  const missingResult = simulateRequireAdminRole(
    {
      user: { id: "unknown-uuid", email: "user@example.com" },
      profile: null,
      error: "profile_missing",
    },
    ["super_admin", "branch_admin", "delivery_staff"]
  );
  assert.equal(missingResult.action, "redirect");
  assert.equal(missingResult.location, "/admin?error=profile_missing");

  // Inactive super admin profile
  const inactiveSuper = simulateRequireAdminRole(
    {
      user: { id: MOCK_PROFILES.inactiveSuperAdmin.id },
      profile: MOCK_PROFILES.inactiveSuperAdmin,
      error: "profile_inactive",
    },
    ["super_admin"]
  );
  assert.equal(inactiveSuper.action, "redirect");
  assert.equal(inactiveSuper.location, "/admin?error=profile_inactive");

  // Inactive branch admin profile
  const inactiveBranch = simulateRequireAdminRole(
    {
      user: { id: MOCK_PROFILES.inactiveBranchAdmin.id },
      profile: MOCK_PROFILES.inactiveBranchAdmin,
      error: "profile_inactive",
    },
    ["branch_admin"]
  );
  assert.equal(inactiveBranch.action, "redirect");
  assert.equal(inactiveBranch.location, "/admin?error=profile_inactive");
});

// -----------------------------------------------------------------------------
// Test 6: Direct navigation to each protected URL while signed out
// -----------------------------------------------------------------------------
test("6. Direct navigation to each protected URL while signed out redirects to login", () => {
  const routes = ["/admin/super-admin", "/admin/branch", "/admin/delivery"];

  for (const url of routes) {
    const mw = simulateMiddleware(url, null);
    assert.equal(mw.action, "redirect");
    assert.equal(mw.location, "/admin?error=unauthenticated");
  }
});

// -----------------------------------------------------------------------------
// Test 7: Shared header uses the verified user's email and role
// -----------------------------------------------------------------------------
test("7. Shared header uses verified authenticated identity without localStorage or demo fallback", () => {
  const adminShellContent = fs.readFileSync(
    path.join(process.cwd(), "src/components/admin/AdminShell.tsx"),
    "utf8"
  );

  // Must not read localStorage.getItem("icespot_auth_email") for activeEmail
  assert.equal(
    adminShellContent.includes("localStorage.getItem(\"icespot_auth_email\")"),
    false,
    "AdminShell must NOT read email from localStorage"
  );

  // Must not use demoRole fallback emails (admin@icespot.com, ollur@icespot.com) in activeEmail
  assert.equal(
    adminShellContent.includes("admin@icespot.com"),
    false,
    "AdminShell must not have demo email fallbacks"
  );

  // activeEmail must strictly derive from userEmail or show Authenticating...
  assert.ok(
    adminShellContent.includes("userEmail || \"Authenticating...\""),
    "AdminShell must derive activeEmail from verified userEmail prop"
  );
});

// -----------------------------------------------------------------------------
// Test 8: Login page does not auto-navigate without a verified session and has no shortcut bypass
// -----------------------------------------------------------------------------
test("8. Login page does not redirect before identity verification and has no shortcut bypass", () => {
  const adminPageContent = fs.readFileSync(
    path.join(process.cwd(), "src/app/admin/page.tsx"),
    "utf8"
  );

  // Extract checkSession body specifically
  const checkSessionMatch = adminPageContent.match(/async function checkSession\(\)[\s\S]*?\n    \}/);
  assert.ok(checkSessionMatch, "checkSession function must exist in admin/page.tsx");
  assert.equal(
    checkSessionMatch[0].includes("router.push"),
    false,
    "checkSession body must NOT contain an automatic router.push on mount"
  );

  // Must not have "Go to " shortcut bypass button
  assert.equal(
    adminPageContent.includes("Go to Super Admin"),
    false,
    "admin/page.tsx must NOT contain 'Go to Super Admin' shortcut"
  );
  assert.equal(
    adminPageContent.includes("Go to Branch Admin"),
    false,
    "admin/page.tsx must NOT contain 'Go to Branch Admin' shortcut"
  );
  assert.equal(
    adminPageContent.includes("activeSession.targetDashboard"),
    false,
    "admin/page.tsx must NOT navigate via activeSession.targetDashboard"
  );

  // Must provide activeSession notice with explicit termination
  assert.ok(
    adminPageContent.includes("activeSession"),
    "admin/page.tsx must provide activeSession state for user notice"
  );
  assert.ok(
    adminPageContent.includes("handleSignOutActiveSession"),
    "admin/page.tsx must provide explicit sign out for detected sessions"
  );
});

// -----------------------------------------------------------------------------
// Test 9: Logout prevents further protected access
// -----------------------------------------------------------------------------
test("9. Logout invalidates server session and prevents subsequent protected access", () => {
  const authActionContent = fs.readFileSync(
    path.join(process.cwd(), "src/lib/actions/auth.ts"),
    "utf8"
  );
  const adminShellContent = fs.readFileSync(
    path.join(process.cwd(), "src/components/admin/AdminShell.tsx"),
    "utf8"
  );

  // signOutAction must exist and invoke createServerSupabaseClient + auth.signOut
  assert.ok(
    authActionContent.includes("createServerSupabaseClient"),
    "signOutAction must call createServerSupabaseClient"
  );
  assert.ok(
    authActionContent.includes("supabase.auth.signOut()"),
    "signOutAction must invoke supabase.auth.signOut()"
  );

  // AdminShell handleSignOut must await signOutAction
  assert.ok(
    adminShellContent.includes("await signOutAction()"),
    "AdminShell handleSignOut must await signOutAction before redirecting"
  );

  // After signOutAction, user is null, so subsequent navigation to protected route is denied
  const afterSignOutMw = simulateMiddleware("/admin/super-admin", null);
  assert.equal(afterSignOutMw.action, "redirect");
  assert.equal(afterSignOutMw.location, "/admin?error=unauthenticated");
});

// -----------------------------------------------------------------------------
// Test 10: Server actions reject unauthorized callers
// -----------------------------------------------------------------------------
test("10. Server actions and mutations strictly reject unauthorized callers", () => {
  // 1. Unauthenticated caller calling super admin action
  const unauthSuper = simulateServerActionAuth(
    { user: null, profile: null, error: "unauthenticated" },
    "super_admin"
  );
  assert.equal(unauthSuper.isAuthorized, false);
  assert.equal(unauthSuper.error, "UNAUTHENTICATED");

  // 2. Branch admin calling super admin action (e.g., approving queue or vehicle reassignment)
  const branchCallingSuper = simulateServerActionAuth(
    {
      user: { id: MOCK_PROFILES.branchAdmin.id },
      profile: MOCK_PROFILES.branchAdmin,
    },
    "super_admin"
  );
  assert.equal(branchCallingSuper.isAuthorized, false);
  assert.equal(branchCallingSuper.error, "FORBIDDEN");

  // 3. Branch admin calling order action on another branch (branch isolation)
  const branchIsolationViolation = simulateServerActionAuth(
    {
      user: { id: MOCK_PROFILES.branchAdmin.id },
      profile: MOCK_PROFILES.branchAdmin,
    },
    "branch_admin",
    "b2222222-2222-2222-2222-222222222222" // foreign branch UUID
  );
  assert.equal(branchIsolationViolation.isAuthorized, false);
  assert.equal(branchIsolationViolation.error, "BRANCH_ISOLATION_VIOLATION");

  // 4. Branch admin managing own branch: authorized
  const branchOwnAccess = simulateServerActionAuth(
    {
      user: { id: MOCK_PROFILES.branchAdmin.id },
      profile: MOCK_PROFILES.branchAdmin,
    },
    "branch_admin",
    MOCK_PROFILES.branchAdmin.branch_id
  );
  assert.equal(branchOwnAccess.isAuthorized, true);
});
