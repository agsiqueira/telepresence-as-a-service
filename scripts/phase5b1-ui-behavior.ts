import assert from "node:assert/strict";
import { parseLocalStart } from "../lib/rescheduling-ui";

const future = new Date(2100, 0, 2, 12, 30);
const valid = parseLocalStart("2100-01-02T12:30", new Date(2099, 0, 1));
assert.equal(valid.ok, true);
if (valid.ok) {
  assert.equal(valid.value.getFullYear(), 2100);
  assert.equal(valid.value.getMonth(), 0);
  assert.equal(valid.value.getDate(), 2);
  assert.equal(valid.value.getHours(), 12);
  assert.equal(valid.value.getMinutes(), 30);
}
assert.equal(parseLocalStart("", new Date(0)).ok, false);
assert.equal(parseLocalStart("not-a-date", new Date(0)).ok, false);
assert.equal(parseLocalStart("2100-02-30T12:30", new Date(0)).ok, false);
assert.equal(parseLocalStart("2100-01-02T12:30", new Date(future.getTime() + 1)).ok, false);
console.log("Phase 5B.1 browser-local input behavior passed: 5/5");
