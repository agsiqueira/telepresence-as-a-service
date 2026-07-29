import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { OperatorApplicationStatus, Role } from "@prisma/client";

const routeFiles = {
  viewer: "app/api/operator-applications/route.ts",
  withdraw: "app/api/operator-applications/[id]/withdraw/route.ts",
  adminList: "app/api/admin/operator-applications/route.ts",
  adminDetail: "app/api/admin/operator-applications/[id]/route.ts",
  adminReview: "app/api/admin/operator-applications/[id]/review/route.ts",
};
const routeSources = Object.fromEntries(Object.entries(routeFiles).map(([key, path]) => [key, readFileSync(path, "utf8")]));
assert.match(routeSources.viewer, /export const \{ GET, POST } = createViewerOperatorApplicationHandlers\(\)/);
assert.match(routeSources.withdraw, /export const POST = createViewerOperatorApplicationWithdrawHandler\(\)/);
assert.match(routeSources.adminList, /export const GET = createAdminOperatorApplicationListHandler\(\)/);
assert.match(routeSources.adminDetail, /export const GET = createAdminOperatorApplicationDetailHandler\(\)/);
assert.match(routeSources.adminReview, /export const POST = createAdminOperatorApplicationReviewHandler\(\)/);
for (const source of Object.values(routeSources)) assert.doesNotMatch(source, /Prisma|\$transaction|assignViewerAsOperator|applicantId|reviewedById/);

const compile = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "scripts/tsconfig.phase3-db.json"], { stdio: "inherit" });
if (compile.status !== 0) process.exit(compile.status ?? 1);
const root = ".phase3-test-build/lib";
const helperPath = `${root}/operator-application-api.js`;
writeFileSync(helperPath, readFileSync(helperPath, "utf8").replace('require("server-only");', ""));
writeFileSync(`${root}/db.js`, "exports.db = Object.freeze({ marker: 'trusted-database' });\n");
writeFileSync(`${root}/current-user.js`, "exports.getCurrentUser = async () => null; exports.isAccountDeactivated = user => user?.accountStatus === 'DEACTIVATED';\n");
writeFileSync(`${root}/operator-applications.js`, [
  "exports.OPERATOR_APPLICATION_MAX_LIMIT = 50;",
  "for (const name of ['getAdminOperatorApplication','listAdminOperatorApplications','listViewerOperatorApplications','reviewOperatorApplication','submitOperatorApplication','withdrawOperatorApplication']) exports[name] = async () => { throw new Error('default service not expected'); };",
].join("\n"));
const api = await import(`../${helperPath}`);
const {
  createAdminOperatorApplicationDetailHandler,
  createAdminOperatorApplicationListHandler,
  createAdminOperatorApplicationReviewHandler,
  createViewerOperatorApplicationHandlers,
  createViewerOperatorApplicationWithdrawHandler,
  operatorApplicationPublicFailures,
} = api;

const users = {
  viewer: { id: "trusted-viewer", role: Role.VIEWER },
  other: { id: "other-viewer", role: Role.VIEWER },
  operator: { id: "trusted-operator", role: Role.OPERATOR },
  admin: { id: "trusted-admin", role: Role.ADMIN },
};
const getUser = user => async () => user;
const application = (overrides = {}) => ({
  id: "application-1",
  applicantId: "private-applicant-id",
  qualifications: "Safe qualifications",
  relevantExperience: "Safe experience",
  languages: ["English"],
  availability: "Weekdays",
  supportingUrl: null,
  additionalNote: null,
  status: OperatorApplicationStatus.PENDING,
  reviewNote: null,
  submittedAt: new Date("2026-07-28T12:00:00Z"),
  reviewedAt: null,
  withdrawnAt: null,
  updatedAt: new Date("2026-07-28T12:00:00Z"),
  reviewedById: null,
  secret: "must-not-leak",
  ...overrides,
});
const adminApplication = overrides => application({
  applicant: { id: "trusted-viewer", name: "Viewer", role: Role.VIEWER, clerkId: "private-clerk" },
  reviewer: { id: "trusted-admin", name: "Admin", email: "private@example.com" },
  ...overrides,
});
const ok = value => ({ ok: true, value });
const failed = code => ({ ok: false, code, status: 500, error: "Prisma P2002 secret SQL stack" });
const jsonRequest = (url, body) => new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const rawRequest = (url, body) => new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body });
const bodyOf = response => response.json();
const context = id => ({ params: { id } });

for (const operation of ["GET", "POST"]) {
  let called = 0;
  const handlers = createViewerOperatorApplicationHandlers({ getUser: getUser(null), list: async () => { called++; }, submit: async () => { called++; } });
  const response = operation === "GET" ? await handlers.GET() : await handlers.POST(jsonRequest("http://localhost/api/operator-applications", {}));
  assert.equal(response.status, 401); assert.equal((await bodyOf(response)).code, "UNAUTHENTICATED"); assert.equal(called, 0);
}
for (const user of [users.operator, users.admin]) {
  const handlers = createViewerOperatorApplicationHandlers({ getUser: getUser(user) });
  assert.equal((await handlers.GET()).status, 403);
  assert.equal((await handlers.POST(jsonRequest("http://localhost/api/operator-applications", {}))).status, 403);
}

let calls = [];
let handlers = createViewerOperatorApplicationHandlers({
  getUser: getUser(users.viewer),
  list: async (...args) => { calls.push(args); return ok([application()]); },
  submit: async (...args) => { calls.push(args); return ok(application()); },
});
let response = await handlers.GET();
assert.equal(response.status, 200); let responseBody = await bodyOf(response);
assert.equal(calls[0][1], users.viewer.id); assert.equal(responseBody.applications.length, 1); assert.equal("applicantId" in responseBody.applications[0], false); assert.equal("secret" in responseBody.applications[0], false);
response = await handlers.POST(jsonRequest("http://localhost/api/operator-applications", { qualifications: "trusted body" }));
assert.equal(response.status, 201); assert.equal(calls[1][1], users.viewer.id); assert.equal(calls[1][2].applicantId, undefined);

for (const raw of ["{", "null", "[]", '"text"', "42"]) {
  let submits = 0;
  handlers = createViewerOperatorApplicationHandlers({ getUser: getUser(users.viewer), submit: async () => { submits++; return ok(application()); } });
  response = await handlers.POST(rawRequest("http://localhost/api/operator-applications", raw));
  assert.equal(response.status, 400); assert.equal(submits, 0);
}

handlers = createViewerOperatorApplicationHandlers({
  getUser: getUser(users.viewer),
  submit: async (_db, actorId, body) => {
    assert.equal(actorId, users.viewer.id);
    assert.deepEqual(body, { applicantId: "forged", reviewerId: "forged", status: "APPROVED", auditId: "forged" });
    return failed("VALIDATION_FAILED");
  },
});
response = await handlers.POST(jsonRequest("http://localhost/api/operator-applications", { applicantId: "forged", reviewerId: "forged", status: "APPROVED", auditId: "forged" }));
assert.equal(response.status, 400); assert.equal((await bodyOf(response)).code, "VALIDATION_FAILED");

for (const code of ["VALIDATION_FAILED", "PENDING_APPLICATION_EXISTS"]) {
  handlers = createViewerOperatorApplicationHandlers({ getUser: getUser(users.viewer), submit: async () => failed(code) });
  response = await handlers.POST(jsonRequest("http://localhost/api/operator-applications", {}));
  assert.equal(response.status, operatorApplicationPublicFailures[code].status); assert.equal((await bodyOf(response)).code, code);
}

let withdrawCalls = [];
let withdraw = createViewerOperatorApplicationWithdrawHandler({ getUser: getUser(users.viewer), withdraw: async (...args) => { withdrawCalls.push(args); return ok(application({ status: "WITHDRAWN", withdrawnAt: new Date() })); } });
response = await withdraw(new Request("http://localhost/api/operator-applications/application-1/withdraw", { method: "POST" }), context("application-1"));
assert.equal(response.status, 200); assert.equal(withdrawCalls[0][1], users.viewer.id); assert.equal(withdrawCalls[0][2], "application-1");
withdraw = createViewerOperatorApplicationWithdrawHandler({ getUser: getUser(users.viewer), withdraw: async () => failed("APPLICATION_NOT_OWNED") });
response = await withdraw(new Request("http://localhost", { method: "POST" }), context("application-1")); assert.equal(response.status, 404);
withdraw = createViewerOperatorApplicationWithdrawHandler({ getUser: getUser(users.viewer), withdraw: async () => failed("APPLICATION_NOT_PENDING") });
response = await withdraw(new Request("http://localhost", { method: "POST" }), context("application-1")); assert.equal(response.status, 409);
response = await withdraw(jsonRequest("http://localhost", { status: "WITHDRAWN", applicantId: "forged" }), context("application-1")); assert.equal(response.status, 400);

for (const user of [null, users.viewer, users.operator]) {
  const list = createAdminOperatorApplicationListHandler({ getUser: getUser(user) });
  response = await list(new Request("http://localhost/api/admin/operator-applications"));
  assert.equal(response.status, user ? 403 : 401);
}

calls = [];
let adminList = createAdminOperatorApplicationListHandler({ getUser: getUser(users.admin), list: async (...args) => { calls.push(args); return ok({ applications: [adminApplication()], page: 2, limit: 10, hasNext: false }); } });
response = await adminList(new Request("http://localhost/api/admin/operator-applications?status=REJECTED&page=2&pageSize=10"));
assert.equal(response.status, 200); assert.deepEqual(calls[0][2], { status: "REJECTED", page: 2, limit: 10 });
responseBody = await bodyOf(response); assert.equal(responseBody.applications[0].applicant.clerkId, undefined); assert.equal(responseBody.applications[0].reviewer.email, undefined); assert.equal(responseBody.applications[0].secret, undefined);
for (const query of ["status=BAD", "page=0", "page=1.5", "pageSize=0", "pageSize=51", "unknown=1", "status=PENDING&status=REJECTED"]) {
  response = await adminList(new Request(`http://localhost/api/admin/operator-applications?${query}`)); assert.equal(response.status, 400, query);
}

let detail = createAdminOperatorApplicationDetailHandler({ getUser: getUser(users.admin), get: async (_db, actorId, id) => { assert.equal(actorId, users.admin.id); assert.equal(id, "application-1"); return ok(adminApplication()); } });
response = await detail(new Request("http://localhost"), context("application-1")); assert.equal(response.status, 200);
detail = createAdminOperatorApplicationDetailHandler({ getUser: getUser(users.admin), get: async () => failed("APPLICATION_NOT_FOUND") });
response = await detail(new Request("http://localhost"), context("missing")); assert.equal(response.status, 404);

calls = [];
let review = createAdminOperatorApplicationReviewHandler({ getUser: getUser(users.admin), review: async (...args) => { calls.push(args); return ok({ application: application({ status: "REJECTED", reviewedById: users.admin.id }), roleTransition: null }); } });
response = await review(jsonRequest("http://localhost", { decision: "REJECTED", reviewNote: "feedback" }), context("application-1"));
assert.equal(response.status, 200); assert.equal(calls[0][1], users.admin.id); assert.equal(calls[0][2], "application-1"); assert.deepEqual(calls[0][3], { decision: "REJECTED", reviewNote: "feedback" });
review = createAdminOperatorApplicationReviewHandler({ getUser: getUser(users.admin), review: async () => ok({ application: application({ status: "APPROVED" }), roleTransition: { ok: true, value: { targetId: "private", auditId: "private-audit", previousRole: Role.VIEWER, newRole: Role.OPERATOR } } }) });
response = await review(jsonRequest("http://localhost", { decision: "APPROVED" }), context("application-1")); responseBody = await bodyOf(response); assert.deepEqual(responseBody.roleTransition, { previousRole: "VIEWER", newRole: "OPERATOR" }); assert.equal(JSON.stringify(responseBody).includes("audit"), false);

for (const [code, status] of [["VALIDATION_FAILED", 400], ["APPLICATION_NOT_PENDING", 409], ["APPLICANT_NOT_VIEWER", 409], ["UNFINISHED_VIEWER_OBLIGATION", 409], ["SERIALIZATION_RETRY_EXHAUSTED", 409], ["INTERNAL_INVARIANT_FAILURE", 500]]) {
  review = createAdminOperatorApplicationReviewHandler({ getUser: getUser(users.admin), review: async () => failed(code) });
  response = await review(jsonRequest("http://localhost", { decision: "APPROVED" }), context("application-1")); assert.equal(response.status, status); responseBody = await bodyOf(response); assert.equal(responseBody.code, code); assert.doesNotMatch(JSON.stringify(responseBody), /Prisma|P20|SQL|stack|secret/i);
}

const expectedCodes = ["UNAUTHENTICATED", "FORBIDDEN", "VALIDATION_FAILED", "PENDING_APPLICATION_EXISTS", "APPLICATION_NOT_FOUND", "APPLICATION_NOT_OWNED", "APPLICATION_NOT_PENDING", "APPLICANT_NOT_VIEWER", "UNFINISHED_VIEWER_OBLIGATION", "SERIALIZATION_RETRY_EXHAUSTED", "INTERNAL_INVARIANT_FAILURE"];
assert.deepEqual(Object.keys(operatorApplicationPublicFailures).sort(), expectedCodes.sort());

const logged = []; const originalConsoleError = console.error; console.error = (...args) => logged.push(args);
review = createAdminOperatorApplicationReviewHandler({ getUser: getUser(users.admin), review: async () => { throw new Error("Prisma P2002 SQL secret"); } });
response = await review(jsonRequest("http://localhost", { decision: "APPROVED", reviewNote: "unsafe submitted note" }), context("application-1"));
console.error = originalConsoleError;
assert.equal(response.status, 500); assert.deepEqual(await bodyOf(response), { error: "Operator application request could not be completed", code: "INTERNAL_ERROR" });
assert.deepEqual(logged[0].slice(0, 2), ["Unexpected Operator application request failure", { operation: "admin-review", applicationId: "application-1" }]); assert.equal(logged[0][2] instanceof Error, true); assert.doesNotMatch(JSON.stringify(logged.slice(0, 2)), /unsafe submitted note/);

const helperSource = readFileSync("lib/operator-application-api.ts", "utf8");
assert.doesNotMatch(helperSource, /\$transaction|P2034|assignViewerAsOperator/);
assert.equal(
  helperSource.includes(
    'console.error("Unexpected Operator application request failure", { operation, ...(applicationId ? { applicationId } : {}) }, error);',
  ),
  true,
);
assert.match(helperSource, /satisfies Record<OperatorApplicationFailureCode/);

rmSync(".phase3-test-build", { recursive: true, force: true });
console.log("Phase 5D.3 Operator Application API assertions passed.");
