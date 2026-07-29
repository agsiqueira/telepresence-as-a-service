import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const read = path => readFileSync(path, "utf8");
const currentUser = read("lib/current-user.ts"), pageAuth = read("lib/page-auth.ts"), middleware = read("middleware.ts"), home = read("app/page.tsx"), deactivated = read("app/account-deactivated/page.tsx");
assert.match(currentUser, /ACCOUNT_DEACTIVATED_CODE = "ACCOUNT_DEACTIVATED"/);
assert.match(currentUser, /isAccountDeactivated/); assert.match(currentUser, /user\?\.accountStatus === AccountStatus\.DEACTIVATED/);
assert.match(currentUser, /status: 403/);
assert.match(pageAuth, /isAccountDeactivated\(user\)[\s\S]*redirect\("\/account-deactivated"\)/);
assert.match(home, /isAccountDeactivated\(user\).*redirect\("\/account-deactivated"\)/);
assert.match(middleware, /"\/account-deactivated"/);
assert.match(deactivated, /SignOutButton/); assert.match(deactivated, /AccountStatus\.ACTIVE/); assert.doesNotMatch(deactivated, /reason|audit|actor|clerkId/i);
for (const layout of ["app/viewer/layout.tsx", "app/operator/layout.tsx", "app/admin/layout.tsx"]) assert.match(read(layout), /requirePageRole/);

const routeFiles = execFileSync("rg", ["--files", "app/api"], { encoding: "utf8" }).trim().split(/\r?\n/).filter(file => file.endsWith("route.ts"));
for (const file of routeFiles) {
  const source = read(file);
  assert.match(source, /authorizeApiUser|authorizeAdminApi|deactivatedAccountApiResponse|getCurrentPersistedUser|createAccessStateHandler|createViewerOperatorApplication|createAdminOperatorApplication|createRoleTransitionHandler|createAccountLifecycleHandler|createAdministratorGovernanceHandler/, `${file} must use a centralized account-status enforcement seam`);
}
console.log(`Phase 5E.1B account-status enforcement assertions passed across ${routeFiles.length} protected API routes.`);
