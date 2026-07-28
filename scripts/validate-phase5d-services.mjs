import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { OperatorApplicationStatus, OperatorPilotStatus, Prisma, Role } from "@prisma/client";

const compile = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "scripts/tsconfig.phase3-db.json"], { stdio: "inherit" });
if (compile.status !== 0) process.exit(compile.status ?? 1);
for (const module of ["marketplace", "role-transitions", "operator-applications"]) {
  const path = `.phase3-test-build/lib/${module}.js`;
  writeFileSync(path, readFileSync(path, "utf8").replace('require("server-only");', ""));
}
const services = await import("../.phase3-test-build/lib/operator-applications.js");
const transitions = await import("../.phase3-test-build/lib/role-transitions.js");
const {
  getAdminOperatorApplication,
  listAdminOperatorApplications,
  listViewerOperatorApplications,
  reviewOperatorApplication,
  submitOperatorApplication,
  validateOperatorApplicationReview,
  validateOperatorApplicationSubmission,
  withdrawOperatorApplication,
} = services;
const { assignViewerAsOperator } = transitions;

const validBody = (overrides = {}) => ({
  qualifications: "  Qualified community volunteer  ",
  relevantExperience: "  Five years of visitor support  ",
  languages: ["English", "Spanish"],
  availability: "  Weekday afternoons  ",
  supportingUrl: "  https://example.com/support  ",
  additionalNote: "  Happy to complete training  ",
  ...overrides,
});

function expectValidation(body, message) {
  const result = validateOperatorApplicationSubmission(body);
  assert.equal(result.ok, false, message);
  assert.equal(result.code, "VALIDATION_FAILED");
}

for (const [field, short, long] of [
  ["qualifications", "x".repeat(19), "x".repeat(2001)],
  ["relevantExperience", "x".repeat(19), "x".repeat(2001)],
  ["availability", "x".repeat(9), "x".repeat(1001)],
]) {
  expectValidation(validBody({ [field]: short }), `${field} lower boundary`);
  expectValidation(validBody({ [field]: long }), `${field} upper boundary`);
}
assert.equal(validateOperatorApplicationSubmission(validBody({ qualifications: "x".repeat(20), relevantExperience: "x".repeat(20), availability: "x".repeat(10), additionalNote: "" })).ok, true);
expectValidation(validBody({ supportingUrl: "http://example.com" }), "HTTPS is required");
expectValidation(validBody({ supportingUrl: "not a URL" }), "URL must parse");
expectValidation(validBody({ supportingUrl: `https://example.com/${"x".repeat(500)}` }), "URL maximum");
expectValidation(validBody({ additionalNote: "x".repeat(1001) }), "note maximum");
expectValidation(validBody({ supportingUrl: 42 }), "URL must be text");
expectValidation(validBody({ additionalNote: false }), "note must be text");
expectValidation(validBody({ languages: [] }), "at least one language");
expectValidation(validBody({ languages: ["English", "English"] }), "duplicate languages");
expectValidation(validBody({ languages: ["Klingon"] }), "unsupported languages");
expectValidation(validBody({ unexpected: true }), "unknown fields");
assert.equal(validateOperatorApplicationReview({ decision: "PENDING" }).ok, false);
assert.equal(validateOperatorApplicationReview({ decision: "APPROVED", reviewNote: 42 }).ok, false);
assert.equal(validateOperatorApplicationReview({ decision: "APPROVED", reviewNote: "x".repeat(1001) }).ok, false);
assert.deepEqual(validateOperatorApplicationReview({ decision: "REJECTED", reviewNote: "  feedback  " }).value, { decision: "REJECTED", reviewNote: "feedback" });

function baseState() {
  return {
    users: {
      admin: { id: "admin", role: Role.ADMIN, name: "Admin", online: false, pendingOfferTripId: null, activeTripId: null },
      admin2: { id: "admin2", role: Role.ADMIN, name: "Second Admin", online: false, pendingOfferTripId: null, activeTripId: null },
      viewer: { id: "viewer", role: Role.VIEWER, name: "Viewer", online: false, pendingOfferTripId: null, activeTripId: null },
      other: { id: "other", role: Role.VIEWER, name: "Other Viewer", online: false, pendingOfferTripId: null, activeTripId: null },
      operator: { id: "operator", role: Role.OPERATOR, name: "Operator", online: false, pendingOfferTripId: null, activeTripId: null },
    },
    applications: [], profiles: {}, destinations: [], trips: [], audits: [], nextApplication: 1, nextAudit: 1,
  };
}

function mockDatabase(initial = baseState(), options = {}) {
  let state = structuredClone(initial);
  let attempts = 0;
  const transactionOptions = [];

  const delegates = draft => {
    const enriched = application => application && ({
      ...application,
      applicant: draft.users[application.applicantId] ? { id: application.applicantId, name: draft.users[application.applicantId].name, role: draft.users[application.applicantId].role } : null,
      reviewer: application.reviewedById && draft.users[application.reviewedById] ? { id: application.reviewedById, name: draft.users[application.reviewedById].name } : null,
    });
    return {
      user: {
        findUnique: async ({ where }) => {
          const user = draft.users[where.id];
          return user ? { ...user, operatorProfile: draft.profiles[user.id] ?? null } : null;
        },
        updateMany: async ({ where, data }) => {
          const user = draft.users[where.id];
          if (!user || user.role !== where.role || user.pendingOfferTripId !== where.pendingOfferTripId || user.activeTripId !== where.activeTripId) return { count: 0 };
          Object.assign(user, data); return { count: 1 };
        },
      },
      operatorApplication: {
        count: async ({ where = {} } = {}) => draft.applications.filter(item => (!where.applicantId || item.applicantId === where.applicantId) && (!where.status || item.status === where.status)).length,
        create: async ({ data }) => {
          if (options.forceUniqueViolation || (data.status ?? OperatorApplicationStatus.PENDING) === OperatorApplicationStatus.PENDING && draft.applications.some(item => item.applicantId === data.applicantId && item.status === OperatorApplicationStatus.PENDING)) {
            throw new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: Prisma.prismaVersion.client, meta: { target: "OperatorApplication_one_pending_per_applicant" } });
          }
          const now = new Date(Date.UTC(2026, 6, 28, 12, 0, draft.nextApplication));
          const application = { id: `application-${draft.nextApplication++}`, status: OperatorApplicationStatus.PENDING, reviewedById: null, reviewNote: null, reviewedAt: null, withdrawnAt: null, submittedAt: now, updatedAt: now, supportingUrl: null, additionalNote: null, ...data };
          draft.applications.push(application); return structuredClone(application);
        },
        findUnique: async ({ where }) => enriched(draft.applications.find(item => item.id === where.id) ?? null),
        findUniqueOrThrow: async ({ where }) => {
          if (options.failFinalApplicationRead) throw new Error("application read unavailable");
          const item = draft.applications.find(value => value.id === where.id); if (!item) throw new Error("missing application"); return structuredClone(item);
        },
        updateMany: async ({ where, data }) => {
          if (options.failApplicationUpdate) throw new Error("application update unavailable");
          if (options.staleApplicationUpdate) return { count: 0 };
          const item = draft.applications.find(value => value.id === where.id && (!where.applicantId || value.applicantId === where.applicantId) && (!where.status || value.status === where.status));
          if (!item) return { count: 0 }; Object.assign(item, data, { updatedAt: new Date() }); return { count: 1 };
        },
        findMany: async ({ where = {}, orderBy = [], skip = 0, take = 100 }) => {
          const rows = draft.applications.filter(item => (!where.applicantId || item.applicantId === where.applicantId) && (!where.status || item.status === where.status)).map(enriched);
          rows.sort((a, b) => {
            for (const order of orderBy) {
              const [key, direction] = Object.entries(order)[0];
              const left = key === "status" ? Object.values(OperatorApplicationStatus).indexOf(a[key]) : a[key];
              const right = key === "status" ? Object.values(OperatorApplicationStatus).indexOf(b[key]) : b[key];
              if (left < right) return direction === "asc" ? -1 : 1;
              if (left > right) return direction === "asc" ? 1 : -1;
            }
            return 0;
          });
          return rows.slice(skip, skip + take);
        },
      },
      trip: { count: async ({ where }) => draft.trips.filter(item => item.viewerId === where.viewerId && where.status.in.includes(item.status)).length },
      operatorProfile: {
        create: async ({ data }) => { draft.profiles[data.userId] = { ...data }; return draft.profiles[data.userId]; },
        update: async ({ where, data }) => { Object.assign(draft.profiles[where.userId], data); return draft.profiles[where.userId]; },
      },
      operatorDestination: { deleteMany: async ({ where }) => { draft.destinations = draft.destinations.filter(item => item.operatorId !== where.operatorId); return { count: 0 }; } },
      adminRoleChangeAudit: {
        create: async ({ data }) => {
          if (options.failAudit) throw new Error("audit unavailable");
          const audit = { id: `audit-${draft.nextAudit++}`, ...data }; draft.audits.push(audit); return { id: audit.id };
        },
      },
    };
  };

  const db = {
    ...delegates(state),
    async $transaction(work, transactionOption) {
      attempts += 1; transactionOptions.push(transactionOption);
      if ((options.conflictsBeforeWork ?? 0) >= attempts) throw new Prisma.PrismaClientKnownRequestError("serialization", { code: "P2034", clientVersion: Prisma.prismaVersion.client });
      if (options.nonRetryableBeforeWork && attempts === 1) throw new Error("database unavailable");
      const draft = structuredClone(state);
      const result = await work(delegates(draft));
      state = draft;
      Object.assign(db, delegates(state));
      return result;
    },
  };
  return { db, state: () => state, attempts: () => attempts, transactionOptions };
}

async function expectFailure(promise, code) { const result = await promise; assert.equal(result.ok, false); assert.equal(result.code, code); return result; }
async function submit(mock, userId = "viewer", body = validBody()) { return submitOperatorApplication(mock.db, userId, body); }

let mock = mockDatabase();
let result = await submit(mock);
assert.equal(result.ok, true);
assert.deepEqual({ qualifications: result.value.qualifications, relevantExperience: result.value.relevantExperience, availability: result.value.availability, supportingUrl: result.value.supportingUrl, additionalNote: result.value.additionalNote }, {
  qualifications: "Qualified community volunteer", relevantExperience: "Five years of visitor support", availability: "Weekday afternoons", supportingUrl: "https://example.com/support", additionalNote: "Happy to complete training",
});
assert.deepEqual(result.value.languages, ["English", "Spanish"]);
await expectFailure(submit(mock), "PENDING_APPLICATION_EXISTS");
await expectFailure(submit(mockDatabase(), "operator"), "FORBIDDEN");

mock = mockDatabase(baseState(), { forceUniqueViolation: true });
await expectFailure(submit(mock), "PENDING_APPLICATION_EXISTS");

for (const terminal of [OperatorApplicationStatus.REJECTED, OperatorApplicationStatus.WITHDRAWN]) {
  const state = baseState();
  state.applications.push({ id: `old-${terminal}`, applicantId: "viewer", status: terminal, submittedAt: new Date(0), reviewedAt: null, withdrawnAt: terminal === OperatorApplicationStatus.WITHDRAWN ? new Date() : null });
  mock = mockDatabase(state); assert.equal((await submit(mock)).ok, true, `resubmission after ${terminal}`);
}

let state = baseState();
state.applications.push(
  { id: "older", applicantId: "viewer", status: OperatorApplicationStatus.REJECTED, submittedAt: new Date("2026-01-01"), reviewedById: "admin" },
  { id: "newer", applicantId: "viewer", status: OperatorApplicationStatus.WITHDRAWN, submittedAt: new Date("2026-02-01"), reviewedById: null },
  { id: "other-app", applicantId: "other", status: OperatorApplicationStatus.PENDING, submittedAt: new Date("2026-03-01"), reviewedById: null },
);
mock = mockDatabase(state);
result = await listViewerOperatorApplications(mock.db, "viewer");
assert.deepEqual(result.value.map(item => item.id), ["newer", "older"]);

result = await listAdminOperatorApplications(mock.db, "admin");
assert.deepEqual(result.value.applications.map(item => item.id), ["other-app", "older", "newer"]);
result = await listAdminOperatorApplications(mock.db, "admin", { status: OperatorApplicationStatus.REJECTED, limit: 10 });
assert.deepEqual(result.value.applications.map(item => item.id), ["older"]);
assert.equal((await getAdminOperatorApplication(mock.db, "admin", "older")).value.reviewer.id, "admin");

state = baseState();
state.applications.push({ id: "pending", applicantId: "viewer", status: OperatorApplicationStatus.PENDING, submittedAt: new Date(), reviewedById: null, reviewNote: null, reviewedAt: null, withdrawnAt: null });
mock = mockDatabase(state);
result = await withdrawOperatorApplication(mock.db, "viewer", "pending", new Date("2026-03-01"));
assert.equal(result.ok, true); assert.equal(result.value.status, OperatorApplicationStatus.WITHDRAWN); assert.equal(result.value.reviewedById, null);
await expectFailure(withdrawOperatorApplication(mock.db, "viewer", "pending"), "APPLICATION_NOT_PENDING");

mock = mockDatabase(state);
await expectFailure(withdrawOperatorApplication(mock.db, "other", "pending"), "APPLICATION_NOT_OWNED");

state = baseState();
state.applications.push({ id: "reject", applicantId: "viewer", status: OperatorApplicationStatus.PENDING, submittedAt: new Date(), reviewedById: null });
mock = mockDatabase(state);
result = await reviewOperatorApplication(mock.db, "admin", "reject", { decision: "REJECTED", reviewNote: "  More experience requested  " }, new Date("2026-04-01"));
assert.equal(result.ok, true); assert.equal(result.value.application.reviewNote, "More experience requested"); assert.equal(mock.state().users.viewer.role, Role.VIEWER); assert.equal(mock.state().audits.length, 0);
await expectFailure(reviewOperatorApplication(mock.db, "admin2", "reject", { decision: "APPROVED" }), "APPLICATION_NOT_PENDING");
await expectFailure(withdrawOperatorApplication(mock.db, "viewer", "reject"), "APPLICATION_NOT_PENDING");

state = baseState();
state.applications.push({ id: "approve", applicantId: "viewer", status: OperatorApplicationStatus.PENDING, submittedAt: new Date(), reviewedById: null });
mock = mockDatabase(state);
result = await reviewOperatorApplication(mock.db, "admin", "approve", { decision: "APPROVED", reviewNote: "Approved" }, new Date("2026-05-01"));
assert.equal(result.ok, true); assert.equal(mock.state().users.viewer.role, Role.OPERATOR); assert.equal(mock.state().profiles.viewer.pilotStatus, OperatorPilotStatus.PENDING); assert.equal(mock.state().audits.length, 1); assert.equal(result.value.application.status, OperatorApplicationStatus.APPROVED); assert.equal(result.value.application.reviewedById, "admin");

state = baseState();
state.profiles.viewer = { userId: "viewer", pilotStatus: OperatorPilotStatus.SUSPENDED, operatingArea: "Dormant" };
state.applications.push({ id: "approve-suspended", applicantId: "viewer", status: OperatorApplicationStatus.PENDING, submittedAt: new Date(), reviewedById: null });
mock = mockDatabase(state);
assert.equal((await reviewOperatorApplication(mock.db, "admin", "approve-suspended", { decision: "APPROVED" })).ok, true);
assert.equal(mock.state().profiles.viewer.pilotStatus, OperatorPilotStatus.PENDING, "application approval resets a dormant profile to PENDING");

for (const option of ["failAudit", "failApplicationUpdate", "failFinalApplicationRead"]) {
  state = baseState(); state.applications.push({ id: option, applicantId: "viewer", status: OperatorApplicationStatus.PENDING, submittedAt: new Date() });
  mock = mockDatabase(state, { [option]: true });
  const original = console.error; console.error = () => undefined;
  await expectFailure(reviewOperatorApplication(mock.db, "admin", option, { decision: "APPROVED" }), "INTERNAL_INVARIANT_FAILURE");
  console.error = original;
  assert.equal(mock.state().users.viewer.role, Role.VIEWER, `${option} rolls back role`); assert.equal(mock.state().audits.length, 0); assert.equal(mock.state().applications[0].status, OperatorApplicationStatus.PENDING);
}

state = baseState(); state.applications.push({ id: "stale", applicantId: "viewer", status: OperatorApplicationStatus.PENDING, submittedAt: new Date() });
mock = mockDatabase(state, { staleApplicationUpdate: true });
await expectFailure(reviewOperatorApplication(mock.db, "admin", "stale", { decision: "APPROVED" }), "APPLICATION_NOT_PENDING");
assert.equal(mock.state().users.viewer.role, Role.VIEWER); assert.equal(mock.state().audits.length, 0);

state = baseState(); state.applications.push({ id: "changed", applicantId: "viewer", status: OperatorApplicationStatus.PENDING, submittedAt: new Date() }); state.users.viewer.role = Role.OPERATOR;
mock = mockDatabase(state);
await expectFailure(reviewOperatorApplication(mock.db, "admin", "changed", { decision: "APPROVED" }), "APPLICANT_NOT_VIEWER");
assert.equal(mock.state().applications[0].status, OperatorApplicationStatus.PENDING);

state = baseState(); state.applications.push({ id: "blocks-direct", applicantId: "viewer", status: OperatorApplicationStatus.PENDING, submittedAt: new Date() });
mock = mockDatabase(state);
await expectFailure(assignViewerAsOperator(mock.db, "admin", "viewer"), "PENDING_OPERATOR_APPLICATION_EXISTS");
state.applications[0].status = OperatorApplicationStatus.REJECTED;
mock = mockDatabase(state); assert.equal((await assignViewerAsOperator(mock.db, "admin", "viewer")).ok, true);

mock = mockDatabase(baseState(), { conflictsBeforeWork: 2 });
result = await submit(mock); assert.equal(result.ok, true); assert.equal(mock.attempts(), 3); assert.equal(mock.transactionOptions.every(value => value.isolationLevel === Prisma.TransactionIsolationLevel.Serializable), true);
mock = mockDatabase(baseState(), { conflictsBeforeWork: 3 });
await expectFailure(submit(mock), "SERIALIZATION_RETRY_EXHAUSTED"); assert.equal(mock.attempts(), 3);

mock = mockDatabase(baseState(), { nonRetryableBeforeWork: true });
const logged = []; const originalConsoleError = console.error; console.error = (...args) => logged.push(args);
await expectFailure(submit(mock), "INTERNAL_INVARIANT_FAILURE"); console.error = originalConsoleError;
assert.equal(mock.attempts(), 1); assert.deepEqual(logged[0].slice(0, 2), ["Unexpected Operator application failure", { operation: "submit", userId: "viewer" }]); assert.equal(logged[0][2] instanceof Error, true);

const source = readFileSync("lib/operator-applications.ts", "utf8");
assert.doesNotMatch(source, /headers|cookies|tokens|qualifications.*console|relevantExperience.*console/i);
assert.match(source, /allowPendingOperatorApplication: true/);
assert.match(readFileSync("lib/role-transitions.ts", "utf8"), /PENDING_OPERATOR_APPLICATION_EXISTS/);

rmSync(".phase3-test-build", { recursive: true, force: true });
console.log("Phase 5D.2 Operator Application service assertions passed.");
