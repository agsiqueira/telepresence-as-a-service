import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const lifecycle = read("lib/trip-lifecycle.ts");
const acceptance = read("lib/agreements.ts");
const routes = read("app/api/trips/[id]/cancel/route.ts") + read("app/api/trips/[id]/start/route.ts") + read("app/api/trips/[id]/end/route.ts");
const projections = [read("components/AgreementConfirmation.tsx"), read("components/TeleporterAgreements.tsx"), read("components/AgreementAdminList.tsx")].join("\n");

assert.match(lifecycle, /SELECT "id" FROM "Trip"[\s\S]*FOR UPDATE[\s\S]*scheduledReservations/);
assert.match(lifecycle, /status: "CONFIRMED", releasedAt: null[\s\S]*status: "RELEASED", releasedAt: now/);
assert.match(lifecycle, /id: currentReservation\.id, tripId/);
assert.match(lifecycle, /trip\.status === TripStatus\.ACCEPTED/);
assert.match(lifecycle, /trip\.status === TripStatus\.CANCELLED[\s\S]*return \{ ok: true/);
assert.match(lifecycle, /where: \{ id: trip\.operatorId, activeTripId: tripId \}[\s\S]*activeTripId: null/);
assert.match(lifecycle, /if \(trip\.status === TripStatus\.IN_PROGRESS\) return/);
assert.doesNotMatch(lifecycle.match(/export async function endTrip[\s\S]*?export type FeedbackInput/)?.[0] ?? "", /status: "RELEASED"|releasedAt/);
assert.doesNotMatch(lifecycle, /scheduledJourneyReservation\.(?:delete|deleteMany)/);
assert.doesNotMatch(lifecycle, /status: "CONFIRMED"[^\n]*data: \{ status: "CONFIRMED"/);
assert.match(acceptance, /The Teleporter is no longer available for the selected Journey time\./);
assert.match(routes, /authorizeApiUser/);
assert.doesNotMatch(projections, /reservationId|scheduledReservation|ScheduledJourneyReservation|releasedAt/);
assert.doesNotMatch(lifecycle, /setInterval|setTimeout|cron|calendar|reschedul|buffer/i);
console.log("Unfar Phase 5A.4 scheduled-reservation release structural and service-source validation passed");
