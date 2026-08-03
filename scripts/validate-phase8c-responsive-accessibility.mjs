import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
let passed = 0;
const check = (condition, label) => { assert.ok(condition, label); passed += 1; };
const includes = (source, markers, label) => {
  for (const marker of markers) check(source.includes(marker), `${label}: ${marker}`);
};

const pkg = JSON.parse(read("package.json"));
const matrix = read("docs/phase8-integrated-test-matrix.md");
const report = read("docs/phase8-responsive-accessibility-report.md");
const rootLayout = read("app/layout.tsx");
const globals = read("app/globals.css");
const primaryNavigation = read("components/ui/PrimaryNavigation.tsx");
const primitives = read("components/ui/primitives.tsx");
const videoRoom = read("components/VideoRoom.tsx");
const safetyDialog = read("components/SafetyReportDialog.tsx");
const viewer = read("app/viewer/page.tsx");
const operator = read("app/operator/page.tsx");
const requestManager = read("components/JourneyRequestManager.tsx");
const proposalManager = read("components/ProposalManager.tsx");
const rescheduling = read("components/JourneyReschedulingPanel.tsx");
const liveMoments = read("components/LiveMomentManager.tsx");
const guidedExperiences = read("components/GuidedExperienceManager.tsx");

for (const path of [
  "scripts/validate-phase8a-integrated-experience.mjs",
  "scripts/validate-phase8b-authenticated-lifecycle.mjs",
  "docs/phase8-authenticated-lifecycle-report.md",
  "docs/phase8-integrated-test-matrix.md",
  "docs/phase8-responsive-accessibility-report.md",
]) check(existsSync(path), `baseline or Phase 8.3 artifact exists: ${path}`);
check(pkg.scripts["test:phase8c"] === "node scripts/validate-phase8c-responsive-accessibility.mjs", "Phase 8.3 validator is registered");

for (const path of [
  "app/viewer/page.tsx", "app/viewer/requests/page.tsx", "app/viewer/requests/[id]/page.tsx",
  "app/viewer/journeys/page.tsx", "app/viewer/account/page.tsx", "app/viewer/operator-application/page.tsx",
  "app/operator/page.tsx", "app/operator/requests/page.tsx", "app/operator/requests/[id]/page.tsx",
  "app/operator/journeys/page.tsx", "app/operator/offerings/page.tsx", "app/operator/account/page.tsx",
  "app/safety-support/page.tsx", "app/account-deactivated/page.tsx",
]) check(existsSync(path), `primary route remains present: ${path}`);

includes(matrix, ["IA-01 — Explorer Home route is unresolved", "Current baseline has four destinations; decision required"], "Explorer IA remains unresolved");
includes(read("app/operator/layout.tsx"), ['label: "Home"', 'label: "Requests"', 'label: "Journeys"', 'label: "Offerings"', 'label: "Account"'], "Teleporter five-destination navigation");
check((read("app/operator/layout.tsx").match(/href: "\/operator(?:\/[^\"]*)?"/g) ?? []).length === 5, "Teleporter navigation has exactly five primary destinations");
includes(primaryNavigation, ["aria-current", "pathname.startsWith", "grid-cols-5", "min-w-0", "current page"], "navigation accessibility and subordinate activation");

check(rootLayout.includes('<div id="main-content" tabIndex={-1}') && !rootLayout.includes('<main id="main-content"'), "root skip target does not create a nested main landmark");
for (const path of ["app/page.tsx", "app/viewer/page.tsx", "app/operator/page.tsx", "app/sign-in/[[...sign-in]]/page.tsx", "app/sign-up/[[...sign-up]]/page.tsx"]) {
  check(read(path).includes("<main"), `page-level main ownership: ${path}`);
  check(read(path).includes("<h1") || read(path).includes("<PageHeader"), `page-level heading ownership: ${path}`);
}
includes(rootLayout, ["Skip to main content", 'href="#main-content"'], "skip-link ownership");
includes(globals, [":focus-visible", "ring-2", ".unfar-skip-link", "overflow-x-hidden"], "shared focus and overflow styles");

includes(primitives, ["htmlFor={id}", "aria-describedby", 'role="alert"'], "shared labeled field and error semantics");
includes(viewer, ["<fieldset>", "<legend", "sm:grid-cols-2"], "Explorer form grouping and responsive collapse");
check(["components/explorer/DiscoveryCard.tsx", "components/explorer/ExplorerJourneys.tsx", "components/JourneyRequestDetail.tsx"].some((path) => read(path).includes("break-words")), "Explorer cards retain long-content wrapping");
includes(operator, ["<fieldset", "<legend", "aria-busy", "min-w-0", "break-words", 'role="status"', 'role="alert"'], "Teleporter form, status, and overflow semantics");
for (const [source, label] of [[requestManager, "Request"], [proposalManager, "Proposal"], [rescheduling, "rescheduling"], [liveMoments, "Live Moment"], [guidedExperiences, "Guided Experience"]]) {
  check(source.includes("<label") || source.includes("<Field"), `${label} forms retain explicit labels`);
  check(source.includes("disabled=") || source.includes("aria-busy"), `${label} duplicate submission protection remains represented`);
}

includes(safetyDialog, ['role="dialog"', 'aria-modal="true"', "aria-labelledby", "aria-describedby", "cycleDialogFocus", 'event.key === "Escape"', "trigger.current?.focus()", "max-h-[90dvh]", "overflow-y-auto"], "Safety dialog accessibility");
includes(videoRoom, ['role="dialog"', 'aria-modal="true"', "aria-labelledby", "autoFocus", "cycleDialogFocus", 'event.key !== "Tab"', 'event.key === "Escape"', "triggerRef.current?.focus()", "max-h-[calc(100dvh-2rem)]", "overflow-y-auto"], "End Journey dialog accessibility and bounded reflow");
includes(videoRoom, ["h-[100dvh]", "env(safe-area-inset-top)", "env(safe-area-inset-bottom)", "max-h-[70dvh]", "min-w-0", "break-words", "min-h-11", "min-w-11"], "live-operation responsive and touch protections");
const timerSource = videoRoom.slice(videoRoom.indexOf("function VisitTimer"), videoRoom.indexOf("function connectionLabel"));
check(!timerSource.includes("aria-live") && timerSource.includes("aria-label"), "Journey timer is labeled but not a one-second live region");
check(!/offerSeconds[\s\S]{0,180}aria-live/.test(operator), "offer countdown is not a one-second live region");
includes(videoRoom, ['role="status"', 'role={connectionError ? "alert" : "status"}', 'aria-live="polite"'], "live-operation status semantics");

includes(matrix, ["Passed — browser", "Passed — source inspection", "Blocked — authentication", "Blocked — assistive technology unavailable", "Blocked — physical device unavailable", "Manual test required"], "matrix evidence classifications");
includes(report, ["Passed — browser", "Passed — source inspection", "Blocked — authentication", "Blocked — assistive technology unavailable", "Blocked — physical device unavailable", "Manual test required", "No screen-reader passage is claimed", "Protected-route passage is not claimed"], "report evidence integrity");
check(!report.includes("Passed — screen reader"), "report does not claim unexecuted screen-reader passage");
check(!report.includes("Passed — keyboard"), "report does not claim unexecuted keyboard passage");

const git = (args) => execFileSync("git", ["-c", `safe.directory=${process.cwd().replaceAll("\\", "/")}`, ...args], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
const changed = git(["status", "--porcelain"]).split(/\r?\n/).filter(Boolean).map((line) => line.slice(3).replaceAll("\\", "/"));
const scoped = changed.filter((path) => path !== "reference-materials/");
check(scoped.every((path) => /^(?:app\/(?:layout|page|account-deactivated\/page|sign-in\/\[\[\.\.\.sign-in\]\]\/page|sign-up\/\[\[\.\.\.sign-up\]\]\/page)\.tsx|components\/VideoRoom\.tsx|docs\/phase8-|scripts\/validate-phase8c|package\.json$)/.test(path)), "changes remain in narrow Phase 8.3 scope");
for (const path of scoped) check(!/^(?:app\/api\/|prisma\/|middleware\.ts$|lib\/|package-lock\.json$)/.test(path), `no API, schema, auth, authority, or dependency lock change: ${path}`);
check(git(["diff", "--", "reference-materials"]).trim() === "", "reference-materials remains untouched");
const diff = git(["diff", "--", ".", ":(exclude)reference-materials"]);
for (const marker of ["LiveKitRoom", "/api/", "prisma", "middleware", "localStorage", "new endpoint"]) {
  if (marker === "LiveKitRoom") check(!diff.includes("-    <LiveKitRoom") && !diff.includes("+    <LiveKitRoom"), "LiveKit behavior ownership is unchanged");
  else check(!diff.toLowerCase().includes(`+${marker}`.toLowerCase()), `no forbidden product or authority addition: ${marker}`);
}

console.log("STATUS Phase 8.3: Public responsive browser validation complete; protected, keyboard, screen-reader, zoom, and physical-device execution remain honestly blocked or manual.");
console.log(`PASS Phase 8.3 responsive, accessibility, evidence-integrity, and scope validation: ${passed}/${passed}`);
