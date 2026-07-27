import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { OperatorPilotStatus, Role, TripStatus } from "@prisma/client";
import { db } from "../lib/db";
import { createTripRequest, updateOperatorSettings } from "../lib/phase3-services";
import { forceOperatorOffline, setOperatorPilotStatus } from "../lib/profiles";

const run = `phase5b-${randomUUID()}`;
async function main() {
  try {
    const destination = await db.destination.create({ data: { slug: run, name: "Phase 5B destination", shortDescription: "Test", city: "Pilot City", meetingArea: "Entrance", category: "Test", durationOptions: [30], active: true } });
    const viewer = await db.user.create({ data: { clerkId: `${run}-viewer`, role: Role.VIEWER } });
    const operator = await db.user.create({ data: { clerkId: `${run}-operator`, role: Role.OPERATOR, online: true } });
    await db.operatorProfile.create({ data: { userId: operator.id, operatingArea: "Pilot City", serviceRadiusKm: 10, languages: ["English"], accessibilityCapabilities: [], durationOptions: [30], pilotStatus: OperatorPilotStatus.PENDING } });
    await db.operatorDestination.create({ data: { operatorId: operator.id, destinationId: destination.id } });
    assert.equal((await setOperatorPilotStatus(db, operator.id, OperatorPilotStatus.APPROVED, OperatorPilotStatus.PENDING)).ok, true);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: operator.id } })).online, false);
    const stale = await setOperatorPilotStatus(db, operator.id, OperatorPilotStatus.SUSPENDED, OperatorPilotStatus.PENDING); assert.equal(stale.ok, false); if (!stale.ok) assert.equal(stale.status, 409);
    const trip = await db.trip.create({ data: { viewerId: viewer.id, operatorId: operator.id, destinationId: destination.id, destination: destination.name, livekitRoom: `${run}-room`, status: TripStatus.IN_PROGRESS, acceptedAt: new Date(), startedAt: new Date() } });
    await db.user.update({ where: { id: operator.id }, data: { activeTripId: trip.id, online: true } });
    assert.equal((await setOperatorPilotStatus(db, operator.id, OperatorPilotStatus.SUSPENDED, OperatorPilotStatus.APPROVED)).ok, true);
    assert.equal((await db.trip.findUniqueOrThrow({ where: { id: trip.id } })).status, TripStatus.IN_PROGRESS);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: operator.id } })).activeTripId, trip.id);
    assert.equal((await forceOperatorOffline(db, operator.id)).ok, true);
    await db.destination.update({ where: { id: destination.id }, data: { active: false } });
    const unavailable = await createTripRequest(db, viewer.id, { destinationId: destination.id, requestedDuration: 30, accessibilityNeeds: [] }); assert.equal(unavailable.ok, false);
    const settings = await updateOperatorSettings(db, operator.id, { operatingArea: "Pilot City", serviceRadiusKm: 10, supportsCustom: false, languages: ["English"], accessibilityCapabilities: [], durationOptions: [30], destinationIds: [destination.id] }); assert.equal(settings.ok, false);
    assert.equal((await db.trip.findUniqueOrThrow({ where: { id: trip.id } })).destination, "Phase 5B destination");
    console.log("Phase 5B PostgreSQL administration assertions passed.");
  } finally {
    await db.trip.deleteMany({ where: { livekitRoom: { startsWith: run } } });
    await db.user.deleteMany({ where: { clerkId: { startsWith: run } } });
    await db.destination.deleteMany({ where: { slug: run } });
    await db.$disconnect();
  }
}
void main();
