import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";

const compile = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "scripts/tsconfig.phase3-db.json"], { stdio: "inherit" });
if (compile.status !== 0) process.exit(compile.status ?? 1);
const controller = await import("../.phase3-test-build/lib/admin-role-ui.js");
const { canCancelRoleDialog, createAdminRoleChangeController, cycleDialogFocus, roleActionFor, roleTransitionEndpoint, roleTransitionRequest, roleErrorMessages } = controller;

assert.equal(roleActionFor("VIEWER"), "ASSIGN_OPERATOR");
assert.equal(roleActionFor("OPERATOR"), "RETURN_TO_VIEWER");
assert.equal(roleActionFor("ADMIN"), null);
assert.equal(canCancelRoleDialog(false), true);
assert.equal(canCancelRoleDialog(true), false);
assert.equal(roleTransitionEndpoint("target", "ASSIGN_OPERATOR"), "/api/admin/users/target/assign-operator");
assert.equal(roleTransitionEndpoint("target", "RETURN_TO_VIEWER"), "/api/admin/users/target/return-to-viewer");
assert.deepEqual(roleTransitionRequest(), { method: "POST" });
assert.equal("body" in roleTransitionRequest(), false);

const json = (body, status = 200) => Response.json(body, { status });
const success = { targetId: "target", previousRole: "VIEWER", newRole: "OPERATOR", auditId: "audit" };
let requests = [], refreshes = 0, release;
let fetcher = async (url, init) => { requests.push({ url, init }); return json(success); };
let roleController = createAdminRoleChangeController(fetcher);
let outcome = await roleController.submit({ reference: "target", displayName: "Pilot", action: "ASSIGN_OPERATOR", refresh: async () => { refreshes += 1; } });
assert.equal(outcome.kind, "success");
assert.equal(refreshes, 1);
assert.deepEqual(requests, [{ url: "/api/admin/users/target/assign-operator", init: { method: "POST" } }]);
assert.doesNotMatch(outcome.message, /audit/);

requests = []; refreshes = 0;
fetcher = (url, init) => { requests.push({ url, init }); return new Promise(resolve => { release = resolve; }); };
roleController = createAdminRoleChangeController(fetcher);
const first = roleController.submit({ reference: "target", displayName: "Pilot", action: "RETURN_TO_VIEWER", refresh: async () => { refreshes += 1; } });
assert.equal(roleController.isPending("target"), true);
const duplicate = await roleController.submit({ reference: "target", displayName: "Pilot", action: "RETURN_TO_VIEWER", refresh: async () => { refreshes += 1; } });
assert.equal(duplicate.kind, "busy");
assert.equal(requests.length, 1);
release(json({ ...success, previousRole: "OPERATOR", newRole: "VIEWER" }));
assert.equal((await first).kind, "success");
assert.equal(roleController.isPending("target"), false);

refreshes = 0;
roleController = createAdminRoleChangeController(async () => new Response("", { status: 200 }));
outcome = await roleController.submit({ reference: "target", displayName: "Pilot", action: "ASSIGN_OPERATOR", refresh: async () => { refreshes += 1; } });
assert.equal(outcome.kind, "error");
assert.equal(refreshes, 1, "a malformed success forces authoritative refresh");

for (const [code, message] of Object.entries(roleErrorMessages)) {
  refreshes = 0;
  roleController = createAdminRoleChangeController(async () => json({ code, error: "raw private detail" }, code === "UNAUTHORIZED" || code === "ACTOR_NOT_FOUND" ? 401 : 409));
  outcome = await roleController.submit({ reference: "target", displayName: "Pilot", action: "ASSIGN_OPERATOR", refresh: async () => { refreshes += 1; } });
  assert.equal(outcome.message, message);
  assert.doesNotMatch(outcome.message, /raw private/);
  assert.equal(refreshes, code === "TARGET_NOT_FOUND" || code === "INVALID_CURRENT_ROLE" ? 1 : 0);
}

const focused = [];
const elements = [{ focus: () => focused.push(0) }, { focus: () => focused.push(1) }];
let prevented = 0;
assert.equal(cycleDialogFocus({ key: "Tab", shiftKey: false, preventDefault: () => { prevented += 1; } }, elements, 1), true);
assert.deepEqual(focused, [0]);
assert.equal(cycleDialogFocus({ key: "Tab", shiftKey: true, preventDefault: () => { prevented += 1; } }, elements, 0), true);
assert.deepEqual(focused, [0, 1]);
assert.equal(prevented, 2);

const ui = readFileSync("components/AdminParticipants.tsx", "utf8");
const layout = readFileSync("app/admin/layout.tsx", "utf8");
assert.match(layout, /requirePageRole\(Role\.ADMIN\)/);
assert.match(ui, /returnFocus\.current\?\.focus\(\)/);
assert.match(ui, /querySelectorAll<HTMLElement>/);
assert.match(ui, /cycleDialogFocus/);
assert.match(ui, /aria-modal="true"/);
assert.match(ui, /disabled=\{Boolean\(pendingReference\)\}/);
assert.doesNotMatch(ui, /setParticipants\([^)]*(?:role|newRole)/);

rmSync(".phase3-test-build", { recursive: true, force: true });
console.log("Phase 5C.4 executable ADMIN role UI/controller assertions passed.");
