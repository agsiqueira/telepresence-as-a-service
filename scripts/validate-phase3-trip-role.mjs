import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { Prisma, Role, TripStatus } from "@prisma/client";

const compile = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "scripts/tsconfig.phase3-db.json"], { stdio: "inherit" });
if (compile.status !== 0) process.exit(compile.status ?? 1);
const root = ".phase3-test-build/lib";
for (const file of ["phase3-services.js", "marketplace.js", "trip-lifecycle.js"]) {
  const path = `${root}/${file}`;
  writeFileSync(path, readFileSync(path, "utf8").replace('require("server-only");', ""));
}
writeFileSync(`${root}/marketplace.js`, [
  "exports.ALLOWED_ACCESSIBILITY = []; exports.ALLOWED_DURATIONS = [30]; exports.ALLOWED_LANGUAGES = [];",
  "exports.normalizedList = value => Array.isArray(value) ? value : null;",
  "exports.assignNextOperator = async () => null; exports.expireAndReassignOffers = async () => undefined;",
].join("\n"));
writeFileSync(`${root}/trip-lifecycle.js`, "exports.cancelTrip = async () => null; exports.endTrip = async () => null;\n");
const { createTripRequest } = await import(`../${root}/phase3-services.js`);

const input = { destinationId: "destination", requestedDuration: 30, accessibilityNeeds: [] };

function database({ role = Role.VIEWER, missing = false, existing = false, conflictAfterFirstWork = false } = {}) {
  let committedTrips = existing ? [{ id: "existing", viewerId: "viewer", status: TripStatus.REQUESTED }] : [];
  let attempts = 0;
  let userReads = 0;
  let inserts = 0;
  return {
    db: {
      async $transaction(work, options) {
        attempts += 1;
        const draft = structuredClone(committedTrips);
        const tx = {
          user: { findUnique: async ({ where }) => { userReads += 1; return missing || where.id !== "viewer" ? null : { role }; } },
          trip: {
            findFirst: async ({ where }) => draft.find(trip => trip.viewerId === where.viewerId && where.status.in.includes(trip.status)) ?? null,
            create: async ({ data }) => { inserts += 1; const trip = { id: `trip-${attempts}`, status: TripStatus.REQUESTED, acceptedAt: null, offeredOperatorId: null, offerExpiresAt: null, ...data }; draft.push(trip); return trip; },
            findUniqueOrThrow: async ({ where }) => draft.find(trip => trip.id === where.id) ?? assert.fail("created trip missing"),
          },
          destination: { findFirst: async () => ({ id: "destination", name: "Destination", city: "Pilot City", custom: false, durationOptions: [30] }) },
        };
        const result = await work(tx);
        assert.equal(options.isolationLevel, Prisma.TransactionIsolationLevel.Serializable);
        if (conflictAfterFirstWork && attempts === 1) {
          throw new Prisma.PrismaClientKnownRequestError("serialization conflict", { code: "P2034", clientVersion: Prisma.prismaVersion.client });
        }
        committedTrips = draft;
        return result;
      },
    },
    state: () => ({ attempts, userReads, inserts, trips: committedTrips }),
  };
}

let mock = database();
let result = await createTripRequest(mock.db, "viewer", input, () => "room");
assert.equal(result.ok, true);
assert.equal(mock.state().userReads, 1);
assert.equal(mock.state().trips.length, 1);

for (const role of [Role.OPERATOR, Role.ADMIN]) {
  mock = database({ role });
  result = await createTripRequest(mock.db, "viewer", input, () => "room");
  assert.deepEqual(result, { ok: false, status: 409, error: "Participant is no longer a Viewer" });
  assert.equal(mock.state().inserts, 0);
}

mock = database({ missing: true });
result = await createTripRequest(mock.db, "viewer", input, () => "room");
assert.deepEqual(result, { ok: false, status: 404, error: "Viewer not found" });
assert.equal(mock.state().inserts, 0);

mock = database({ existing: true });
result = await createTripRequest(mock.db, "viewer", input, () => "room");
assert.equal(result.ok, false);
assert.equal(result.status, 409);
assert.equal(mock.state().inserts, 0);

mock = database({ conflictAfterFirstWork: true });
result = await createTripRequest(mock.db, "viewer", input, () => "room");
assert.equal(result.ok, true);
assert.equal(mock.state().attempts, 2);
assert.equal(mock.state().userReads, 2, "the persisted role is reread on every retry");
assert.equal(mock.state().trips.length, 1, "the failed transaction attempt does not commit its insert");

const source = readFileSync("lib/phase3-services.ts", "utf8");
assert.match(source, /tx\.user\.findUnique/);
assert.match(source, /participant\.role !== Role\.VIEWER/);
assert.ok(source.indexOf("tx.user.findUnique") < source.indexOf("tx.trip.create"));
rmSync(".phase3-test-build", { recursive: true, force: true });
console.log("Phase 3 transactional Viewer-role assertions passed.");
