import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const service=read("lib/rescheduling.ts"),route=read("app/api/trips/[id]/reschedule/route.ts"),panel=read("components/JourneyReschedulingPanel.tsx"),explorer=read("components/AgreementConfirmation.tsx"),teleporter=read("components/TeleporterAgreements.tsx");
assert.match(service,/getReschedulingState/);assert.match(service,/scheduledReservations:[\s\S]*status: "CONFIRMED"[\s\S]*take: 2/);assert.match(service,/eligible && proposal === null/);assert.match(service,/reservation\.agreementId === trip\.agreement\.id/);
assert.match(route,/rescheduling: result\.value/);assert.match(explorer,/JourneyReschedulingPanel/);assert.match(teleporter,/JourneyReschedulingPanel/);
assert.match(panel,/Confirmed time:/);assert.match(panel,/Proposed new time — pending/);assert.match(panel,/remains unchanged until the other party accepts/);assert.match(panel,/Withdraw proposal/);assert.match(panel,/Accept new time/);assert.match(panel,/Decline/);assert.match(panel,/datetime-local/);assert.match(panel,/aria-live="polite"/);assert.match(panel,/role="alert"/);assert.match(panel,/min-h-11/);assert.match(panel,/disabled=\{working\}/);assert.match(panel,/await load\(\);await onRefresh\(\)/);
assert.doesNotMatch(panel,/reservationId|releasedAt|agreementId|constraint|availability is available/i);
console.log("Phase 5B.1 mutual-rescheduling UI structural validation passed: 20/20");
