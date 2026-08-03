import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient, Role, SupplyCapacityClaimStatus, SupplyStatus, SupplyType } from "@prisma/client";
import { acceptProposal } from "../lib/agreements";
import { createGuidedOccurrence, initiateGuidedOccurrence } from "../lib/guided-experiences";
import { createRescheduleProposal } from "../lib/rescheduling";
import { SupplyFoundationError } from "../lib/supply-foundation";
import { cancelTrip } from "../lib/trip-lifecycle";

const db = new PrismaClient();
const run = `p6b-${randomUUID()}`;
const pass = (message: string) => console.log(`PASS ${message}`);
async function user(name: string) { return db.user.create({ data: { clerkId: `${run}-${randomUUID()}`, name, role: Role.VIEWER } }); }

async function main() {
  const teleporter = await user("Guided Teleporter"), explorer1 = await user("Guided Explorer 1"), explorer2 = await user("Guided Explorer 2");
  await db.operatorProfile.create({ data: { userId: teleporter.id, operatingArea: "Downtown", serviceRadiusKm: 10, supportsCustom: true, languages: ["English"], accessibilityCapabilities: [], durationOptions: [30,45], pilotStatus: "APPROVED" } });
  const listing = await db.supplyListing.create({ data: { teleporterId: teleporter.id, type: SupplyType.GUIDED_EXPERIENCE, publicPlaceName: "Museum entrance", coarseLocation: "Downtown", durationMinutes: 30, priceMinor: 2500, currency: "USD", capacity: 1 } });
  const guide = await db.guidedExperience.create({ data: { listingId: listing.id, title: "Museum highlights", description: "A focused walk through the museum highlights." } });
  const start = new Date(Date.now() + 7_200_000);
  const draft = await db.guidedExperienceOccurrence.create({ data: { guidedExperienceId: guide.id, availabilityStart: start, availabilityEnd: start, capacity: 1 } });
  assert.equal(draft.availabilityEnd.getTime() - draft.availabilityStart.getTime(), 1_800_000);
  await assert.rejects(db.guidedExperienceOccurrence.create({ data: { guidedExperienceId: guide.id, availabilityStart: start, availabilityEnd: start, capacity: 1 } }));
  await assert.rejects(db.guidedExperienceOccurrence.create({ data: { guidedExperienceId: guide.id, availabilityStart: new Date(start.getTime() + 60_000), availabilityEnd: start, capacity: 2 } }));
  pass("server derives one exact capacity-one interval and listing/start uniqueness prevents duplicates");

  await db.supplyListing.update({ where: { id: listing.id }, data: { status: SupplyStatus.PUBLISHED, publishedAt: new Date() } });
  const published = await db.guidedExperienceOccurrence.update({ where: { id: draft.id }, data: { status: SupplyStatus.PUBLISHED, supplyListingVersion: 1, titleSnapshot: "Museum highlights", descriptionSnapshot: "A focused walk through the museum highlights.", publicPlaceSnapshot: "Museum entrance", coarseLocationSnapshot: "Downtown", durationMinutesSnapshot: 30, priceMinorSnapshot: 2500, currencySnapshot: "USD" } });
  await assert.rejects(db.guidedExperienceOccurrence.update({ where: { id: published.id }, data: { availabilityStart: new Date(start.getTime() + 1000) } }));
  await assert.rejects(db.guidedExperienceOccurrence.update({ where: { id: published.id }, data: { titleSnapshot: "Changed" } }));
  pass("publication snapshots terms and PostgreSQL rejects published interval or snapshot rewriting");

  const claim1 = await db.supplyCapacityClaim.create({ data: { listingId: listing.id, occurrenceId: published.id, explorerId: explorer1.id, teleporterId: teleporter.id, startAt: published.availabilityStart, endAt: published.availabilityEnd, expiresAt: new Date(0) } });
  assert.equal(claim1.expiresAt.getTime() - claim1.createdAt.getTime(), 600_000);
  await assert.rejects(db.guidedExperienceOccurrence.update({ where: { id: published.id }, data: { status: SupplyStatus.ARCHIVED } }));
  const contender = new PrismaClient();
  try {
    await assert.rejects(contender.supplyCapacityClaim.create({ data: { listingId: listing.id, occurrenceId: published.id, explorerId: explorer2.id, teleporterId: teleporter.id, startAt: published.availabilityStart, endAt: published.availabilityEnd, expiresAt: new Date(0) } }));
  } finally { await contender.$disconnect(); }
  pass("database-clock hold is exactly ten minutes, capacity cannot oversubscribe, and protected occurrence cannot archive");

  await db.supplyCapacityClaim.update({ where: { id: claim1.id }, data: { status: SupplyCapacityClaimStatus.RELEASED, releasedAt: new Date() } });
  await db.guidedExperienceOccurrence.update({ where: { id: published.id }, data: { status: SupplyStatus.ARCHIVED } });
  await assert.rejects(db.supplyCapacityClaim.create({ data: { listingId: listing.id, occurrenceId: published.id, explorerId: explorer2.id, teleporterId: teleporter.id, startAt: published.availabilityStart, endAt: published.availabilityEnd, expiresAt: new Date(0) } }));
  pass("released capacity permits terminal archive and archived occurrences cannot be claimed");

  await db.supplyListing.update({ where: { id: listing.id }, data: { status: SupplyStatus.PAUSED, pausedAt: new Date() } });
  await db.supplyListing.update({ where: { id: listing.id }, data: { durationMinutes: 45, priceMinor: 3100, version: { increment: 1 } } });
  await db.guidedExperience.update({ where: { id: guide.id }, data: { title: "Museum masterworks", description: "A revised walk through selected museum masterworks." } });
  const old = await db.guidedExperienceOccurrence.findUniqueOrThrow({ where: { id: published.id } });
  assert.equal(old.durationMinutesSnapshot, 30); assert.equal(old.priceMinorSnapshot, 2500); assert.equal(old.titleSnapshot, "Museum highlights");
  await db.supplyListing.update({ where: { id: listing.id }, data: { status: SupplyStatus.PUBLISHED, pausedAt: null } });
  const replacementStart = new Date(start.getTime() + 7_200_000);
  const replacement = await db.guidedExperienceOccurrence.create({ data: { guidedExperienceId: guide.id, availabilityStart: replacementStart, availabilityEnd: replacementStart, capacity: 1, replacesOccurrenceId: old.id } });
  assert.equal(replacement.availabilityEnd.getTime() - replacement.availabilityStart.getTime(), 2_700_000);
  const replacementPublished = await db.guidedExperienceOccurrence.update({ where: { id: replacement.id }, data: { status: SupplyStatus.PUBLISHED, supplyListingVersion: 2, titleSnapshot: "Museum masterworks", descriptionSnapshot: "A revised walk through selected museum masterworks.", publicPlaceSnapshot: "Museum entrance", coarseLocationSnapshot: "Downtown", durationMinutesSnapshot: 45, priceMinorSnapshot: 3100, currencySnapshot: "USD" } });
  assert.equal(replacementPublished.replacesOccurrenceId, old.id);
  await assert.rejects(db.guidedExperienceOccurrence.create({ data: { guidedExperienceId: guide.id, availabilityStart: new Date(replacementStart.getTime() + 7_200_000), availabilityEnd: replacementStart, capacity: 1, replacesOccurrenceId: replacement.id } }));
  pass("later template edits preserve old snapshots; correction archives and replaces without replacement chains");

  await assert.rejects(createGuidedOccurrence(db,teleporter.id,listing.id,{startAt:"2026-08-04T12:00:00",replacesOccurrenceId:null}),error=>(error as SupplyFoundationError).code==="INVALID");
  const retryStart=new Date(replacementStart.getTime()+14_400_000).toISOString();
  const concurrent=await Promise.all(Array.from({length:4},()=>createGuidedOccurrence(db,teleporter.id,listing.id,{startAt:retryStart,replacesOccurrenceId:null})));
  assert.equal(new Set(concurrent.map(value=>value.id)).size,1);
  await assert.rejects(createGuidedOccurrence(db,teleporter.id,listing.id,{startAt:retryStart,replacesOccurrenceId:old.id}),error=>(error as SupplyFoundationError).code==="CONFLICT");
  pass("offset-free timestamps fail, identical and concurrent retries converge, and conflicting retries return stable conflict");

  const lifecycleOccurrence=await db.guidedExperienceOccurrence.update({where:{id:concurrent[0].id},data:{status:SupplyStatus.PUBLISHED,supplyListingVersion:2,titleSnapshot:"Museum masterworks",descriptionSnapshot:"A revised walk through selected museum masterworks.",publicPlaceSnapshot:"Museum entrance",coarseLocationSnapshot:"Downtown",durationMinutesSnapshot:45,priceMinorSnapshot:3100,currencySnapshot:"USD"}});
  const explorer3=await user("Guided Explorer 3"),explorer4=await user("Guided Explorer 4");
  const held=await initiateGuidedOccurrence(db,explorer3.id,listing.id,lifecycleOccurrence.id,{});
  const heldRetry=await initiateGuidedOccurrence(db,explorer3.id,listing.id,lifecycleOccurrence.id,{});
  assert.equal(heldRetry.id,held.id);
  const accepted=await acceptProposal(db,explorer3.id,held.journeyRequestId!,held.proposalId!,{});
  if(!accepted.ok)throw new Error(accepted.error);assert.equal(accepted.ok,true);
  const acceptedRetry=await acceptProposal(db,explorer3.id,held.journeyRequestId!,held.proposalId!,{});
  if(!acceptedRetry.ok)throw new Error(acceptedRetry.error);assert.equal(acceptedRetry.ok,true);
  assert.equal(acceptedRetry.created,false);
  const committed=await db.supplyCapacityClaim.findUniqueOrThrow({where:{id:held.id},include:{journeyRequest:true,proposal:true,agreement:true,trip:true}});
  assert.equal(committed.status,SupplyCapacityClaimStatus.COMMITTED);assert.equal(committed.occurrenceId,lifecycleOccurrence.id);assert.equal(committed.journeyRequest?.supplyListingVersion,2);assert.equal(committed.proposal?.supplyOccurrenceId,lifecycleOccurrence.id);
  assert.equal(await db.journeyRequest.count({where:{id:held.journeyRequestId!}}),1);assert.equal(await db.proposal.count({where:{id:held.proposalId!}}),1);assert.equal(await db.agreement.count({where:{tripId:committed.tripId!}}),1);assert.equal(await db.scheduledJourneyReservation.count({where:{tripId:committed.tripId!}}),1);
  pass("transactional lifecycle conversion is idempotent and preserves listing, version, occurrence, claim, Agreement, Trip, and reservation provenance");

  const beforeReschedule=await db.scheduledJourneyReservation.findMany({where:{tripId:committed.tripId!}}),beforeProposals=await db.scheduledJourneyRescheduleProposal.count({where:{tripId:committed.tripId!}});
  const reschedule=await createRescheduleProposal(db,explorer3.id,committed.tripId!,{proposedStartAt:new Date(lifecycleOccurrence.availabilityStart.getTime()+86_400_000).toISOString(),proposedEndAt:new Date(lifecycleOccurrence.availabilityEnd.getTime()+86_400_000).toISOString()});
  assert.equal(reschedule.ok,false);if(reschedule.ok)throw new Error("Guided reschedule unexpectedly succeeded");assert.equal(reschedule.status,409);assert.match(reschedule.error,/Guided Experiences cannot be rescheduled/);
  assert.deepEqual(await db.scheduledJourneyReservation.findMany({where:{tripId:committed.tripId!}}),beforeReschedule);assert.equal(await db.scheduledJourneyRescheduleProposal.count({where:{tripId:committed.tripId!}}),beforeProposals);
  pass("Guided rescheduling is rejected with no Trip, reservation, claim, occurrence, or proposal mutation");

  const occurrenceBefore=await db.guidedExperienceOccurrence.findUniqueOrThrow({where:{id:lifecycleOccurrence.id}}),claimBefore=await db.supplyCapacityClaim.findUniqueOrThrow({where:{id:held.id}});
  const cancellations=await Promise.all([cancelTrip(db,explorer3.id,Role.VIEWER,committed.tripId!),cancelTrip(db,explorer3.id,Role.VIEWER,committed.tripId!)]);
  assert.ok(cancellations.every(value=>value.ok));assert.equal(await db.supplyCapacityRestoration.count({where:{claimId:held.id}}),1);
  assert.deepEqual(await db.guidedExperienceOccurrence.findUniqueOrThrow({where:{id:lifecycleOccurrence.id}}),occurrenceBefore);assert.equal((await db.supplyCapacityClaim.findUniqueOrThrow({where:{id:held.id}})).status,claimBefore.status);
  const rebooked=await initiateGuidedOccurrence(db,explorer4.id,listing.id,lifecycleOccurrence.id,{});assert.notEqual(rebooked.id,held.id);
  assert.equal(await db.supplyCapacityClaim.count({where:{occurrenceId:lifecycleOccurrence.id}}),2);assert.equal(await db.supplyCapacityRestoration.count({where:{claimId:held.id}}),1);
  pass("concurrent cancellation appends one restoration, preserves original occurrence and COMMITTED claim, and distinct rebooking coexists without oversubscription");
  const acceptedRebooking=await acceptProposal(db,explorer4.id,rebooked.journeyRequestId!,rebooked.proposalId!,{});if(!acceptedRebooking.ok)throw new Error(acceptedRebooking.error);
  const rebookedCommitted=await db.supplyCapacityClaim.findUniqueOrThrow({where:{id:rebooked.id}});await db.supplyListing.update({where:{id:listing.id},data:{status:SupplyStatus.PAUSED,pausedAt:new Date()}});
  assert.equal((await cancelTrip(db,explorer4.id,Role.VIEWER,rebookedCommitted.tripId!)).ok,true);assert.equal(await db.supplyCapacityRestoration.count({where:{claimId:rebooked.id}}),0);
  pass("ineligible Guided cancellation still succeeds without restoration");

  const installed = await db.$queryRaw<Array<{ count: number }>>`SELECT count(*)::int AS count FROM _prisma_migrations WHERE migration_name='20260803030000_phase6b_guided_experiences' AND finished_at IS NOT NULL`;
  assert.equal(installed[0].count, 1);
  const catalog = await db.$queryRaw<Array<{ snapshots: number; triggers: number }>>`SELECT (SELECT count(*)::int FROM information_schema.columns WHERE table_name='GuidedExperienceOccurrence' AND column_name IN ('supplyListingVersion','titleSnapshot','descriptionSnapshot','publicPlaceSnapshot','coarseLocationSnapshot','durationMinutesSnapshot','priceMinorSnapshot','currencySnapshot')) snapshots, (SELECT count(*)::int FROM pg_trigger WHERE tgrelid='"GuidedExperienceOccurrence"'::regclass AND NOT tgisinternal) triggers`;
  assert.equal(catalog[0].snapshots, 8); assert.ok(catalog[0].triggers >= 3);
  pass("Phase 6B migration, snapshot columns, constraints, and lifecycle triggers are installed");
}

main().finally(() => db.$disconnect());
