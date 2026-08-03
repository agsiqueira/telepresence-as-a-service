import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(path, "utf8");
const viewer = read("app/viewer/page.tsx");
const operator = read("app/operator/page.tsx");
const services = read("lib/phase3-services.ts");
const lifecycle = read("lib/trip-lifecycle.ts");
const schema = read("prisma/schema.prisma");
const seed = read("prisma/seed.js");

assert.match(viewer, /Starting-point preference \(optional\)/);
assert.match(viewer, /Otherwise, the Teleporter will choose an appropriate starting point/);
assert.match(viewer, /placeholder="Example: Begin outside the main entrance"/);
assert.match(viewer, /Journey instructions \(optional\)/);
assert.match(viewer, /Cancel request/);
assert.doesNotMatch(viewer, /Describe where to meet|Meeting instructions|Custom public destination/);
assert.match(operator, /No starting preference provided\. Choose an appropriate place to begin the video visit\./);
assert.match(operator, /Starting-point preference/);
assert.match(operator, /Visit instructions/);
assert.doesNotMatch(operator, />Meeting instructions</);
assert.doesNotMatch(services, /meetingArea\.length < 2/);
assert.match(services, /meetingArea: input\.meetingArea \|\| null/);
assert.match(schema, /meetingArea\s+String\?/);
assert.match(lifecycle, /meetingArea: previous\.meetingArea \?\? undefined/);
assert.doesNotMatch(seed, /Public meeting point/);
assert.doesNotMatch(`${viewer}\n${operator}\n${seed}`, /\b(pickup|rider|passenger|driver|ride)\b/i);

console.log("Telepresence terminology assertions passed.");
