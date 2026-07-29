import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const helper = readFileSync("lib/account-lifecycle-api.ts", "utf8");
const deactivate = readFileSync("app/api/admin/participants/[reference]/deactivate/route.ts", "utf8");
const reactivate = readFileSync("app/api/admin/participants/[reference]/reactivate/route.ts", "utf8");
assert.match(deactivate, /createAccountLifecycleHandler\("deactivate"\)/); assert.match(reactivate, /createAccountLifecycleHandler\("reactivate"\)/);
assert.doesNotMatch(deactivate + reactivate, /\$transaction|clerk|actorId|role|status|timestamp/i);
assert.match(helper, /authorizeApiUser\(Role\.ADMIN\)/); assert.match(helper, /Content-Type must be application\/json/); assert.match(helper, /Object\.keys\(body\)\.length !== 1/); assert.match(helper, /INVALID_TARGET_ID/);
assert.match(helper, /deactivateAccount/); assert.match(helper, /reactivateAccount/); assert.doesNotMatch(helper, /\$transaction|user\.(?:update|delete)|clerkClient|metadata/);
for (const code of ["SELF_DEACTIVATION_FORBIDDEN", "LAST_ACTIVE_ADMIN", "ACTIVE_ACCOUNT_OBLIGATION", "ACCOUNT_ALREADY_ACTIVE", "ACCOUNT_ALREADY_DEACTIVATED"]) assert.match(helper, new RegExp(code));
assert.match(helper, /conflictCodes\.has\(result\.code\) \? 409/); assert.match(helper, /result\.status/); assert.match(helper, /Cache-Control/);
const admin = readFileSync("lib/admin.ts", "utf8"), route = readFileSync("app/api/admin/participants/route.ts", "utf8");
assert.match(admin, /accountStatus/); assert.match(admin, /deactivatedAt/); assert.match(admin, /isCurrentAdmin/); assert.doesNotMatch(admin, /clerkId/); assert.match(route, /auth\.user\.id/);
console.log("Phase 5E.1B lifecycle API and safe participant projection assertions passed.");
