import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(path, "utf8");
const schema = read("prisma/schema.prisma");
const migration = read("prisma/migrations/20260727230000_phase5a_profiles_and_eligibility/migration.sql");
const auth = read("lib/current-user.ts");
const profiles = read("lib/profiles.ts");
const viewerRoute = read("app/api/viewer/profile/route.ts");
const operatorRoute = read("app/api/operator/profile/route.ts");
const settings = read("app/api/operator/settings/route.ts");
const online = read("app/api/operator/online/route.ts");
const marketplace = read("lib/marketplace.ts");
const provision = read("scripts/provision-initial-admin.mjs");
const profileUi = read("components/ProfileSettings.tsx");

assert.match(schema, /enum Role \{\s+ADMIN\s+OPERATOR\s+VIEWER/);
assert.match(schema, /enum OperatorPilotStatus[\s\S]*PENDING[\s\S]*APPROVED[\s\S]*SUSPENDED/);
assert.match(schema, /preferredLanguage\s+String\?/);
assert.match(schema, /accessibilityPreferences\s+String\[\]\s+@default\(\[\]\)/);
assert.match(schema, /pilotStatus\s+OperatorPilotStatus\s+@default\(PENDING\)/);
for (const sql of ["ALTER TYPE \"Role\" ADD VALUE 'ADMIN'", "CREATE TYPE \"OperatorPilotStatus\"", "accessibilityPreferences", "pilotStatus"]) assert.ok(migration.includes(sql));
assert.match(auth, /requireAdmin/);
assert.match(auth, /user\.role === Role\.ADMIN/);
for (const route of [viewerRoute, operatorRoute]) {
  assert.match(route, /status: 401/);
  assert.match(route, /status: 403/);
  assert.match(route, /Unsupported profile field|validate.*Profile|validateOperatorPresentation/);
  assert.doesNotMatch(route, /clerkId: true|role: true|email/);
}
assert.match(profiles, /VIEWER_FIELDS = new Set\(\["displayName", "preferredLanguage", "accessibilityPreferences"\]\)/);
assert.match(profiles, /OPERATOR_PRESENTATION_FIELDS = new Set\(\["displayName"\]\)/);
assert.match(profiles, /AWAITING_APPROVAL/);
assert.match(profiles, /SUSPENDED/);
assert.match(profiles, /ACTIVE_ASSIGNMENT/);
assert.match(profiles, /setOperatorPilotStatus/);
assert.match(profiles, /data: \{ online: false \}/);
assert.match(settings, /pilotStatus: true/);
assert.match(settings, /getCurrentUser/);
assert.match(online, /evaluateOperatorReadiness/);
assert.match(online, /reason: readiness\.code/);
assert.match(marketplace, /pilotStatus: OperatorPilotStatus\.APPROVED/g);
assert.match(provision, /--confirm=PROVISION_INITIAL_ADMIN/);
assert.doesNotMatch(provision, /console\.log\([^)]*target/);
assert.match(profileUi, /aria-busy="true"/);
assert.match(profileUi, /saving\.current/);
assert.match(profileUi, /min-h-11/);
assert.match(profileUi, /response\.status === 401 \|\| response\.status === 403/);

console.log("Phase 5A role, profile, privacy, and eligibility structural assertions passed.");
