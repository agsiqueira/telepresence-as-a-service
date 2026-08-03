import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const panel = read("components/JourneyReviewPanel.tsx");
const viewer = read("app/viewer/page.tsx");
const explorerJourneys = read("components/explorer/ExplorerJourneys.tsx");
const operator = read("app/operator/page.tsx");
const service = read("lib/journey-reviews.ts");
const route = read("app/api/trips/[id]/review/route.ts");
const feedback = read("components/FeedbackForm.tsx");

assert.match(explorerJourneys, /JourneyReviewPanel/);
assert.match(operator, /JourneyReviewPanel/);
assert.match(explorerJourneys, /ENDED.*FEEDBACK_COMPLETED/);
assert.match(operator, /item\.status\s*===\s*"ACCEPTED"/);
for (const token of [
  "counterpartyDisplayName", "Reviews are unavailable for this Journey", "Review window ends",
  "cannot be edited or withdrawn", 'type="radio"', "required", "maxLength={1000}",
  "/1,000 characters", "1,000 characters maximum", "Submit immutable review", "Your review is submitted",
  "Revealed Journey reviews", "Review you wrote", "Review you received", "No reviews yet",
  "toFixed(1)", "Load more reviews", 'role="status"', 'aria-live="polite"', 'role="alert"',
  "min-h-11", "focus-within:ring-2", "break-words", "whitespace-pre-wrap", "aria-disabled",
  "aria-invalid", "aria-describedby", "errorNotice", "focusError", "loadingMore",
  "Loading more reviews…", "Your entries have been preserved", "The review window is closed. No reviews are available.",
]) assert.ok(panel.includes(token), `Missing Journey review UI token: ${token}`);
assert.match(panel, /JSON\.stringify\(\{\s*rating,\s*comment\s*\}\)/);
assert.doesNotMatch(panel, /reviewerId|revieweeId|clerkId|email|Withdraw review|Edit review|setInterval|poll/i);
assert.doesNotMatch(panel, /waiting for (?:the )?(?:other|Explorer|Teleporter)|body\.error/i);
assert.match(panel, /REVIEW_ALREADY_SUBMITTED/);
assert.match(panel, /REVIEW_WINDOW_CLOSED/);
assert.match(panel, /REVIEW_CHANGED_CONCURRENTLY/);
assert.match(panel, /INVALID_REPUTATION_CURSOR/);
assert.match(panel, /requestAnimationFrame\(\(\) => errorNotice\.current\?\.focus\(\)\)/);
assert.match(panel, /No reviews yet for this participant as a/);
assert.match(panel, /review\{state\.reputation\.count\s*===\s*1\s*\?\s*""\s*:\s*"s"\} as a/);
assert.match(service, /getJourneyReviewContext/);
assert.match(service, /performed\.revieweeId,\s*performed\.revieweeRole/);
assert.match(service, /counterpartyDisplayName:publicDisplayName\(counterpartyName\)/);
assert.match(service, /performed\.revieweeRole===JourneyReviewRole\.EXPLORER\?trip\.viewer\.name:trip\.operator\?\.name/);
assert.match(route, /getJourneyReviewContext/);
assert.doesNotMatch(route, /userId|performedRole.*searchParams/);
assert.doesNotMatch(panel, /presence|mediaQuality|moodBefore|moodAfter|Feedback/);
assert.match(feedback, /How was your Journey/);
for (const source of [explorerJourneys, operator]) assert.match(source, /trips\/history[^"\n]*limit=50/);
assert.match(explorerJourneys, /Journey history|Recent Journeys/);
assert.match(operator, />Offer and visit history</);
console.log("Phase 5D.2 bilateral-review UI validation passed: 60/60");
