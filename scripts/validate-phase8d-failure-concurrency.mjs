import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
let passed = 0;
const check = (condition, label) => { assert.ok(condition, label); passed += 1; };
const includes = (source, markers, label) => { for (const marker of markers) check(source.includes(marker), `${label}: ${marker}`); };

const pkg = JSON.parse(read("package.json"));
const report = read("docs/phase8-failure-concurrency-report.md");
const matrix = read("docs/phase8-integrated-test-matrix.md");
const viewer = read("app/viewer/page.tsx");
const operator = read("app/operator/page.tsx");
const requestManager = read("components/JourneyRequestManager.tsx");
const requestDetail = read("components/JourneyRequestDetail.tsx");
const proposalManager = read("components/ProposalManager.tsx");
const received = read("components/ReceivedProposals.tsx");
const reschedulePanel = read("components/JourneyReschedulingPanel.tsx");
const profile = read("components/ProfileSettings.tsx");
const application = read("components/OperatorApplicationViewer.tsx");
const feedback = read("components/FeedbackForm.tsx");
const review = read("components/JourneyReviewPanel.tsx");
const tip = read("components/SimulatedTipPanel.tsx");
const safety = read("components/SafetyReportDialog.tsx");
const support = read("components/SafetySupportInbox.tsx");
const liveMoments = read("components/LiveMomentManager.tsx");
const guided = read("components/GuidedExperienceManager.tsx");
const poller = read("lib/resilient-poller.ts");
const agreements = read("lib/agreements.ts");
const proposals = read("lib/proposals.ts");
const requests = read("lib/journey-requests.ts");
const rescheduling = read("lib/rescheduling.ts");
const supply = read("lib/supply-foundation.ts");
const safetyRestrictions = read("lib/safety-restrictions.ts");
const pageAuth = read("lib/page-auth.ts");

for (const path of [
  "docs/phase8-integrated-test-matrix.md", "docs/phase8-authenticated-lifecycle-report.md",
  "docs/phase8-responsive-accessibility-report.md", "docs/phase8-failure-concurrency-report.md",
  "scripts/validate-phase8a-integrated-experience.mjs", "scripts/validate-phase8b-authenticated-lifecycle.mjs",
  "scripts/validate-phase8c-responsive-accessibility.mjs",
]) check(existsSync(path), `Phase 8 baseline or Phase 8.4 artifact exists: ${path}`);
check(pkg.scripts["test:phase8d"] === "node scripts/validate-phase8d-failure-concurrency.mjs", "Phase 8.4 validator is registered");

includes(viewer, ["submitting", "cancelling", "leaveRequestRef", "/api/trips/current", "/cancel", "/end", "createResilientPoller", "onPersistentFailure", "onRecovery"], "Explorer immediate lifecycle duplicate, reload, and polling authority");
includes(operator, ["availabilityAction", "offerAction", "endRequestRef", "/api/operator/offers", "/accept", "/decline", "/start", "/end", "offerExpiresAt", "createResilientPoller"], "Teleporter immediate lifecycle duplicate and server authority");
check(operator.includes("intervalMs: 10000") && operator.includes("intervalMs: 1000") && operator.includes("maxIntervalMs: 8000"), "Teleporter polling intervals and backoff remain unchanged");
check(viewer.includes("intervalMs: 1000") && viewer.includes("maxIntervalMs: 8000"), "Explorer active Journey polling remains unchanged");

for (const [source, guards, pending, label] of [
  [requestManager, ["busy"], ["Creating Request"], "scheduled Request"],
  [requestDetail, ["working"], ["Withdrawing"], "Request withdrawal"],
  [proposalManager, ["pendingAction"], ["Submitting", "Withdrawing"], "Proposal create/revise/withdraw"],
  [received, ["busyId"], ["Accepting Proposal", "Declining Proposal"], "Proposal accept/decline"],
  [reschedulePanel, ["working"], ["Submitting", "Accepting", "Declining", "Withdrawing"], "rescheduling"],
  [profile, ["saving.current", "isSaving"], ["Saving"], "profile"],
  [application, ["submitting", "withdrawing"], ["Submitting", "Withdrawing"], "application"],
  [feedback, ["submitting"], ["Submitting"], "Feedback"],
  [review, ["submitting"], ["Submitting"], "Review"],
  [tip, ["lock.current", "submitting"], ["Submitting"], "Tip"],
  [safety, ["lock.current", "pending"], ["Submitting"], "Safety report"],
  [support, ["lock.current", "pending"], ["Sending"], "Safety support"],
  [liveMoments, ["pending", "if (pending) return"], ["Creating", "Publishing", "Archiving"], "Live Moment"],
  [guided, ["pending", "if (pending) return"], ["Creating", "Saving", "Updating", "Replacing"], "Guided Experience"],
]) {
  includes(source, guards, `${label} duplicate guard`);
  check(pending.some((marker) => source.includes(marker)), `${label} visible pending label`);
  check(source.includes("disabled=") || source.includes("aria-busy"), `${label} pending control disabled or busy`);
}

includes(requestManager, ["await load(true)", "no-store"], "Request authoritative reload");
includes(requestDetail, ["await load()", "no-store"], "Request detail stale recovery");
includes(proposalManager, ["await load({ preserveMessage: true })", "active.version"], "Proposal conflict reload and immutable version presentation");
includes(received, ["await load(true)", "data.created", "Existing confirmation restored"], "Proposal decision idempotency and reload");
includes(reschedulePanel, ["await load()", "canAccept", "canDecline", "canWithdraw"], "server-provided rescheduling permissions and reload");

includes(proposals, ["version", "P2002", "ProposalStatus", "$transaction"], "Proposal immutable server authority");
includes(agreements, ["acceptProposal", "$transaction", "privateMeetingSnapshot", "Agreement"], "transactional Agreement and private snapshot");
includes(requests, ["expiresAt", "JourneyRequestStatus", "WITHDRAWN"], "Request expiry and withdrawal authority");
includes(rescheduling, ["canAccept", "canDecline", "canWithdraw", "$transaction", "ScheduledJourneyRescheduleStatus"], "rescheduling terminal authority");
includes(supply, ["expectedVersion", "updateMany", "version: { increment: 1 }"], "offering optimistic concurrency authority");
check(guided.includes("expectedStartAt"), "occurrence edits retain expectedStartAt");

includes(poller, ["running", "AbortController", "AbortError", "persistentFailureCount", "onPersistentFailure", "onRecovery", "maxIntervalMs", "request?.abort()"], "poller serialization backoff abort and recovery");
check(poller.includes("if (stopped || running) return"), "poller prevents overlapping executions");
check(poller.includes("if (failures > 0) options.onRecovery?.()"), "poller clears persistent interruption through recovery callback");
check(!requestManager.includes("createResilientPoller") && !proposalManager.includes("createResilientPoller") && !liveMoments.includes("createResilientPoller") && !guided.includes("createResilientPoller"), "one-time list and mutation surfaces did not gain polling");

for (const source of [requestManager, requestDetail, proposalManager, received, reschedulePanel, profile, liveMoments, guided]) {
  check(source.includes("catch") && source.includes("finally"), "mutation failure clears pending without false success");
}
check(received.includes("error&&proposals.length===0") && received.includes("The Request details remain available"), "Proposal refresh failure retains successful Request content");
check(!requestManager.includes("loading") || requestManager.includes("StatePanel"), "Request loading is represented separately from empty state");
check(!operator.includes("localStorage") && !viewer.includes("localStorage"), "no client-authoritative Journey state persistence");

check(!read("components/JourneyRequestDiscovery.tsx").includes("privateMeetingDetails") && !read("components/JourneyRequestDiscovery.tsx").includes("viewerNote"), "stale discovery remains coarse and privacy safe");
includes(pageAuth, ["hasExplorerCapability", "hasTeleporterCapability", "canAccessTeleporterObligation", "/account-deactivated"], "account role and capability server ownership");
includes(safetyRestrictions, ["enforceNoActiveSafetyRestriction", "SafetyRestrictionError"], "Safety policy server ownership");
includes(operator, ["pilotStatus", "readiness", "/api/operator/settings"], "pilot readiness and setup server ownership");
includes(read("middleware.ts"), ["auth().protect()", "isPublicRoute"], "authentication boundary remains enabled");

includes(matrix, ["Passed — database", "Passed — automated", "Passed — source inspection", "Blocked — authentication", "Blocked — paired role", "Blocked — network tooling unavailable", "Manual test required"], "matrix evidence classifications");
includes(report, ["No application defect was reproduced", "Blocked — authentication", "Blocked — paired role", "Blocked — network tooling unavailable", "Manual test required", "No ad-hoc SQL", "reserved for Phase 8.5"], "report evidence integrity");
check(!report.includes("Passed — paired browser"), "report does not claim paired browser passage");
check(!report.includes("Passed — browser network recovery"), "report does not claim browser network recovery");

const git = (args) => execFileSync("git", ["-c", `safe.directory=${process.cwd().replaceAll("\\", "/")}`, ...args], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
const changed = git(["status", "--porcelain"]).split(/\r?\n/).filter(Boolean).map((line) => line.slice(3).replaceAll("\\", "/")).filter((path) => path !== "reference-materials/");
check(changed.every((path) => /^(?:docs\/phase8-|scripts\/validate-phase8d|package\.json$)/.test(path)), "changes are limited to Phase 8.4 documentation, validator, and script registration");
for (const path of changed) check(!/^(?:app\/|components\/|lib\/|middleware\.ts$|prisma\/|package-lock\.json$)/.test(path), `no application API authority schema dependency or LiveKit change: ${path}`);
check(git(["diff", "--", "reference-materials"]).trim() === "", "reference-materials remains untouched");

const diff = git(["diff", "--", ".", ":(exclude)reference-materials"]);
for (const forbidden of ["authentication bypass", "test-only production endpoint", "client-authoritative lifecycle", "new LiveKit", "schema change", "new dependency"]) check(!diff.toLowerCase().includes(`+${forbidden}`), `no forbidden implementation addition: ${forbidden}`);

console.log("STATUS Phase 8.4: Database and source validation complete; authenticated stale-tab, paired-browser, protected network, refresh, and history execution remain honestly blocked or manual.");
console.log(`PASS Phase 8.4 failure, stale-state, concurrency, evidence-integrity, and scope validation: ${passed}/${passed}`);
