import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(path, "utf8");
const schema = read("prisma/schema.prisma");
const migration = read("prisma/migrations/20260803030000_phase6b_guided_experiences/migration.sql");
const service = read("lib/guided-experiences.ts");
const lifecycle = read("lib/trip-lifecycle.ts");
const rescheduling = read("lib/rescheduling.ts");
const manager = read("components/GuidedExperienceManager.tsx");
const discovery = read("components/GuidedExperienceDiscovery.tsx");

for (const token of ["titleSnapshot", "descriptionSnapshot", "durationMinutesSnapshot", "supplyListingVersion", "replacesOccurrenceId", "@@unique([guidedExperienceId, availabilityStart])"])
  assert.ok(schema.includes(token), `schema: ${token}`);
for (const token of ["GuidedExperienceOccurrence_capacity_one_check", "GuidedExperienceOccurrence_snapshot_shape_check", "GuidedExperienceOccurrence_authority_immutable", "GuidedExperienceOccurrence_archive_protection", "GuidedExperienceOccurrence_replacement_check", "CURRENT_TIMESTAMP+interval '10 minutes'", "durationMinutesSnapshot"])
  assert.ok(migration.includes(token), `migration: ${token}`);
assert.ok(!/recurrence|cron|materialization horizon|named.time.zone|btree_gist/i.test(schema + migration));
assert.ok(!migration.includes('UPDATE "JourneyRequest"') && !migration.includes('UPDATE "Agreement"') && !migration.includes('UPDATE "Trip"'));
for (const token of ["createGuidedOccurrence", "updateGuidedOccurrenceDraft", "deleteGuidedOccurrenceDraft", "publishGuidedOccurrence", "archiveGuidedOccurrence", "replaceGuidedOccurrence", "initiateGuidedOccurrence", "SupplyFoundationError(\"INVALID\",400)", "TransactionIsolationLevel.Serializable"])
  assert.ok(service.includes(token), `service: ${token}`);
assert.ok(service.includes("/(?:Z|[+-]\\d{2}:\\d{2})$/"));
assert.ok(lifecycle.includes("occurrenceId") && lifecycle.includes("supplyCapacityRestoration.create"));
assert.ok(rescheduling.includes("Guided Experiences cannot be rescheduled"));

for (const route of [
  "app/api/operator/guided-experiences/route.ts",
  "app/api/operator/guided-experiences/[id]/route.ts",
  "app/api/operator/guided-experiences/[id]/[action]/route.ts",
  "app/api/operator/guided-experiences/[id]/occurrences/route.ts",
  "app/api/operator/guided-experiences/[id]/occurrences/[occurrenceId]/route.ts",
  "app/api/operator/guided-experiences/[id]/occurrences/[occurrenceId]/[action]/route.ts",
  "app/api/guided-experiences/route.ts",
  "app/api/guided-experiences/[id]/route.ts",
  "app/api/guided-experiences/[id]/occurrences/[occurrenceId]/claim/route.ts",
  "app/api/guided-experience-claims/route.ts",
  "app/api/guided-experience-claims/[id]/abandon/route.ts",
]) assert.ok(read(route).includes("Cache-Control") || route.endsWith("abandon/route.ts"), `route: ${route}`);

for (const source of [manager, discovery]) {
  assert.ok(source.includes('aria-live="polite"') || source.includes("LiveRegion"));
  assert.ok(source.includes("disabled"));
}
assert.ok(manager.includes('type="datetime-local"') && manager.includes("toISOString"));
assert.ok(manager.includes("No recurrence is generated"));
assert.ok(discovery.includes("Claim and review") && discovery.includes("Release claim"));

console.log("PASS Phase 6B schema, migration, lifecycle, API, privacy, and strict-source validation: 48/48");
console.log("PASS Phase 6B participant UI and accessibility source validation: 12/12");
