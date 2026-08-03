import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const read=path=>readFileSync(path,"utf8");
const page=read("app/viewer/requests/page.tsx"),layout=read("app/viewer/layout.tsx"),manager=read("components/JourneyRequestManager.tsx"),detail=read("components/JourneyRequestDetail.tsx"),proposals=read("components/ReceivedProposals.tsx"),agreement=read("components/AgreementConfirmation.tsx"),reschedule=read("components/JourneyReschedulingPanel.tsx");
const presentation=`${manager}\n${detail}\n${proposals}\n${agreement}`;
let count=0;const check=(value,message)=>{assert.ok(value,message);count+=1};

check(page.includes("JourneyRequestManager"),"Requests route composes manager");
check(layout.includes("requireExplorerPage")&&/href:\s*"\/viewer\/requests"/.test(layout),"Requests protected by Explorer layout");
for(const token of ["PageHeader","AccountSafetyRestrictionNotice","Action and coordination","Confirmed scheduled Journeys","Past coordination"] )check(manager.includes(token),`Requests hierarchy: ${token}`);
for(const token of ["expandedId","aria-expanded","aria-controls","expanded&&","JourneyRequestDetail","ReceivedProposals"])check(manager.includes(token),`Single coordination disclosure: ${token}`);
check(manager.includes("setExpandedId(current=>current===id?null:id)"),"Only one Request expands at a time");

for(const token of ["publicPlaceName","coarseLocation","privateMeetingDetails","earliestStart","latestStart","expiresAt","durationMinutes","proposedPriceMinor","currency",'fetch("/api/journey-requests"','method:"POST"',"Review Request details","Create Journey Request"])check(manager.includes(token),`Request creation contract: ${token}`);
for(const token of ["/proposals","/accept","/decline","ACTIVE","ACCEPTED","Awaiting a Proposal","Proposal action could not be completed","Confirm decline"])check(proposals.includes(token),`Proposal behavior: ${token}`);
for(const token of ["/agreement","Agreement confirmed","Confirmed scheduled Journey","agreedStartAt","agreedEarliestStart","agreedLatestStart","JourneyReschedulingPanel","Portal access"])check(agreement.includes(token),`Agreement/schedule behavior: ${token}`);
for(const token of ["/withdraw","Confirm withdrawal","working","Request action could not be completed"])check(detail.includes(token),`Request withdrawal behavior: ${token}`);
for(const token of ["/reschedule","/accept","/decline","/withdraw","Review proposed new time","confirmed Journey time remains unchanged","aria-live=\"polite\""])check(reschedule.includes(token),`Rescheduling behavior: ${token}`);
for(const token of ["loading","refreshing","ready","failed","No Journey Requests yet","Retry Journey Requests","read-only","could not be loaded","conflict"] )check(token==="conflict"?/(stale|conflict|no longer|could not)/i.test(presentation):presentation.toLowerCase().includes(token.toLowerCase()),`State presentation: ${token}`);

for(const prohibited of [/rating/i,/queue position/i,/acceptance likelihood/i,/response estimate/i,/party size/i,/recurrence/i,/checkout/i,/deposit/i])check(!prohibited.test(presentation),`Unsupported presentation omitted: ${prohibited}`);
for(const prohibited of ["LiveMomentDiscovery","GuidedExperienceDiscovery","ExplorerJourneys","FeedbackForm","JourneyReviewPanel","SimulatedTipPanel","ProfileSettings"])check(!manager.includes(prohibited),`Out-of-scope surface absent: ${prohibited}`);
for(const prohibited of [/>[^<{\r\n]*\bviewer\b/i,/>[^<{\r\n]*\boperator\b/i,/>[^<{\r\n]*\btrip\b/i])check(!prohibited.test(presentation),`No user-facing legacy term: ${prohibited}`);

const status=execFileSync("git",["-c","safe.directory=C:/260 - Telepresence-as-a-service","status","--short"],{encoding:"utf8"});
for(const path of ["prisma/","app/api/","lib/","middleware.ts","app/sign-in","app/sign-up"])check(!status.split(/\r?\n/).some(line=>line.slice(3).startsWith(path)),`Prohibited scope unchanged: ${path}`);
console.log(`PASS Phase 7B.4 Request coordination, disclosure, lifecycle wiring, state presentation, terminology, and scope validation: ${count}/${count}`);
