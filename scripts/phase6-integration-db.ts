import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient, Role, SupplyStatus, SupplyType, TripStatus } from "@prisma/client";

const db = new PrismaClient();
const run = `p6i-${randomUUID()}`;
const pass = (message: string) => console.log(`PASS ${message}`);
async function user(name: string) { return db.user.create({ data: { clerkId: `${run}-${randomUUID()}`, name, role: Role.VIEWER } }); }
async function teleporter(name: string) {
  const value = await user(name);
  await db.operatorProfile.create({ data: { userId: value.id, operatingArea: "Downtown", serviceRadiusKm: 10, supportsCustom: true, languages: ["English"], accessibilityCapabilities: [], durationOptions: [30], pilotStatus: "APPROVED" } });
  return value;
}
async function live(ownerId: string, startAt: Date, capacity = 1) {
  const listing = await db.supplyListing.create({ data: { teleporterId: ownerId, type: SupplyType.LIVE_MOMENT, publicPlaceName: "Public square", coarseLocation: "Downtown", durationMinutes: 30, priceMinor: 2200, currency: "USD", capacity } });
  const moment = await db.liveMoment.create({ data: { listingId: listing.id, availabilityStart: startAt, availabilityEnd: new Date(startAt.getTime() + 3_600_000), expiresAt: new Date(startAt.getTime() + 3_600_000) } });
  await db.supplyListing.update({ where: { id: listing.id }, data: { status: SupplyStatus.PUBLISHED, publishedAt: new Date() } });
  return { listing, moment };
}
async function guided(ownerId: string, startAt: Date) {
  const listing = await db.supplyListing.create({ data: { teleporterId: ownerId, type: SupplyType.GUIDED_EXPERIENCE, publicPlaceName: "Museum", coarseLocation: "Downtown", durationMinutes: 30, priceMinor: 2500, currency: "USD", capacity: 1 } });
  const guide = await db.guidedExperience.create({ data: { listingId: listing.id, title: "Museum highlights", description: "A focused walk through public museum highlights." } });
  const occurrence = await db.guidedExperienceOccurrence.create({ data: { guidedExperienceId: guide.id, availabilityStart: startAt, availabilityEnd: startAt, capacity: 1 } });
  await db.supplyListing.update({ where: { id: listing.id }, data: { status: SupplyStatus.PUBLISHED, publishedAt: new Date() } });
  const published = await db.guidedExperienceOccurrence.update({ where: { id: occurrence.id }, data: { status: SupplyStatus.PUBLISHED, supplyListingVersion: 1, titleSnapshot: "Museum highlights", descriptionSnapshot: "A focused walk through public museum highlights.", publicPlaceSnapshot: "Museum", coarseLocationSnapshot: "Downtown", durationMinutesSnapshot: 30, priceMinorSnapshot: 2500, currencySnapshot: "USD" } });
  return { listing, occurrence: published };
}

async function main() {
  const owner = await teleporter("Cross-mode Teleporter"), liveExplorer = await user("Live contender"), guidedExplorer = await user("Guided contender");
  const overlapStart = new Date(Date.now() + 7_200_000), liveSupply = await live(owner.id, overlapStart), guidedSupply = await guided(owner.id, overlapStart);
  const first = new PrismaClient(), second = new PrismaClient();
  try {
    const results = await Promise.allSettled([
      first.supplyCapacityClaim.create({ data: { listingId: liveSupply.listing.id, liveMomentId: liveSupply.moment.id, explorerId: liveExplorer.id, teleporterId: owner.id, startAt: overlapStart, endAt: new Date(overlapStart.getTime() + 1_800_000), expiresAt: new Date(0) } }),
      second.supplyCapacityClaim.create({ data: { listingId: guidedSupply.listing.id, occurrenceId: guidedSupply.occurrence.id, explorerId: guidedExplorer.id, teleporterId: owner.id, startAt: overlapStart, endAt: new Date(overlapStart.getTime() + 1_800_000), expiresAt: new Date(0) } }),
    ]);
    assert.equal(results.filter(value => value.status === "fulfilled").length, 1);
    assert.equal(results.filter(value => value.status === "rejected").length, 1);
  } finally { await first.$disconnect(); await second.$disconnect(); }
  pass("independent concurrent Live and Guided clients cannot overlap one Teleporter");

  const cappedExplorer = await user("Globally capped Explorer");
  for (let index = 0; index < 3; index++) {
    const supplyOwner = await teleporter(`Capacity Teleporter ${index}`), start = new Date(overlapStart.getTime() + (index + 2) * 7_200_000);
    if (index === 1) {
      const supply = await guided(supplyOwner.id, start);
      await db.supplyCapacityClaim.create({ data: { listingId: supply.listing.id, occurrenceId: supply.occurrence.id, explorerId: cappedExplorer.id, teleporterId: supplyOwner.id, startAt: start, endAt: new Date(start.getTime() + 1_800_000), expiresAt: new Date(0) } });
    } else {
      const supply = await live(supplyOwner.id, start);
      await db.supplyCapacityClaim.create({ data: { listingId: supply.listing.id, liveMomentId: supply.moment.id, explorerId: cappedExplorer.id, teleporterId: supplyOwner.id, startAt: start, endAt: new Date(start.getTime() + 1_800_000), expiresAt: new Date(0) } });
    }
  }
  const fourthOwner = await teleporter("Fourth Capacity Teleporter"), fourthStart = new Date(overlapStart.getTime() + 36_000_000), fourth = await guided(fourthOwner.id, fourthStart);
  await assert.rejects(db.supplyCapacityClaim.create({ data: { listingId: fourth.listing.id, occurrenceId: fourth.occurrence.id, explorerId: cappedExplorer.id, teleporterId: fourthOwner.id, startAt: fourthStart, endAt: new Date(fourthStart.getTime() + 1_800_000), expiresAt: new Date(0) } }));
  assert.equal(await db.supplyCapacityClaim.count({ where: { explorerId: cappedExplorer.id, status: "HELD" } }), 3);
  pass("one Explorer is limited to three active claims globally across both modes");

  const reservedOwner = await teleporter("Reserved Teleporter"), reservedExplorer = await user("Reserved Explorer"), reservationStart = new Date(overlapStart.getTime() + 43_200_000), reservedSupply = await live(reservedOwner.id, reservationStart);
  const request = await db.journeyRequest.create({ data: { explorerId: reservedExplorer.id, publicPlaceName: "Library", coarseLocation: "Downtown", earliestStart: reservationStart, latestStart: new Date(reservationStart.getTime() + 1), durationMinutes: 30, proposedPriceMinor: 2000, currency: "USD", expiresAt: new Date(Date.now() + 600_000) } });
  const proposal = await db.proposal.create({ data: { journeyRequestId: request.id, teleporterId: reservedOwner.id, version: 1, earliestStart: reservationStart, durationMinutes: 30, proposedPriceMinor: 2000, currency: "USD", validUntil: new Date(Date.now() + 600_000) } });
  const trip = await db.trip.create({ data: { viewerId: reservedExplorer.id, operatorId: reservedOwner.id, destination: "Library", livekitRoom: `${run}-${randomUUID()}`, immediate: false, status: TripStatus.ACCEPTED, acceptedAt: new Date() } });
  const agreement = await db.agreement.create({ data: { journeyRequestId: request.id, proposalId: proposal.id, explorerId: reservedExplorer.id, teleporterId: reservedOwner.id, tripId: trip.id, agreedStartAt: reservationStart, agreedEarliestStart: reservationStart, agreedDurationMinutes: 30, agreedPriceMinor: 2000, currency: "USD", publicPlaceNameSnapshot: "Library", coarseLocationSnapshot: "Downtown" } });
  await db.scheduledJourneyReservation.create({ data: { teleporterId: reservedOwner.id, agreementId: agreement.id, tripId: trip.id, startAt: reservationStart, endAt: new Date(reservationStart.getTime() + 1_800_000) } });
  await assert.rejects(db.supplyCapacityClaim.create({ data: { listingId: reservedSupply.listing.id, liveMomentId: reservedSupply.moment.id, explorerId: await user("Reservation contender").then(value => value.id), teleporterId: reservedOwner.id, startAt: reservationStart, endAt: new Date(reservationStart.getTime() + 1_800_000), expiresAt: new Date(0) } }));
  pass("a supply claim cannot race successfully against an existing scheduled reservation");
}

main().finally(() => db.$disconnect());
