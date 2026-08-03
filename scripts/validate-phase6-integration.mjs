import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const schema=readFileSync("prisma/schema.prisma","utf8"),live=readFileSync("lib/live-moments.ts","utf8"),guided=readFileSync("lib/guided-experiences.ts","utf8"),agreements=readFileSync("lib/agreements.ts","utf8"),lifecycle=readFileSync("lib/trip-lifecycle.ts","utf8"),migration=readFileSync("prisma/migrations/20260803030000_phase6b_guided_experiences/migration.sql","utf8");
for(const token of["SupplyListing","SupplyCapacityClaim","SupplyCapacityRestoration","supplyListingId","supplyOccurrenceId"])assert.ok(schema.includes(token),token);
for(const source of[live,guided])for(const token of["JourneyRequestStatus.OPEN","ProposalStatus.ACTIVE","supplyCapacityClaim.create","TransactionIsolationLevel.Serializable","acquireSafetyRestrictionParticipantLocks"])assert.ok(source.includes(token),token);
assert.ok(live.includes("CURRENT_TIMESTAMP + interval '10 minutes'")&&!live.includes("Promise.all([tx.journeyRequest.update"));
assert.ok(guided.includes("CURRENT_TIMESTAMP + interval '10 minutes'"));
for(const token of["phase6-claim-explorer:","phase6-claim-teleporter:","SupplyCapacityClaim_explorer_global_limit","SupplyCapacityClaim_no_teleporter_overlap","ScheduledJourneyReservation"])assert.ok(migration.includes(token),token);
assert.ok(agreements.includes("commitSupplyCapacityClaimInTransaction")&&lifecycle.includes("supplyCapacityRestoration.create"));
console.log("PASS Phase 6 integrated authority and lifecycle source validation: 25/25");
