import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { OfferStatus, OperatorPilotStatus, Prisma, PrismaClient, Role, TripStatus } from "@prisma/client";
import { assignNextOperator, expireAndReassignOffers } from "../lib/marketplace";
import { acceptTripOffer, createTripRequest, declineTripOffer } from "../lib/phase3-services";
import {
  cancelTrip,
  completeViewerFeedback,
  endTrip,
  listOperatorHistory,
  listViewerHistory,
  recoverStaleTrips,
  retryUnavailableTrip,
  startTrip,
} from "../lib/trip-lifecycle";

if (!process.env.PHASE3_TEST_DATABASE_URL || process.env.DATABASE_URL !== process.env.PHASE3_TEST_DATABASE_URL) throw new Error("Unsafe database mapping");
const db = new PrismaClient();
const run = `p4-${randomUUID()}`;
const serial = <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => db.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
const race = (tasks: Array<() => Promise<unknown>>) => Promise.allSettled(tasks.map(task => task()));
const fulfilledOk = (value: PromiseSettledResult<unknown>) =>
  value.status === "fulfilled" &&
  typeof value.value === "object" &&
  value.value !== null &&
  "ok" in value.value &&
  value.value.ok === true;

async function user(role: Role, online = false) {
  return db.user.create({ data: { clerkId: `${run}-${randomUUID()}`, name: "Lifecycle test", role, online } });
}
async function destination() {
  return db.destination.create({ data: { slug: `${run}-${randomUUID()}`, name: "Lifecycle destination", shortDescription: "Public", city: "Pilot City", meetingArea: "Entrance", category: "Test", durationOptions: [30] } });
}
async function operator(destinationId: string) {
  const value = await user(Role.OPERATOR, true);
  await db.operatorProfile.create({ data: { userId: value.id, operatingArea: "Pilot City", serviceRadiusKm: 10, languages: ["English"], accessibilityCapabilities: [], durationOptions: [30], pilotStatus: OperatorPilotStatus.APPROVED } });
  await db.operatorDestination.create({ data: { operatorId: value.id, destinationId } });
  return value;
}
async function rawTrip(viewerId: string, destinationId: string, data: Partial<Prisma.TripUncheckedCreateInput> = {}) {
  return db.trip.create({ data: { viewerId, destinationId, destination: "Lifecycle destination", operatingArea: "Pilot City", meetingArea: "Entrance", requestedDuration: 30, livekitRoom: `${run}-${randomUUID()}`, ...data } });
}
async function offered(viewerId: string, destinationId: string) {
  const trip = await rawTrip(viewerId, destinationId);
  await serial(tx => assignNextOperator(tx, trip.id));
  return db.trip.findUniqueOrThrow({ where: { id: trip.id } });
}
async function accepted(viewerId: string, destinationId: string) {
  const trip = await offered(viewerId, destinationId);
  assert.ok(trip.offeredOperatorId);
  assert.equal((await acceptTripOffer(db, trip.offeredOperatorId, trip.id)).ok, true);
  return db.trip.findUniqueOrThrow({ where: { id: trip.id } });
}
async function test(name: string, work: () => Promise<void>) {
  try {
    await work();
    console.log(`PASS ${name}`);
  } finally {
    await db.user.updateMany({ where: { clerkId: { startsWith: run }, role: Role.OPERATOR }, data: { online: false } });
  }
}

async function main() {
  const destinationValue = await destination();

  await test("complete lifecycle and duplicate transitions", async () => {
    const viewer = await user(Role.VIEWER); await operator(destinationValue.id);
    const trip = await offered(viewer.id, destinationValue.id); assert.equal(trip.status, TripStatus.OFFERED);
    const operatorId = trip.offeredOperatorId!; assert.equal((await acceptTripOffer(db, operatorId, trip.id)).ok, true);
    const starts = await race([() => startTrip(db, viewer.id, Role.VIEWER, trip.id), () => startTrip(db, operatorId, Role.OPERATOR, trip.id)]);
    assert.equal(starts.filter(fulfilledOk).length, 2);
    assert.equal((await db.trip.findUniqueOrThrow({ where: { id: trip.id } })).status, TripStatus.IN_PROGRESS);
    const ends = await race([() => endTrip(db, operatorId, Role.OPERATOR, trip.id), () => endTrip(db, viewer.id, Role.VIEWER, trip.id)]);
    assert.equal(ends.filter(fulfilledOk).length, 2);
    const feedback = { presence: 4, mediaQuality: 5 };
    const completions = await race([() => completeViewerFeedback(db, viewer.id, trip.id, feedback), () => completeViewerFeedback(db, viewer.id, trip.id, feedback)]);
    assert.equal(completions.filter(fulfilledOk).length, 2);
    const final = await db.trip.findUniqueOrThrow({ where: { id: trip.id }, include: { feedback: true } });
    assert.equal(final.status, TripStatus.FEEDBACK_COMPLETED); assert.equal(final.feedback.length, 1);
    assert.ok(final.offeredAt && final.acceptedAt && final.startedAt && final.endedAt && final.feedbackCompletedAt);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: operatorId } })).activeTripId, null);
  });

  for (let iteration = 0; iteration < 3; iteration += 1) {
    await test(`accept versus expiration race ${iteration + 1}`, async () => {
      const viewer = await user(Role.VIEWER); await operator(destinationValue.id); await operator(destinationValue.id);
      const start = new Date(Date.now() - 31_000); const trip = await rawTrip(viewer.id, destinationValue.id); await serial(tx => assignNextOperator(tx, trip.id, start));
      const assigned = (await db.trip.findUniqueOrThrow({ where: { id: trip.id } })).offeredOperatorId!;
      await race([() => acceptTripOffer(db, assigned, trip.id, new Date()), () => serial(tx => expireAndReassignOffers(tx, new Date()))]);
      const final = await db.trip.findUniqueOrThrow({ where: { id: trip.id }, include: { offers: true } });
      assert.notEqual(final.offeredOperatorId, assigned);
      assert.equal(final.offers.find(value => value.operatorId === assigned)?.status, OfferStatus.EXPIRED);
      assert.notEqual((await db.user.findUniqueOrThrow({ where: { id: assigned } })).pendingOfferTripId, trip.id);
    });
  }

  await test("cancel races assignment and acceptance without stranded reservation", async () => {
    const viewer = await user(Role.VIEWER); await operator(destinationValue.id); const trip = await rawTrip(viewer.id, destinationValue.id);
    await race([() => serial(tx => assignNextOperator(tx, trip.id)), () => cancelTrip(db, viewer.id, Role.VIEWER, trip.id)]);
    const first = await db.trip.findUniqueOrThrow({ where: { id: trip.id } });
    if (first.status === TripStatus.OFFERED) {
      await race([() => acceptTripOffer(db, first.offeredOperatorId!, trip.id), () => cancelTrip(db, viewer.id, Role.VIEWER, trip.id)]);
    }
    const final = await db.trip.findUniqueOrThrow({ where: { id: trip.id } });
    assert.ok(([TripStatus.CANCELLED, TripStatus.ACCEPTED] as TripStatus[]).includes(final.status));
    if (final.status === TripStatus.CANCELLED) assert.equal(await db.user.count({ where: { OR: [{ pendingOfferTripId: trip.id }, { activeTripId: trip.id }] } }), 0);
  });

  await test("operator cancellation versus start", async () => {
    const viewer = await user(Role.VIEWER); await operator(destinationValue.id); const trip = await accepted(viewer.id, destinationValue.id);
    await race([() => startTrip(db, trip.operatorId!, Role.OPERATOR, trip.id), () => cancelTrip(db, trip.operatorId!, Role.OPERATOR, trip.id)]);
    const final = await db.trip.findUniqueOrThrow({ where: { id: trip.id } });
    assert.ok(([TripStatus.CANCELLED, TripStatus.IN_PROGRESS] as TripStatus[]).includes(final.status));
  });

  await test("decline versus expiration and duplicate processing", async () => {
    const viewer = await user(Role.VIEWER); await operator(destinationValue.id); await operator(destinationValue.id); const trip = await offered(viewer.id, destinationValue.id);
    const assigned = trip.offeredOperatorId!;
    await race([() => declineTripOffer(db, assigned, trip.id), () => serial(tx => expireAndReassignOffers(tx, new Date(trip.offerExpiresAt!.getTime() + 1)))]);
    const history = await db.tripOffer.findUniqueOrThrow({ where: { tripId_operatorId: { tripId: trip.id, operatorId: assigned } } });
    assert.ok(([OfferStatus.DECLINED, OfferStatus.EXPIRED] as OfferStatus[]).includes(history.status));
    assert.notEqual((await db.user.findUniqueOrThrow({ where: { id: assigned } })).pendingOfferTripId, trip.id);
  });

  await test("exhaustion and duplicate retry", async () => {
    const viewer = await user(Role.VIEWER); const trip = await rawTrip(viewer.id, destinationValue.id); await serial(tx => assignNextOperator(tx, trip.id));
    assert.equal((await db.trip.findUniqueOrThrow({ where: { id: trip.id } })).status, TripStatus.NO_OPERATOR_AVAILABLE);
    const retries = await race([() => retryUnavailableTrip(db, viewer.id, trip.id), () => retryUnavailableTrip(db, viewer.id, trip.id)]);
    assert.equal(retries.filter(fulfilledOk).length, 2);
    assert.equal(await db.trip.count({ where: { retryOfTripId: trip.id } }), 1);
  });

  await test("stale accepted and in-progress recovery is idempotent", async () => {
    const viewer = await user(Role.VIEWER); const op = await operator(destinationValue.id);
    const acceptedTrip = await rawTrip(viewer.id, destinationValue.id, { status: TripStatus.ACCEPTED, operatorId: op.id, acceptedAt: new Date(0) });
    await db.user.update({ where: { id: op.id }, data: { activeTripId: acceptedTrip.id } });
    const viewer2 = await user(Role.VIEWER); const op2 = await operator(destinationValue.id);
    const activeTrip = await rawTrip(viewer2.id, destinationValue.id, { status: TripStatus.IN_PROGRESS, operatorId: op2.id, acceptedAt: new Date(0), startedAt: new Date(0) });
    await db.user.update({ where: { id: op2.id }, data: { activeTripId: activeTrip.id } });
    await race([() => recoverStaleTrips(db), () => recoverStaleTrips(db)]);
    assert.equal((await db.trip.findUniqueOrThrow({ where: { id: acceptedTrip.id } })).status, TripStatus.CANCELLED);
    assert.equal((await db.trip.findUniqueOrThrow({ where: { id: activeTrip.id } })).status, TripStatus.ENDED);
    assert.equal(await db.user.count({ where: { activeTripId: { in: [acceptedTrip.id, activeTrip.id] } } }), 0);
  });

  await test("history ownership and privacy", async () => {
    const viewer = await user(Role.VIEWER); await operator(destinationValue.id); const trip = await accepted(viewer.id, destinationValue.id);
    const viewerHistory = await listViewerHistory(db, viewer.id); const operatorHistory = await listOperatorHistory(db, trip.operatorId!);
    assert.ok(viewerHistory.some(value => value.id === trip.id)); assert.ok(operatorHistory.some(value => value.trip.id === trip.id));
    const serialized = JSON.stringify({ viewerHistory, operatorHistory });
    for (const privateField of ["clerkId", "lat", "lng", "livekitRoom", "viewerId", "operatorId"]) assert.ok(!serialized.includes(`"${privateField}"`));
    const stranger = await user(Role.VIEWER); assert.equal((await listViewerHistory(db, stranger.id)).length, 0);
    assert.equal((await cancelTrip(db, stranger.id, Role.VIEWER, trip.id)).ok, false);
  });

  await test("feedback skip and repeated visit", async () => {
    const viewer = await user(Role.VIEWER); await operator(destinationValue.id); const first = await accepted(viewer.id, destinationValue.id);
    await startTrip(db, viewer.id, Role.VIEWER, first.id); await endTrip(db, viewer.id, Role.VIEWER, first.id);
    assert.equal((await completeViewerFeedback(db, viewer.id, first.id, null)).ok, true);
    assert.equal((await db.trip.findUniqueOrThrow({ where: { id: first.id } })).status, TripStatus.FEEDBACK_COMPLETED);
    const next = await createTripRequest(db, viewer.id, { destinationId: destinationValue.id, meetingArea: "Entrance", requestedDuration: 30, accessibilityNeeds: [] }, () => `${run}-${randomUUID()}`);
    assert.equal(next.ok, true);
  });

  await test("real route authorization with mocked Clerk boundary", async () => {
    let clerkId: string | null = null;
    const clerkPath = require.resolve("@clerk/nextjs/server");
    const cached = require.cache[clerkPath];
    require.cache[clerkPath] = {
      id: clerkPath,
      filename: clerkPath,
      loaded: true,
      exports: {
        auth: () => ({ userId: clerkId }),
        currentUser: async () => null,
      },
      children: [],
      paths: [],
    } as unknown as NodeModule;
    try {
      const destinationsRoute = require("../app/api/destinations/route") as typeof import("../app/api/destinations/route");
      const offersRoute = require("../app/api/operator/offers/route") as typeof import("../app/api/operator/offers/route");
      const settingsRoute = require("../app/api/operator/settings/route") as typeof import("../app/api/operator/settings/route");
      const acceptRoute = require("../app/api/trips/[id]/accept/route") as typeof import("../app/api/trips/[id]/accept/route");
      const declineRoute = require("../app/api/operator/offers/[id]/decline/route") as typeof import("../app/api/operator/offers/[id]/decline/route");
      const startRoute = require("../app/api/trips/[id]/start/route") as typeof import("../app/api/trips/[id]/start/route");
      const currentRoute = require("../app/api/trips/current/route") as typeof import("../app/api/trips/current/route");
      const historyRoute = require("../app/api/trips/history/route") as typeof import("../app/api/trips/history/route");
      const retryRoute = require("../app/api/trips/[id]/retry/route") as typeof import("../app/api/trips/[id]/retry/route");
      const skipRoute = require("../app/api/feedback/skip/route") as typeof import("../app/api/feedback/skip/route");

      const viewer = await user(Role.VIEWER);
      const assignedOperator = await operator(destinationValue.id);
      const otherOperator = await operator(destinationValue.id);
      const inactive = await db.destination.create({ data: { slug: `${run}-${randomUUID()}`, name: "Inactive", shortDescription: "Hidden", city: "Pilot City", meetingArea: "Entrance", category: "Test", durationOptions: [30], active: false } });
      const trip = await rawTrip(viewer.id, destinationValue.id);
      await serial(tx => assignNextOperator(tx, trip.id));
      const assignedId = (await db.trip.findUniqueOrThrow({ where: { id: trip.id } })).offeredOperatorId!;
      const assigned = assignedId === assignedOperator.id ? assignedOperator : otherOperator;
      const other = assignedId === assignedOperator.id ? otherOperator : assignedOperator;

      clerkId = null;
      assert.equal((await destinationsRoute.GET()).status, 401);

      clerkId = viewer.clerkId;
      const viewerCatalog = await destinationsRoute.GET(); assert.equal(viewerCatalog.status, 200);
      const viewerCatalogBody = await viewerCatalog.json(); assert.ok(!viewerCatalogBody.destinations.some((value: { id: string }) => value.id === inactive.id));
      assert.deepEqual(Object.keys(viewerCatalogBody.destinations[0]).sort(), ["category", "city", "custom", "durationOptions", "id", "imageUrl", "meetingArea", "name", "shortDescription"].sort());
      assert.equal((await offersRoute.GET()).status, 403);
      const viewerSettings = new Request("http://test/api/operator/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: assigned.id }) });
      assert.equal((await settingsRoute.PUT(viewerSettings as never)).status, 403);

      clerkId = other.clerkId;
      const otherOffer = await offersRoute.GET(); assert.equal(otherOffer.status, 200); assert.equal((await otherOffer.json()).offer, null);
      const unauthorizedAccept = await acceptRoute.POST(new Request("http://test") as never, { params: { id: trip.id } }); assert.equal(unauthorizedAccept.status, 409);
      const unauthorizedDecline = await declineRoute.POST(new Request("http://test") as never, { params: { id: trip.id } }); assert.equal(unauthorizedDecline.status, 409);

      clerkId = assigned.clerkId;
      const operatorCatalog = await destinationsRoute.GET(); assert.equal(operatorCatalog.status, 200);
      const assignedOffer = await offersRoute.GET(); assert.equal(assignedOffer.status, 200); const assignedBody = await assignedOffer.json(); assert.equal(assignedBody.offer.id, trip.id);
      const serialized = JSON.stringify(assignedBody); for (const field of ["clerkId", "lat", "lng", "viewerId", "operatorId"]) assert.ok(!serialized.includes(`"${field}"`));
      const accepted = await acceptRoute.POST(new Request("http://test", { method: "POST", body: JSON.stringify({ userId: other.id }) }) as never, { params: { id: trip.id } }); assert.equal(accepted.status, 200);
      assert.equal((await db.trip.findUniqueOrThrow({ where: { id: trip.id } })).operatorId, assigned.id);

      clerkId = viewer.clerkId;
      const current = await currentRoute.GET(new Request("http://test/api/trips/current")); assert.equal(current.status, 200); const currentBody = await current.json(); assert.equal(currentBody.trip.id, trip.id); assert.ok(!JSON.stringify(currentBody).includes("livekitRoom"));
      const viewerHistory = await historyRoute.GET(new Request("http://test/api/trips/history?limit=10") as never); assert.equal(viewerHistory.status, 200); assert.ok((await viewerHistory.json()).history.some((value: { id: string }) => value.id === trip.id));
      const stranger = await user(Role.VIEWER); clerkId = stranger.clerkId; assert.equal((await startRoute.POST(new Request("http://test") as never, { params: { id: trip.id } })).status, 404);

      clerkId = assigned.clerkId;
      assert.equal((await startRoute.POST(new Request("http://test") as never, { params: { id: trip.id } })).status, 200);
      const operatorHistory = await historyRoute.GET(new Request("http://test/api/trips/history?as=teleporter") as never); assert.equal(operatorHistory.status, 200); const operatorHistoryBody = await operatorHistory.json(); assert.ok(operatorHistoryBody.history.some((value: { trip: { id: string } }) => value.trip.id === trip.id));
      const phase4Serialized = JSON.stringify(operatorHistoryBody); for (const field of ["clerkId", "lat", "lng", "livekitRoom", "viewerId", "operatorId"]) assert.ok(!phase4Serialized.includes(`"${field}"`));
      assert.equal((await retryRoute.POST(new Request("http://test") as never, { params: { id: trip.id } })).status, 403);
      assert.equal((await skipRoute.POST(new Request("http://test", { method: "POST", body: JSON.stringify({ tripId: trip.id }) }) as never)).status, 403);
    } finally {
      if (cached) require.cache[clerkPath] = cached;
      else delete require.cache[clerkPath];
    }
  });
}

main().finally(async () => {
  await db.feedback.deleteMany({ where: { trip: { viewer: { clerkId: { startsWith: run } } } } });
  await db.trip.deleteMany({ where: { viewer: { clerkId: { startsWith: run } } } });
  await db.destination.deleteMany({ where: { slug: { startsWith: run } } });
  await db.user.deleteMany({ where: { clerkId: { startsWith: run } } });
  await db.$disconnect();
}).catch(error => { console.error(error instanceof Error ? error.message : "Phase 4 database integration failure"); process.exitCode = 1; });
