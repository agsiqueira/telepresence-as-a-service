import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { liveMomentStartBounds, toLocalDateTimeMinute } from "../lib/datetime-local.ts";

process.env.TZ = "America/New_York";

const start = "2026-08-03T22:58:00.000Z";
const end = "2026-08-04T01:58:00.000Z";
const bounds = liveMomentStartBounds(start, end, 10);
assert.ok(bounds);
assert.equal(bounds.min, "2026-08-03T18:58");
assert.equal(bounds.max, "2026-08-03T21:48");
assert.equal(new Date(bounds.min).toISOString(), start);
assert.equal(new Date(bounds.max).getTime() + 10 * 60_000, new Date(end).getTime());

const selected = new Date("2026-08-03T20:00");
assert.equal(selected.toISOString(), "2026-08-04T00:00:00.000Z");
assert.ok(selected >= bounds.start && selected.getTime() + 10 * 60_000 <= new Date(end).getTime());
assert.equal(new Date(bounds.max).getTime() + 10 * 60_000, new Date(end).getTime());
assert.ok(new Date("2026-08-03T21:49").getTime() + 10 * 60_000 > new Date(end).getTime());

assert.equal(toLocalDateTimeMinute("2026-01-15T17:00:00.000Z"), "2026-01-15T12:00");
assert.equal(new Date(toLocalDateTimeMinute("2026-01-15T17:00:00.000Z")).toISOString(), "2026-01-15T17:00:00.000Z");
assert.equal(liveMomentStartBounds(start, "2026-08-03T23:03:00.000Z", 10), null);

const component = readFileSync("components/LiveMomentDiscovery.tsx", "utf8");
for (const defect of ["availabilityStart.slice(0,16)", "availabilityEnd.slice(0,16)", "toISOString().slice(0, 16)"]) assert.ok(!component.includes(defect), defect);
for (const required of ["No valid start fits within this availability window.", "disabled={restricted || unavailable}", "busyId !== null || restricted || unavailable"]) assert.ok(component.includes(required), required);

console.log("PASS Live Moment local datetime bounds, DST, exact boundary, short window, and regression coverage: 8/8");
