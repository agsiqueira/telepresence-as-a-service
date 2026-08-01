import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const panel = read("components/JourneyReviewPanel.tsx");
const viewer = read("app/viewer/page.tsx");
const operator = read("app/operator/page.tsx");
const service = read("lib/journey-reviews.ts");
const route = read("app/api/trips/[id]/review/route.ts");
const feedback = read("components/FeedbackForm.tsx");

for (const source of [viewer, operator]) assert.match(source, /JourneyReviewPanel/);
assert.match(viewer, /ENDED.*FEEDBACK_COMPLETED/);
assert.match(operator, /item\.status\s*===\s*"ACCEPTED"/);
for (const token of [
  "Review your", "Reviews are unavailable for this Journey", "Review window ends",
  "cannot be edited or withdrawn", 'type="radio"', "required", "maxLength={1000}",
  "/1,000 characters", "Submit immutable review", "Your review is submitted",
  "Revealed Journey reviews", "Review you wrote", "Review you received", "No reviews yet",
  "toFixed(1)", "Load more reviews", 'role="status"', 'aria-live="polite"', 'role="alert"',
  "min-h-11", "focus-within:ring-2", "break-words", "whitespace-pre-wrap",
]) assert.ok(panel.includes(token), `Missing Journey review UI token: ${token}`);
assert.match(panel, /JSON\.stringify\(\{\s*rating,\s*comment\s*\}\)/);
assert.doesNotMatch(panel, /reviewerId|revieweeId|clerkId|email|Withdraw review|Edit review|setInterval|poll/i);
assert.match(panel, /REVIEW_ALREADY_SUBMITTED/);
assert.match(panel, /REVIEW_WINDOW_CLOSED/);
assert.match(panel, /REVIEW_CHANGED_CONCURRENTLY/);
assert.match(service, /getJourneyReviewContext/);
assert.match(service, /performed\.revieweeId,\s*performed\.revieweeRole/);
assert.match(route, /getJourneyReviewContext/);
assert.doesNotMatch(route, /userId|performedRole.*searchParams/);
assert.doesNotMatch(panel, /presence|mediaQuality|moodBefore|moodAfter|Feedback/);
assert.match(feedback, /How was your visit/);
console.log("Phase 5D.2 bilateral-review UI validation passed: 40/40");
