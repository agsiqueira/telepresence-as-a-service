import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const participants = readFileSync("components/AdminParticipants.tsx", "utf8"), controls = readFileSync("components/AccountLifecycleControls.tsx", "utf8"), page = readFileSync("app/account-deactivated/page.tsx", "utf8");
for (const token of ["ACTIVE", "DEACTIVATED", "Account status", "AccountLifecycleControls", "deactivatedAt"]) assert.match(participants, new RegExp(token));
for (const token of ["role=\"dialog\"", "aria-modal=\"true\"", "aria-labelledby", "role=\"alert\"", "role=\"status\"", "maxLength=\\{500\\}", "required", "pending", "await onChanged", "Content-Type", "reason", "cycleDialogFocus"]) assert.match(controls, new RegExp(token));
assert.match(controls, /isCurrentAdmin/); assert.match(controls, /cannot deactivate your own account/); assert.match(controls, /role and history will be preserved/); assert.match(controls, /does not restore online availability/);
assert.match(page, /has not been deleted or disabled/); assert.match(page, /Contact an administrator/); assert.match(page, /SignOutButton/);
console.log("Phase 5E.1B participant lifecycle UI and deactivated-page assertions passed.");
