import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const schema = read("prisma/schema.prisma");
const migration = read("prisma/migrations/20260801030000_unfar_phase5a2_scheduled_reservations/migration.sql");
const service = read("lib/agreements.ts");
const lifecycle = read("lib/trip-lifecycle.ts");

assert.match(schema, /enum ScheduledJourneyReservationStatus\s*{\s*CONFIRMED\s*RELEASED\s*}/s);
assert.match(schema, /model ScheduledJourneyReservation\s*{[\s\S]*id\s+String\s+@id @default\(uuid\(\)\) @db\.Uuid[\s\S]*agreementId\s+String\s+@unique[\s\S]*tripId\s+String\s+@unique[\s\S]*startAt\s+DateTime\s+@db\.Timestamptz\(3\)[\s\S]*endAt\s+DateTime\s+@db\.Timestamptz\(3\)[\s\S]*releasedAt\s+DateTime\?\s+@db\.Timestamptz\(3\)/);
for (const owner of [/scheduledReservations\s+ScheduledJourneyReservation\[\]/, /scheduledReservation\s+ScheduledJourneyReservation\?/]) assert.match(schema, owner);
assert.match(migration, /CREATE EXTENSION IF NOT EXISTS btree_gist/);
assert.match(migration, /"endAt" > "startAt"/);
assert.match(migration, /"status" = 'CONFIRMED' AND "releasedAt" IS NULL/);
assert.match(migration, /"status" = 'RELEASED' AND "releasedAt" IS NOT NULL/);
assert.match(migration, /EXCLUDE USING gist[\s\S]*"teleporterId" WITH =[\s\S]*tstzrange\("startAt", "endAt", '\[\)'\) WITH &&[\s\S]*WHERE \("status" = 'CONFIRMED'\)/);
assert.doesNotMatch(migration, /^\s*(?:UPDATE|INSERT INTO|DELETE FROM)\b/m);
assert.match(migration, /Do not automatically drop btree_gist/);
assert.match(service, /proposal\.durationMinutes \* 60_000/);
assert.match(service, /scheduledJourneyReservation\.create/);
assert.match(service, /ScheduledJourneyReservation_no_confirmed_overlap/);
assert.match(service, /The Teleporter is no longer available for the selected Journey time\./);
assert.match(service, /activeTripId: tripId/);
assert.doesNotMatch(service, /scheduledReservation[^\n]*SNAPSHOT_SELECT|reservationId/);
assert.doesNotMatch(lifecycle, /scheduledJourneyReservation|releasedAt|ScheduledJourneyReservationStatus/);
console.log("Unfar Phase 5A.2 scheduled-reservation structural and service-source validation passed");
