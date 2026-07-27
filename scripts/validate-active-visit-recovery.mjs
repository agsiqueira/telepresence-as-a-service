import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const operator = readFileSync("app/operator/page.tsx", "utf8");
const viewer = readFileSync("app/viewer/page.tsx", "utf8");
const current = readFileSync("app/api/trips/current/route.ts", "utf8");
const room = readFileSync("components/VideoRoom.tsx", "utf8");

// These are structural assertions; authenticated browser execution still requires Clerk and LiveKit.
assert.match(current, /operatorId: user\.id/);
assert.match(current, /TripStatus\.ACCEPTED, TripStatus\.IN_PROGRESS/);
assert.match(operator, /if \(data\.trip\) \{[\s\S]*setActiveTrip\(data\.trip\)/);
assert.match(operator, /if \(activeTrip\) \{\s*return <ActiveVisitPreparation/);
assert.match(operator, /Your visit is still active/);
assert.match(operator, /setMediaRetry/);
assert.doesNotMatch(operator, /if \(!startResponse\.ok\) \{[\s\S]{0,120}setActiveTrip\(null\)/);
assert.match(operator, /if \(!online \|\| activeTrip\) return/);
assert.match(operator, /!\["ACCEPTED", "IN_PROGRESS"\]\.includes/);
assert.match(operator, /setTripEnded\(true\);\s*return "stop"/);
assert.match(viewer, /trip\?\.status === "IN_PROGRESS"/);
assert.match(viewer, /Reconnecting to the live visit/);
assert.match(room, /Your visit is still active/);
assert.match(room, /Camera or microphone permission was denied/);
assert.match(room, /required camera or microphone was not found/);
assert.match(room, /media connection could not be established/);

console.log("Active-visit recovery structural assertions passed.");
