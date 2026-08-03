import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const read = path => readFileSync(path, "utf8");
const layout = read("app/viewer/layout.tsx");
const discover = read("app/viewer/page.tsx");
const journeys = read("components/explorer/ExplorerJourneys.tsx");
const account = read("app/viewer/account/page.tsx");
const navigation = read("components/ui/PrimaryNavigation.tsx");

for (const [label, href] of [["Discover", "/viewer"], ["Journeys", "/viewer/journeys"], ["Requests", "/viewer/requests"], ["Account", "/viewer/account"]]) {
  assert.ok(layout.includes(`label:"${label}",href:"${href}"`), `${label} navigation item`);
}
assert.match(layout, /persistentMobileNavigation/);
assert.match(navigation, /fixed inset-x-0 bottom-0/);
assert.match(navigation, /grid grid-cols-4/);
assert.match(navigation, /aria-current=\{active \? "page"/);
assert.ok(existsSync("app/viewer/journeys/page.tsx"));
assert.ok(existsSync("app/viewer/account/page.tsx"));

assert.doesNotMatch(discover, /ProfileSettings|JourneyReviewPanel|SimulatedTipPanel|Journey history|trips\/history/);
assert.match(account, /ProfileSettings/);
assert.match(account, /\/safety-support/);
assert.match(account, /\/viewer\/operator-application/);
assert.match(journeys, /Journey history/);
assert.match(journeys, /FeedbackForm/);
assert.match(journeys, /JourneyReviewPanel/);
assert.match(journeys, /SafetyReportDialog/);
assert.match(read("components/JourneyReviewPanel.tsx"), /SimulatedTipPanel/);
assert.match(journeys, /expandedId === item\.id/);
assert.match(journeys, /aria-expanded=\{expanded\}/);
assert.match(journeys, /expanded && <div id=\{panelId\}/);

const status = execFileSync("git", ["-c", `safe.directory=${process.cwd().replaceAll("\\", "/")}`, "status", "--porcelain"], { encoding: "utf8" });
const changed = status.split(/\r?\n/).filter(Boolean).map(line => line.slice(3).replaceAll("\\", "/")).filter(path => path !== "reference-materials/");
for (const path of changed) {
  assert.doesNotMatch(path, /^(?:prisma\/|app\/api\/|lib\/(?!explorer-presentation\.ts$))/, `prohibited Phase 7B.2 file changed: ${path}`);
}

for (const source of [layout, discover, journeys, account]) {
  assert.doesNotMatch(source, />[^<{]*(?:operator|visit)[^<{]*</i, "legacy Explorer-facing label");
}

console.log("PASS Phase 7B.2 Explorer routes, navigation, separation, disclosure, policy-component reuse, and scope validation: 32/32");
