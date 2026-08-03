import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(path, "utf8");
const viewer = read("app/viewer/page.tsx");
const journeys = read("components/explorer/ExplorerJourneys.tsx");
const destinations = read("app/api/destinations/route.ts");
const current = read("app/api/trips/current/route.ts");
const history = read("app/api/trips/history/route.ts");
const middleware = read("middleware.ts");
const currentUser = read("lib/current-user.ts");

assert.match(viewer, /async function fetchJson<T>/);
assert.match(viewer, /response\.headers\.get\("content-type"\)/);
assert.match(viewer, /if \(!body\) throw new Error/);
assert.match(viewer, /includes\("application\/json"\)/);
assert.match(viewer, /JSON\.parse\(body\)/);
assert.match(viewer, /if \(!response\.ok\)/);
assert.match(viewer, /destinationsState/);
assert.match(viewer, /Destinations are temporarily unavailable/);
assert.match(viewer, /Current Journey could not be restored/);
assert.match(journeys, /Journey history could not be loaded/);
assert.match(journeys, /historyState\s*===\s*"loading"/);
assert.doesNotMatch(viewer, /fetch\("\/api\/(destinations|trips\/current|trips\/history)[^\n]*\n\s*\.then\([^\n]*response\.json/);

for (const route of [destinations, current, history]) {
  assert.match(route, /getCurrentUser\(\)|authorizeExplorerApi\(\)/);
  assert.match(route, /Unauthenticated|authorizeExplorerApi/);
  assert.match(route, /catch \(error\)/);
  assert.match(route, /status: 503/);
}
assert.match(current, /trip: trip \?/);
assert.match(current, /: null/);
assert.match(history, /NextResponse\.json\(\{ history \}\)/);
assert.match(destinations, /NextResponse\.json\(\{ destinations \}\)/);
assert.match(middleware, /isViewerBootstrapApi/);
assert.match(currentUser, /db\.user\.upsert/);
assert.match(currentUser, /where: \{ clerkId: userId \}/);
assert.doesNotMatch(currentUser, /return db\.user\.create/);

console.log("Viewer runtime response-contract assertions passed.");
