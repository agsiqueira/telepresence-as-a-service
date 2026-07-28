import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const assignRoutePath = "app/api/admin/users/[id]/assign-operator/route.ts";
const returnRoutePath = "app/api/admin/users/[id]/return-to-viewer/route.ts";
const helperPath = "lib/role-transition-api.ts";
const assignRoute = readFileSync(assignRoutePath, "utf8");
const returnRoute = readFileSync(returnRoutePath, "utf8");
const helperSource = readFileSync(helperPath, "utf8");

assert.match(assignRoute, /export const POST = createRoleTransitionHandler\("assign-operator"\)/);
assert.match(returnRoute, /export const POST = createRoleTransitionHandler\("return-to-viewer"\)/);
for (const route of [assignRoute, returnRoute]) {
  assert.doesNotMatch(route, /export const (GET|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(route, /prisma|\.user\.|\.trip|\.operatorProfile|\.adminRoleChangeAudit/);
}
assert.match(helperSource, /getCurrentUser/);
assert.match(helperSource, /actor\.role !== Role\.ADMIN/);
assert.match(helperSource, /dependencies\.transition\(db, actor\.id, params\.id\)/);
assert.doesNotMatch(helperSource, /Clerk|metadata|actorId.*(?:json|body|headers|params)/i);

const compile = spawnSync(
  process.execPath,
  ["node_modules/typescript/bin/tsc", "-p", "scripts/tsconfig.phase3-db.json"],
  { stdio: "inherit" }
);
if (compile.status !== 0) process.exit(compile.status ?? 1);

const buildRoot = ".phase3-test-build";
const helperBuild = `${buildRoot}/lib/role-transition-api.js`;
writeFileSync(helperBuild, readFileSync(helperBuild, "utf8").replace('require("server-only");', ""));
const alias = `${buildRoot}/node_modules/@/lib`;
mkdirSync(alias, { recursive: true });
writeFileSync(`${alias}/current-user.js`, "exports.getCurrentUser = async () => null;\n");
writeFileSync(`${alias}/db.js`, "exports.db = Object.freeze({ marker: 'application-db' });\n");
writeFileSync(`${alias}/role-transitions.js`, [
  "exports.assignViewerAsOperator = async () => { throw new Error('default transition not expected'); };",
  "exports.returnOperatorToViewer = async () => { throw new Error('default transition not expected'); };",
].join("\n"));
cpSync(helperBuild, `${alias}/role-transition-api.js`);

const { Role } = await import("@prisma/client");
const { createRoleTransitionHandler } = await import(`../${helperBuild}`);
const validId = "clzzzzzzzzzzzzzzzzzzzzzzz";
const request = body => new Request("http://localhost/api/admin/users/target/action", { method: "POST", body });
const invoke = (handler, body = undefined, id = validId) => handler(request(body), { params: { id } });
const bodyOf = response => response.json();
const success = { ok: true, value: { targetId: validId, previousRole: Role.VIEWER, newRole: Role.OPERATOR, auditId: "audit-safe" } };

let calls = [];
const transition = async (database, actorId, targetId) => {
  calls.push({ database, actorId, targetId });
  return success;
};

for (const getUser of [async () => null]) {
  calls = [];
  const response = await invoke(createRoleTransitionHandler("assign-operator", { getUser, transition }));
  assert.equal(response.status, 401);
  assert.deepEqual(await bodyOf(response), { error: "Authentication is required", code: "UNAUTHORIZED" });
  assert.equal(calls.length, 0);
  assert.equal(response.headers.get("cache-control"), "no-store");
}

for (const role of [Role.VIEWER, Role.OPERATOR]) {
  for (const operation of ["assign-operator", "return-to-viewer"]) {
    calls = [];
    const response = await invoke(createRoleTransitionHandler(operation, { getUser: async () => ({ id: "trusted-actor", role }), transition }));
    assert.equal(response.status, 403);
    assert.deepEqual(await bodyOf(response), { error: "Forbidden", code: "FORBIDDEN" });
    assert.equal(calls.length, 0);
  }
}

const admin = async () => ({ id: "trusted-actor", role: Role.ADMIN });
for (const id of ["", " ", " bad", "bad id", "x".repeat(65), "bad!"]) {
  calls = [];
  const response = await invoke(createRoleTransitionHandler("assign-operator", { getUser: admin, transition }), undefined, id);
  assert.equal(response.status, 400);
  assert.equal((await bodyOf(response)).code, "INVALID_TARGET_ID");
  assert.equal(calls.length, 0);
}
calls = [];
const missingTarget = await createRoleTransitionHandler("assign-operator", { getUser: admin, transition })(request(), { params: {} });
assert.equal(missingTarget.status, 400);
assert.equal((await bodyOf(missingTarget)).code, "INVALID_TARGET_ID");
assert.equal(calls.length, 0);

for (const body of ["{}", " ", JSON.stringify({ actorId: "forged", role: "ADMIN", action: "assign", status: "APPROVED", auditId: "forged" })]) {
  calls = [];
  const response = await invoke(createRoleTransitionHandler("assign-operator", { getUser: admin, transition }), body);
  assert.equal(response.status, 400);
  assert.equal((await bodyOf(response)).code, "INVALID_REQUEST_BODY");
  assert.equal(calls.length, 0);
}
calls = [];
const declaredBody = await createRoleTransitionHandler("assign-operator", { getUser: admin, transition })(
  new Request("http://localhost/api/admin/users/target/action", { method: "POST", headers: { "Content-Length": "20" } }),
  { params: { id: validId } }
);
assert.equal(declaredBody.status, 400);
assert.equal((await bodyOf(declaredBody)).code, "INVALID_REQUEST_BODY");
assert.equal(calls.length, 0);
assert.match(helperSource, /MAX_EMPTY_BODY_PROBE_BYTES/);
assert.match(helperSource, /request\.body\.getReader\(\)/);
assert.doesNotMatch(helperSource, /request\.text\(\)/);

for (const operation of ["assign-operator", "return-to-viewer"]) {
  calls = [];
  const expected = operation === "assign-operator" ? success : { ok: true, value: { targetId: validId, previousRole: Role.OPERATOR, newRole: Role.VIEWER, auditId: "audit-safe" } };
  const response = await invoke(createRoleTransitionHandler(operation, { getUser: admin, transition: async (...args) => { calls.push(args); return expected; } }));
  assert.equal(response.status, 200);
  assert.deepEqual(await bodyOf(response), expected.value);
  assert.equal(Object.keys(expected.value).length, 4);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1], "trusted-actor");
  assert.equal(calls[0][2], validId);
  assert.equal(response.headers.get("cache-control"), "no-store");
}

const mappings = {
  UNAUTHORIZED: 401,
  ACTOR_NOT_FOUND: 401,
  FORBIDDEN: 403,
  SELF_TRANSITION_FORBIDDEN: 403,
  TARGET_NOT_FOUND: 404,
  INVALID_CURRENT_ROLE: 409,
  UNFINISHED_VIEWER_OBLIGATION: 409,
  ACTIVE_OPERATOR_OBLIGATION: 409,
  SERIALIZATION_RETRY_EXHAUSTED: 503,
  INTERNAL_INVARIANT_FAILURE: 500,
};
for (const [code, status] of Object.entries(mappings)) {
  const response = await invoke(createRoleTransitionHandler("assign-operator", {
    getUser: admin,
    transition: async () => ({ ok: false, code, status: 500, error: "sensitive raw service detail" }),
  }));
  assert.equal(response.status, status);
  const responseBody = await bodyOf(response);
  assert.equal(responseBody.code, code);
  assert.doesNotMatch(JSON.stringify(responseBody), /sensitive|Prisma|P20|stack|SQL/i);
  assert.equal(response.headers.get("cache-control"), "no-store");
}

const loggedFailures = [];
const originalConsoleError = console.error;
console.error = (...args) => loggedFailures.push(args);
const unexpected = await invoke(createRoleTransitionHandler("assign-operator", { getUser: admin, transition: async () => { throw new Error("Prisma P2002 secret stack SQL"); } }));
console.error = originalConsoleError;
assert.equal(unexpected.status, 500);
assert.deepEqual(await bodyOf(unexpected), { error: "Role change could not be completed", code: "INTERNAL_ERROR" });
assert.equal(loggedFailures.length, 1);
assert.deepEqual(loggedFailures[0].slice(0, 2), ["Unexpected role transition request failure", { operation: "assign-operator", targetId: validId }]);
assert.equal(loggedFailures[0][2] instanceof Error, true);

const middleware = readFileSync("middleware.ts", "utf8");
assert.doesNotMatch(middleware, /api\/admin.*isPublic|isPublic.*api\/admin/s);
for (const source of [assignRoute, returnRoute, helperSource]) assert.doesNotMatch(source, /clerkClient|publicMetadata|privateMetadata|unsafeMetadata/);
assert.equal([...readFileSync("app/admin/page.tsx", "utf8").matchAll(/assign-operator|return-to-viewer/g)].length, 0);

rmSync(buildRoot, { recursive: true, force: true });
console.log("Phase 5C.3 ADMIN role-transition API assertions passed.");
