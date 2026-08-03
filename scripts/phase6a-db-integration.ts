import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { JourneyRequestStatus, PrismaClient, ProposalStatus, Role, SupplyCapacityClaimStatus, SupplyStatus, SupplyType, TripStatus } from "@prisma/client";
import { cancelTrip } from "../lib/trip-lifecycle";

const db = new PrismaClient();
const run = `p6a-${randomUUID()}`;
const pass = (value: string) => console.log(`PASS ${value}`);
async function user(name: string) { return db.user.create({ data: { clerkId: `${run}-${randomUUID()}`, name, role: Role.VIEWER } }); }

async function committedBooking(listingId: string, liveMomentId: string, explorerId: string, teleporterId: string, startAt: Date) {
  const endAt = new Date(startAt.getTime() + 1_800_000), validUntil = new Date(Date.now() + 600_000);
  const request = await db.journeyRequest.create({ data: { explorerId, publicPlaceName: "Museum", coarseLocation: "Downtown", earliestStart: startAt, latestStart: new Date(startAt.getTime() + 1), durationMinutes: 30, proposedPriceMinor: 2500, currency: "USD", expiresAt: validUntil, supplyListingId: listingId, supplyListingVersion: 1 } });
  const proposal = await db.proposal.create({ data: { journeyRequestId: request.id, teleporterId, version: 1, earliestStart: startAt, durationMinutes: 30, proposedPriceMinor: 2500, currency: "USD", validUntil, status: ProposalStatus.ACTIVE, supplyListingId: listingId, supplyListingVersion: 1 } });
  const claim = await db.supplyCapacityClaim.create({ data: { listingId, liveMomentId, explorerId, teleporterId, startAt, endAt, expiresAt: new Date(0), journeyRequestId: request.id, proposalId: proposal.id } });
  const trip = await db.trip.create({ data: { viewerId: explorerId, operatorId: teleporterId, destination: "Museum", livekitRoom: `${run}-${randomUUID()}`, immediate: false, status: TripStatus.ACCEPTED, acceptedAt: new Date() } });
  const agreement = await db.agreement.create({ data: { journeyRequestId: request.id, proposalId: proposal.id, explorerId, teleporterId, tripId: trip.id, agreedStartAt: startAt, agreedEarliestStart: startAt, agreedDurationMinutes: 30, agreedPriceMinor: 2500, currency: "USD", publicPlaceNameSnapshot: "Museum", coarseLocationSnapshot: "Downtown" } });
  await db.journeyRequest.update({ where: { id: request.id }, data: { tripId: trip.id, status: JourneyRequestStatus.CONVERTED, convertedAt: new Date() } });
  await db.proposal.update({ where: { id: proposal.id }, data: { status: ProposalStatus.ACCEPTED, terminalAt: new Date() } });
  await db.scheduledJourneyReservation.create({ data: { teleporterId, agreementId: agreement.id, tripId: trip.id, startAt, endAt } });
  await db.supplyCapacityClaim.update({ where: { id: claim.id }, data: { status: SupplyCapacityClaimStatus.COMMITTED, committedAt: new Date(), agreementId: agreement.id, tripId: trip.id } });
  return { claim, trip };
}

async function main() {
  const t = await user("Teleporter"), e = await user("Explorer"), e2 = await user("Explorer 2");
  await db.operatorProfile.create({ data: { userId: t.id, operatingArea: "Downtown", serviceRadiusKm: 10, supportsCustom: true, languages: ["English"], accessibilityCapabilities: [], durationOptions: [30], pilotStatus: "APPROVED" } });
  const start = new Date(Date.now() + 3_600_000), end = new Date(start.getTime() + 7_200_000);
  const listing = await db.supplyListing.create({ data: { teleporterId: t.id, type: SupplyType.LIVE_MOMENT, publicPlaceName: "Museum", coarseLocation: "Downtown", durationMinutes: 30, priceMinor: 2500, currency: "USD", capacity: 1 } });
  const liveId = randomUUID();
  await db.$executeRaw`INSERT INTO "LiveMoment"("id","listingId","availabilityStart","availabilityEnd","expiresAt") VALUES (${liveId}::uuid,${listing.id}::uuid,${start},${end},${end})`;
  await db.liveMoment.update({ where: { id: liveId }, data: { availabilityStart: new Date(start.getTime() + 60_000) } });
  pass("draft Live Moment availability remains editable");
  await db.supplyListing.update({ where: { id: listing.id }, data: { status: SupplyStatus.PUBLISHED, publishedAt: new Date() } });
  await assert.rejects(db.liveMoment.update({ where: { id: liveId }, data: { availabilityEnd: new Date(end.getTime() + 60_000) } }));
  pass("published availability remains immutable");

  const released = await db.supplyCapacityClaim.create({ data: { listingId: listing.id, liveMomentId: liveId, explorerId: e.id, teleporterId: t.id, startAt: new Date(start.getTime() + 60_000), endAt: new Date(start.getTime() + 1_860_000), expiresAt: new Date(0) } });
  assert.equal(released.expiresAt.getTime() - released.createdAt.getTime(), 600_000);
  await db.supplyCapacityClaim.update({ where: { id: released.id }, data: { status: SupplyCapacityClaimStatus.RELEASED, releasedAt: new Date() } });
  pass("claim expiry remains exactly ten minutes and explicit release preserves history");

  const claimStart = new Date(start.getTime() + 2_400_000), claimEnd = new Date(claimStart.getTime() + 1_800_000), validUntil = new Date(Date.now() + 600_000);
  const request = await db.journeyRequest.create({ data: { explorerId: e.id, publicPlaceName: "Museum", coarseLocation: "Downtown", earliestStart: claimStart, latestStart: new Date(claimStart.getTime() + 1), durationMinutes: 30, proposedPriceMinor: 2500, currency: "USD", expiresAt: validUntil, supplyListingId: listing.id, supplyListingVersion: 1 } });
  const proposal = await db.proposal.create({ data: { journeyRequestId: request.id, teleporterId: t.id, version: 1, earliestStart: claimStart, durationMinutes: 30, proposedPriceMinor: 2500, currency: "USD", validUntil, status: ProposalStatus.ACTIVE, supplyListingId: listing.id, supplyListingVersion: 1 } });
  const committed = await db.supplyCapacityClaim.create({ data: { listingId: listing.id, liveMomentId: liveId, explorerId: e.id, teleporterId: t.id, startAt: claimStart, endAt: claimEnd, expiresAt: new Date(0), journeyRequestId: request.id, proposalId: proposal.id } });
  const trip = await db.trip.create({ data: { viewerId: e.id, operatorId: t.id, destination: "Museum", livekitRoom: `${run}-${randomUUID()}`, immediate: false, status: TripStatus.ACCEPTED, acceptedAt: new Date() } });
  const agreement = await db.agreement.create({ data: { journeyRequestId: request.id, proposalId: proposal.id, explorerId: e.id, teleporterId: t.id, tripId: trip.id, agreedStartAt: claimStart, agreedEarliestStart: claimStart, agreedDurationMinutes: 30, agreedPriceMinor: 2500, currency: "USD", publicPlaceNameSnapshot: "Museum", coarseLocationSnapshot: "Downtown" } });
  await db.journeyRequest.update({ where: { id: request.id }, data: { tripId: trip.id, status: JourneyRequestStatus.CONVERTED, convertedAt: new Date() } });
  await db.proposal.update({ where: { id: proposal.id }, data: { status: ProposalStatus.ACCEPTED, terminalAt: new Date() } });
  const reservation = await db.scheduledJourneyReservation.create({ data: { teleporterId: t.id, agreementId: agreement.id, tripId: trip.id, startAt: claimStart, endAt: claimEnd } });
  await db.supplyCapacityClaim.update({ where: { id: committed.id }, data: { status: SupplyCapacityClaimStatus.COMMITTED, committedAt: new Date(), agreementId: agreement.id, tripId: trip.id } });
  const cancelledAt = new Date();
  const cancellations = await Promise.all([cancelTrip(db, e.id, Role.VIEWER, trip.id, cancelledAt), cancelTrip(db, e.id, Role.VIEWER, trip.id, new Date(cancelledAt.getTime() + 1000))]);
  assert.ok(cancellations.every(value => value.ok));
  const restoration = await db.supplyCapacityRestoration.findUniqueOrThrow({ where: { claimId: committed.id } });
  assert.equal(restoration.startAt.getTime(), claimStart.getTime());
  assert.equal(restoration.endAt.getTime(), claimEnd.getTime());
  assert.equal((await db.supplyCapacityClaim.findUniqueOrThrow({ where: { id: committed.id } })).status, SupplyCapacityClaimStatus.COMMITTED);
  assert.equal(await db.supplyCapacityRestoration.count({ where: { tripId: trip.id } }), 1);
  await assert.rejects(db.supplyCapacityRestoration.update({ where: { id: restoration.id }, data: { startAt: new Date() } }));
  await assert.rejects(db.supplyCapacityRestoration.delete({ where: { id: restoration.id } }));
  pass("pre-start cancellation restoration is derived, append-only, and preserves the committed claim");

  const replacement = await db.supplyCapacityClaim.create({ data: { listingId: listing.id, liveMomentId: liveId, explorerId: e2.id, teleporterId: t.id, startAt: claimStart, endAt: claimEnd, expiresAt: new Date(0) } });
  assert.equal(replacement.status, SupplyCapacityClaimStatus.HELD);
  pass("restored committed capacity can be claimed again without weakening overlap enforcement");

  await db.supplyCapacityClaim.update({ where: { id: replacement.id }, data: { status: SupplyCapacityClaimStatus.RELEASED, releasedAt: new Date() } });
  const paused = await committedBooking(listing.id, liveId, e.id, t.id, new Date(start.getTime() + 4_800_000));
  await db.supplyListing.update({ where: { id: listing.id }, data: { status: SupplyStatus.PAUSED, pausedAt: new Date() } });
  assert.equal((await cancelTrip(db, e.id, Role.VIEWER, paused.trip.id)).ok, true);
  assert.equal(await db.supplyCapacityRestoration.count({ where: { claimId: paused.claim.id } }), 0);
  const listing2 = await db.supplyListing.create({ data: { teleporterId: t.id, type: SupplyType.LIVE_MOMENT, publicPlaceName: "Gallery", coarseLocation: "Downtown", durationMinutes: 30, priceMinor: 2500, currency: "USD", capacity: 1 } });
  const liveId2 = randomUUID();
  await db.$executeRaw`INSERT INTO "LiveMoment"("id","listingId","availabilityStart","availabilityEnd","expiresAt") VALUES (${liveId2}::uuid,${listing2.id}::uuid,${start},${end},${end})`;
  await db.supplyListing.update({ where: { id: listing2.id }, data: { status: SupplyStatus.PUBLISHED, publishedAt: new Date() } });
  const archived = await committedBooking(listing2.id, liveId2, e2.id, t.id, new Date(start.getTime() + 60_000));
  await db.supplyListing.update({ where: { id: listing2.id }, data: { status: SupplyStatus.ARCHIVED, archivedAt: new Date() } });
  assert.equal((await cancelTrip(db, e2.id, Role.VIEWER, archived.trip.id)).ok, true);
  assert.equal(await db.supplyCapacityRestoration.count({ where: { claimId: archived.claim.id } }), 0);
  pass("paused and archived supply cancellation succeeds without restoration");

  await assert.rejects(db.supplyCapacityRestoration.create({ data: { claimId: released.id, tripId: paused.trip.id, listingId: listing.id, liveMomentId: liveId, startAt: released.startAt, endAt: released.endAt } }));
  pass("invalid status and mismatched provenance cannot fabricate restoration history");

  const migrations = await db.$queryRaw<Array<{ n: number }>>`SELECT count(*)::int n FROM _prisma_migrations WHERE migration_name IN ('20260803020000_phase6a_live_moment_draft_edit','20260803021000_phase6a_split_supply_authority_triggers','20260803022000_phase6a_capacity_restoration') AND finished_at IS NOT NULL`;
  assert.equal(migrations[0].n, 3);
  pass("Phase 6A migrations installed");
}

main().finally(() => db.$disconnect());
