import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { AccountLifecycleAction, AccountStatus, Prisma, Role } from "@prisma/client";

const compile = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "scripts/tsconfig.phase3-db.json"], { stdio: "inherit" });
if (compile.status !== 0) process.exit(compile.status ?? 1);
const compiled = ".phase3-test-build/lib/account-lifecycle.js";
writeFileSync(compiled, readFileSync(compiled, "utf8").replace('require("server-only");', ""));
const { ACCOUNT_LIFECYCLE_REASON_MAX_LENGTH, deactivateAccount, reactivateAccount } = await import(`../${compiled}`);

function state() {
  return {
    users: {
      admin: { id: "admin", role: Role.ADMIN, accountStatus: AccountStatus.ACTIVE, online: false, pendingOfferTripId: null, activeTripId: null, deactivatedAt: null },
      admin2: { id: "admin2", role: Role.ADMIN, accountStatus: AccountStatus.ACTIVE, online: false, pendingOfferTripId: null, activeTripId: null, deactivatedAt: null },
      viewer: { id: "viewer", role: Role.VIEWER, accountStatus: AccountStatus.ACTIVE, online: true, pendingOfferTripId: null, activeTripId: null, deactivatedAt: null },
      operator: { id: "operator", role: Role.OPERATOR, accountStatus: AccountStatus.ACTIVE, online: true, pendingOfferTripId: null, activeTripId: null, deactivatedAt: null },
      inactive: { id: "inactive", role: Role.VIEWER, accountStatus: AccountStatus.DEACTIVATED, online: false, pendingOfferTripId: null, activeTripId: null, deactivatedAt: new Date("2026-01-01") },
    },
    viewerTrips: 0, operatorTrips: 0, offeredTrips: 0, pendingOffers: 0, audits: [], nextAudit: 1,
  };
}

function mockDatabase(initial = state(), options = {}) {
  let current = structuredClone(initial), attempts = 0;
  const db = {
    async $transaction(work, transactionOptions) {
      attempts += 1;
      assert.equal(transactionOptions.isolationLevel, Prisma.TransactionIsolationLevel.Serializable);
      if (attempts <= (options.conflictsBeforeWork ?? 0)) throw new Prisma.PrismaClientKnownRequestError("serialization", { code: "P2034", clientVersion: Prisma.prismaVersion.client });
      const draft = structuredClone(current);
      const tx = {
        user: {
          findUnique: async ({ where }) => draft.users[where.id] ? { ...draft.users[where.id] } : null,
          count: async ({ where }) => options.forceNoOtherAdmins ? 0 : Object.values(draft.users).filter(user => user.id !== where.id.not && user.role === where.role && user.accountStatus === where.accountStatus).length,
          updateMany: async ({ where, data }) => {
            const user = draft.users[where.id];
            if (!user || user.accountStatus !== where.accountStatus || ("pendingOfferTripId" in where && user.pendingOfferTripId !== where.pendingOfferTripId) || ("activeTripId" in where && user.activeTripId !== where.activeTripId)) return { count: 0 };
            Object.assign(user, data); return { count: 1 };
          },
        },
        trip: { count: async ({ where }) => "viewerId" in where ? draft.viewerTrips : "operatorId" in where ? draft.operatorTrips : draft.offeredTrips },
        tripOffer: { count: async () => draft.pendingOffers },
        accountLifecycleAudit: { create: async ({ data }) => { if (options.failAudit) throw new Error("audit unavailable"); const audit = { id: `audit-${draft.nextAudit++}`, ...data }; draft.audits.push(audit); return { id: audit.id }; } },
      };
      const result = await work(tx);
      current = draft;
      return result;
    },
  };
  return { db, state: () => structuredClone(current), attempts: () => attempts };
}

async function expectCode(promise, code) { const result = await promise; assert.equal(result.ok, false); assert.equal(result.code, code); return result; }

assert.equal(ACCOUNT_LIFECYCLE_REASON_MAX_LENGTH, 500);
for (const reason of [undefined, null, "", "   ", "x".repeat(501)]) await expectCode(deactivateAccount(mockDatabase().db, "admin", "viewer", reason), "INVALID_REASON");

let mock = mockDatabase();
let result = await deactivateAccount(mock.db, "admin", "viewer", "  Policy   request  ", new Date("2026-07-28T12:00:00Z"));
assert.equal(result.ok, true); assert.equal(mock.state().users.viewer.accountStatus, AccountStatus.DEACTIVATED); assert.equal(mock.state().users.viewer.online, false); assert.equal(mock.state().users.viewer.role, Role.VIEWER);
assert.deepEqual(mock.state().audits[0], { id: "audit-1", actorId: "admin", targetId: "viewer", action: AccountLifecycleAction.DEACTIVATE, previousStatus: AccountStatus.ACTIVE, newStatus: AccountStatus.DEACTIVATED, reason: "Policy request" });
await expectCode(deactivateAccount(mock.db, "admin", "viewer", "again"), "ACCOUNT_ALREADY_DEACTIVATED"); assert.equal(mock.state().audits.length, 1);
result = await reactivateAccount(mock.db, "admin", "viewer", "  Access restored  "); assert.equal(result.ok, true); assert.equal(mock.state().users.viewer.accountStatus, AccountStatus.ACTIVE); assert.equal(mock.state().users.viewer.online, false); assert.equal(mock.state().users.viewer.deactivatedAt, null); assert.equal(mock.state().audits.length, 2);
await expectCode(reactivateAccount(mock.db, "admin", "viewer", "again"), "ACCOUNT_ALREADY_ACTIVE"); assert.equal(mock.state().audits.length, 2);

await expectCode(deactivateAccount(mockDatabase().db, null, "viewer", "reason"), "UNAUTHORIZED");
await expectCode(deactivateAccount(mockDatabase().db, "missing", "viewer", "reason"), "ACTOR_NOT_FOUND");
await expectCode(deactivateAccount(mockDatabase().db, "viewer", "operator", "reason"), "FORBIDDEN");
await expectCode(deactivateAccount(mockDatabase().db, "admin", "admin", "reason"), "SELF_DEACTIVATION_FORBIDDEN");
let inactiveActor = state(); inactiveActor.users.admin.accountStatus = AccountStatus.DEACTIVATED;
await expectCode(deactivateAccount(mockDatabase(inactiveActor).db, "admin", "viewer", "reason"), "ACTOR_INACTIVE");

await expectCode(deactivateAccount(mockDatabase(state(), { forceNoOtherAdmins: true }).db, "admin", "admin2", "reason"), "LAST_ACTIVE_ADMIN");

for (const field of ["viewerTrips", "operatorTrips", "offeredTrips", "pendingOffers"]) { const blocked = state(); blocked[field] = 1; await expectCode(deactivateAccount(mockDatabase(blocked).db, "admin", "operator", "reason"), "ACTIVE_ACCOUNT_OBLIGATION"); }
for (const pointer of ["pendingOfferTripId", "activeTripId"]) { const blocked = state(); blocked.users.operator[pointer] = "reserved"; await expectCode(deactivateAccount(mockDatabase(blocked).db, "admin", "operator", "reason"), "ACTIVE_ACCOUNT_OBLIGATION"); }

mock = mockDatabase(state(), { failAudit: true });
const originalError = console.error; console.error = () => undefined;
await expectCode(deactivateAccount(mock.db, "admin", "operator", "reason"), "INTERNAL_INVARIANT_FAILURE"); console.error = originalError;
assert.equal(mock.state().users.operator.accountStatus, AccountStatus.ACTIVE); assert.equal(mock.state().users.operator.online, true); assert.equal(mock.state().audits.length, 0);

mock = mockDatabase(state(), { conflictsBeforeWork: 2 }); result = await deactivateAccount(mock.db, "admin", "viewer", "reason"); assert.equal(result.ok, true); assert.equal(mock.attempts(), 3);
mock = mockDatabase(state(), { conflictsBeforeWork: 3 }); await expectCode(deactivateAccount(mock.db, "admin", "viewer", "reason"), "SERIALIZATION_RETRY_EXHAUSTED"); assert.equal(mock.attempts(), 3);

const source = readFileSync("lib/account-lifecycle.ts", "utf8");
assert.doesNotMatch(source, /clerk|deleteMany|trip\.(?:update|delete)|operatorProfile\.(?:update|delete)|operatorApplication\.(?:update|delete)/i);
assert.match(source, /TripStatus\.REQUESTED[\s\S]*TripStatus\.ENDED/);
assert.match(source, /AccountStatus\.ACTIVE[\s\S]*Role\.ADMIN/);
rmSync(".phase3-test-build", { recursive: true, force: true });
console.log("Phase 5E.1A account lifecycle service assertions passed.");
