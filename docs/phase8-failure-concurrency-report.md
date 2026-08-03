# Phase 8.4 Failure, Stale-State, and Concurrency Report

## 1. Repository pre-state

- Branch `main`; HEAD `4cd9e9a4e31645a8be50eb7bd8bde2641c69ad26` (`test: validate responsive accessibility`).
- `main` tracked `origin/main` at 0 ahead / 0 behind.
- HEAD includes `4cd9e9a`.
- The worktree was clean except for excluded untracked `reference-materials/`.

## 2. Phase 8.1–8.3 baseline

The integrated matrix, authenticated-lifecycle report, responsive/accessibility report, and Phase 8A–8C validators were present. Phase 8.2 already established database-backed lifecycle authority; Phase 8.3 established public responsive evidence and narrow landmark/dialog fixes.

## 3. Authentication and browser availability

The in-app browser was available, but it contained no legitimate authenticated Explorer, Teleporter, or Administrator session and no open signed-in tabs. No test accounts or credentials were available. Protected browser execution is `Blocked — authentication`; paired scenarios are `Blocked — paired role`.

The browser exposed viewport and visibility control only. Request interception, offline mode, response delay, abort injection, and HTTP-response mocking were unavailable. Browser network simulation is `Blocked — network tooling unavailable`.

## 4. Database safety determination

The Phase 3 and Phase 4 mappings were present, identified the same guarded test target, and were distinct from the application database. Existing runners replace `DATABASE_URL` only within their child process and refuse missing or inconsistent mappings. Phase 5E.1 and Phase 5E.2 dedicated mappings were absent, so those database runners were not executed. No ad-hoc SQL or application-database mutation was used.

## 5. Failure inventory

| Surface group | Duplicate/pending protection | Conflict and recovery | Prior-content behavior |
|---|---|---|---|
| Immediate Explorer Journey | request/cancel refs and disabled pending labels | server create/cancel/start/end; current-Journey reload and poll | restoration distinguishes loading/failure from no Journey |
| Immediate Teleporter Journey | availability/offer/end refs and pending labels | offer polling, expiry authority, accept/decline/start/end endpoints | active Journey polling remains higher priority than Home |
| Scheduled Requests/Proposals | `busy`, `pendingAction`, `busyId` | mutations reload Request/Proposal history after success or conflict | Request details remain visible when Proposal refresh fails |
| Agreements/rescheduling | per-action working state | server-provided permissions and authoritative `load()` | confirmed timing changes only after accepted server mutation |
| Feedback/Review/Tip/Safety | locks/submitting/pending state | duplicate/idempotent or stable conflict responses; reload where designed | selections/content retained on recoverable failures |
| Profiles/application/support | saving/withdrawing/send locks | authoritative endpoint reload or visible error | forms remain present and pending clears |
| Live/Guided Offerings | saving/action locks | `expectedVersion` and `expectedStartAt`, then authoritative reload | failed mutation does not fabricate lifecycle success |
| Shared access/polling | single running poll, AbortController | bounded backoff, persistent notice, recovery callback, stop/abort | successful content is not reclassified as empty by refresh failure where implemented |

## 6. Duplicate-action findings

`Passed — source inspection` for visible pending states and synchronous client guards across critical mutations. `Passed — database` for server authority covering duplicate immediate Requests, offer decisions, start/end, Proposal acceptance/retry, Agreement creation, reservations, rescheduling, Reviews, Tips, Safety reports, and claims.

A client `busy` state is not treated as proof of server idempotency; database evidence is classified separately.

## 7. Stale-tab findings

`Blocked — authentication` / `Blocked — paired role` for real two-tab UI convergence. Database races passed for stale Proposal acceptance versus revision, withdrawal, decline, expiry, and Request withdrawal; reciprocal rescheduling races also passed. Source inspection confirmed conflict paths reload authoritative state where designed.

Human paired-session runbook: open the same offer, Proposal, reschedule, and offering in two legitimate sessions; mutate in one; attempt the obsolete action in the other; verify no false success, current state reload, private data remains gated, and refresh converges.

## 8. Expiry findings

`Passed — database` for immediate accept/expiry, decline/expiry, duplicate expiry, newer-offer protection, Proposal expiry, stale scheduled obligations, and supply window/capacity enforcement. Countdown presentation remains non-authoritative. Authenticated displayed-expiry execution is blocked.

## 9. Refresh-during-mutation findings

`Passed — source inspection` and database recovery evidence show no pending action requires local persistence; reloads use authoritative endpoints and duplicate retry is idempotent or conflict-authoritative. Actual refresh/close/Back/Forward timing is `Manual test required` because protected browser sessions were unavailable.

## 10. Network-failure findings

`requireJsonResponse` rejects malformed JSON, non-JSON success, and failed responses without announcing success. Pollers ignore unmount aborts, serialize requests, back off, announce persistent failure, clear notices on recovery, and stop when ownership ends. Actual offline/delay/5xx browser recovery is `Blocked — network tooling unavailable`.

## 11. HTTP response findings

- `400`: service/UI validation retains inputs and clears pending in `finally`.
- `401`: Clerk middleware and page/API authorization remain authoritative; no custom loop was added.
- `403`: role, capability, account, pilot, readiness, and Safety denials remain server-owned; specific presentation varies by surface.
- `404`: private direct access remains privacy-safe and detail loaders leave loading state.
- `409`: lifecycle, version, overlap, and duplicate conflicts remain server-authoritative; critical scheduled flows reload after conflict.
- `410`: unavailable/expired actions are server rejected where endpoints use this convention; no client countdown authority exists.
- `429`: generic response handling preserves the status and treats it as retryable; no invented retry time was added.
- `5xx`: failures remain visible, pending clears, and retry or polling recovery remains available where designed.

Browser response injection was not available, so these are source/database classifications rather than browser passage.

## 12. Polling and recovery findings

`Passed — automated` and `Passed — source inspection`: intervals and maximum backoff remain unchanged; one poll runs at a time; abort is silent; persistent failure and recovery callbacks remain present; cleanup stops timers and requests. No polling was added to one-time list surfaces.

## 13. Authorization and policy-change findings

Account status, role, capability, pilot, readiness, setup, and Safety restrictions remain server-owned. `Passed — database` for Safety-restriction/Journey ordering and `Passed — automated` for access-state/account boundaries. Open-session policy-change browser behavior is `Blocked — authentication`.

## 14. Privacy stale-state findings

`Passed — source inspection` and `Passed — database`: Request discovery remains coarse; Agreement-gated private fulfillment fields are not merged into stale discovery; unrelated access remains privacy-safe; Proposal acceptance transaction creates the private snapshot only for authorized Agreement projections.

## 15. Destructive-action findings

Request withdrawal, Proposal withdrawal/decline, cancellation, end, reschedule withdrawal/decline, offering archive, occurrence lifecycle actions, Safety submission, and application withdrawal retain pending guards and visible failure paths. Database suites passed duplicate cancellation/end and terminal-race coherence. Browser Back behavior remains manual.

## 16. Database concurrency evidence

Passed guarded suites covered:

- Phase 3: 17 assertions for assignment, accept/decline, settings, cancellation, duplicate submission/end, and expiry.
- Phase 4: 12 lifecycle, recovery, privacy, and route-authorization assertions.
- Phase 3/4 dedicated races: competing Proposal acceptance, retry, withdrawal, decline, revision, expiry, Request withdrawal, and post-conversion creation.
- Phase 5A.1–5A.4: Agreement time selection, overlap constraints, scheduled activation, cancellation/release, rollback, and concurrent winners.
- Phase 5B: 21 reciprocal rescheduling and terminal-race assertions.
- Phase 5D.1: 7 Review attribution, retry, concurrency, and reveal assertions.
- Phase 5F: 9 Tip eligibility, retry, conflict, immutability, and concurrency assertions.
- Safety Phase 1 and 4D: uniqueness, privacy, enforcement, and restriction-versus-Journey ordering.
- Phase 6 foundation/integration: claim capacity, overlap, cross-mode conflict, and reservation races.

## 17. Defects found

No application defect was reproduced. Browser-only stale presentation and network recovery could not be exercised without authentication/network controls and are not classified as passed.

## 18. Fixes applied

None. No application, API, service, middleware, schema, migration, authorization, lifecycle, persistence, or LiveKit file was changed.

## 19. Retest results

The Phase 8.4 validator, current structural suites, guarded database suites, lint, TypeScript, diff integrity, and production build are the retest basis. Exact final command results are recorded below after execution.

## 20. Files changed

- `docs/phase8-failure-concurrency-report.md`
- `docs/phase8-integrated-test-matrix.md`
- `scripts/validate-phase8d-failure-concurrency.mjs`
- `package.json`

## 21. Matrix updates

The matrix now separates database, automated, source, authentication-blocked, paired-role-blocked, network-tooling-blocked, and manual evidence. Granular entries cover offer expiry, duplicate end, stale Proposal, concurrent rescheduling, offering version conflicts, polling recovery, policy changes, refresh during mutation, and Back/Forward recovery.

## 22. Validator design

`test:phase8d` guards Phase 8 artifacts, critical client duplicate/pending patterns, server lifecycle authority, Proposal/Agreement/rescheduling concurrency, offering versions, polling/backoff/abort, privacy, policy ownership, evidence integrity, excluded Phase 8.5 claims, and narrow file scope. It explicitly does not equate client busy state with server idempotency.

## 23. Validation commands and exact results

Passed:

- `npm run test:phase8d` — 173/173.
- `npm run test:phase8a` — 58/58 with IA-01 audit notice.
- `npm run test:phase7c7` — 63/63; `phase7c6` — 70/70; `phase7c5` — 81/81; `phase7c4` — 66/66; `phase7c3` — 64/64; `phase7c2` — 58/58; `phase7c1` — 36/36.
- `npm run test:viewer-runtime`, `test:access-state`, `test:terminology`, `test:polling`, `test:active-visit`, `test:camera-switching`, and `test:feedback-reload` — passed.
- `npm run test:phase3`, `test:phase3:trip-role`, `test:phase4`, `test:phase5a:services`, `test:phase5e1b:auth`, `test:phase5e1b:api`, `test:phase5e1b:ui`, and `test:phase5e2:three-role` — passed.
- `npm run test:unfar:phase2`, `test:unfar:phase3`, `test:unfar:phase4`, `test:unfar:phase5b`, `test:unfar:phase5d2`, `test:phase5f`, Safety Phase 1/2/4D, Phase 6A, Phase 6B, and Phase 6 integration — passed.
- Guarded database suites: Phase 3, Phase 4, the dedicated Phase 3/4 concurrency runner, Phase 5A.1–5A.4, Phase 5B rescheduling, Phase 5D.1 Reviews, Phase 5F Tips, Safety Phase 1 and 4D, Phase 6 foundation, and Phase 6 integration — passed.
- `npm run lint` — no warnings or errors.
- `npx tsc --noEmit` — exit 0.
- `git diff --check` — exit 0 with line-ending notices only.
- `npm run build` — exit 0; 57/57 static pages generated.

The first sandboxed Phase 3 database attempt was blocked by network isolation before assertions. Its approved guarded rerun passed all 17 assertions. This blocked attempt is not reported as a failed application test.

## 24. Historical-validator conflicts

Failed and not called passed:

- `npm run test:phase8c` — exact assertion: `changes remain in narrow Phase 8.3 scope`. The committed Phase 8.3 baseline is unchanged; the guard rejects Phase 8.4 report/validator files. Current `test:phase8d` passes. The historical validator was not modified.
- `npm run test:phase8b` — exact assertion: `changes are limited to Phase 8.2 validation and documentation`. The committed Phase 8.2 baseline is unchanged; the guard rejects later Phase 8.4 files. Current Phase 8A and 8D validators pass. The historical validator was not modified.

## 25. Build result

`npm run build` passed compilation, lint/type validation, page-data collection, 57/57 static-page generation, optimization, and trace collection. Existing dynamic-route diagnostics appeared for authenticated/database-backed routes during collection, but the build exited 0.

## 26. Blocked scenarios

- Authenticated protected failures and policy changes: `Blocked — authentication`.
- Two-session stale-tab convergence and paired duplicate actions: `Blocked — paired role`.
- Offline, delay, abort, and injected HTTP response behavior: `Blocked — network tooling unavailable`.
- Refresh timing and Back/Forward mutation recovery: `Manual test required`.
- Phase 5E-specific database suites: `Not executed` because dedicated mappings were absent.
- Real LiveKit/media/device/chat/reconnection: `Not executed`, reserved for Phase 8.5.

## 27. Remaining risks

The principal risks are UI convergence after a real stale-tab conflict, retention of populated content under injected 5xx/offline failures, Back/Forward action freshness, account/Safety changes during an open authenticated page, and browser-level status wording for less common `410`/`429` responses.

## 28. Recommended Phase 8.5 scope

Use legitimate paired Explorer/Teleporter sessions and real desktop/mobile devices to validate LiveKit permissions, camera/microphone, camera switching, chat transport, network reconnection, and authoritative disconnect/end behavior. Do not absorb IA, payments, ratings, notifications, or broad redesign.

## 29. Final working-tree state

HEAD remains `4cd9e9a` on `main`, synchronized with `origin/main`. Expected changes are limited to the Phase 8.4 report, integrated matrix, validator, and package script registration, plus excluded untracked `reference-materials/`. Nothing is staged, committed, or pushed.

## 30. Completion assessment

Phase 8.4 is complete as a failure/concurrency validation checkpoint. Guarded database races, source auditing, current automated regressions, lint, types, diff integrity, and production build are complete. No application defect was reproduced, so no application remediation was made. Authenticated stale-tab, paired-browser, injected-network, refresh-timing, and history-navigation scenarios remain honestly blocked or manual.

No credentials, tokens, cookies, URLs, secrets, personal data, or private Journey content are included.
