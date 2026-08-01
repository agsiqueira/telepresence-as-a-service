import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient, ProposalStatus, JourneyRequestStatus, Role, OperatorPilotStatus, TripStatus } from "@prisma/client";
import { acceptProposal } from "../lib/agreements";
import { declineProposal, listTeleporterProposalHistory, reviseProposal, submitInitialProposal, withdrawProposal } from "../lib/proposals";
import { withdrawJourneyRequest } from "../lib/journey-requests";

if (!process.env.PHASE3_TEST_DATABASE_URL || !process.env.PHASE4_TEST_DATABASE_URL || process.env.PHASE3_TEST_DATABASE_URL !== process.env.PHASE4_TEST_DATABASE_URL || process.env.DATABASE_URL !== process.env.PHASE3_TEST_DATABASE_URL) throw new Error("Unsafe database mapping");
const db = new PrismaClient();
const run = `p34-race-${randomUUID()}`;
const now = new Date();
const plus = (minutes: number) => new Date(now.getTime() + minutes * 60_000);

async function fixture(operatorCount = 1) {
  const destination = await db.destination.create({ data: { slug: `${run}-${randomUUID()}`, name: "Race destination", shortDescription: "Disposable validation", city: "Test City", meetingArea: "Public gate", category: "Test", durationOptions: [30], active: true } });
  const explorer = await db.user.create({ data: { clerkId: `${run}-${randomUUID()}`, name: "Race Explorer", role: Role.VIEWER } });
  const operators = [];
  for (let i = 0; i < operatorCount; i++) {
    operators.push(await db.user.create({ data: { clerkId: `${run}-${randomUUID()}`, name: `Race Teleporter ${i}`, role: Role.OPERATOR, operatorProfile: { create: { operatingArea: "Test City", serviceRadiusKm: 10, languages: ["English"], accessibilityCapabilities: [], durationOptions: [30], pilotStatus: OperatorPilotStatus.APPROVED } }, destinationServices: { create: { destinationId: destination.id } } } }));
  }
  const request = await db.journeyRequest.create({ data: { explorerId: explorer.id, destinationId: destination.id, publicPlaceName: "Race destination", coarseLocation: "Test City", privateMeetingDetails: "Private gate detail", earliestStart: plus(120), latestStart: plus(180), durationMinutes: 30, proposedPriceMinor: 2500, currency: "USD", expiresAt: plus(90) } });
  const proposals = [];
  for (const [i, operator] of operators.entries()) proposals.push(await db.proposal.create({ data: { journeyRequestId: request.id, teleporterId: operator.id, version: 1, earliestStart: plus(120 + i), latestStart: plus(150 + i), durationMinutes: 30, proposedPriceMinor: 2500 + i, currency: "USD", validUntil: plus(60) } }));
  return { destination, explorer, operators, request, proposals };
}

async function verify(label: string, requestId: string) {
  const request = await db.journeyRequest.findUniqueOrThrow({ where: { id: requestId }, include: { proposals: true, agreement: { include: { scheduledReservations: { where: { status: "CONFIRMED" }, take: 1 } } }, trip: true } });
  const accepted = request.proposals.filter(p => p.status === ProposalStatus.ACCEPTED);
  assert.ok(accepted.length <= 1, `${label}: more than one accepted Proposal`);
  assert.equal(Boolean(request.agreement), Boolean(request.trip), `${label}: partial Agreement/Trip`);
  if (request.agreement) {
    assert.equal(accepted.length, 1, `${label}: Agreement without accepted Proposal`);
    assert.equal(request.status, JourneyRequestStatus.CONVERTED, `${label}: request not converted`);
    assert.equal(request.tripId, request.trip!.id, `${label}: linked Trip mismatch`);
    assert.equal(request.agreement.tripId, request.trip!.id, `${label}: Agreement Trip mismatch`);
    assert.equal(request.agreement.proposalId, accepted[0].id, `${label}: Agreement Proposal mismatch`);
    assert.equal(request.agreement.scheduledReservations[0]?.tripId, request.trip!.id, `${label}: reservation mismatch`);
    assert.equal(request.trip!.status, TripStatus.ACCEPTED, `${label}: Trip not accepted`);
  } else {
    assert.equal(accepted.length, 0, `${label}: accepted Proposal without Agreement`);
  }
  console.log(`PASS ${label} | accepted=${accepted.length} agreement=${request.agreement ? 1 : 0} trip=${request.trip ? 1 : 0} request=${request.status}`);
}

function serializationConflict(reason: unknown) {
  return reason instanceof Prisma.PrismaClientKnownRequestError &&
    (reason.code === "P2034" || (reason.code === "P2010" && reason.meta?.code === "40001"));
}
async function race(label: string, ...actions: Array<() => Promise<unknown>>) {
  const results = await Promise.allSettled(actions.map(action => action()));
  const rejected = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
  assert.ok(results.some(result => result.status === "fulfilled"), `${label}: every contender rejected`);
  assert.ok(rejected.every(result => serializationConflict(result.reason)), `${label}: unexpected race rejection`);
  console.log(`RACE ${label} | fulfilled=${results.length - rejected.length} serialization_conflicts=${rejected.length}`);
  return results;
}
const body = (price = 2600) => ({ earliestStart: plus(125).toISOString(), latestStart: plus(155).toISOString(), durationMinutes: 30, proposedPriceMinor: price, currency: "USD", validUntil: plus(55).toISOString() });
const accept = (f: Awaited<ReturnType<typeof fixture>>, index = 0) => acceptProposal(db, f.explorer.id, f.request.id, f.proposals[index].id, { scheduledStartAt: f.proposals[index].earliestStart.toISOString() }, now);

async function main() {
  { const label = "two competing Proposal acceptances", f = await fixture(2); await race(label, () => accept(f), () => accept(f, 1)); await verify(label, f.request.id); }
  { const label = "same-Proposal retry", f = await fixture(); const results = await race(label, () => accept(f), () => accept(f)); assert.ok(results.some(r => r.status === "fulfilled" && r.value && (r.value as {ok:boolean}).ok)); await verify(label, f.request.id); }
  { const label = "acceptance versus withdrawal", f = await fixture(); await race(label, () => accept(f), () => withdrawProposal(db, f.operators[0].id, f.proposals[0].id, now)); await verify(label, f.request.id); }
  { const label = "acceptance versus decline", f = await fixture(); await race(label, () => accept(f), () => declineProposal(db, f.explorer.id, f.request.id, f.proposals[0].id, now)); await verify(label, f.request.id); }
  { const label = "acceptance versus revision", f = await fixture(); await race(label, () => accept(f), () => reviseProposal(db, f.operators[0].id, f.proposals[0].id, body(), now)); await verify(label, f.request.id); }
  { const label = "acceptance versus expiration", f = await fixture(); await race(label, () => accept(f), () => listTeleporterProposalHistory(db, f.operators[0].id, f.request.id, plus(61))); await verify(label, f.request.id); }
  { const label = "acceptance versus JourneyRequest withdrawal", f = await fixture(); await race(label, () => accept(f), () => withdrawJourneyRequest(db, f.explorer.id, f.request.id, now)); await verify(label, f.request.id); }
  { const label = "Proposal creation after conversion", f = await fixture(2); await race(label, () => accept(f), () => submitInitialProposal(db, f.operators[1].id, f.request.id, body(2700), now)); await verify(label, f.request.id); }

  const immutable = await fixture(); await accept(immutable);
  const agreement = await db.agreement.findUniqueOrThrow({ where: { journeyRequestId: immutable.request.id } });
  await assert.rejects(db.agreement.update({ where: { id: agreement.id }, data: { agreedPriceMinor: agreement.agreedPriceMinor + 1 } }));
  await assert.rejects(db.agreement.delete({ where: { id: agreement.id } }));
  console.log("PASS PostgreSQL rejects Agreement updates and deletions");

  const legacy = await fixture(); const trip = await db.trip.create({ data: { viewerId: legacy.explorer.id, destinationId: legacy.destination.id, destination: "Legacy", livekitRoom: `${run}-${randomUUID()}` } });
  assert.equal(await db.agreement.count({ where: { tripId: trip.id } }), 0); console.log("PASS legacy Trip without Agreement remains valid");
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => db.$disconnect());
