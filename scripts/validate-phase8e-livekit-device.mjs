import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const read = path => readFileSync(path, "utf8");
let passed = 0;
const check = (condition, message) => { assert.ok(condition, message); passed += 1; };
const includes = (source, values, label) => {
  for (const value of values) check(source.includes(value), `${label}: ${value}`);
};
const gitRaw = (...args) => execFileSync("git", ["-c", "safe.directory=C:/260 - Telepresence-as-a-service", ...args], { encoding: "utf8" });
const git = (...args) => gitRaw(...args).trim();

const pkg = JSON.parse(read("package.json"));
const headPkg = JSON.parse(git("show", "HEAD:package.json"));
const report = read("docs/phase8-livekit-device-report.md");
const matrix = read("docs/phase8-integrated-test-matrix.md");
const room = read("components/VideoRoom.tsx");
const viewer = read("app/viewer/page.tsx");
const operator = read("app/operator/page.tsx");
const token = read("app/api/livekit-token/route.ts");
const livekit = read("lib/livekit.ts");
const camera = read("lib/camera-switch.ts");

check(pkg.scripts["test:phase8e"] === "node scripts/validate-phase8e-livekit-device.mjs", "Phase 8.5 package script is registered");
for (const artifact of [
  "docs/phase8-integrated-test-matrix.md",
  "scripts/validate-phase8a-integrated-experience.mjs",
  "docs/phase8-authenticated-lifecycle-report.md",
  "scripts/validate-phase8b-authenticated-lifecycle.mjs",
  "docs/phase8-responsive-accessibility-report.md",
  "scripts/validate-phase8c-responsive-accessibility.mjs",
  "docs/phase8-failure-concurrency-report.md",
  "scripts/validate-phase8d-failure-concurrency.mjs",
]) check(read(artifact).length > 0, `prior Phase 8 artifact remains present: ${artifact}`);

check(viewer.includes("<VideoRoom") && operator.includes("<VideoRoom"), "Explorer and Teleporter still share VideoRoom");
includes(viewer, ["canPublishCamera={false}", "canPublishMicrophone"], "Explorer media call-site contract");
check(operator.includes("canPublishCamera canPublishMicrophone"), "Teleporter media call-site contract");
includes(token, ["authorizeApiUser", "TripStatus.ACCEPTED", "TripStatus.IN_PROGRESS", "TrackSource.CAMERA", "TrackSource.MICROPHONE"], "authorized LiveKit token contract");
includes(livekit, ["roomJoin: true", "canSubscribe: true", "canPublishData: true", "canPublishSources"], "server-side LiveKit grant contract");
includes(operator, ["/api/trips/current?as=teleporter", "/start`,", "fetch(\"/api/livekit-token\"", "/end`", "createResilientPoller"], "Teleporter lifecycle ownership");
includes(viewer, ["/api/trips/current", "fetch(\"/api/livekit-token\"", "/end`,", "createResilientPoller"], "Explorer lifecycle ownership");
includes(room, ["useConnectionState", "ConnectionState.Reconnecting", "ConnectionState.Disconnected"], "LiveKit connection authority");
check(!/reconnectAttempts|new Room\(|setTimeout\([^)]*reconnect/i.test(room), "custom reconnection state machine remains absent");
includes(room, ["TrackToggle", "Track.Source.Camera", "Track.Source.Microphone"], "LiveKit media controls");
includes(room, ["shouldOfferCameraSwitch", "replacePublishedCameraSource", "runExclusiveCameraSwitch", "inferCurrentFacing"], "camera switching ownership");
check(camera.includes("oldTrack") || room.includes("current camera will remain in use"), "camera switch failure preserves current camera contract");
includes(room, ["useChat()", "unreadCount", "draft.trim()", "isSending"], "LiveKit chat ownership and duplicate protection");
includes(room, ["acceptedAt", "Date.now()", "elapsed"], "accepted-time timer ownership");
includes(room, ["End this Journey?", "Keep Journey active", "triggerRef.current?.focus"], "end confirmation and focus restoration");
includes(operator, ["endRequestRef", "endingRef", "teardownRef", "onAuthoritativeDisconnect={clearActiveCall}"], "authoritative Teleporter end and teardown");
check((operator.match(/SafetyReportDialog/g) ?? []).length >= 3, "Safety reporting remains available in preparation, live operation, and eligible history");
check(viewer.includes("phase === \"call\"") && viewer.includes("SafetyReportDialog"), "Explorer live Safety access remains present");
includes(room, ["100dvh", "safe-area-inset-top", "safe-area-inset-bottom", "max-h-[70dvh]", "role=\"dialog\"", "aria-modal=\"true\""], "live responsive and dialog protections");

includes(report, [
  "Validation foundation complete. Real LiveKit/device execution blocked.",
  "Blocked — paired role",
  "Blocked — mobile device unavailable",
  "Blocked — desktop device unavailable",
  "Blocked — network tooling unavailable",
  "Blocked — authentication",
  "Static props and source inspection are not evidence of a real room connection",
  "No application",
  "No credentials, tokens, cookies, database URLs",
], "report evidence integrity");
includes(report, ["Passed — paired LiveKit", "Passed — desktop device", "Passed — mobile device", "Passed — browser", "Passed — automated", "Passed — source inspection"], "report distinguishes evidence classifications without claiming execution");
for (const classification of ["Passed — paired LiveKit", "Passed — desktop device", "Passed — mobile device", "Passed — browser"]) {
  check(report.split(classification).length === 2 && report.includes("no scenario is marked"), `report lists but does not claim blocked execution: ${classification}`);
}
check(report.includes("Phase 8.6") && !/Phase 8\.6[^\n]*(?:complete|passed)/i.test(report), "Phase 8.6 completion is not claimed");
includes(matrix, ["Phase 8.5 LiveKit and device evidence overlay", "LIVE-22", "Blocked — paired role", "Blocked — mobile device unavailable", "Blocked — network tooling unavailable"], "matrix carries granular Phase 8.5 evidence");

const changed = gitRaw("status", "--porcelain=v1", "-z", "--untracked-files=all").split("\0").filter(Boolean);
const pathOf = line => line.slice(3).replaceAll("\\", "/");
const relevant = changed.filter(line => !pathOf(line).startsWith("reference-materials/"));
const allowed = new Set([
  "package.json",
  "docs/phase8-integrated-test-matrix.md",
  "docs/phase8-livekit-device-report.md",
  "scripts/validate-phase8e-livekit-device.mjs",
]);
check(relevant.every(line => allowed.has(pathOf(line))), `Phase 8.5 changes remain narrow: ${relevant.join(", ")}`);
const protectedChanges = git("diff", "--name-only", "HEAD", "--", "app", "components", "lib", "prisma", "middleware.ts", "package-lock.json");
check(protectedChanges === "", `application, API, service, schema, middleware, and dependency lock remain unchanged: ${protectedChanges}`);
check(JSON.stringify(pkg.dependencies) === JSON.stringify(headPkg.dependencies) && JSON.stringify(pkg.devDependencies) === JSON.stringify(headPkg.devDependencies), "no dependency is added or changed");
for (const feature of ["screen sharing", "recording", "picture-in-picture", "virtual background", "background blur", "device selector", "attachment", "typing indicator", "read receipt", "live caption", "translation"]) {
  check(!room.toLowerCase().includes(feature), `unsupported media/chat feature remains absent: ${feature}`);
}
check(changed.some(line => pathOf(line).startsWith("reference-materials/")), "excluded reference-materials remains untracked and untouched");
check(!report.includes("Static props prove") && !matrix.includes("Static props prove"), "static presentation is never represented as connection proof");

console.log(`Phase 8.5 LiveKit/device validation foundation passed: ${passed}/${passed}`);
console.log("Real paired-room, desktop-browser, and physical-mobile execution remains blocked and is not inferred by this validator.");
