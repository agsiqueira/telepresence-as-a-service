import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(path, "utf8");
const schema = read("prisma/schema.prisma");
const migration = read("prisma/migrations/20260727180000_phase4_trip_lifecycle/migration.sql");
const lifecycle = read("lib/trip-lifecycle.ts");
const marketplace = read("lib/marketplace.ts");
const feedback = read("app/api/feedback/route.ts");
const skip = read("app/api/feedback/skip/route.ts");
const token = read("app/api/livekit-token/route.ts");
const viewer = read("app/viewer/page.tsx");
const operator = read("app/operator/page.tsx");
const room = read("components/VideoRoom.tsx");

for (const state of ["REQUESTED", "OFFERED", "ACCEPTED", "IN_PROGRESS", "ENDED", "FEEDBACK_COMPLETED", "CANCELLED", "NO_OPERATOR_AVAILABLE"]) {
  assert.match(schema, new RegExp(`\\b${state}\\b`));
}
for (const field of ["offeredAt", "startedAt", "cancelledAt", "noOperatorAvailableAt", "feedbackCompletedAt", "feedbackSkippedAt", "retryOfTripId"]) {
  assert.match(schema, new RegExp(`\\b${field}\\b`));
  assert.match(migration, new RegExp(`"${field}"`));
}
assert.match(marketplace, /status: TripStatus\.OFFERED/);
assert.match(marketplace, /status: TripStatus\.NO_OPERATOR_AVAILABLE/);
assert.match(lifecycle, /export async function startTrip/);
assert.match(lifecycle, /status: TripStatus\.IN_PROGRESS/);
assert.match(lifecycle, /export async function cancelTrip/);
assert.match(lifecycle, /pendingOfferTripId: tripId/);
assert.match(lifecycle, /activeTripId: tripId/);
assert.match(lifecycle, /export async function endTrip/);
assert.match(lifecycle, /export async function recoverStaleTrips/);
assert.match(lifecycle, /export async function listViewerHistory/);
assert.match(lifecycle, /export async function listOperatorHistory/);
assert.match(lifecycle, /retryOfTripId: previous\.id/);
assert.match(feedback, /completeViewerFeedback/);
assert.match(skip, /completeViewerFeedback\(db, user\.id, tripId, null\)/);
assert.match(token, /TripStatus\.IN_PROGRESS/);
assert.match(viewer, /No compatible Teleporter is available/);
assert.match(viewer, /Journey accepted/);
assert.match(operator, /\/start/);
assert.match(room, /canPublishCamera/);
assert.match(room, /const \{ chatMessages, send, isSending \} = useChat\(\)/);
assert.match(room, /grid-cols-3/);

console.log("Phase 4 structural assertions passed.");
