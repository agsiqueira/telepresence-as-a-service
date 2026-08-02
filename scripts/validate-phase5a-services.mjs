import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const compile = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "scripts/tsconfig.phase3-db.json"], { stdio: "inherit" });
if (compile.status !== 0) process.exit(compile.status ?? 1);
for (const module of ["marketplace", "marketplace-vocabulary", "profiles", "safety-restriction-lock"]) {
  const path = `.phase3-test-build/lib/${module}.js`;
  writeFileSync(path, readFileSync(path, "utf8").replace('require("server-only");', ""));
}
const alias = ".phase3-test-build/node_modules/@/lib";
mkdirSync(alias, { recursive: true });
cpSync(".phase3-test-build/lib/marketplace.js", `${alias}/marketplace.js`);
cpSync(".phase3-test-build/lib/marketplace-vocabulary.js", `${alias}/marketplace-vocabulary.js`);
cpSync(".phase3-test-build/lib/safety-restriction-lock.js", `${alias}/safety-restriction-lock.js`);
const { publicDisplayName, validateOperatorPresentation, validateViewerProfile } = await import("../.phase3-test-build/lib/profiles.js");
const { profileIsComplete } = await import("../.phase3-test-build/lib/marketplace.js");

assert.deepEqual(validateViewerProfile({ displayName: "  Pilot   Viewer ", preferredLanguage: "English", accessibilityPreferences: ["Slower-paced visit", "Slower-paced visit"] }), { ok: true, value: { displayName: "Pilot Viewer", preferredLanguage: "English", accessibilityPreferences: ["Slower-paced visit"] } });
for (const body of [
  { displayName: "Viewer", preferredLanguage: "", accessibilityPreferences: [], role: "ADMIN" },
  { displayName: "Viewer", preferredLanguage: "Unsupported", accessibilityPreferences: [] },
  { displayName: "   ", preferredLanguage: "", accessibilityPreferences: [] },
  { displayName: "private@example.test", preferredLanguage: "", accessibilityPreferences: [] },
]) assert.equal(validateViewerProfile(body).ok, false);
assert.equal(validateOperatorPresentation({ displayName: "Operator", pilotStatus: "APPROVED" }).ok, false);
assert.equal(validateOperatorPresentation({ displayName: " Operator " }).ok, true);
assert.equal(publicDisplayName("private@example.test"), "");
const completeOperator = { operatingArea: "Pilot City", serviceRadiusKm: 10, languages: ["English"], accessibilityCapabilities: [], durationOptions: [30] };
assert.equal(profileIsComplete(completeOperator, 1, false, "Persisted Operator"), true);
assert.equal(profileIsComplete(completeOperator, 1, false, ""), false);
rmSync(".phase3-test-build", { recursive: true, force: true });
console.log("Phase 5A profile validation service assertions passed.");
