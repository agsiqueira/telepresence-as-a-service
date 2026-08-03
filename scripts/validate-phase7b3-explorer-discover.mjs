import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const read = path => readFileSync(path, "utf8");
const discover = read("app/viewer/page.tsx");
const live = read("components/LiveMomentDiscovery.tsx");
const guided = read("components/GuidedExperienceDiscovery.tsx");
const card = read("components/explorer/DiscoveryCard.tsx");
const presentation = `${discover}\n${live}\n${guided}\n${card}`;
let count = 0;
const check = (condition, message) => { assert.ok(condition, message); count += 1; };

const hierarchy = ['<PageHeader title="Discover"', 'restorationState === "loading"', "<LiveMomentDiscovery", "<GuidedExperienceDiscovery", "Explore destinations"];
let position = -1;
for (const token of hierarchy) { const next = discover.indexOf(token); check(next > position, `Discover hierarchy: ${token}`); position = next; }

for (const token of ["/api/trips/current", 'type Phase = "browse" | "review" | "waiting" | "call" | "feedback"', 'setPhase("review")', 'fetch("/api/trips"', 'setPhase("waiting")', "createResilientPoller", "intervalMs: 2500", "intervalMs: 1000", "/api/livekit-token", "VideoRoom", "FeedbackForm", "/cancel", "/retry"])
  check(discover.includes(token), `Immediate Journey continuity: ${token}`);
check(/onClick=\{\(\) => chooseDestination\(destination\)\}/.test(discover), "Destination card selects without submitting");
check(/onClick=\{enterReview\}/.test(discover) && /if \(phase === "review"/.test(discover), "Selected details enter a distinct review state");
check(/if \(phase === "review"[\s\S]*onClick=\{requestTrip\}/.test(discover), "Submission is available from review only");

for (const token of ["loading", "ready", "failed", "No destinations available", "Retry destinations", "Current Journey could not be restored", "Retry current Journey restoration", "No compatible Teleporter", "Cancelling request…", "Journey accepted"])
  check(discover.includes(token), `Discover state: ${token}`);
for (const token of ["/api/live-moments", "/api/live-moment-claims", "/claim", "/abandon", "ten minutes", "visibilitychange", "refreshing", "Creating hold", "Hold active", "no longer available", "Retry Live Moments", "LiveRegion"])
  check(live.includes(token), `Live Moment behavior/state: ${token}`);
for (const token of ["/api/guided-experiences", "/api/guided-experience-claims", "/claim", "/abandon", "ten minutes", "refreshing", "Creating claim", "Claim active", "No longer available", "Retry Guided Experiences", "LiveRegion"])
  check(guided.includes(token), `Guided Experience behavior/state: ${token}`);

for (const token of ["DiscoveryCard", "StatusBadge", "break-words", "min-w-0"])
  check(card.includes(token), `Reusable card contract: ${token}`);
check(presentation.includes("MetadataList"), "Discovery cards use semantic metadata lists");
for (const prohibited of [/rating/i, /distance/i, /popularity/i, /recommended for you/i, /queue position/i, /estimated wait/i])
  check(!prohibited.test(`${discover}\n${live}\n${guided}\n${card}`), `Unsupported metadata: ${prohibited}`);
for (const prohibited of [/JourneyReviewPanel/, /SimulatedTipPanel/, /ProfileSettings/, /Journey history/, /AgreementConfirmation/, /ReceivedProposals/])
  check(!prohibited.test(discover), `Out-of-scope Discover control: ${prohibited}`);

for (const prohibited of [/>[^<{\r\n]*\bviewer\b/i, />[^<{\r\n]*\boperator\b/i, />[^<{\r\n]*\btrip\b/i])
  check(!prohibited.test(presentation), `Explorer-facing legacy term: ${prohibited}`);

const status = execFileSync("git", ["-c", "safe.directory=C:/260 - Telepresence-as-a-service", "status", "--short"], { encoding: "utf8" });
for (const path of ["prisma/", "app/api/", "lib/", "middleware.ts", "app/sign-in", "app/sign-up"])
  check(!status.split(/\r?\n/).some(line => line.slice(3).startsWith(path)), `Prohibited scope unchanged: ${path}`);

console.log(`PASS Phase 7B.3 Discover hierarchy, workflows, state presentation, metadata, terminology, and scope validation: ${count}/${count}`);
