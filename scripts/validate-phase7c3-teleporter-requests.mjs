import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(path, "utf8");
let passed = 0;
const check = (condition, label) => { assert.ok(condition, label); passed += 1; };

const listPage = read("app/operator/requests/page.tsx");
const detailPage = read("app/operator/requests/[id]/page.tsx");
const discovery = read("components/JourneyRequestDiscovery.tsx");
const proposal = read("components/ProposalManager.tsx");
const legacyList = read("app/operator/opportunities/page.tsx");
const legacyDetail = read("app/operator/opportunities/[id]/page.tsx");
const operatorLayout = read("app/operator/layout.tsx");
const home = read("app/operator/page.tsx");
const adminPage = read("app/admin/journey-requests/page.tsx");
const packageJson = read("package.json");
const presentation = [listPage, detailPage, discovery, proposal].join("\n");

check(listPage.includes("JourneyRequestDiscovery"), "canonical Requests list retains discovery owner");
check(detailPage.includes("ProposalManager"), "canonical Request detail retains Proposal owner");
check(legacyList.includes('redirect("/operator/requests")'), "legacy opportunities list redirects");
check(legacyDetail.includes("`/operator/requests/${params.id}`"), "legacy opportunity detail redirects");
check(discovery.includes('title="Requests"') && !discovery.includes('title="Open Journey Requests"'), "Teleporter h1 is Requests");
check(discovery.includes('eyebrow="Teleporter"'), "Requests eyebrow is Teleporter");
check(discovery.includes('fetch(admin ? "/api/admin/journey-requests" : "/api/operator/journey-requests"'), "existing discovery endpoints retained");
check(!/setInterval|setTimeout/.test(discovery), "automatic Request polling absent");
for (const field of ["publicPlaceName", "coarseLocation", "earliestStart", "latestStart", "durationMinutes", "proposedPriceMinor", "currency", "status"]) check(discovery.includes(field), `discovery renders ${field}`);
check(!/privateMeetingDetails|explorerId|clerkId|contact/i.test(discovery), "private Request details excluded");
check(discovery.includes('href={`/operator/requests/${request.id}`}'), "cards link to canonical detail URL");
check(discovery.includes("AdminDiscovery") && discovery.includes("if (admin)"), "Administrator presentation remains separate");
check(adminPage.includes("JourneyRequestDiscovery admin"), "Administrator remains read-only discovery consumer");
check(!discovery.match(/admin[\s\S]{0,300}Review and propose/), "Administrator mode does not gain Proposal action");
for (const endpoint of ['fetch("/api/operator/journey-requests"', 'fetch(`/api/operator/journey-requests/${requestId}/proposals`']) check(proposal.includes(endpoint), `detail load retained: ${endpoint}`);
for (const field of ["publicPlaceName", "coarseLocation", "earliestStart", "latestStart", "durationMinutes", "proposedPriceMinor", "currency", "expiresAt"]) check(proposal.includes(field), `Request summary retains ${field}`);
for (const label of ["Earliest proposed start", "Latest proposed start", "Duration", "Price in minor units", "Currency", "Valid until"]) check(proposal.includes(label), `Proposal form retains ${label}`);
check(proposal.includes("getTimezoneOffset") && proposal.includes("toISOString().slice(0, 16)"), "existing local datetime conversion retained");
check(proposal.includes("active ? `/api/operator/proposals/${active.id}/revise` : `/api/operator/journey-requests/${requestId}/proposals`"), "create-versus-revise endpoint selection retained");
check(proposal.includes('method: "POST"'), "Proposal mutations remain server-backed");
check(proposal.includes('`/api/operator/proposals/${active.id}/withdraw`'), "withdrawal endpoint retained");
check(proposal.includes("pendingAction") && proposal.includes("if (pendingAction) return") && proposal.includes("disabled={pendingAction !== null}"), "duplicate mutation protection present");
check(proposal.includes('status === "ACTIVE"') && proposal.includes("proposals.find"), "active Proposal detection retained");
check(proposal.includes("new immutable version") && proposal.includes("Proposal history"), "immutable version behavior is explained");
check(proposal.includes("This Journey Request is no longer available.") && proposal.includes('href="/operator/requests"'), "unavailable state returns to Requests");
check(proposal.includes('role="status"') && proposal.includes('role="alert"'), "status and error live regions are distinct");
check(discovery.includes('role="status"') && discovery.includes('role="alert"'), "discovery loading and failure semantics present");
check(presentation.includes("sm:grid-cols-2") && presentation.includes("flex-col") && presentation.includes("break-words") && presentation.includes("min-w-0"), "responsive wrapping and form collapse markers present");
check(operatorLayout.includes('{ label: "Home"') && operatorLayout.includes('{ label: "Requests"') && operatorLayout.includes('{ label: "Journeys"') && operatorLayout.includes('{ label: "Offerings"') && operatorLayout.includes('{ label: "Account"'), "Phase 7C.1 navigation remains unchanged");
check(home.includes('title="Home"') && home.includes("AvailabilityCard"), "Phase 7C.2 Home remains unchanged");
check(packageJson.includes('"test:phase7c3": "node scripts/validate-phase7c3-teleporter-requests.mjs"'), "Phase 7C.3 package script registered");

for (const prohibited of ["AgreementConfirmation", "TeleporterAgreements", "payment", "rating", "Tip", "notification", "Map integration", "negotiation chat", "Request filtering", "Request sorting", "Request search", "pagination", "localStorage"]) check(!presentation.toLowerCase().includes(prohibited.toLowerCase()), `unsupported behavior absent: ${prohibited}`);

console.log(`PASS Phase 7C.3 Teleporter Requests hierarchy, privacy, Proposal lifecycle, accessibility, and scope validation: ${passed}/${passed}`);
