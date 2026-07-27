import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { OperatorPilotStatus, Role, TripStatus } from "@prisma/client";
import { db } from "../lib/db";
import { evaluateOperatorReadiness, setOperatorPilotStatus, validateOperatorPresentation, validateViewerProfile } from "../lib/profiles";

const run = `phase5a-${randomUUID()}`;
async function main() {
 try {
  assert.equal(validateViewerProfile({ displayName: " Pilot Viewer ", preferredLanguage: "English", accessibilityPreferences: [] }).ok, true);
  assert.equal(validateViewerProfile({ displayName: "Viewer", preferredLanguage: "", accessibilityPreferences: [], role: "ADMIN" }).ok, false);
  assert.equal(validateOperatorPresentation({ displayName: "Operator", pilotStatus: "APPROVED" }).ok, false);

  const destination = await db.destination.create({ data: { slug: run, name: "Pilot test destination", shortDescription: "Test", city: "Pilot City", meetingArea: "Entrance", category: "Test", durationOptions: [30], active: true } });
  const operator = await db.user.create({ data: { clerkId: `${run}-operator`, role: Role.OPERATOR, name: "Pilot operator" } });
  await db.operatorProfile.create({ data: { userId: operator.id, operatingArea: "Pilot City", serviceRadiusKm: 10, languages: ["English"], accessibilityCapabilities: [], durationOptions: [30] } });
  await db.operatorDestination.create({ data: { operatorId: operator.id, destinationId: destination.id } });
  assert.equal((await evaluateOperatorReadiness(db, operator.id)).code, "AWAITING_APPROVAL");
  await db.operatorProfile.update({ where: { userId: operator.id }, data: { pilotStatus: OperatorPilotStatus.APPROVED } });
  assert.equal((await evaluateOperatorReadiness(db, operator.id)).code, "READY");
  assert.equal((await setOperatorPilotStatus(db, operator.id, OperatorPilotStatus.SUSPENDED)).ok, true);
  assert.equal((await evaluateOperatorReadiness(db, operator.id)).code, "SUSPENDED");

  const viewer = await db.user.create({ data: { clerkId: `${run}-viewer`, role: Role.VIEWER } });
  const trip = await db.trip.create({ data: { viewerId: viewer.id, operatorId: operator.id, destination: "Pilot test destination", livekitRoom: `${run}-room`, status: TripStatus.IN_PROGRESS, acceptedAt: new Date(), startedAt: new Date() } });
  await db.user.update({ where: { id: operator.id }, data: { activeTripId: trip.id } });
  assert.equal((await setOperatorPilotStatus(db, operator.id, OperatorPilotStatus.SUSPENDED)).ok, true);
  assert.equal((await db.trip.findUniqueOrThrow({ where: { id: trip.id } })).status, TripStatus.IN_PROGRESS);
  assert.equal((await evaluateOperatorReadiness(db, operator.id)).eligible, false);
  console.log("Phase 5A database service assertions passed.");
 } finally {
  await db.trip.deleteMany({ where: { livekitRoom: { startsWith: run } } });
  await db.user.deleteMany({ where: { clerkId: { startsWith: run } } });
  await db.destination.deleteMany({ where: { slug: run } });
  await db.$disconnect();
 }
}

void main();
