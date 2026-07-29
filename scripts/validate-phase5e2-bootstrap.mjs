import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync("scripts/provision-initial-admin.mjs", "utf8");
for (const pattern of [/PROVISION_INITIAL_ADMIN/, /role: Role\.ADMIN/, /accountStatus !== AccountStatus\.ACTIVE/, /role !== Role\.VIEWER/, /online/, /pendingOfferTripId/, /activeTripId/, /TripStatus\.REQUESTED[\s\S]*TripStatus\.ENDED/, /OfferStatus\.OFFERED/, /OperatorApplicationStatus\.PENDING/, /TransactionIsolationLevel\.Serializable/, /administrator governance/]) assert.match(source, pattern);
assert.doesNotMatch(source, /adminRoleChangeAudit\.create|AccountLifecycleAudit|data:\s*{[^}]*accountStatus/s);
console.log("Phase 5E.2A initial-administrator bootstrap restrictions passed.");
