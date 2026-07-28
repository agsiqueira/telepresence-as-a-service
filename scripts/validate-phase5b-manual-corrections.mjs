import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(path, "utf8");
const currentUser = read("lib/current-user.ts");
const marketplace = read("lib/marketplace.ts");
const profiles = read("lib/profiles.ts");
const admin = read("lib/admin.ts");
const settings = read("app/api/operator/settings/route.ts");
const operator = read("app/operator/page.tsx");
const profileUi = read("components/ProfileSettings.tsx");

assert.doesNotMatch(currentUser, /currentUser\(\)|clerkUser|firstName|username|emailAddresses/);
assert.match(currentUser, /create: \{ clerkId: userId, name: null \}/);
assert.match(marketplace, /displayName: string \| null/);
assert.match(marketplace, /displayName\?\.trim\(\)/);
assert.match(profiles, /profileIsComplete\(profile,[\s\S]*publicDisplayName\(user\.name\)\)/);
assert.match(admin, /displayName: publicDisplayName\(user\.name\) \|\| "Unnamed participant"/);
assert.match(admin, /profileIsComplete\(user\.operatorProfile,[\s\S]*publicDisplayName\(user\.name\)\)/);
assert.doesNotMatch(admin, /clerkId|emailAddresses|firstName|username/);
assert.match(settings, /evaluateOperatorReadiness/);
assert.match(settings, /readiness/);
assert.match(operator, /createResilientPoller/);
assert.match(operator, /intervalMs: 10000/);
assert.match(operator, /maxIntervalMs: 30000/);
assert.match(operator, /if \(activeTrip\) return/);
assert.match(operator, /requireJsonResponse<SettingsPayload>/);
assert.match(operator, /Pilot approval confirmed/);
assert.match(operator, /window\.addEventListener\("focus"/);
assert.match(operator, /visibilitychange/);
assert.match(profileUi, /operator-profile-updated/);

console.log("Phase 5B display-name and operator-status reconciliation assertions passed.");
