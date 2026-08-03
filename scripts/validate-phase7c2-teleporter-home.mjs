import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const read = path => readFileSync(path, "utf8");
const home = read("app/operator/page.tsx");
const layout = read("app/operator/layout.tsx");
let count = 0;
const check = (condition, message) => { assert.ok(condition, message); count += 1; };

check(/export default function OperatorPage/.test(home), "/operator remains the Teleporter Home implementation");
check((home.match(/title="Home"/g) ?? []).length === 1 && home.includes('eyebrow="Teleporter"'), "single normal Home heading contract");
for (const token of ["VideoRoom", "ActiveVisitPreparation", "mediaState", "mediaRetry", "onAuthoritativeDisconnect", "clearActiveCall", "endTrip"]) check(home.includes(token), `active Journey path preserved: ${token}`);
check(home.includes('/api/trips/current?as=teleporter') && /if \(data\.trip\)[\s\S]*setActiveTrip\(data\.trip\)/.test(home), "current Journey restoration preserved");
check(home.includes('fetch("/api/operator/online"') && home.includes("JSON.stringify({ online: !online })"), "existing availability mutation preserved");
check(home.includes('"Go online"') && home.includes('"Go offline"'), "availability actions describe their effect");
for (const token of ["setupComplete", "pilotStatus", "readiness", "eligibleToGoOnline", "AvailabilityCard"]) check(home.includes(token), `readiness presentation uses authoritative data: ${token}`);
check(home.includes('fetch("/api/operator/offers"') && home.includes("intervalMs: 2000") && home.includes("maxIntervalMs: 16000"), "immediate-offer polling cadence preserved");
check(home.includes("offerExpiresAt") && home.includes("offerSeconds") && home.includes("Offer expires in"), "offer countdown preserved");
for (const token of ["acceptOffer", "declineOffer", "offerAction || offerSeconds <= 0"]) check(home.includes(token), `offer action preserved: ${token}`);
for (const token of ["Immediate Journey offer", "customDestination || offer.destination", "Starting-point preference", "requestedDuration", "preferredLanguage", "accessibilityNeeds", "Explorer instructions"]) check(home.includes(token), `offer detail rendered: ${token}`);
for (const token of ["operatingArea", "serviceRadiusKm", "destinationIds", "supportsCustom", "languages", "durationOptions", "accessibilityCapabilities", "Save service setup", 'fetch("/api/operator/settings"']) check(home.includes(token), `service setup preserved: ${token}`);
check(home.includes('/api/trips/history?as=teleporter&limit=50') && home.includes("Recent activity"), "existing history fetch and secondary hierarchy preserved");
check(home.includes("SafetyReportDialog") && home.includes("JourneyReviewPanel") && home.includes('item.status==="ACCEPTED"'), "Safety and Review eligibility remains state-gated");
check(home.indexOf("if (activeTrip && videoToken") < home.indexOf('title="Home"') && home.indexOf("if (activeTrip) {") < home.indexOf('title="Home"'), "active Journey returns precede normal Home");
check(home.includes("AccountSafetyRestrictionNotice"), "shared account Safety restriction notice preserved");
check(home.includes('role={pilotStatus === "SUSPENDED" ? "alert" : "status"}') && home.includes('role="status"') && home.includes("aria-label={`Offer expires"), "status, alert, and countdown semantics present");
check(home.includes("fieldset") && home.includes("legend") && home.includes("min-h-control-lg"), "grouped controls and minimum operational target size present");
check(home.includes("flex-wrap") && home.includes("min-w-0") && home.includes("break-words") && home.includes("sm:grid-cols-2"), "responsive wrapping markers present");
check(home.includes("Checking for immediate Journey Requests") && home.includes("Go offline") && !/notification|guaranteed notification/i.test(home), "waiting state is accurate and non-notifying");
check(!/AgreementConfirmation|TeleporterAgreements|LiveMomentManager|GuidedExperienceManager/.test(home), "scheduled Agreements and Offerings remain off Home");
check(!/aggregation|statistics dashboard|payment information|browser notification|push notification|notification count/i.test(home), "unsupported Phase 7C.2 features absent");

const destinations = [["Home", "/operator"], ["Requests", "/operator/requests"], ["Journeys", "/operator/journeys"], ["Offerings", "/operator/offerings"], ["Account", "/operator/account"]];
for (const [label, href] of destinations) check(layout.includes(`label: "${label}", href: "${href}"`), `Phase 7C.1 navigation preserved: ${label}`);

const status = execFileSync("git", ["-c", "safe.directory=C:/260 - Telepresence-as-a-service", "status", "--short"], { encoding: "utf8" });
const changed = status.split(/\r?\n/).filter(Boolean).map(line => line.slice(3).replaceAll("\\", "/"));
for (const path of changed) {
  if (path === "reference-materials/") continue;
  check(!/^(?:app\/api\/|lib\/|prisma\/|middleware\.ts$|app\/viewer\/|app\/admin\/)/.test(path), `server, Explorer, and Administrator scope unchanged: ${path}`);
}
check(!changed.some(path => path.startsWith("reference-materials/") && path !== "reference-materials/"), "reference materials remain untouched");

console.log(`PASS Phase 7C.2 Teleporter Home hierarchy, active-work priority, availability, offers, setup, history, accessibility, and scope validation: ${count}/${count}`);
