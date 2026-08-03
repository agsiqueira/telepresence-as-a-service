import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const read = path => readFileSync(path, "utf8");
const account = read("app/viewer/account/page.tsx");
const profile = read("components/explorer/ExplorerProfileSettings.tsx");
const layout = read("app/viewer/layout.tsx");
const root = read("app/layout.tsx");
const route = read("app/api/viewer/profile/route.ts");
const validation = read("lib/profiles.ts");
const currentUser = read("lib/current-user.ts");
const accessSync = read("components/AccessStateSynchronizer.tsx");
const restriction = read("components/AccountSafetyRestrictionNotice.tsx");
let count = 0;
const check = (value, message) => { assert.ok(value, message); count += 1; };

check(existsSync("app/viewer/account/page.tsx"), "Account route exists");
check(layout.includes("requireExplorerPage()"), "Explorer layout remains protected");
check(account.includes("requireExplorerPage()"), "Account page obtains authorized Explorer");
check(currentUser.includes("auth()"), "Clerk session remains authoritative");
check(currentUser.includes("clerkId: userId"), "Application user synchronization remains wired");
check(root.includes("<UserButton />"), "Provider account and sign-out control remains global");
check(root.includes("<AccessStateSynchronizer />"), "Access-state synchronization remains global");
check(accessSync.includes('fetch("/api/access-state"'), "Access-state endpoint remains wired");
check(account.includes("AccountSafetyRestrictionNotice"), "Safety restriction state remains wired");
check(restriction.includes('/api/account-safety/restriction'), "Restriction endpoint remains wired");

for (const value of ["displayName", "preferredLanguage", "accessibilityPreferences"]) {
  check(profile.includes(value), `${value} remains presented`);
  check(route.includes(value), `${value} remains projected`);
  check(validation.includes(value), `${value} remains validated`);
}
check(profile.includes('fetch("/api/viewer/profile"'), "Existing profile endpoint remains wired");
check(profile.includes('method: "PUT"'), "Existing update method remains wired");
check(profile.includes('"Content-Type": "application/json"'), "Existing JSON payload remains wired");
check(profile.includes("JSON.stringify(profile)"), "Existing payload fields remain wired");
check(route.includes("validateViewerProfile"), "Server validation remains authoritative");
check(route.includes("db.user.update"), "Existing persistence remains wired");
check(profile.includes("setProfile({ displayName: data.profile.displayName"), "Confirmed server projection replaces local state");

for (const state of ["loading", "ready", "unauthorized", "failed"]) check(profile.includes(`\"${state}\"`), `${state} profile state presented`);
for (const phrase of ["Retry Explorer profile", "Managed by the sign-in provider", "Active application access", "Server profile changed", "Reload server profile", "Your entered values are still available above"]) check((account + profile).includes(phrase), `${phrase} presentation exists`);
check(profile.includes("if (saving) return"), "Duplicate profile mutation prevented");
check(profile.includes("disabled={saving}"), "Controls disabled while mutation pending");
check(profile.includes("LiveRegion"), "Mutation result announced");
check(profile.includes("resultRef.current?.focus()"), "Mutation result receives useful focus");
check(profile.includes("request.abort()"), "Unmounted initial load is aborted");
check(account.includes("StatusBadge") && account.includes(">Active</StatusBadge>"), "Status is textual, not color-only");
check(account.includes("server-managed and cannot be changed"), "Role and access state presented read-only");
check(account.includes("global header"), "Provider ownership accurately explained");

const presentation = account + profile;
for (const prohibited of ["role switch", "Delete account", "notification preference", "billing history", "subscription", "two-factor", "password management", "trust score", "verification badge", "localStorage", "SimulatedTipPanel", "FeedbackForm", "JourneyReviewPanel", "VideoRoom", "ReceivedProposals", "AgreementConfirmation", "Upcoming Journeys"]) check(!presentation.toLowerCase().includes(prohibited.toLowerCase()), `Unsupported control absent: ${prohibited}`);
check(!/(?:clerkId|userId|database ID|session metadata|authorization claim|token)/.test(presentation), "Internal identity details are not rendered");
check(!/>[^<{]*(?:viewer|operator|trip|visit)[^<{]*</i.test(presentation), "No prohibited Explorer-facing legacy terminology");

const status = execFileSync("git", ["-c", `safe.directory=${process.cwd().replaceAll("\\", "/")}`, "status", "--porcelain"], { encoding: "utf8" });
const changed = status.split(/\r?\n/).filter(Boolean).map(line => line.slice(3).replaceAll("\\", "/")).filter(path => path !== "reference-materials/");
for (const path of changed) check(!/^(?:prisma\/|app\/api\/|lib\/|middleware\.ts$|app\/(?:viewer\/(?:page|requests|journeys)|operator|admin)\/)/.test(path), `Phase 7B.6 scope preserved: ${path}`);

console.log(`PASS Phase 7B.6 Account hierarchy, profile persistence, provider ownership, access state, safety, recovery, accessibility, terminology, and scope validation: ${count}/${count}`);
