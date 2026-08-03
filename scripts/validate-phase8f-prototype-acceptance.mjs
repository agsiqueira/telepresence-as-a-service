import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const read = path => readFileSync(path, "utf8");
const gitRaw = (...args) => execFileSync("git", ["-c", "safe.directory=C:/260 - Telepresence-as-a-service", ...args], { encoding: "utf8" });
const git = (...args) => gitRaw(...args).trim();
let passed = 0;
const check = (condition, message) => { assert.ok(condition, message); passed += 1; };
const includes = (source, values, label) => { for (const value of values) check(source.includes(value), `${label}: ${value}`); };

const report = read("docs/phase8-prototype-acceptance-report.md");
const checklist = read("docs/prototype-demo-readiness-checklist.md");
const matrix = read("docs/phase8-integrated-test-matrix.md");
const pkg = JSON.parse(read("package.json"));
const headPkg = JSON.parse(git("show", "HEAD:package.json"));

for (const artifact of [
  "docs/phase8-integrated-test-matrix.md",
  "docs/phase8-authenticated-lifecycle-report.md",
  "docs/phase8-responsive-accessibility-report.md",
  "docs/phase8-failure-concurrency-report.md",
  "docs/phase8-livekit-device-report.md",
  "scripts/validate-phase8a-integrated-experience.mjs",
  "scripts/validate-phase8b-authenticated-lifecycle.mjs",
  "scripts/validate-phase8c-responsive-accessibility.mjs",
  "scripts/validate-phase8d-failure-concurrency.mjs",
  "scripts/validate-phase8e-livekit-device.mjs",
]) check(read(artifact).length > 0, `Phase 8.1–8.5 artifact remains present: ${artifact}`);

check(report.length > 0, "Phase 8.6 acceptance report exists");
check(checklist.length > 0, "prototype demo-readiness checklist exists");
check(pkg.scripts["test:phase8f"] === "node scripts/validate-phase8f-prototype-acceptance.mjs", "Phase 8.6 validator is registered");
for (const key of ["test:phase8a", "test:phase8b", "test:phase8c", "test:phase8d", "test:phase8e", "test:phase7c7", "test:viewer-runtime", "test:access-state", "test:camera-switching"]) check(Boolean(pkg.scripts[key]), `authoritative validator remains registered: ${key}`);

const outcomes = [
  "Accepted as a functional prototype with documented waivers",
  "Conditionally accepted pending paired-device LiveKit validation",
  "Not yet accepted",
];
check(report.includes("## 20. Acceptance decision"), "acceptance decision section exists");
check(outcomes.filter(outcome => report.includes(`\`${outcome}\``)).length === 1, "report selects exactly one approved acceptance outcome");
check(report.includes("`Conditionally accepted pending paired-device LiveKit validation`"), "decision matches remaining paired-device risk");
includes(report, ["real paired device", "authenticated browser", "guarded database", "automated behavioral", "public browser", "source inspection", "blocked/manual"], "decision rationale preserves evidence hierarchy");
includes(report, ["No token, room join", "no real paired/device evidence", "No lower level was promoted"], "blocked LiveKit evidence is not promoted");
check(!/Passed[^\n]*(?:real paired|paired LiveKit|physical (?:mobile|camera)|remote media)/i.test(report), "no blocked real-time scenario is described as passed");
check(!/authenticated (?:Explorer|Teleporter|protected)[^\n]*(?:passed|complete)/i.test(report), "authenticated protected passage is not falsely claimed");
check(report.includes("Screen reader | Blocked") && !/screen.reader[^\n]*(?:passed|certified)/i.test(report), "screen-reader passage is not falsely claimed");
check(!/(?:is|are|accepted as) production[- ]ready|production[- ]ready:\s*(?:yes|true)|production readiness (?:is )?approved/i.test(report + checklist), "production readiness is not claimed");

includes(report, ["Explorer Teleporter-application terminology inconsistencies", "Public main-landmark ownership", "End Journey dialog focus containment"], "known fixed defects are documented");
check(report.includes("stale historical guard conflicts, not product defects"), "historical validator conflicts are distinguished from product defects");
check(report.includes("No confirmed critical, high, medium, or low application defect remains open"), "open-defect status is explicit");
check(report.includes("Blocked validation is recorded as risk, not invented as a defect"), "blocked evidence is not assigned an invented severity");

for (const waiver of ["AUTH-W01", "A11Y-W01", "RESP-W01", "LIVE-W01", "LIVE-W02", "LIVE-W03", "LIVE-W04", "LIVE-W05", "IA-W01"]) {
  check(report.includes(`| \`${waiver}\` |`), `waiver table includes ${waiver}`);
  check(matrix.includes(`\`${waiver}\``), `matrix references ${waiver}`);
  check(checklist.includes(`\`${waiver}\``), `demo checklist references ${waiver}`);
}
includes(report, ["| Waiver | Scope | Rationale | Risk | Mitigation | Closure condition | Demo | Pilot |", "Waivers document evidence gaps; none hides a confirmed defect"], "waiver governance is complete");
check(report.includes("conditionally demo-ready") && report.includes("Not pilot-ready"), "demo readiness and pilot readiness are distinct");
check(checklist.includes("Demo-ready:") && checklist.includes("Pilot-ready:") && checklist.includes("Production-ready:"), "checklist distinguishes readiness levels");
check(report.includes("## 25. Remaining Phase 9 work") && report.includes("Do not broaden it into feature development or production launch"), "prototype scope and next phase remain narrow");
check(report.includes("## 27. Phase 8 completion assessment") && report.includes("**Next step:**"), "report includes completion assessment and next step");

includes(matrix, [
  "## Phase 8.5 LiveKit and device evidence overlay",
  "| LIVE-08 | Desktop paired connection | Blocked — paired role |",
  "| LIVE-13 | Physical camera-switch success | Blocked — mobile device unavailable |",
  "| LIVE-16 | Reconnection success | Blocked — network tooling unavailable |",
  "| LIVE-20 | Chat unread state over transport | Blocked — paired role |",
  "| LIVE-22 | Authoritative remote end | Blocked — paired role |",
], "Phase 8.5 matrix truth remains preserved");
includes(matrix, ["## Phase 8.6 prototype-acceptance overlay", "Conditionally accepted pending paired-device LiveKit validation", "Demo readiness:", "Pilot readiness:", "Required closure evidence:"], "Phase 8.6 matrix overlay is complete");
check(matrix.includes("IA-01") && matrix.includes("IA-W01") && matrix.includes("remains unresolved"), "Explorer IA-01 remains unresolved");

const protectedChanges = git("diff", "--name-only", "HEAD", "--", "app", "components", "lib", "prisma", "middleware.ts", "package-lock.json");
check(protectedChanges === "", `Phase 7 routes and application/API/service/schema/auth files remain unchanged: ${protectedChanges}`);
check(JSON.stringify(pkg.dependencies) === JSON.stringify(headPkg.dependencies) && JSON.stringify(pkg.devDependencies) === JSON.stringify(headPkg.devDependencies), "no dependency is added or changed");
const packageDelta = git("diff", "--unified=0", "HEAD", "--", "package.json");
check(packageDelta.includes("test:phase8f") && !/[+-]\s+\"(?:dependencies|devDependencies)\"/.test(packageDelta), "package change is limited to validator registration");

const changed = gitRaw("status", "--porcelain=v1", "-z", "--untracked-files=all").split("\0").filter(Boolean);
const pathOf = line => line.slice(3).replaceAll("\\", "/");
const relevant = changed.filter(line => !pathOf(line).startsWith("reference-materials/"));
const allowed = new Set([
  "package.json",
  "docs/phase8-integrated-test-matrix.md",
  "docs/phase8-prototype-acceptance-report.md",
  "docs/prototype-demo-readiness-checklist.md",
  "scripts/validate-phase8f-prototype-acceptance.mjs",
]);
check(relevant.every(line => allowed.has(pathOf(line))), `Phase 8.6 changes remain documentation/validation-only: ${relevant.join(", ")}`);
check(changed.some(line => pathOf(line).startsWith("reference-materials/")), "excluded reference-materials remains untracked and untouched");

for (const secretMarker of ["LIVEKIT_API_SECRET=", "LIVEKIT_API_KEY=", "DATABASE_URL=", "CLERK_SECRET_KEY=", "__session="]) {
  check(!(report + checklist + matrix).includes(secretMarker), `reports do not expose secret marker: ${secretMarker}`);
}
check(report.toLowerCase().includes("production build") && checklist.toLowerCase().includes("production build"), "production build remains a required gate");
check(report.includes("No Phase 8.6 application") && report.includes("No new route or navigation destination"), "no feature or route expansion is claimed");
check(!/Outcome A[^\n]*(?:selected|decision|accepted)/i.test(report), "Outcome A is not implied while LiveKit remains blocked");

console.log(`Phase 8.6 prototype acceptance validation passed: ${passed}/${passed}`);
console.log("Acceptance is evidence-based and is not inferred merely from passing scripts.");
