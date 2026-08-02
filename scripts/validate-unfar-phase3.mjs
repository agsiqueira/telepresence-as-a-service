import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const read = path => readFileSync(path, "utf8"), schema = read("prisma/schema.prisma"), migration = read("prisma/migrations/20260731210000_phase3_versioned_proposals/migration.sql"), service = read("lib/proposals.ts");
assert.match(schema, /enum ProposalStatus \{\s+ACTIVE\s+SUPERSEDED\s+WITHDRAWN\s+DECLINED\s+EXPIRED/); assert.doesNotMatch(migration, /ACCEPTED|NOT_SELECTED/);
for (const field of ["journeyRequestId", "teleporterId", "version", "revisesProposalId", "earliestStart", "latestStart", "durationMinutes", "proposedPriceMinor", "currency", "validUntil", "status", "createdAt", "terminalAt"]) assert.match(schema, new RegExp(`\\b${field}\\b`));
for (const invariant of ["Proposal_one_active_chain_key", "Proposal_journeyRequestId_teleporterId_version_key", "Proposal_revisesProposalId_key", "Proposal_immutable_transition", "Proposal_prevent_delete"]) assert.match(migration, new RegExp(invariant));
assert.match(migration, /WHERE "status" = 'ACTIVE'/); assert.match(migration, /OLD\."status" <> 'ACTIVE' OR NEW\."status" = 'ACTIVE'/); assert.match(migration, /Proposal authored terms are immutable/);
assert.doesNotMatch(migration, /(?:UPDATE|DELETE FROM|ALTER TABLE) "(?:User|Trip|JourneyRequest)"/);
assert.match(service, /request\.explorerId === teleporterId/); assert.match(service, /OperatorPilotStatus\.APPROVED/); assert.match(service, /AccountStatus\.ACTIVE/); assert.match(service, /JourneyRequestStatus\.OPEN/); assert.match(service, /profileIsComplete/);
assert.match(service, /status: ProposalStatus\.SUPERSEDED, terminalAt: now/); assert.match(service, /version: previous\.version \+ 1/); assert.match(service, /revisesProposalId: previous\.id/); assert.match(service, /status: ProposalStatus\.WITHDRAWN/); assert.match(service, /status: ProposalStatus\.DECLINED/); assert.match(service, /status: ProposalStatus\.EXPIRED/);
assert.doesNotMatch(service, /trip\.(?:create|update)|journeyRequest\.update|Agreement|ProposalStatus\.ACCEPTED/);
const teleporterProjection = service.match(/const TELEPORTER_SELECT = \{[\s\S]*?satisfies Prisma\.ProposalSelect/)?.[0] ?? ""; assert.doesNotMatch(teleporterProjection, /privateMeetingDetails|explorerId|clerkId/);

const compile = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "scripts/tsconfig.phase3-db.json"], { stdio: "inherit" }); if (compile.status !== 0) process.exit(compile.status ?? 1);
const build = ".phase3-test-build/lib/proposals.js"; writeFileSync(build, readFileSync(build, "utf8").replace('require("server-only");', ""));
const alias = ".phase3-test-build/node_modules/@/lib"; mkdirSync(alias, { recursive: true });
writeFileSync(`${alias}/marketplace.js`, "exports.profileIsComplete = () => true;\n"); writeFileSync(`${alias}/profiles.js`, "exports.publicDisplayName = value => value || '';\n"); writeFileSync(`${alias}/journey-requests.js`, "exports.DISCOVERY_SELECT={id:true}; exports.JOURNEY_REQUEST_LIMITS={minDurationMinutes:15,maxDurationMinutes:480,maxPriceMinor:10000000}; exports.materializeExpiredJourneyRequests=async()=>({count:0});\n");
writeFileSync(`${alias}/safety-restriction-lock.js`, "exports.acquireSafetyRestrictionParticipantLocks=async()=>[];exports.hasEffectiveSafetyRestrictionInTransaction=async()=>false;\n");
const { validateProposalInput } = await import(`../${build}`);
const now = new Date("2026-08-01T12:00:00Z"), request = { earliestStart: new Date("2026-08-03T12:00:00Z"), latestStart: new Date("2026-08-04T12:00:00Z"), expiresAt: new Date("2026-08-03T18:00:00Z"), currency: "USD" };
const valid = { earliestStart: "2026-08-03T14:00:00Z", latestStart: "2026-08-03T16:00:00Z", durationMinutes: 60, proposedPriceMinor: 3000, currency: "usd", validUntil: "2026-08-03T13:00:00Z" };
assert.equal(validateProposalInput(valid, request, now).ok, true);
for (const body of [{...valid,earliestStart:"2026-08-02T00:00:00Z"},{...valid,latestStart:"bad"},{...valid,durationMinutes:0},{...valid,proposedPriceMinor:-1},{...valid,currency:"EUR"},{...valid,validUntil:"2026-08-04T00:00:00Z"}]) assert.equal(validateProposalInput(body, request, now).ok, false);
for (const path of ["app/api/operator/journey-requests/[id]/proposals/route.ts","app/api/operator/proposals/[id]/revise/route.ts","app/api/operator/proposals/[id]/withdraw/route.ts"]) assert.match(read(path), /authorizeTeleporterActivityApi/);
for (const path of ["app/api/journey-requests/[id]/proposals/route.ts","app/api/journey-requests/[id]/proposals/[proposalId]/history/route.ts","app/api/journey-requests/[id]/proposals/[proposalId]/decline/route.ts"]) assert.match(read(path), /authorizeExplorerApi/);
assert.match(read("app/api/admin/proposals/route.ts"), /authorizeAdminApi/); assert.doesNotMatch(read("components/ProposalManager.tsx"), /privateMeetingDetails|explorerId|clerkId/);
rmSync(".phase3-test-build", { recursive: true, force: true }); console.log("Unfar Phase 3 immutable Proposal validation passed");
