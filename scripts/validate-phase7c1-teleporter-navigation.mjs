import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const read = path => readFileSync(path, "utf8");
const layout = read("app/operator/layout.tsx");
const navigation = read("components/ui/PrimaryNavigation.tsx");
const explorerLayout = read("app/viewer/layout.tsx");
const requestList = read("app/operator/requests/page.tsx");
const requestDetail = read("app/operator/requests/[id]/page.tsx");
const legacyList = read("app/operator/opportunities/page.tsx");
const legacyDetail = read("app/operator/opportunities/[id]/page.tsx");
const discovery = read("components/JourneyRequestDiscovery.tsx");
let count = 0;
const check = (condition, message) => { assert.ok(condition, message); count += 1; };

const destinations = [
  ["Home", "/operator"],
  ["Requests", "/operator/requests"],
  ["Journeys", "/operator/journeys"],
  ["Offerings", "/operator/offerings"],
  ["Account", "/operator/account"],
];
for (const [label, href] of destinations) check(layout.includes(`label: "${label}", href: "${href}"`), `${label} primary destination`);
const primaryItems = layout.slice(layout.indexOf("const items = ["), layout.indexOf("];", layout.indexOf("const items = [")));
check((primaryItems.match(/label: "/g) ?? []).length === 5, "exactly five primary Teleporter destinations");
check(!/label:\s*"(?:Explore|Teleport|Opportunities)"/.test(layout), "no legacy primary destination");
check(layout.includes("requireTeleporterPage"), "Teleporter route authorization remains in the server layout");
check(layout.includes("persistentMobileNavigation"), "persistent mobile Teleporter navigation");
check(layout.includes('navigationLabel="Teleporter primary navigation"'), "accessible Teleporter navigation label");
check(layout.includes('secondaryLink={{ label: "Open Explorer", href: "/viewer" }}'), "Explorer context remains a secondary authorized link");
check(navigation.includes("items.length === 5") && navigation.includes("grid-cols-5"), "mobile navigation supports five aligned destinations");
check(navigation.includes('aria-current={active ? "page"'), "current-page state remains semantic");
check(navigation.includes('pathname.startsWith(`${item.href}/`)'), "subordinate routes inherit active state");

for (const path of ["app/operator/requests/page.tsx", "app/operator/requests/[id]/page.tsx", "app/operator/journeys/page.tsx", "app/operator/offerings/page.tsx", "app/operator/account/page.tsx"]) check(existsSync(path), `route exists: ${path}`);
check(requestList.includes("JourneyRequestDiscovery"), "Requests preserves scheduled-demand discovery");
check(requestDetail.includes("ProposalManager"), "Request detail preserves Proposal behavior");
check(discovery.includes("/operator/requests/${request.id}"), "Request links use the canonical route");
check(legacyList.includes('redirect("/operator/requests")'), "legacy Request list redirects compatibly");
check(legacyDetail.includes("redirect(`/operator/requests/${params.id}`)"), "legacy Request detail redirects compatibly");
check(read("app/operator/offerings/page.tsx").includes("LiveMomentManager") && read("app/operator/offerings/page.tsx").includes("GuidedExperienceManager"), "Offerings reuses authoritative managers");
check(read("app/operator/journeys/page.tsx").includes("TeleporterAgreements"), "Journeys reuses authoritative Agreement behavior");
check(read("app/operator/account/page.tsx").includes('ProfileSettings role="operator"'), "Account reuses authoritative Teleporter profile");

for (const [label, href] of [["Discover", "/viewer"], ["Journeys", "/viewer/journeys"], ["Requests", "/viewer/requests"], ["Account", "/viewer/account"]]) check(explorerLayout.includes(`label:"${label}",href:"${href}"`), `Explorer navigation preserved: ${label}`);

const status = execFileSync("git", ["-c", "safe.directory=C:/260 - Telepresence-as-a-service", "status", "--short"], { encoding: "utf8" });
const changed = status.split(/\r?\n/).filter(Boolean).map(line => line.slice(3).replaceAll("\\", "/"));
for (const path of changed) {
  if (path === "reference-materials/") continue;
  check(!/^(?:prisma\/|app\/api\/|lib\/|middleware\.ts$)/.test(path), `server authority unchanged: ${path}`);
}
check(!changed.some(path => path.startsWith("reference-materials/") && path !== "reference-materials/"), "reference materials remain untouched");

console.log(`PASS Phase 7C.1 Teleporter navigation, route ownership, compatibility, shared navigation, and scope validation: ${count}/${count}`);
