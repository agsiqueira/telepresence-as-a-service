import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const read=path=>readFileSync(path,"utf8");
const page=read("app/viewer/journeys/page.tsx"),layout=read("app/viewer/layout.tsx"),journeys=read("components/explorer/ExplorerJourneys.tsx"),feedback=read("components/FeedbackForm.tsx"),review=read("components/JourneyReviewPanel.tsx"),historyRoute=read("app/api/trips/history/route.ts"),currentRoute=read("app/api/trips/current/route.ts"),lifecycle=read("lib/trip-lifecycle.ts");
const presentation=`${journeys}\n${feedback}\n${review}`;
let count=0;const check=(value,message)=>{assert.ok(value,message);count+=1};

check(page.includes("ExplorerJourneys"),"Journeys route composes Explorer history workspace");
check(layout.includes("requireExplorerPage")&&/href:\s*"\/viewer\/journeys"/.test(layout),"Journeys protected by Explorer layout");
for(const token of ["PageHeader","AccountSafetyRestrictionNotice","Current Journey continuity","Follow-up action required","Recent Journeys","Earlier Journey history"])check(journeys.includes(token),`Journeys hierarchy: ${token}`);
for(const token of ["expandedId","aria-expanded","aria-controls","expanded&&","disclosureRefs"])check(journeys.includes(token),`One-at-a-time disclosure: ${token}`);
check(journeys.includes("setExpandedId(value=>")&&journeys.includes("value===id?null:id"),"Only one Journey expands at a time");

for(const token of ["/api/trips/history?limit=50","HistoryJourney","requestedAt","endedAt","cancelledAt","noOperatorAvailableAt","feedbackCompletedAt","ENDED","FEEDBACK_COMPLETED","CANCELLED","NO_OPERATOR_AVAILABLE"])check(journeys.includes(token),`History/lifecycle mapping: ${token}`);
check(historyRoute.includes("listViewerHistory")&&lifecycle.includes("export async function listViewerHistory"),"Server history contract remains wired");
for(const token of ["/api/trips/current","loadCurrent","Current immediate Journey","Continue on Discover","Open Requests"])check(journeys.includes(token),`Reload/current continuity: ${token}`);
check(currentRoute.includes("TripStatus.REQUESTED")&&currentRoute.includes("TripStatus.IN_PROGRESS"),"Current restoration lifecycle remains server-authoritative");

for(const token of ["<FeedbackForm embedded",'fetch("/api/feedback"',"tripId, presence, mediaQuality","/api/feedback/skip","disabled={submitting}","Unable to submit feedback","Private Feedback is available","Feedback completed"])check(presentation.includes(token),`Feedback behavior: ${token}`);
for(const token of ["JourneyReviewPanel","/api/trips/${tripId}/review","JSON.stringify({ rating, comment })","REVIEW_ALREADY_SUBMITTED","REVIEW_WINDOW_CLOSED","REVIEW_CHANGED_CONCURRENTLY","cannot be edited or withdrawn","Submit immutable review","Your review is submitted"])check(presentation.includes(token),`Review behavior: ${token}`);

for(const token of ["loading","refreshing","ready","failed","No terminal Journey history","Retry Journey history","read-only","immutable","temporarily unavailable","state changed"])check(presentation.toLowerCase().includes(token.toLowerCase()),`State presentation: ${token}`);
check(journeys.includes("terminalHistory")&&journeys.includes("coordinationOverlap"),"Non-terminal coordination is not presented as history controls");
for(const token of ["Request, Proposal, Agreement, cancellation, rescheduling, and Portal coordination is not duplicated here",'href="/viewer/requests"'])check(journeys.includes(token),`Requests boundary: ${token}`);

for(const prohibited of [/transcript/i,/recording/i,/certificate/i,/refund/i,/receipt/i,/cancellation reason/i,/outcome claim/i,/unified upcoming/i])check(!prohibited.test(journeys),`Unsupported artifact/metadata omitted: ${prohibited}`);
for(const prohibited of ["ReceivedProposals","AgreementConfirmation","JourneyReschedulingPanel","ProfileSettings","LiveMomentDiscovery","GuidedExperienceDiscovery","VideoRoom"])check(!journeys.includes(prohibited),`Out-of-scope controls absent: ${prohibited}`);
check(!journeys.includes("SimulatedTipPanel"),"Simulated Tip controls were not directly moved or changed");
for(const prohibited of [/>[^<{\r\n]*\bviewer\b/i,/>[^<{\r\n]*\boperator\b/i,/>[^<{\r\n]*\btrip\b/i])check(!prohibited.test(presentation),`No user-facing legacy term: ${prohibited}`);

const status=execFileSync("git",["-c","safe.directory=C:/260 - Telepresence-as-a-service","status","--short"],{encoding:"utf8"});
for(const path of ["prisma/","app/api/","lib/","middleware.ts","app/sign-in","app/sign-up","components/SimulatedTipPanel.tsx"])check(!status.split(/\r?\n/).some(line=>line.slice(3).startsWith(path)),`Prohibited scope unchanged: ${path}`);
console.log(`PASS Phase 7B.5 Journey history, disclosure, lifecycle, Feedback, Review, restoration, boundaries, terminology, and scope validation: ${count}/${count}`);
