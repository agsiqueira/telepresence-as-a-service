import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { OfferStatus, OperatorPilotStatus, Prisma, PrismaClient, Role, TripStatus } from "@prisma/client";
import { assignNextOperator, expireAndReassignOffers } from "../lib/marketplace";
import {
  acceptTripOffer,
  cancelRequestedTrip,
  createTripRequest,
  declineTripOffer,
  endAcceptedTrip,
  getCurrentOffer,
  listActiveDestinations,
  updateOperatorSettings,
  type OperatorSettingsInput,
} from "../lib/phase3-services";
import { startTrip } from "../lib/trip-lifecycle";

if (!process.env.PHASE3_TEST_DATABASE_URL) throw new Error("PHASE3_TEST_DATABASE_URL is required");
if (process.env.DATABASE_URL !== process.env.PHASE3_TEST_DATABASE_URL) throw new Error("Unsafe database mapping");

const db = new PrismaClient();
const run = `p3-${randomUUID()}`;
const serial = <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => db.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
const race = (values: Promise<unknown>[]) => Promise.allSettled(values);
const fulfilledResult = (value: PromiseSettledResult<unknown>) => value.status === "fulfilled" && typeof value.value === "object" && value.value !== null ? value.value as { ok?: boolean; status?: number } : null;

async function user(role: Role, online = false) {
  return db.user.create({ data: { clerkId: `${run}-${randomUUID()}`, role, online, name: "Phase 3 integration" } });
}
async function destination(city = "Pilot City", active = true) {
  return db.destination.create({ data: { slug: `${run}-${randomUUID()}`, name: "Test destination", shortDescription: "Safe public description", city, meetingArea: "Public entrance", category: "Test", durationOptions: [30], active } });
}
async function operator(destinationId: string, options: { area?: string; online?: boolean; language?: string; access?: string[]; serves?: boolean } = {}) {
  const value = await user(Role.OPERATOR, options.online ?? true);
  await db.operatorProfile.create({ data: { userId: value.id, operatingArea: options.area ?? "Pilot City", serviceRadiusKm: 25, languages: [options.language ?? "English"], accessibilityCapabilities: options.access ?? [], durationOptions: [30], pilotStatus: OperatorPilotStatus.APPROVED } });
  if (options.serves !== false) await db.operatorDestination.create({ data: { operatorId: value.id, destinationId } });
  return value;
}
async function rawTrip(viewerId: string, destinationId: string, data: Partial<Prisma.TripUncheckedCreateInput> = {}) {
  return db.trip.create({ data: { viewerId, destinationId, destination: "Test destination", operatingArea: "Pilot City", meetingArea: "Descriptive instructions", requestedDuration: 30, livekitRoom: `${run}-${randomUUID()}`, ...data } });
}
const requestInput = (destinationId: string) => ({ destinationId, meetingArea: "Begin outside the main entrance", requestedDuration: 30, viewerNote: "Please show the main exhibits", preferredLanguage: "", accessibilityNeeds: [] as string[], customDestination: "" });
const settings = (destinationId: string, radius = 30): OperatorSettingsInput => ({ operatingArea: "Pilot City", serviceRadiusKm: radius, supportsCustom: false, languages: ["English"], accessibilityCapabilities: [], durationOptions: [30], destinationIds: [destinationId] });

async function assertOfferConsistent(tripId: string) {
  const trip = await db.trip.findUniqueOrThrow({ where: { id: tripId }, include: { offers: true } });
  const offered = trip.offers.filter(value => value.status === OfferStatus.OFFERED);
  if (!trip.offeredOperatorId) { assert.equal(offered.length, 0); return; }
  assert.equal(offered.length, 1);
  assert.equal(offered[0].operatorId, trip.offeredOperatorId);
  assert.equal(offered[0].expiresAt.getTime(), trip.offerExpiresAt?.getTime());
  const operator = await db.user.findUniqueOrThrow({ where: { id: trip.offeredOperatorId } });
  assert.equal(operator.pendingOfferTripId, trip.id);
}
async function test(name: string, fn: () => Promise<void>) {
  try { await fn(); console.log(`PASS ${name}`); }
  finally { await db.user.updateMany({ where: { clerkId: { startsWith: run }, role: Role.OPERATOR }, data: { online: false } }); }
}

async function main() {
  const d = await destination();

  await test("seed idempotency and safe active catalog projection", async () => {
    const expected = ["campus-tour", "historic-downtown", "cultural-venue", "waterfront-visit", "shopping-district", "custom-destination"];
    assert.equal(await db.destination.count({ where: { slug: { in: expected } } }), 6);
    const duplicates = await db.destination.groupBy({ by: ["slug"], _count: { slug: true }, having: { slug: { _count: { gt: 1 } } } });
    assert.equal(duplicates.length, 0);
    const inactive = await destination("Pilot City", false);
    const catalog = await listActiveDestinations(db);
    assert.ok(!catalog.some(value => value.id === inactive.id));
    assert.deepEqual(Object.keys(catalog[0]).sort(), ["category", "city", "custom", "durationOptions", "id", "imageUrl", "meetingArea", "name", "shortDescription"].sort());
  });

  await test("optional starting preference and operator presentation", async () => {
    const viewerWithout = await user(Role.VIEWER); await operator(d.id);
    const without = await createTripRequest(db, viewerWithout.id, { ...requestInput(d.id), meetingArea: "" }, () => `${run}-${randomUUID()}`);
    assert.equal(without.ok, true);
    if (!without.ok) return;
    const withoutTrip = await db.trip.findUniqueOrThrow({ where: { id: without.value.trip.id } });
    assert.equal(withoutTrip.meetingArea, null);
    assert.ok(withoutTrip.offeredOperatorId);
    assert.equal((await getCurrentOffer(db, withoutTrip.offeredOperatorId!))?.meetingArea, null);

    await db.user.updateMany({ where: { clerkId: { startsWith: run }, role: Role.OPERATOR }, data: { online: false } });
    const viewerWith = await user(Role.VIEWER); await operator(d.id);
    const preference = "Begin outside the main entrance";
    const supplied = await createTripRequest(db, viewerWith.id, { ...requestInput(d.id), meetingArea: preference }, () => `${run}-${randomUUID()}`);
    assert.equal(supplied.ok, true);
    if (!supplied.ok) return;
    const suppliedTrip = await db.trip.findUniqueOrThrow({ where: { id: supplied.value.trip.id } });
    assert.ok(suppliedTrip.offeredOperatorId);
    assert.equal((await getCurrentOffer(db, suppliedTrip.offeredOperatorId!))?.meetingArea, preference);
  });

  await test("concurrent assignment to one trip", async () => {
    const viewer = await user(Role.VIEWER), first = await operator(d.id), second = await operator(d.id), trip = await rawTrip(viewer.id, d.id);
    await race([serial(tx => assignNextOperator(tx, trip.id)), serial(tx => assignNextOperator(tx, trip.id))]);
    await assertOfferConsistent(trip.id);
    const state = await db.trip.findUniqueOrThrow({ where: { id: trip.id }, include: { offers: true } });
    assert.ok([first.id, second.id].includes(state.offeredOperatorId!));
    assert.equal(state.offers.filter(value => value.status === OfferStatus.OFFERED).length, 1);
    assert.equal(await db.user.count({ where: { id: { in: [first.id, second.id] }, pendingOfferTripId: trip.id } }), 1);
  });

  await test("two trips compete for one operator", async () => {
    const viewer1 = await user(Role.VIEWER), viewer2 = await user(Role.VIEWER), only = await operator(d.id);
    const first = await rawTrip(viewer1.id, d.id), second = await rawTrip(viewer2.id, d.id);
    await race([serial(tx => assignNextOperator(tx, first.id)), serial(tx => assignNextOperator(tx, second.id))]);
    const trips = await db.trip.findMany({ where: { id: { in: [first.id, second.id] } }, include: { offers: true } });
    assert.equal(trips.filter(value => value.offeredOperatorId === only.id).length, 1);
    assert.equal(trips.flatMap(value => value.offers).filter(value => value.status === OfferStatus.OFFERED).length, 1);
    assert.ok([first.id, second.id].includes((await db.user.findUniqueOrThrow({ where: { id: only.id } })).pendingOfferTripId!));
    for (const value of trips) await assertOfferConsistent(value.id);
  });

  await test("shared acceptance: duplicate winner and unauthorized operator", async () => {
    const viewer = await user(Role.VIEWER), first = await operator(d.id), second = await operator(d.id), trip = await rawTrip(viewer.id, d.id);
    await serial(tx => assignNextOperator(tx, trip.id));
    const assigned = (await db.trip.findUniqueOrThrow({ where: { id: trip.id } })).offeredOperatorId!;
    const stale = assigned === first.id ? second.id : first.id;
    const results = await race([acceptTripOffer(db, assigned, trip.id), acceptTripOffer(db, assigned, trip.id), acceptTripOffer(db, stale, trip.id)]);
    assert.ok(results.some(value => fulfilledResult(value)?.ok === true));
    assert.equal((await acceptTripOffer(db, assigned, trip.id)).ok, true);
    const unauthorized = await acceptTripOffer(db, stale, trip.id); assert.equal(unauthorized.ok, false); if (!unauthorized.ok) assert.equal(unauthorized.status, 409);
    const state = await db.trip.findUniqueOrThrow({ where: { id: trip.id }, include: { offers: true } });
    assert.equal(state.status, TripStatus.ACCEPTED); assert.equal(state.operatorId, assigned); assert.equal(state.offers.filter(value => value.status === OfferStatus.ACCEPTED).length, 1);
    const operatorState = await db.user.findUniqueOrThrow({ where: { id: assigned } }); assert.equal(operatorState.pendingOfferTripId, null); assert.equal(operatorState.activeTripId, trip.id);
  });

  await test("shared accept versus decline", async () => {
    const viewer = await user(Role.VIEWER), first = await operator(d.id), second = await operator(d.id), trip = await rawTrip(viewer.id, d.id);
    await serial(tx => assignNextOperator(tx, trip.id)); const assigned = (await db.trip.findUniqueOrThrow({ where: { id: trip.id } })).offeredOperatorId!;
    await race([acceptTripOffer(db, assigned, trip.id), declineTripOffer(db, assigned, trip.id)]);
    const state = await db.trip.findUniqueOrThrow({ where: { id: trip.id }, include: { offers: true } });
    const original = state.offers.find(value => value.operatorId === assigned)!;
    assert.ok(([OfferStatus.ACCEPTED, OfferStatus.DECLINED] as OfferStatus[]).includes(original.status));
    if (state.status === TripStatus.ACCEPTED) { assert.equal(original.status, OfferStatus.ACCEPTED); assert.equal((await db.user.findUniqueOrThrow({ where: { id: assigned } })).activeTripId, trip.id); }
    else { assert.equal(original.status, OfferStatus.DECLINED); await assertOfferConsistent(trip.id); }
    void first; void second;
  });

  await test("shared duplicate decline is stable and preserves newer offer", async () => {
    const viewer = await user(Role.VIEWER), first = await operator(d.id), second = await operator(d.id), trip = await rawTrip(viewer.id, d.id);
    await serial(tx => assignNextOperator(tx, trip.id)); const assigned = (await db.trip.findUniqueOrThrow({ where: { id: trip.id } })).offeredOperatorId!;
    const results = await race([declineTripOffer(db, assigned, trip.id), declineTripOffer(db, assigned, trip.id)]);
    assert.equal(results.filter(value => fulfilledResult(value)?.ok === true).length, 1);
    const repeated = await declineTripOffer(db, assigned, trip.id); assert.equal(repeated.ok, false); if (!repeated.ok) assert.equal(repeated.status, 409);
    const state = await db.trip.findUniqueOrThrow({ where: { id: trip.id }, include: { offers: true } }); assert.equal(state.offers.filter(value => value.operatorId === assigned && value.status === OfferStatus.DECLINED).length, 1); assert.notEqual(state.offeredOperatorId, assigned); await assertOfferConsistent(trip.id); assert.equal((await db.user.findUniqueOrThrow({ where: { id: assigned } })).online, true); void first; void second;
  });

  await test("shared settings with pending, active, and waiting states", async () => {
    const viewer = await user(Role.VIEWER), op = await operator(d.id), trip = await rawTrip(viewer.id, d.id); await serial(tx => assignNextOperator(tx, trip.id));
    const assigned = (await db.trip.findUniqueOrThrow({ where: { id: trip.id } })).offeredOperatorId!;
    const before = await db.operatorProfile.findUniqueOrThrow({ where: { userId: assigned } });
    const pending = await updateOperatorSettings(db, assigned, settings(d.id, 44)); assert.equal(pending.ok, false);
    assert.equal((await db.operatorProfile.findUniqueOrThrow({ where: { userId: assigned } })).serviceRadiusKm, before.serviceRadiusKm); await assertOfferConsistent(trip.id);
    assert.equal((await acceptTripOffer(db, assigned, trip.id)).ok, true);
    const active = await updateOperatorSettings(db, assigned, settings(d.id, 45)); assert.equal(active.ok, false);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: assigned } })).activeTripId, trip.id);
    const waiting = await operator(d.id); const saved = await updateOperatorSettings(db, waiting.id, settings(d.id, 46)); assert.equal(saved.ok, true);
    const waitingState = await db.user.findUniqueOrThrow({ where: { id: waiting.id } }); assert.equal(waitingState.online, false); assert.equal(waitingState.pendingOfferTripId, null); assert.equal(waitingState.activeTripId, null);
    assert.equal((await db.operatorProfile.findUniqueOrThrow({ where: { userId: waiting.id } })).serviceRadiusKm, 46); void op;
  });

  await test("shared settings races assignment and acceptance", async () => {
    const viewer = await user(Role.VIEWER), op = await operator(d.id), trip = await rawTrip(viewer.id, d.id);
    await race([serial(tx => assignNextOperator(tx, trip.id)), updateOperatorSettings(db, op.id, settings(d.id, 51))]);
    const afterAssignment = await db.trip.findUniqueOrThrow({ where: { id: trip.id } }); const operatorState = await db.user.findUniqueOrThrow({ where: { id: op.id } });
    if (afterAssignment.offeredOperatorId === op.id) { assert.equal(operatorState.pendingOfferTripId, trip.id); assert.equal((await db.operatorProfile.findUniqueOrThrow({ where: { userId: op.id } })).serviceRadiusKm, 25); }
    else { assert.equal(operatorState.online, false); assert.equal(operatorState.pendingOfferTripId, null); assert.equal((await db.operatorProfile.findUniqueOrThrow({ where: { userId: op.id } })).serviceRadiusKm, 51); }
    const viewer2 = await user(Role.VIEWER), op2 = await operator(d.id), trip2 = await rawTrip(viewer2.id, d.id); await serial(tx => assignNextOperator(tx, trip2.id));
    const assigned = (await db.trip.findUniqueOrThrow({ where: { id: trip2.id } })).offeredOperatorId!;
    await race([acceptTripOffer(db, assigned, trip2.id), updateOperatorSettings(db, assigned, settings(d.id, 52))]);
    const finalTrip = await db.trip.findUniqueOrThrow({ where: { id: trip2.id } }); const finalOperator = await db.user.findUniqueOrThrow({ where: { id: assigned } });
    assert.ok(finalOperator.pendingOfferTripId === trip2.id || finalOperator.activeTripId === trip2.id); assert.equal((await db.operatorProfile.findUniqueOrThrow({ where: { userId: assigned } })).serviceRadiusKm, 25); assert.ok(([TripStatus.OFFERED, TripStatus.ACCEPTED] as TripStatus[]).includes(finalTrip.status)); void op2;
  });

  await test("shared cancellation versus acceptance", async () => {
    const viewer = await user(Role.VIEWER), op = await operator(d.id), trip = await rawTrip(viewer.id, d.id); await serial(tx => assignNextOperator(tx, trip.id));
    const assigned = (await db.trip.findUniqueOrThrow({ where: { id: trip.id } })).offeredOperatorId!;
    await race([cancelRequestedTrip(db, viewer.id, trip.id), acceptTripOffer(db, assigned, trip.id)]);
    const state = await db.trip.findUniqueOrThrow({ where: { id: trip.id }, include: { offers: true } }); const operatorState = await db.user.findUniqueOrThrow({ where: { id: assigned } });
    if (state.status === TripStatus.ACCEPTED) { assert.equal(state.operatorId, assigned); assert.equal(operatorState.activeTripId, trip.id); assert.equal(state.offers.find(value => value.operatorId === assigned)?.status, OfferStatus.ACCEPTED); assert.equal((await cancelRequestedTrip(db, viewer.id, trip.id)).ok, false); }
    else { assert.equal(state.status, TripStatus.CANCELLED); assert.equal(state.operatorId, null); assert.equal(operatorState.pendingOfferTripId, null); assert.equal(operatorState.activeTripId, null); assert.equal(state.offers.find(value => value.operatorId === assigned)?.status, OfferStatus.EXPIRED); assert.equal((await acceptTripOffer(db, assigned, trip.id)).ok, false); }
    void op;
  });

  await test("cancellation clears only exact pending reservation", async () => {
    const viewer = await user(Role.VIEWER), op = await operator(d.id), trip = await rawTrip(viewer.id, d.id); await serial(tx => assignNextOperator(tx, trip.id)); const assigned = (await db.trip.findUniqueOrThrow({ where: { id: trip.id } })).offeredOperatorId!;
    const newerViewer = await user(Role.VIEWER), newer = await rawTrip(newerViewer.id, d.id); await db.user.update({ where: { id: assigned }, data: { pendingOfferTripId: newer.id } });
    assert.equal((await cancelRequestedTrip(db, viewer.id, trip.id)).ok, true); assert.equal((await db.user.findUniqueOrThrow({ where: { id: assigned } })).pendingOfferTripId, newer.id); assert.equal((await db.trip.findUniqueOrThrow({ where: { id: trip.id } })).status, TripStatus.CANCELLED); void op;
  });

  await test("shared ending is idempotent and protects newer active reservation", async () => {
    const viewer = await user(Role.VIEWER), op = await operator(d.id), trip = await rawTrip(viewer.id, d.id); await serial(tx => assignNextOperator(tx, trip.id)); const assigned = (await db.trip.findUniqueOrThrow({ where: { id: trip.id } })).offeredOperatorId!; await acceptTripOffer(db, assigned, trip.id);
    const newerViewer = await user(Role.VIEWER); const newer = await rawTrip(newerViewer.id, d.id, { status: TripStatus.ACCEPTED, operatorId: assigned, acceptedAt: new Date() }); await db.user.update({ where: { id: assigned }, data: { activeTripId: newer.id } });
    assert.equal((await startTrip(db, viewer.id, Role.VIEWER, trip.id)).ok, true); assert.equal((await endAcceptedTrip(db, viewer.id, Role.VIEWER, trip.id)).ok, true); assert.equal((await endAcceptedTrip(db, viewer.id, Role.VIEWER, trip.id)).ok, true);
    assert.equal((await db.trip.findUniqueOrThrow({ where: { id: trip.id } })).status, TripStatus.ENDED); assert.equal((await db.user.findUniqueOrThrow({ where: { id: assigned } })).activeTripId, newer.id); void op;
  });

  await test("dedicated eligibility exclusions and unspecified language", async () => {
    async function caseTrip(configure: (tripId: string) => Promise<string[]>, tripData: Partial<Prisma.TripUncheckedCreateInput> = {}) {
      const viewer = await user(Role.VIEWER), trip = await rawTrip(viewer.id, d.id, tripData); const excluded = await configure(trip.id); await serial(tx => assignNextOperator(tx, trip.id)); const state = await db.trip.findUniqueOrThrow({ where: { id: trip.id } }); assert.ok(state.offeredOperatorId); assert.ok(!excluded.includes(state.offeredOperatorId!)); await assertOfferConsistent(trip.id);
    }
    await caseTrip(async tripId => { const accessibility = await operator(d.id, { access: [] }), destinationMismatch = await operator(d.id, { serves: false }), area = await operator(d.id, { area: "Elsewhere" }), offline = await operator(d.id, { online: false }), language = await operator(d.id, { language: "French" }), pending = await operator(d.id), active = await operator(d.id), declined = await operator(d.id), eligible = await operator(d.id, { access: ["Slower-paced visit"] }); await db.user.update({ where: { id: pending.id }, data: { pendingOfferTripId: `other-${run}` } }); await db.user.update({ where: { id: active.id }, data: { activeTripId: `active-${run}` } }); await db.tripOffer.create({ data: { tripId, operatorId: declined.id, status: OfferStatus.DECLINED, expiresAt: new Date(Date.now() + 60_000), respondedAt: new Date() } }); void eligible; return [accessibility.id, destinationMismatch.id, area.id, offline.id, language.id, pending.id, active.id, declined.id]; }, { preferredLanguage: "English", accessibilityNeeds: ["Slower-paced visit"] });
    await caseTrip(async () => { const eligible = await operator(d.id, { language: "French" }); return []; }, { preferredLanguage: null });
  });

  await test("inactive and nonexistent destination requests and settings fail", async () => {
    const viewer = await user(Role.VIEWER), inactive = await destination("Pilot City", false);
    const inactiveRequest = await createTripRequest(db, viewer.id, requestInput(inactive.id), () => `${run}-${randomUUID()}`); assert.equal(inactiveRequest.ok, false);
    const missingRequest = await createTripRequest(db, viewer.id, requestInput(`${run}-missing`), () => `${run}-${randomUUID()}`); assert.equal(missingRequest.ok, false);
    assert.equal(await db.trip.count({ where: { viewerId: viewer.id } }), 0);
    const op = await operator(d.id); const before = await db.operatorProfile.findUniqueOrThrow({ where: { userId: op.id } }); const invalidSettings = await updateOperatorSettings(db, op.id, settings(inactive.id, 70)); assert.equal(invalidSettings.ok, false); assert.equal((await db.operatorProfile.findUniqueOrThrow({ where: { userId: op.id } })).serviceRadiusKm, before.serviceRadiusKm);
  });

  await test("shared duplicate viewer submission", async () => {
    const viewer = await user(Role.VIEWER); await operator(d.id); const input = requestInput(d.id);
    const results = await race([createTripRequest(db, viewer.id, input, () => `${run}-${randomUUID()}`), createTripRequest(db, viewer.id, input, () => `${run}-${randomUUID()}`)]);
    assert.equal(await db.trip.count({ where: { viewerId: viewer.id, status: { in: [TripStatus.REQUESTED, TripStatus.OFFERED, TripStatus.ACCEPTED, TripStatus.IN_PROGRESS] } } }), 1);
    assert.equal(await db.tripOffer.count({ where: { trip: { viewerId: viewer.id } } }), 1);
    const created = await db.trip.findFirstOrThrow({ where: { viewerId: viewer.id, status: TripStatus.OFFERED } });
    await assertOfferConsistent(created.id);
    assert.ok(results.some(value => fulfilledResult(value)?.ok === false && fulfilledResult(value)?.status === 409));
  });

  await test("authoritative expiration, duplicate expiration, and newer offer protection", async () => {
    const viewer = await user(Role.VIEWER), first = await operator(d.id), second = await operator(d.id), trip = await rawTrip(viewer.id, d.id);
    const authoritativeStart = new Date(Date.now() - 31_000); await serial(tx => assignNextOperator(tx, trip.id, authoritativeStart));
    const initial = await db.trip.findUniqueOrThrow({ where: { id: trip.id } }); const assigned = initial.offeredOperatorId!; assert.equal(initial.offerExpiresAt?.getTime(), authoritativeStart.getTime() + 30_000);
    assert.equal((await getCurrentOffer(db, assigned, authoritativeStart))?.offerExpiresAt?.getTime(), initial.offerExpiresAt?.getTime()); assert.equal((await acceptTripOffer(db, assigned, trip.id, new Date())).ok, false);
    await race([serial(tx => expireAndReassignOffers(tx, new Date())), serial(tx => expireAndReassignOffers(tx, new Date()))]);
    const reassigned = await db.trip.findUniqueOrThrow({ where: { id: trip.id }, include: { offers: true } }); assert.notEqual(reassigned.offeredOperatorId, assigned); assert.equal(reassigned.offers.filter(value => value.operatorId === assigned && value.status === OfferStatus.EXPIRED).length, 1); await assertOfferConsistent(trip.id);
    const newerId = reassigned.offeredOperatorId; await serial(tx => expireAndReassignOffers(tx, new Date())); assert.equal((await db.trip.findUniqueOrThrow({ where: { id: trip.id } })).offeredOperatorId, newerId); void first; void second;
  });

  await test("offer visibility projection and identity ownership", async () => {
    const viewer = await user(Role.VIEWER), first = await operator(d.id), second = await operator(d.id), trip = await rawTrip(viewer.id, d.id, { lat: 1.25, lng: -2.5 }); await serial(tx => assignNextOperator(tx, trip.id)); const assigned = (await db.trip.findUniqueOrThrow({ where: { id: trip.id } })).offeredOperatorId!; const other = assigned === first.id ? second.id : first.id;
    const visible = await getCurrentOffer(db, assigned); assert.ok(visible); assert.equal(await getCurrentOffer(db, other), null); assert.ok(!("lat" in visible!) && !("lng" in visible!) && !("clerkId" in visible!));
    const staleDecline = await declineTripOffer(db, other, trip.id); assert.equal(staleDecline.ok, false); const staleAccept = await acceptTripOffer(db, other, trip.id); assert.equal(staleAccept.ok, false); assert.equal(await getCurrentOffer(db, viewer.id), null); const viewerSettings = await updateOperatorSettings(db, viewer.id, settings(d.id, 90)); assert.equal(viewerSettings.ok, false); await assertOfferConsistent(trip.id);
  });
}

main()
  .finally(async () => {
    await db.trip.deleteMany({ where: { livekitRoom: { startsWith: run } } });
    await db.destination.deleteMany({ where: { slug: { startsWith: run } } });
    await db.user.deleteMany({ where: { clerkId: { startsWith: run } } });
    await db.$disconnect();
  })
  .catch(error => { console.error(error instanceof Error ? error.message : "Phase 3 database integration failure"); process.exitCode = 1; });
