import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const compile = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "scripts/tsconfig.phase3-db.json"], { stdio: "inherit" });
if (compile.status !== 0) process.exit(compile.status ?? 1);
for (const module of ["marketplace", "profiles", "admin"]) { const path = `.phase3-test-build/lib/${module}.js`; writeFileSync(path, readFileSync(path, "utf8").replace('require("server-only");', "")); }
const alias = ".phase3-test-build/node_modules/@/lib"; mkdirSync(alias, { recursive: true }); for (const module of ["marketplace", "profiles"]) cpSync(`.phase3-test-build/lib/${module}.js`, `${alias}/${module}.js`);
const { destinationSlug, parseParticipantQuery, validateAdminDestination } = await import("../.phase3-test-build/lib/admin.js");
assert.deepEqual(parseParticipantQuery(new URLSearchParams("limit=20&page=2&role=OPERATOR&status=APPROVED&search=%20Pilot%20%20Operator%20")), { limit: 20, page: 2, role: "OPERATOR", status: "APPROVED", search: "Pilot Operator" });
for (const query of ["limit=0", "limit=51", "page=0", "role=ADMIN", "status=UNKNOWN", `search=${"x".repeat(81)}`]) assert.equal(parseParticipantQuery(new URLSearchParams(query)), null);
const destination = { name: " Museum ", shortDescription: " Remote visit ", city: " Pilot City ", meetingArea: " Main entrance ", category: "Culture", durationOptions: [30, 30], imageUrl: null, custom: false, active: true };
assert.equal(validateAdminDestination(destination, true).ok, true);
assert.equal(validateAdminDestination({ ...destination, role: "ADMIN" }, true).ok, false);
assert.equal(validateAdminDestination({ ...destination, name: " " }, true).ok, false);
assert.equal(validateAdminDestination({ ...destination, imageUrl: "http://unsafe.example" }, true).ok, false);
assert.equal(validateAdminDestination({ ...destination }, false).ok, false);
assert.equal(destinationSlug("  Pilot Museum & Gardens  "), "pilot-museum-gardens");
rmSync(".phase3-test-build", { recursive: true, force: true });
console.log("Phase 5B administrative validation service assertions passed.");
