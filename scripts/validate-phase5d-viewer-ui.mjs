import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";

const compile = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "scripts/tsconfig.phase3-db.json"], { stdio: "inherit" });
if (compile.status !== 0) process.exit(compile.status ?? 1);
const ui = await import("../.phase3-test-build/lib/operator-application-ui.js");
const { createOperatorApplicationController, emptyApplicationForm, safeApplicationError, safeSupportingUrl, statusCopy, submissionPayload, validateApplicationForm } = ui;
const valid = { qualifications: "Qualified through many years of work.", relevantExperience: "I have guided remote visitors before.", languages: ["English"], availability: "Weekdays after 5 PM.", supportingUrl: "", additionalNote: "" };
assert.deepEqual(Object.keys(submissionPayload(valid)).sort(), ["additionalNote", "availability", "languages", "qualifications", "relevantExperience", "supportingUrl"].sort());
assert.deepEqual(submissionPayload({ ...valid, languages: ["English", "English"] }).languages, ["English"]);
assert.deepEqual(validateApplicationForm(valid), {});
for (const form of [{ ...valid, qualifications: "short" }, { ...valid, relevantExperience: "x".repeat(2001) }, { ...valid, availability: "short" }, { ...valid, languages: [] }, { ...valid, languages: ["English", "Spanish", "French", "Portuguese", "German"] }, { ...valid, languages: ["German"] }, { ...valid, languages: ["English", "English"] }, { ...valid, supportingUrl: "http://unsafe.example" }, { ...valid, supportingUrl: `https://example.com/${"x".repeat(500)}` }, { ...valid, additionalNote: "x".repeat(1001) }]) assert.notDeepEqual(validateApplicationForm(form), {});
assert.deepEqual(validateApplicationForm({ ...valid, supportingUrl: "", additionalNote: "" }), {});
assert.equal(safeSupportingUrl("https://example.com/file"), "https://example.com/file"); assert.equal(safeSupportingUrl("http://example.com"), null); assert.equal(safeSupportingUrl("javascript:alert(1)"), null);
for (const status of ["PENDING", "APPROVED", "REJECTED", "WITHDRAWN"]) assert.ok(statusCopy[status].label && statusCopy[status].next);
assert.match(safeApplicationError("VALIDATION_FAILED", "fallback"), /highlighted/); assert.equal(safeApplicationError("UNKNOWN_PRIVATE_CODE", "safe fallback"), "safe fallback");

const json = (body, status = 200) => Response.json(body, { status }); let requests = [], refreshes = 0, release;
let controller = createOperatorApplicationController(async (url, init) => { requests.push({ url, init }); return json({ application: {} }, 201); });
let outcome = await controller.submit(valid, async () => { refreshes++; }); assert.equal(outcome.kind, "success"); assert.equal(refreshes, 1); assert.equal(requests.length, 1); assert.deepEqual(Object.keys(JSON.parse(requests[0].init.body)).sort(), Object.keys(valid).sort());
requests = []; controller = createOperatorApplicationController((url, init) => { requests.push({ url, init }); return new Promise(resolve => { release = resolve; }); });
const first = controller.submit(valid, async () => {}); assert.equal(controller.isSubmitting(), true); assert.equal((await controller.submit(valid, async () => {})).kind, "busy"); assert.equal(requests.length, 1); release(json({}, 201)); await first; assert.equal(controller.isSubmitting(), false);
refreshes = 0; controller = createOperatorApplicationController(async () => json({ code: "PENDING_APPLICATION_EXISTS", error: "private" }, 409)); outcome = await controller.submit(valid, async () => { refreshes++; }); assert.equal(outcome.kind, "error"); assert.equal(refreshes, 1); assert.doesNotMatch(outcome.message, /private/);
for (const response of [new Response("not json", { status: 500 }), new Response("{", { status: 500, headers: { "content-type": "application/json" } })]) { controller = createOperatorApplicationController(async () => response); outcome = await controller.submit(valid, async () => {}); assert.match(outcome.message, /could not be submitted/); }
controller = createOperatorApplicationController(async () => { throw new Error("Prisma SQL secret"); }); outcome = await controller.submit(valid, async () => {}); assert.doesNotMatch(outcome.message, /Prisma|SQL|secret/);

requests = []; refreshes = 0; controller = createOperatorApplicationController(async (url, init) => { requests.push({ url, init }); return json({ application: {} }); }); outcome = await controller.withdraw("app-1", async () => { refreshes++; }); assert.equal(outcome.kind, "success"); assert.deepEqual(requests[0], { url: "/api/operator-applications/app-1/withdraw", init: { method: "POST" } }); assert.equal(refreshes, 1);
controller = createOperatorApplicationController((url, init) => { requests.push({ url, init }); return new Promise(resolve => { release = resolve; }); }); const withdrawing = controller.withdraw("app-2", async () => {}); assert.equal(controller.isWithdrawing("app-2"), true); assert.equal((await controller.withdraw("app-2", async () => {})).kind, "busy"); release(json({})); await withdrawing; assert.equal(controller.isWithdrawing("app-2"), false);
refreshes = 0; controller = createOperatorApplicationController(async () => json({ code: "APPLICATION_NOT_PENDING", error: "private" }, 409)); outcome = await controller.withdraw("app-3", async () => { refreshes++; }); assert.equal(outcome.kind, "error"); assert.equal(refreshes, 1); assert.match(outcome.message, /status changed/);

const component = readFileSync("components/OperatorApplicationViewer.tsx", "utf8"); const page = readFileSync("app/viewer/operator-application/page.tsx", "utf8"); const layout = readFileSync("app/viewer/layout.tsx", "utf8");
assert.match(layout, /requirePageRole\(Role\.VIEWER\)/); assert.match(layout, /href="\/viewer\/operator-application"/); assert.match(page, /OperatorApplicationViewer/);
assert.match(component, /aria-live="assertive"/); assert.match(component, /aria-modal="true"/); assert.match(component, /cancelRef\.current\?\.focus/); assert.match(component, /returnFocus\.current\?\.focus/); assert.match(component, /querySelectorAll<HTMLElement>/); assert.match(component, /Administrator feedback/); assert.match(component, /noopener noreferrer/); assert.match(component, /latest\.status === "PENDING"/); assert.match(component, /applications\.slice\(1\)/); assert.match(component, /if \(outcome\.kind === "success"\).*setForm\(emptyApplicationForm\(\)\)/s); assert.match(component, /if \(outcome\.kind === "success"\).*setConfirmId\(null\)/s);
assert.doesNotMatch(component, /@prisma|lib\/operator-applications|role-transitions|admin\/operator-applications|applicantId|reviewerEmail|dangerouslySetInnerHTML/); assert.doesNotMatch(page, /@prisma|lib\/operator-applications|role-transitions/);
assert.match(component, /submittedAt/); assert.match(component, /reviewedAt/); assert.match(component, /withdrawnAt/);
assert.deepEqual(emptyApplicationForm(), { qualifications: "", relevantExperience: "", languages: [], availability: "", supportingUrl: "", additionalNote: "" });
rmSync(".phase3-test-build", { recursive: true, force: true }); console.log("Phase 5D.4 Viewer Operator Application UI/controller assertions passed.");
