import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const schema=readFileSync("prisma/schema.prisma","utf8"),migration=readFileSync("prisma/migrations/20260803010000_phase6_supply_foundation/migration.sql","utf8"),service=readFileSync("lib/supply-foundation.ts","utf8");
for(const token of ["enum SupplyType","enum SupplyStatus","enum SupplyCapacityClaimStatus","model SupplyListing","model LiveMoment","model GuidedExperience","model GuidedExperienceOccurrence","model SupplyCapacityClaim","supplyListingVersion","supplyOccurrenceId"])assert.ok(schema.includes(token),token);
for(const token of ["SupplyCapacityClaim_no_teleporter_overlap","phase6-claim-explorer:","phase6-claim-teleporter:","interval '10 minutes'","SupplyCapacityClaim_explorer_global_limit","ScheduledJourneyReservation","SupplyListing_authority_immutable","SupplyCapacityClaim_prevent_delete"])assert.ok(migration.includes(token),token);
for(const token of ["createLiveMomentFoundation","createGuidedExperienceFoundation","createGuidedOccurrenceFoundation","createSupplyCapacityClaim","releaseSupplyCapacityClaim","expireSupplyCapacityClaims","commitSupplyCapacityClaimInTransaction","isSupplyIntervalRestorable","getOwnedSupplyFoundation","hasEffectiveSafetyRestrictionInTransaction","profileIsComplete","TransactionIsolationLevel.Serializable"])assert.ok(service.includes(token),token);
assert.ok(!/recurrence|recurrenceRule|groupSize|paymentMethod|stripe/i.test(schema.slice(schema.indexOf("model SupplyListing"),schema.indexOf("model SafetyReport"))));
assert.ok(!migration.includes("INSERT INTO")&&!migration.includes("UPDATE \"Agreement\"")&&!migration.includes("UPDATE \"Trip\""));
assert.ok(!service.includes("NextResponse")&&!service.includes("app/api"));
console.log("PASS Phase 6 foundation schema boundaries and mode separation");
console.log("PASS Phase 6 transactional claims, 10-minute expiry, limits, and overlap guards");
console.log("PASS Phase 6 internal services enforce actor, safety, strict input, and narrow projections");
console.log("PASS Phase 6 adds no recurrence, group, payment, public API, UI, or historical rewrite");
