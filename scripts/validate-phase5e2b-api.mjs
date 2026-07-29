import assert from "node:assert/strict";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const route = readFileSync("app/api/admin/participants/[reference]/administrator/route.ts", "utf8");
const helper = readFileSync("lib/administrator-governance-api.ts", "utf8");
const projection = readFileSync("lib/admin.ts", "utf8");
assert.match(route, /POST = createAdministratorGovernanceHandler\("assign-administrator"\)/);
assert.match(route, /DELETE = createAdministratorGovernanceHandler\("remove-administrator"\)/);
assert.doesNotMatch(route, /PATCH|PUT|\$transaction|actorId|clerk/i);
assert.match(helper, /getCurrentPersistedUser/); assert.match(helper, /actor\.accountStatus !== AccountStatus\.ACTIVE/); assert.match(helper, /actor\.role !== Role\.ADMIN/);
assert.match(helper, /Object\.keys\(body\)\.length !== 1/); assert.match(helper, /dependencies\.govern\(db, actor\.id, targetId/); assert.doesNotMatch(helper, /clerkId|activeTripId|pendingOfferTripId|adminRoleChangeAudit\.create/);
for (const field of ["canAssignAdministrator", "canRemoveAdministrator", "administratorActionBlockedReason", "isCurrentAdmin"]) assert.match(projection, new RegExp(field));
assert.doesNotMatch(projection, /clerkId/); assert.match(projection, /user\.role === Role\.OPERATOR/); assert.match(projection, /user\.role === Role\.ADMIN/);

const compile = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "scripts/tsconfig.phase3-db.json"], { stdio: "inherit" });
if (compile.status !== 0) process.exit(compile.status ?? 1);
const root = ".phase3-test-build", built = `${root}/lib/administrator-governance-api.js`, alias = `${root}/node_modules/@/lib`;
writeFileSync(built, readFileSync(built, "utf8").replace('require("server-only");', "")); mkdirSync(alias, { recursive: true });
writeFileSync(`${alias}/current-user.js`, "exports.getCurrentPersistedUser = async () => null;\n");
writeFileSync(`${alias}/db.js`, "exports.db = Object.freeze({ marker: 'application-db' });\n");
writeFileSync(`${alias}/admin.js`, "exports.getAdminParticipant = async () => null;\n");
writeFileSync(`${alias}/administrator-governance.js`, "exports.assignAdministrator = async () => { throw new Error('unexpected default'); }; exports.removeAdministrator = exports.assignAdministrator;\n");
cpSync(built, `${alias}/administrator-governance-api.js`);
const { createAdministratorGovernanceHandler } = await import(`../${built}`);
const validId = "participant_local_123", admin = { id: "actor-local", role: "ADMIN", accountStatus: "ACTIVE" };
const participant = { reference: validId, displayName: "Alex", role: "ADMIN", accountStatus: "ACTIVE", deactivatedAt: null, isCurrentAdmin: false, canAssignAdministrator: false, canRemoveAdministrator: true, administratorActionBlockedReason: null, joinedDate: "2026-07-01" };
const success = { ok: true, value: { targetId: validId, previousRole: "VIEWER", newRole: "ADMIN", accountStatus: "ACTIVE", auditId: "audit-private" } };
const invoke = (handler, body, reference = validId, method = "POST", contentType = "application/json") => handler(new Request("http://localhost/action", { method, headers: { "Content-Type": contentType }, body }), { params: { reference } });
const bodyOf = response => response.json();
let calls = [];
const govern = async (...args) => { calls.push(args); return success; }, project = async () => participant;

let response = await invoke(createAdministratorGovernanceHandler("assign-administrator", { getUser: async () => null, govern, project }), JSON.stringify({ reason: "valid" }));
assert.equal(response.status, 401); assert.equal((await bodyOf(response)).code, "UNAUTHORIZED"); assert.equal(calls.length, 0);
for (const reference of ["", " bad", "bad id", "bad!", "x".repeat(65)]) { calls = []; response = await invoke(createAdministratorGovernanceHandler("assign-administrator", { getUser: async () => admin, govern, project }), JSON.stringify({ reason: "valid" }), reference); assert.equal(response.status, 400); assert.equal((await bodyOf(response)).code, "INVALID_TARGET_ID"); assert.equal(calls.length, 0); }
for (const actor of [{ id: "viewer", role: "VIEWER", accountStatus: "ACTIVE" }, { id: "inactive-admin", role: "ADMIN", accountStatus: "DEACTIVATED" }]) {
  calls = []; response = await invoke(createAdministratorGovernanceHandler("assign-administrator", { getUser: async () => actor, govern, project }), JSON.stringify({ reason: "valid" }));
  assert.equal(response.status, 403); assert.equal(calls.length, 0); assert.equal((await bodyOf(response)).code, actor.role === "ADMIN" ? "ACCOUNT_DEACTIVATED" : "ACTOR_NOT_ACTIVE_ADMIN");
}
for (const [body, code] of [["{", "INVALID_JSON"], [JSON.stringify({}), "INVALID_REQUEST_BODY"], [JSON.stringify({ reason: "valid", actorId: "forged" }), "INVALID_REQUEST_BODY"], [JSON.stringify({ reason: "valid", role: "ADMIN" }), "INVALID_REQUEST_BODY"]]) {
  calls = []; response = await invoke(createAdministratorGovernanceHandler("assign-administrator", { getUser: async () => admin, govern, project }), body); assert.equal(response.status, 400); assert.equal((await bodyOf(response)).code, code); assert.equal(calls.length, 0);
}
response = await invoke(createAdministratorGovernanceHandler("assign-administrator", { getUser: async () => admin, govern, project }), JSON.stringify({ reason: "valid" }), validId, "POST", "text/plain");
assert.equal(response.status, 400); assert.equal((await bodyOf(response)).code, "UNSUPPORTED_CONTENT_TYPE");
calls = []; response = await invoke(createAdministratorGovernanceHandler("assign-administrator", { getUser: async () => admin, govern, project }), JSON.stringify({})); assert.equal(response.status, 400); assert.equal((await bodyOf(response)).code, "INVALID_REQUEST_BODY"); assert.equal(calls.length, 0);
for (const reason of [42, "", "   ", "x".repeat(501)]) {
  const rejecting = async (...args) => { calls.push(args); return { ok: false, code: "INVALID_REASON", status: 400, error: "raw" }; };
  calls = []; response = await invoke(createAdministratorGovernanceHandler("assign-administrator", { getUser: async () => admin, govern: rejecting, project }), JSON.stringify({ reason })); assert.equal(response.status, 400); assert.equal((await bodyOf(response)).code, "INVALID_REASON"); assert.equal(calls.length, 1);
}
for (const [operation, method] of [["assign-administrator", "POST"], ["remove-administrator", "DELETE"]]) {
  calls = []; response = await invoke(createAdministratorGovernanceHandler(operation, { getUser: async () => admin, govern, project }), JSON.stringify({ reason: `  ${"x".repeat(500)}  ` }), validId, method);
  assert.equal(response.status, 200); const output = await bodyOf(response); assert.deepEqual(output, { participant }); assert.doesNotMatch(JSON.stringify(output), /clerk|audit-private|trip|offer/i); assert.equal(calls[0][1], admin.id); assert.equal(calls[0][2], validId); assert.equal(response.headers.get("cache-control"), "no-store");
}
for (const scenario of [
  { operation: "assign-administrator", previousRole: "VIEWER", newRole: "ADMIN", accountStatus: "ACTIVE" },
  { operation: "assign-administrator", previousRole: "OPERATOR", newRole: "ADMIN", accountStatus: "ACTIVE" },
  { operation: "remove-administrator", previousRole: "ADMIN", newRole: "VIEWER", accountStatus: "ACTIVE" },
  { operation: "remove-administrator", previousRole: "ADMIN", newRole: "VIEWER", accountStatus: "DEACTIVATED" },
]) {
  const projected = { ...participant, role: scenario.newRole, accountStatus: scenario.accountStatus, canAssignAdministrator: scenario.newRole === "VIEWER" && scenario.accountStatus === "ACTIVE", canRemoveAdministrator: scenario.newRole === "ADMIN" };
  response = await invoke(createAdministratorGovernanceHandler(scenario.operation, { getUser: async () => admin, govern: async () => ({ ok: true, value: { targetId: validId, ...scenario, auditId: "not-public" } }), project: async () => projected }), JSON.stringify({ reason: "valid" }), validId, scenario.operation === "assign-administrator" ? "POST" : "DELETE");
  assert.equal(response.status, 200); const output = await bodyOf(response); assert.deepEqual(output, { participant: projected }); assert.equal(output.participant.accountStatus, scenario.accountStatus); assert.doesNotMatch(JSON.stringify(output), /not-public|clerkId|activeTripId|pendingOfferTripId/);
}
assert.doesNotMatch(route + helper, /ADMIN.{0,20}(?:→|->|to).{0,20}OPERATOR|targetRole|replacementRole/i);
const mappings = { ACTOR_NOT_FOUND: 401, ACTOR_NOT_ACTIVE_ADMIN: 403, SELF_GOVERNANCE_FORBIDDEN: 403, TARGET_NOT_FOUND: 404, TARGET_INACTIVE: 409, INVALID_CURRENT_ROLE: 409, LAST_ACTIVE_ADMIN: 409, ACTIVE_ACCOUNT_OBLIGATION: 409, PENDING_OPERATOR_APPLICATION_EXISTS: 409, SERIALIZATION_RETRY_EXHAUSTED: 409, INTERNAL_INVARIANT_FAILURE: 500 };
for (const [code, status] of Object.entries(mappings)) { response = await invoke(createAdministratorGovernanceHandler("assign-administrator", { getUser: async () => admin, govern: async () => ({ ok: false, code, status: 500, error: "private trip secret Prisma SQL" }), project }), JSON.stringify({ reason: "valid" })); assert.equal(response.status, status); const output = await bodyOf(response); assert.equal(output.code, code); assert.doesNotMatch(JSON.stringify(output), /private|Prisma|SQL|trip secret/i); }
rmSync(root, { recursive: true, force: true });
console.log("Phase 5E.2B administrator-governance API and projection assertions passed.");
