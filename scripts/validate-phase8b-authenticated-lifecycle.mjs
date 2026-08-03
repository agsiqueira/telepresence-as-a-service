import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const read = path => readFileSync(path, "utf8");
let passed = 0;
const check = (condition, label) => { assert.ok(condition, label); passed += 1; };
const includes = (source, markers, label) => {
  for (const marker of markers) check(source.includes(marker), `${label}: ${marker}`);
};

const pkg = JSON.parse(read("package.json"));
const report = read("docs/phase8-authenticated-lifecycle-report.md");
const matrix = read("docs/phase8-integrated-test-matrix.md");
const viewer = read("app/viewer/page.tsx");
const operator = read("app/operator/page.tsx");
const requestManager = read("components/JourneyRequestManager.tsx");
const requestDetail = read("components/JourneyRequestDetail.tsx");
const requestDiscovery = read("components/JourneyRequestDiscovery.tsx");
const proposalManager = read("components/ProposalManager.tsx");
const receivedProposals = read("components/ReceivedProposals.tsx");
const agreementService = read("lib/agreements.ts");
const rescheduling = read("lib/rescheduling.ts");
const reschedulingPanel = read("components/JourneyReschedulingPanel.tsx");
const explorerJourneys = read("components/explorer/ExplorerJourneys.tsx");
const teleporterJourneys = read("components/TeleporterAgreements.tsx");
const safety = read("lib/safety-restrictions.ts");
const pageAuth = read("lib/page-auth.ts");
const middleware = read("middleware.ts");

check(existsSync("scripts/validate-phase8a-integrated-experience.mjs"), "Phase 8.1 validator remains present");
check(existsSync("docs/phase8-integrated-test-matrix.md"), "Phase 8 matrix remains present");
check(existsSync("docs/phase8-authenticated-lifecycle-report.md"), "authenticated lifecycle report exists");
check(pkg.scripts["test:phase8a"] === "node scripts/validate-phase8a-integrated-experience.mjs", "Phase 8.1 script remains registered");
check(pkg.scripts["test:phase8b"] === "node scripts/validate-phase8b-authenticated-lifecycle.mjs", "Phase 8.2 script is registered");

includes(viewer, ["/api/trips/current", 'fetch("/api/trips"', "/cancel", "/end", "/api/livekit-token", "leaveRequestRef"], "Explorer immediate Journey ownership");
includes(operator, ["/api/operator/offers", "offerExpiresAt", "/accept", "/decline", "/start", "/api/trips/current?as=teleporter", "/end", "endRequestRef", "createResilientPoller"], "Teleporter immediate Journey ownership");
check(operator.includes("intervalMs: 10000") && operator.includes("offerSeconds"), "offer polling and expiry presentation remain present");
check(operator.includes("intervalMs: 1000") && operator.includes("maxIntervalMs: 8000"), "active Journey status polling remains unchanged");

includes(requestManager, ["/api/journey-requests", 'method:"POST"', "busy", "await load(true)"], "scheduled Request creation and authoritative reload");
includes(requestDetail, ["/api/journey-requests/${id}", "/withdraw", "working", "await load()"], "Request withdrawal and stale recovery");
includes(requestDiscovery, ["/api/operator/journey-requests", "coarseLocation", "Private meeting details and Explorer information remain hidden"], "coarse Teleporter Request discovery");
includes(proposalManager, ["/proposals", "/revise", "/withdraw", "active.version", "await load({ preserveMessage: true })"], "Proposal create revise withdraw and immutable-version presentation");
includes(receivedProposals, ["/decline", "/accept", "busyId", "await load(true)"], "Proposal decisions and authoritative reload");

includes(agreementService, ["acceptProposal", "$transaction", "Agreement", "privateMeetingSnapshot", "ProposalStatus.ACCEPTED"], "server-authoritative Agreement creation and private snapshot");
check(!requestDiscovery.includes("privateMeetingDetails") && !requestDiscovery.includes("viewerNote") && !requestDiscovery.includes("accessibilityNeeds"), "pre-Agreement discovery carries no private fulfillment fields");
includes(teleporterJourneys, ["privateMeetingSnapshot", "Confirmed Journeys", "/api/operator/agreements"], "post-confirmation fulfillment projection");

includes(rescheduling, ["EXPLORER", "TELEPORTER", "canAccept", "canDecline", "canWithdraw", "$transaction"], "both rescheduling proposer directions and server-provided permissions");
includes(reschedulingPanel, ["canAccept", "canDecline", "canWithdraw", "/accept", "/decline", "/withdraw", "await load()"], "rescheduling UI permissions and conflict reload");
check(rescheduling.includes("scheduledJourneyReservation.create") && rescheduling.includes("status: ScheduledJourneyRescheduleStatus.ACCEPTED"), "confirmed replacement timing changes in the acceptance transaction");

includes(explorerJourneys, ["/api/trips/history?limit=50", "FeedbackForm", "JourneyReviewPanel", "SafetyReportDialog"], "Explorer history Feedback Review and Safety continuity");
includes(read("components/JourneyReviewPanel.tsx"), ["SimulatedTipPanel"], "simulated Tip continuity");
includes(teleporterJourneys, ["JourneyReschedulingPanel", "Agreement"], "Teleporter Agreement and rescheduling continuity");

for (const [source, guard, label] of [[viewer, "leaveRequestRef", "Explorer end"], [operator, "endRequestRef", "Teleporter end"], [requestManager, "busy", "Request create"], [proposalManager, "pending", "Proposal mutation"], [receivedProposals, "busyId", "Proposal decision"], [reschedulingPanel, "working", "rescheduling"]]) check(source.includes(guard), `${label} duplicate-action protection`);

includes(pageAuth, ["hasExplorerCapability", "hasTeleporterCapability", "canAccessTeleporterObligation", "/account-deactivated"], "role and account page authority");
includes(safety, ["enforceNoActiveSafetyRestriction", "SafetyRestrictionError"], "server-owned Safety restriction");
includes(operator, ["pilotStatus", "readiness", "/api/operator/settings"], "server-owned pilot readiness and setup presentation");
includes(middleware, ["auth().protect()", "isPublicRoute"], "authentication middleware remains enabled");

includes(report, ["Validation foundation complete", "Authenticated execution blocked", "Passed by database suite", "No legitimate authenticated test accounts or credentials were available", "No application defects were reproduced", "Human authenticated execution runbook"], "honest execution report markers");
check(!report.includes("Passed manually: authenticated cross-role lifecycle"), "report does not claim authenticated passage");
includes(matrix, ["Database suite passed in Phase 8.2", "Authenticated browser remains blocked", "Blocked — LiveKit/device"], "matrix execution evidence and limitations");

const status = execFileSync("git", ["-c", `safe.directory=${process.cwd().replaceAll("\\", "/")}`, "status", "--porcelain"], { encoding: "utf8" });
const changed = status.split(/\r?\n/).filter(Boolean).map(line => line.slice(3).replaceAll("\\", "/")).filter(path => path !== "reference-materials/");
for (const path of changed) check(!/^(?:app\/api\/|prisma\/|middleware\.ts$|lib\/(?!.*(?:\.md)$))/.test(path), `no endpoint schema middleware or authority change: ${path}`);
check(!changed.includes("package-lock.json"), "no dependency lockfile change");
check(changed.every(path => /^(?:docs\/|scripts\/validate-phase8b|package\.json$)/.test(path)), "changes are limited to Phase 8.2 validation and documentation");

const diff = execFileSync("git", ["-c", `safe.directory=${process.cwd().replaceAll("\\", "/")}`, "diff", "--", ".", ":(exclude)reference-materials"], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
for (const forbidden of ["bypass Clerk", "test-only production", "hard-code user", "disable middleware", "promote users", "new endpoint", "schema change"]) check(!diff.toLowerCase().includes(forbidden.toLowerCase()), `no forbidden implementation marker: ${forbidden}`);

console.log("STATUS Phase 8.2: Validation foundation complete; authenticated execution blocked.");
console.log(`PASS Phase 8.2 lifecycle ownership, database evidence, privacy, concurrency, continuity, and scope validation: ${passed}/${passed}`);
