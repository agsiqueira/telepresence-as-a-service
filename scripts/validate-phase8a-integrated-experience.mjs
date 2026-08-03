import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const read = path => readFileSync(path, "utf8");
const has = (source, values, label) => {
  for (const value of values) assert.ok(source.includes(value), `${label}: ${value}`);
};
let passed = 0;
const check = (condition, label) => { assert.ok(condition, label); passed += 1; };

const packageJson = JSON.parse(read("package.json"));
const viewerLayout = read("app/viewer/layout.tsx");
const operatorLayout = read("app/operator/layout.tsx");
const navigation = read("components/ui/PrimaryNavigation.tsx");
const appShell = read("components/ui/AppShell.tsx");
const pageAuth = read("lib/page-auth.ts");
const middleware = read("middleware.ts");
const viewer = read("app/viewer/page.tsx");
const operator = read("app/operator/page.tsx");
const videoRoom = read("components/VideoRoom.tsx");
const requests = read("components/JourneyRequestManager.tsx");
const requestDetail = read("components/JourneyRequestDetail.tsx");
const receivedProposals = read("components/ReceivedProposals.tsx");
const agreementConfirmation = read("components/AgreementConfirmation.tsx");
const requestDiscovery = read("components/JourneyRequestDiscovery.tsx");
const proposalManager = read("components/ProposalManager.tsx");
const explorerJourneys = read("components/explorer/ExplorerJourneys.tsx");
const teleporterJourneys = read("components/TeleporterAgreements.tsx");
const liveMoments = read("components/LiveMomentManager.tsx");
const guidedExperiences = read("components/GuidedExperienceManager.tsx");
const application = read("components/OperatorApplicationViewer.tsx");
const safetyReport = read("components/SafetyReportDialog.tsx");
const matrix = read("docs/phase8-integrated-test-matrix.md");

const explorerRoutes = ["app/viewer/page.tsx", "app/viewer/requests/page.tsx", "app/viewer/requests/[id]/page.tsx", "app/viewer/journeys/page.tsx", "app/viewer/account/page.tsx", "app/viewer/operator-application/page.tsx"];
const teleporterRoutes = ["app/operator/page.tsx", "app/operator/requests/page.tsx", "app/operator/requests/[id]/page.tsx", "app/operator/journeys/page.tsx", "app/operator/offerings/page.tsx", "app/operator/account/page.tsx"];
const secondaryRoutes = ["app/sign-in/[[...sign-in]]/page.tsx", "app/sign-up/[[...sign-up]]/page.tsx", "app/account-deactivated/page.tsx", "app/safety-support/page.tsx", "app/admin/participants/page.tsx"];
for (const route of [...explorerRoutes, ...teleporterRoutes, ...secondaryRoutes]) check(existsSync(route), `canonical route exists: ${route}`);

const primaryLabels = source => {
  const items = source.match(/const items\s*=\s*(\[[\s\S]*?\]);/)?.[1] ?? "";
  return [...items.matchAll(/label:\s*"([^"]+)"\s*,\s*href:/g)].map(match => match[1]);
};
const teleporterPrimary = primaryLabels(operatorLayout);
const explorerPrimary = primaryLabels(viewerLayout);
check(JSON.stringify(teleporterPrimary) === JSON.stringify(["Home", "Requests", "Journeys", "Offerings", "Account"]), "Teleporter has exactly five approved primary destinations");
check(JSON.stringify(explorerPrimary) === JSON.stringify(["Discover", "Journeys", "Requests", "Account"]), "Phase 7B Explorer four-destination baseline remains explicit pending an approved Home route");
check(matrix.includes("IA-01") && matrix.includes("Explorer Home route is unresolved"), "five-destination Explorer IA gap is recorded rather than hidden");
has(viewerLayout, ["requireExplorerPage", "Explorer primary navigation", "persistentMobileNavigation"], "Explorer shell");
has(operatorLayout, ["requireTeleporterPage", "Teleporter primary navigation", "persistentMobileNavigation"], "Teleporter shell");
has(navigation, ["aria-current", "pathname.startsWith", "grid-cols-5", "grid-cols-4", "safe-area-inset-bottom"], "primary navigation active and responsive behavior");
check(appShell.indexOf("secondaryLink") < appShell.indexOf("<PrimaryNavigation"), "context link remains outside primary navigation");
has(read("app/operator/opportunities/page.tsx"), ["redirect(\"/operator/requests\")"], "legacy opportunities redirect");
has(read("app/operator/opportunities/[id]/page.tsx"), ["redirect(`/operator/requests/${params.id}`)"], "legacy opportunity detail redirect");

has(pageAuth, ["requireExplorerPage", "hasExplorerCapability", "requireTeleporterPage", "hasTeleporterCapability", "canAccessTeleporterObligation", "/account-deactivated"], "page authorization boundaries");
has(middleware, ["isPublicRoute", "auth().protect()", '"/sign-in(.*)"', '"/sign-up(.*)"', '"/account-deactivated"'], "broad protected-route middleware boundary");

for (const script of ["phase7a", "phase7b2", "phase7b3", "phase7b4", "phase7b5", "phase7b6", "phase7c1", "phase7c2", "phase7c3", "phase7c4", "phase7c5", "phase7c6", "phase7c7"]) {
  check(Boolean(packageJson.scripts[`test:${script}`]), `Phase 7 validator registered: ${script}`);
}
check(packageJson.scripts["test:phase8a"] === "node scripts/validate-phase8a-integrated-experience.mjs", "Phase 8 validator registered");

has(viewer, ["/api/destinations", "/api/trips/current", "fetch(\"/api/trips\"", "/cancel", "/end", "/api/livekit-token"], "Immediate Journey Explorer ownership");
has(operator, ["/api/operator/offers", "/accept", "/decline", "/start", "/api/livekit-token", "/end", "endRequestRef"], "Immediate Journey Teleporter ownership");
has(requests, ["/api/journey-requests", 'method:"POST"', "busy"], "Explorer scheduled Request creation ownership");
has(requestDetail, ["/api/journey-requests/${id}", "/withdraw", "working"], "Explorer scheduled Request detail ownership");
has(receivedProposals, ["/proposals/${id}/decline", "/proposals/${proposal.id}/accept", "busyId"], "Explorer Proposal decision ownership");
has(agreementConfirmation, ["/agreement", "privateMeetingSnapshot"], "Explorer Agreement ownership");
has(requestDiscovery, ["/api/operator/journey-requests", "coarse", "/operator/requests/"], "Teleporter coarse Request discovery");
has(proposalManager, ["/api/operator/journey-requests", "/proposals", "/revise", "/withdraw"], "Proposal ownership");
has(explorerJourneys, ["/api/trips/history?limit=50", "JourneyReviewPanel", "SafetyReportDialog", "FeedbackForm"], "Explorer Journey ownership");
has(teleporterJourneys, ["/api/operator/agreements", "JourneyReschedulingPanel", "privateMeetingSnapshot"], "Teleporter Agreement ownership");
has(liveMoments, ["/api/operator/live-moments", "publish", "pause", "resume", "archive"], "Live Moment lifecycle ownership");
has(guidedExperiences, ["/api/operator/guided-experiences", "occurrences", "publish", "archive"], "Guided Experience lifecycle ownership");

check(viewer.includes("<VideoRoom") && operator.includes("<VideoRoom"), "shared VideoRoom remains in both live call sites");
check(viewer.includes("canPublishCamera={false}"), "Explorer cannot publish camera at the Viewer call site");
check(operator.includes("canPublishCamera canPublishMicrophone"), "Teleporter camera and microphone publishing remain enabled");
has(videoRoom, ["useConnectionState", "ConnectionState.Reconnecting", "TrackToggle", "Track.Source.Camera", "Track.Source.Microphone", "useChat()", "End this Journey?"], "shared LiveKit behavior");
check(!videoRoom.includes("aria-live=\"polite\" aria-atomic=\"true\">\n        <VisitTimer"), "Journey timer is not a per-second live announcement");

const primarySources = [viewer, requests, requestDetail, receivedProposals, explorerJourneys, read("app/viewer/account/page.tsx"), application, operator, requestDiscovery, proposalManager, teleporterJourneys, liveMoments, guidedExperiences, read("app/operator/account/page.tsx")];
check(primarySources.filter(source => /loading|Skeleton|aria-busy/i.test(source)).length >= 8, "loading presentation spans primary data-driven destinations");
check(primarySources.filter(source => /empty|No |nothing|StatePanel/i.test(source)).length >= 8, "empty presentation spans primary data-driven destinations");
check(primarySources.filter(source => /role="alert"|tone="danger"|variant="danger"/i.test(source)).length >= 8, "failure presentation spans primary data-driven destinations");
check(primarySources.filter(source => /Retry|Try again|onRetry/i.test(source)).length >= 7, "retry presentation spans primary data-driven destinations");
check(primarySources.filter(source => /pending|submitting|saving|actionRef|\.current/i.test(source)).length >= 8, "important mutations expose pending or duplicate protection");
check(primarySources.filter(source => /StatusBadge|Status:|status text|role="status"/i.test(source)).length >= 7, "major states have explicit text");

has(requestDiscovery, ["coarseLocation", "Private meeting details and Explorer information remain hidden", "publicPlaceName"], "Request privacy boundary representation");
check(!requestDiscovery.includes("privateMeetingDetails") && !requestDiscovery.includes("viewerNote") && !requestDiscovery.includes("accessibilityNeeds"), "coarse Request cards do not carry private fulfillment fields");
has(teleporterJourneys, ["Fulfillment details", "privateMeetingSnapshot", "Confirmed Journeys appear here after an Explorer accepts"], "Agreement privacy boundary representation");
has(safetyReport, ["/safety-report", "role=\"dialog\"", "aria-modal", "pending"], "Journey Safety reporting ownership and accessibility");
has(application, ["Teleporter application", "Explorer account", "submitting", "role=\"dialog\""], "application terminology and interaction state");

const accessibilityCorpus = primarySources.join("\n") + videoRoom + navigation + safetyReport;
has(accessibilityCorpus, ["<main", "<h1", "aria-current", "role=\"status\"", "role=\"alert\"", "aria-modal", "focus-visible", "fieldset", "legend"], "integrated accessibility markers");
has(accessibilityCorpus, ["min-w-0", "break-words", "sm:flex-row", "flex-col", "safe-area-inset-bottom", "100dvh", "max-h-[90dvh]"], "integrated responsive markers");

const status = execFileSync("git", ["-c", `safe.directory=${process.cwd().replaceAll("\\", "/")}`, "status", "--porcelain"], { encoding: "utf8" });
const changed = status.split(/\r?\n/).filter(Boolean).map(line => line.slice(3).replaceAll("\\", "/")).filter(path => path !== "reference-materials/");
for (const path of changed) check(!/^(?:prisma\/|app\/api\/|middleware\.ts$)/.test(path), `Phase 8.1 has no schema, migration, API, or middleware change: ${path}`);
check(!changed.includes("package-lock.json"), "no dependency lockfile change");
check(existsSync("docs/phase8-integrated-test-matrix.md"), "manual test matrix exists");
has(matrix, ["Structurally validated", "Blocked — authentication", "Blocked — paired role", "Blocked — LiveKit/device", "320px", "390px", "768px", "1280px", "Screen reader", "Stale state"], "manual matrix coverage");

const diff = execFileSync("git", ["-c", `safe.directory=${process.cwd().replaceAll("\\", "/")}`, "diff", "--", ".", ":(exclude)reference-materials"], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
for (const term of ["stripe", "payout", "analytics", "notification", "mapbox", "recurrenceRule"]) check(!diff.toLowerCase().includes(term.toLowerCase()), `no excluded product addition: ${term}`);

console.log("AUDIT Phase 8.1 finding: Explorer Home route is unresolved; the approved Phase 7B shell still owns four primary destinations. See IA-01 in the manual matrix.");
console.log(`PASS Phase 8.1 integrated route, workflow, authority, privacy, accessibility, responsive, and scope validation: ${passed}/${passed}`);
