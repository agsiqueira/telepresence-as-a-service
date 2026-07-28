import assert from "node:assert/strict";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { OperatorPilotStatus, Prisma, Role, TripStatus } from "@prisma/client";

const compile = spawnSync(
  process.execPath,
  ["node_modules/typescript/bin/tsc", "-p", "scripts/tsconfig.phase3-db.json"],
  { stdio: "inherit" }
);
if (compile.status !== 0) process.exit(compile.status ?? 1);
const compiled = ".phase3-test-build/lib/role-transitions.js";
writeFileSync(compiled, readFileSync(compiled, "utf8").replace('require("server-only");', ""));
const alias = ".phase3-test-build/node_modules/@/lib";
mkdirSync(alias, { recursive: true });
cpSync(compiled, `${alias}/role-transitions.js`);
const { assignViewerAsOperator, returnOperatorToViewer } = await import(`../${compiled}`);

function baseState(targetRole = Role.VIEWER) {
  return {
    users: {
      admin: { id: "admin", role: Role.ADMIN, online: false, pendingOfferTripId: null, activeTripId: null },
      target: { id: "target", role: targetRole, online: true, pendingOfferTripId: null, activeTripId: null },
      viewer: { id: "viewer", role: Role.VIEWER, online: false, pendingOfferTripId: null, activeTripId: null },
    },
    profiles: {},
    destinations: [],
    trips: [],
    offers: [],
    applications: [],
    audits: [],
    tripWrites: 0,
  };
}

function mockDatabase(initial, options = {}) {
  let state = structuredClone(initial);
  let attempts = 0;
  const transactionOptions = [];
  const db = {
    async $transaction(work, transactionOption) {
      attempts += 1;
      transactionOptions.push(transactionOption);
      if (options.conflictsBeforeWork >= attempts) {
        throw new Prisma.PrismaClientKnownRequestError("serialization conflict", {
          code: "P2034",
          clientVersion: Prisma.prismaVersion.client,
        });
      }
      if (options.nonRetryableBeforeWork && attempts === 1) throw new Error("database unavailable");
      const draft = structuredClone(state);
      let auditSequence = draft.audits.length;
      const tx = {
        user: {
          findUnique: async ({ where }) => {
            const user = draft.users[where.id];
            if (!user) return null;
            return { ...user, operatorProfile: draft.profiles[user.id] ?? null };
          },
          updateMany: async ({ where, data }) => {
            const user = draft.users[where.id];
            if (!user || user.role !== where.role || user.pendingOfferTripId !== where.pendingOfferTripId || user.activeTripId !== where.activeTripId) return { count: 0 };
            Object.assign(user, data);
            return { count: 1 };
          },
        },
        trip: {
          count: async ({ where }) => {
            if (where.viewerId) {
              return draft.trips.filter(trip => trip.viewerId === where.viewerId && where.status.in.includes(trip.status)).length;
            }
            return draft.trips.filter(trip =>
              (trip.operatorId === "target" && [TripStatus.ACCEPTED, TripStatus.IN_PROGRESS].includes(trip.status)) ||
              (trip.offeredOperatorId === "target" && trip.status === TripStatus.OFFERED)
            ).length;
          },
        },
        tripOffer: {
          count: async ({ where }) => draft.offers.filter(offer => offer.operatorId === where.operatorId && offer.status === where.status).length,
        },
        operatorApplication: {
          count: async ({ where }) => draft.applications.filter(application => application.applicantId === where.applicantId && application.status === where.status).length,
        },
        operatorProfile: {
          create: async ({ data }) => {
            draft.profiles[data.userId] = { ...data };
            return draft.profiles[data.userId];
          },
          update: async ({ where, data }) => {
            if (!draft.profiles[where.userId]) throw new Error("missing profile");
            Object.assign(draft.profiles[where.userId], data);
            return draft.profiles[where.userId];
          },
        },
        operatorDestination: {
          deleteMany: async ({ where }) => {
            const before = draft.destinations.length;
            draft.destinations = draft.destinations.filter(value => value.operatorId !== where.operatorId);
            return { count: before - draft.destinations.length };
          },
        },
        adminRoleChangeAudit: {
          create: async ({ data }) => {
            if (options.failAudit) throw new Error("audit unavailable");
            const audit = { id: `audit-${++auditSequence}`, ...data };
            draft.audits.push(audit);
            return { id: audit.id };
          },
        },
      };
      const result = await work(tx);
      state = draft;
      return result;
    },
  };
  return { db, state: () => state, attempts: () => attempts, transactionOptions };
}

async function expectFailure(operation, code) {
  const result = await operation;
  assert.equal(result.ok, false);
  assert.equal(result.code, code);
  return result;
}

for (const transition of [assignViewerAsOperator, returnOperatorToViewer]) {
  const role = transition === assignViewerAsOperator ? Role.VIEWER : Role.OPERATOR;
  let mock = mockDatabase(baseState(role));
  await expectFailure(transition(mock.db, null, "target"), "UNAUTHORIZED");
  assert.equal(mock.state().audits.length, 0);

  mock = mockDatabase(baseState(role));
  await expectFailure(transition(mock.db, "missing", "target"), "ACTOR_NOT_FOUND");
  assert.equal(mock.state().audits.length, 0);

  mock = mockDatabase(baseState(role));
  await expectFailure(transition(mock.db, "viewer", "target"), "FORBIDDEN");
  assert.equal(mock.state().audits.length, 0);

  mock = mockDatabase(baseState(role));
  await expectFailure(transition(mock.db, "admin", "admin"), "SELF_TRANSITION_FORBIDDEN");
  assert.equal(mock.state().audits.length, 0);
}

let state = baseState(Role.ADMIN);
let mock = mockDatabase(state);
await expectFailure(assignViewerAsOperator(mock.db, "admin", "target"), "INVALID_CURRENT_ROLE");
assert.equal(mock.state().audits.length, 0);
mock = mockDatabase(state);
await expectFailure(returnOperatorToViewer(mock.db, "admin", "target"), "INVALID_CURRENT_ROLE");

state = baseState(Role.VIEWER);
state.profiles.target = { userId: "target", pilotStatus: OperatorPilotStatus.APPROVED, operatingArea: "Pilot City" };
state.destinations.push({ operatorId: "target", destinationId: "old" });
mock = mockDatabase(state);
let result = await assignViewerAsOperator(mock.db, "admin", "target");
assert.equal(result.ok, true);
assert.deepEqual(result.value, { targetId: "target", previousRole: Role.VIEWER, newRole: Role.OPERATOR, auditId: "audit-1" });
assert.equal(mock.state().users.target.role, Role.OPERATOR);
assert.equal(mock.state().users.target.online, false);
assert.equal(mock.state().profiles.target.operatingArea, "Pilot City", "dormant profile is reused");
assert.equal(mock.state().profiles.target.pilotStatus, OperatorPilotStatus.PENDING);
assert.equal(mock.state().destinations.length, 0, "promotion assigns no destinations");
assert.deepEqual(mock.state().audits[0], { id: "audit-1", actorId: "admin", targetId: "target", action: "ASSIGN_OPERATOR", previousRole: Role.VIEWER, newRole: Role.OPERATOR });
assert.equal(mock.state().tripWrites, 0);
await expectFailure(assignViewerAsOperator(mock.db, "admin", "target"), "INVALID_CURRENT_ROLE");
assert.equal(mock.state().audits.length, 1, "a repeated transition cannot create a duplicate audit");

state = baseState(Role.VIEWER);
mock = mockDatabase(state);
result = await assignViewerAsOperator(mock.db, "admin", "target");
assert.equal(result.ok, true);
assert.deepEqual(mock.state().profiles.target, {
  userId: "target", operatingArea: "", serviceRadiusKm: 0, supportsCustom: false,
  languages: [], accessibilityCapabilities: [], durationOptions: [], pilotStatus: OperatorPilotStatus.PENDING,
});

state = baseState(Role.VIEWER);
state.profiles.target = { userId: "target", pilotStatus: OperatorPilotStatus.SUSPENDED };
mock = mockDatabase(state);
await assignViewerAsOperator(mock.db, "admin", "target");
assert.equal(mock.state().profiles.target.pilotStatus, OperatorPilotStatus.SUSPENDED);

for (const status of [TripStatus.REQUESTED, TripStatus.ACCEPTED, TripStatus.ENDED]) {
  state = baseState(Role.VIEWER);
  state.trips.push({ viewerId: "target", status });
  mock = mockDatabase(state);
  await expectFailure(assignViewerAsOperator(mock.db, "admin", "target"), "UNFINISHED_VIEWER_OBLIGATION");
  assert.equal(mock.state().users.target.role, Role.VIEWER);
  assert.equal(mock.state().audits.length, 0);
}
state = baseState(Role.VIEWER);
state.trips.push({ viewerId: "target", status: TripStatus.FEEDBACK_COMPLETED });
mock = mockDatabase(state);
assert.equal((await assignViewerAsOperator(mock.db, "admin", "target")).ok, true);

state = baseState(Role.OPERATOR);
state.profiles.target = { userId: "target", pilotStatus: OperatorPilotStatus.APPROVED, operatingArea: "Pilot City" };
state.destinations.push({ operatorId: "target", destinationId: "served" });
mock = mockDatabase(state);
result = await returnOperatorToViewer(mock.db, "admin", "target");
assert.equal(result.ok, true);
assert.equal(mock.state().users.target.role, Role.VIEWER);
assert.equal(mock.state().users.target.online, false);
assert.equal(mock.state().profiles.target.operatingArea, "Pilot City", "profile is retained");
assert.equal(mock.state().profiles.target.pilotStatus, OperatorPilotStatus.PENDING);
assert.equal(mock.state().destinations.length, 0);
assert.equal(mock.state().audits[0].action, "RETURN_TO_VIEWER");

state = baseState(Role.OPERATOR);
state.profiles.target = { userId: "target", pilotStatus: OperatorPilotStatus.SUSPENDED };
mock = mockDatabase(state);
await returnOperatorToViewer(mock.db, "admin", "target");
assert.equal(mock.state().profiles.target.pilotStatus, OperatorPilotStatus.SUSPENDED);

state = baseState(Role.OPERATOR);
state.trips.push({ operatorId: "target", status: TripStatus.ACCEPTED });
mock = mockDatabase(state);
await expectFailure(returnOperatorToViewer(mock.db, "admin", "target"), "ACTIVE_OPERATOR_OBLIGATION");
assert.equal(mock.state().audits.length, 0);
state = baseState(Role.OPERATOR);
state.users.target.pendingOfferTripId = "trip";
mock = mockDatabase(state);
await expectFailure(returnOperatorToViewer(mock.db, "admin", "target"), "ACTIVE_OPERATOR_OBLIGATION");
state = baseState(Role.OPERATOR);
state.offers.push({ operatorId: "target", status: "OFFERED" });
mock = mockDatabase(state);
await expectFailure(returnOperatorToViewer(mock.db, "admin", "target"), "ACTIVE_OPERATOR_OBLIGATION");

state = baseState(Role.VIEWER);
mock = mockDatabase(state, { failAudit: true });
const loggedFailures = [];
const originalConsoleError = console.error;
console.error = (...args) => loggedFailures.push(args);
await expectFailure(assignViewerAsOperator(mock.db, "admin", "target"), "INTERNAL_INVARIANT_FAILURE");
console.error = originalConsoleError;
assert.equal(mock.state().users.target.role, Role.VIEWER, "audit failure rolls back role mutation");
assert.equal(mock.state().profiles.target, undefined, "audit failure rolls back profile creation");
assert.equal(loggedFailures.length, 1);
assert.deepEqual(loggedFailures[0].slice(0, 2), ["Unexpected role transition failure", { operation: "assign-operator", targetId: "target" }]);
assert.equal(loggedFailures[0][2] instanceof Error, true);

state = baseState(Role.VIEWER);
mock = mockDatabase(state, { conflictsBeforeWork: 2 });
result = await assignViewerAsOperator(mock.db, "admin", "target");
assert.equal(result.ok, true);
assert.equal(mock.attempts(), 3);
assert.equal(mock.transactionOptions.every(value => value.isolationLevel === Prisma.TransactionIsolationLevel.Serializable), true);

mock = mockDatabase(baseState(Role.VIEWER), { conflictsBeforeWork: 3 });
await expectFailure(assignViewerAsOperator(mock.db, "admin", "target"), "SERIALIZATION_RETRY_EXHAUSTED");
assert.equal(mock.attempts(), 3);
assert.equal(mock.state().audits.length, 0);

mock = mockDatabase(baseState(Role.VIEWER), { nonRetryableBeforeWork: true });
console.error = () => undefined;
await expectFailure(assignViewerAsOperator(mock.db, "admin", "target"), "INTERNAL_INVARIANT_FAILURE");
console.error = originalConsoleError;
assert.equal(mock.attempts(), 1, "non-retryable failures are not retried");

const source = readFileSync("lib/role-transitions.ts", "utf8");
assert.doesNotMatch(source, /trip\.(update|updateMany|delete|deleteMany)/);
assert.equal(readFileSync("components/AdminParticipants.tsx", "utf8").includes("Assign operator"), false);
assert.equal(readFileSync("components/AdminParticipants.tsx", "utf8").includes("Return to viewer"), false);
assert.equal(readFileSync("app/api/admin/participants/route.ts", "utf8").includes("role-transitions"), false);

rmSync(".phase3-test-build", { recursive: true, force: true });
console.log("Phase 5C.2 role-transition service assertions passed.");
