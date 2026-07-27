import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync("lib/resilient-poller.ts", "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
new Function("exports", "module", "require", javascript)(module.exports, module, () => { throw new Error("Unexpected import"); });
const { createResilientPoller } = module.exports;
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

let calls = 0;
let concurrent = 0;
let maximumConcurrent = 0;
let recovered = false;
let persistent = false;
const stopRecovering = createResilientPoller({
  intervalMs: 5,
  maxIntervalMs: 10,
  persistentFailureCount: 2,
  poll: async () => {
    calls += 1;
    concurrent += 1;
    maximumConcurrent = Math.max(maximumConcurrent, concurrent);
    await wait(2);
    concurrent -= 1;
    if (calls <= 2) throw new TypeError("network unavailable");
    return calls >= 4 ? "stop" : "continue";
  },
  onPersistentFailure: () => { persistent = true; },
  onRecovery: () => { recovered = true; },
});
await wait(80);
stopRecovering();
assert.equal(maximumConcurrent, 1, "poll requests must not overlap");
assert.equal(calls, 4, "a completed result must stop future polls");
assert.equal(persistent, true, "persistent failures must surface safe UI state");
assert.equal(recovered, true, "temporary failures must recover");

let abortObserved = false;
let callsAfterStop = 0;
const stopAborted = createResilientPoller({
  intervalMs: 5,
  poll: signal => new Promise((resolve, reject) => {
    callsAfterStop += 1;
    signal.addEventListener("abort", () => {
      abortObserved = true;
      reject(new DOMException("Aborted", "AbortError"));
    });
  }),
  onPersistentFailure: () => assert.fail("intentional abort must be ignored"),
});
await wait(5);
stopAborted();
await wait(15);
assert.equal(abortObserved, true, "cleanup must abort the in-flight request");
assert.equal(callsAfterStop, 1, "cleanup must leave no timer or request behind");

for (const path of ["app/operator/page.tsx", "app/viewer/page.tsx"]) {
  const page = readFileSync(path, "utf8");
  assert.match(page, /createResilientPoller/);
  assert.match(page, /Connection interrupted/);
  assert.match(page, />Retry<\/button>/);
}
assert.doesNotMatch(readFileSync("app/viewer/page.tsx", "utf8"), /setInterval\(async/);

console.log("Polling lifecycle and recovery assertions passed.");
