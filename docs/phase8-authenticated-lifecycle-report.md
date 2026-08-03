# Phase 8.2 Authenticated Cross-Role Journey Lifecycle Report

## Completion status

- **Validation foundation complete**
- **Authenticated execution blocked**
- No legitimate authenticated test accounts or credentials were available.
- No application defects were reproduced.
- No application, API, service, schema, migration, authentication, authorization, role, account, Safety-policy, or dependency changes were made.

“Passed by database suite” below means an existing guarded integration harness exercised server behavior with synthetic database fixtures. It does not prove browser presentation or authenticated Clerk passage.

## Environment classification

| Area | Determination | Evidence |
|---|---|---|
| Repository | Local `main` synchronized with `origin/main` at Phase 8.1 baseline | Preflight Git inspection |
| Clerk | Configuration present | Environment-key presence only; no value recorded |
| LiveKit | Configuration present | Environment-key presence only; not exercised |
| Application database | Configured remote PostgreSQL | Not mutated during Phase 8.2 |
| Test database | Dedicated configured PostgreSQL URL, equal across Phase 3/4 test variables and distinct from application URL | Non-sensitive equality checks |
| Database isolation | Existing runners only | URL guards, UUID fixture prefixes, transactional tests, and runner-specific cleanup/disconnect behavior |
| Authentication credentials | Unavailable | No test credential environment variables; browser session inspection documented below |

The test database is remote and its database name is not visibly test-labelled. It was treated as authorized only through the explicit `PHASE3_TEST_DATABASE_URL`/`PHASE4_TEST_DATABASE_URL` configuration and existing runners that reject application-database mappings. No seed, ad-hoc SQL, manual role mutation, or direct cleanup was used. Some historical harnesses retain UUID-labelled fixtures in the disposable test database; this report does not claim universal transactional cleanup.

## Test-account inventory

| Required participant | Availability | State evidence |
|---|---|---|
| Explorer test account | Not available | No credentials or legitimate authenticated session identified |
| Teleporter test account | Not available | No credentials or separate legitimate authenticated session identified |
| Administrator test account | Not available | No credentials or legitimate authenticated session identified |

No email address, user ID, cookie, session token, or personal data was recorded.

## Execution summary

| Workflow | Classification | Result |
|---|---|---|
| Immediate Journey assignment, offer visibility, expiry, decline, cancellation, acceptance races, start/end, history privacy | Passed by database suite | Phase 3 and Phase 4 guarded database suites passed |
| Fixed/windowed Proposal acceptance and Agreement immutability | Passed by database suite | Phase 5A.1 passed |
| Reservation overlap and acceptance concurrency | Passed by database suite | Phase 5A.2 passed all 29 assertions when rerun alone |
| Scheduled activation and operational isolation | Passed by database suite | Phase 5A.3 passed |
| Cancellation and reservation release | Passed by database suite | Phase 5A.4 passed |
| Reciprocal rescheduling, permissions, conflicts, races, rollback | Passed by database suite | Phase 5B passed |
| Bilateral Reviews and concurrency | Passed by database suite | Phase 5D.1 passed |
| Simulated Tips authority, privacy, idempotency, concurrency | Passed by database suite | Phase 5F passed |
| Journey Safety reporting and duplicate concurrency | Passed by database suite | Safety Phase 1 passed |
| Safety restriction activation versus Journey creation | Passed by database suite | Safety Phase 4D passed |
| Live/Guided claims versus scheduled reservation | Passed by database suite | Phase 6 integration passed |
| Account-status database variants | Blocked | Dedicated Phase 5E.1/5E.2 database URL variables were not configured; runners refused to connect |
| Authenticated Explorer/Teleporter browser workflow | Blocked | No legitimate accounts or sessions available |
| LiveKit/device workflow | Not executed | Reserved for Phase 8.5 |

## Authoritative outcomes validated by database suites

### Immediate Journey

- One Journey/operator assignment wins concurrent competition.
- Duplicate acceptance is stable; unauthorized acceptance is denied.
- Acceptance versus decline, expiry, and cancellation resolves coherently.
- Expired offers cannot clear newer offers.
- Cancellation clears only the exact pending reservation.
- Ending is idempotent and cannot clear a newer active Journey.
- Start, end, and stale active recovery preserve lifecycle authority.
- History projections preserve participant ownership and privacy.

Authenticated presentation of these outcomes remains blocked.

### Scheduled Request, Proposal, and Agreement

- Fixed and windowed Proposal acceptance validate selected times.
- Same-Proposal retry preserves one immutable Agreement/reservation.
- Different or obsolete Proposal acceptance conflicts.
- Forced failures roll back Agreement, Trip, reservation, Request, Proposal, and active-pointer changes.
- Concurrent acceptance produces at most one complete winner where intervals conflict.
- Agreement authority fields and confirmed reservations are database-protected.

Proposal creation, revision, and withdrawal browser presentation remains structurally validated but not authenticated manually.

### Agreement privacy

- Agreement projections remain role-specific.
- Unrelated actors are denied or receive privacy-safe not-found results.
- Pre-confirmation Teleporter discovery contains coarse Request data and does not carry private fulfillment fields.
- Post-confirmation authorized Agreement projections contain the existing private meeting snapshot.

### Explorer-originated rescheduling

- Explorer proposal and Teleporter accept/decline/Explorer-withdraw behavior passed by database suite.
- The original confirmed interval remains unchanged after decline or withdrawal.
- Replacement timing becomes authoritative only after successful acceptance.

### Teleporter-originated rescheduling

- Teleporter proposal and Explorer acceptance passed by database suite.
- Proposer self-acceptance and unrelated access are rejected.
- Accept/decline/withdraw races resolve once without partial state.

### Downstream continuity

- Reviews remain bilateral, immutable, role-attributed, and concurrency-safe.
- Simulated Tips remain limited to eligible completed Journeys, idempotent for identical retry, and conflicting for changed retry.
- Safety reports remain participant-owned, immutable, privacy-safe, and independent of Feedback/Review state.
- Ending and rescheduling preserve Agreement and reservation history according to existing lifecycle rules.

## Account and policy variants

Structurally validated and covered by non-database authorization suites:

- Account status, pilot status, readiness, setup, capability, and Safety restrictions remain distinct and server-owned.
- Phase 5E database execution was not possible because its dedicated test URL variables were absent.
- No account or role was changed to manufacture access.

## Concurrency and stale-state findings

Passed database evidence includes:

- Duplicate Journey submission and acceptance
- Offer acceptance/decline/expiry/cancellation races
- Competing Teleporter assignment
- Same- and different-Proposal acceptance retries
- Reservation overlap and adjacent-interval behavior
- Scheduled start versus cancellation
- Reschedule accept/decline/withdraw races
- Review and Safety-report independent-client concurrency
- Simulated Tip duplicate and changed retries
- Supply claims versus scheduled reservations

Client components continue to reload authoritative state after conflicts. No client-only conflict resolution was introduced.

## Defects and fixes

- **Defects found:** none.
- **Application fixes applied:** none.
- **Retest required for a code fix:** none.

Infrastructure observations are not application defects:

- Initial database attempts were blocked by sandbox network isolation.
- Four initial commands used nonexistent package-script names and did not run; corrected names were used later.
- One long database batch timed out after Phase 5A.2 printed its assertions; Phase 5A.2 was then rerun alone and exited successfully with all 29 assertions passed.
- Phase 5E.1/5E.2 database runners correctly refused execution without their dedicated URL variables.

## Historical-validator conflict

`npm run test:phase5a` failed its literal assertion `/aria-busy="true"/` against `components/ProfileSettings.tsx`. The approved current component expresses loading through the shared `StatePanel` `busy` property and saving through `aria-busy={isSaving || undefined}`. Phase 5A service validation, Phase 7 account validators, the Phase 8 integrated validators, lint, TypeScript, and the production build pass. This is a stale exact-source-format assertion, not a Phase 8.2 behavioral regression. The historical validator was not modified.

## Browser contexts and authenticated evidence

No legitimate authenticated browser context was available. The only connected browser context was the in-app browser; direct navigation to `/viewer` reached the sign-in surface with the canonical return URL, confirming that context was signed out. No second browser family or profile was connected. Public sign-in and protected-route redirect behavior was already exercised in Phase 8.1. Phase 8.2 does not claim authenticated cross-role passage.

## Human authenticated execution runbook

Use two separate legitimate browser profiles or contexts; do not share one Clerk session across roles.

1. Confirm an active Explorer account and an active, approved, setup-complete, readiness-eligible Teleporter account with compatible destination, language, accessibility, and duration capabilities.
2. Record only synthetic scenario labels in local evidence; do not record credentials, cookies, tokens, or private participant data.
3. In the Teleporter profile, open `/operator`, confirm offline, then use the existing UI to go online.
4. In the Explorer profile, open `/viewer`, create one clearly synthetic immediate Journey, and record response category and displayed lifecycle status.
5. Verify the Teleporter offer projection, decline/expiry variants, then create a fresh Journey and accept it once. Refresh both profiles and confirm one authoritative Journey.
6. Validate preparation/token eligibility without requiring physical media. Submit end twice safely and verify one final authoritative state, history, Feedback, Review, Tip, and Safety availability.
7. Create a scheduled Request with synthetic public and private details. Before confirmation, verify the Teleporter sees only coarse fields.
8. Submit, revise, withdraw, and recreate a Proposal. Accept the active Proposal as Explorer. Verify one Agreement and private details only on authorized post-confirmation surfaces.
9. Exercise Explorer-proposed accept/decline/withdraw rescheduling, then reciprocal Teleporter-proposed flows. Refresh both roles after every mutation.
10. Use separate stale tabs only for duplicate/conflict attempts. Record the HTTP category and resulting server-visible status without copying response secrets.
11. Use an Administrator only through an existing authorized workflow for approved account-state variants. Never directly edit role, pilot, account, or Safety records.
12. Update this report and the matrix only with scenarios actually observed. Leave physical media, chat, device switching, and reconnection for Phase 8.5.

## Evidence references

- `npm run test:phase3:db`
- `npm run test:phase4:db`
- `npm run test:unfar:phase5a1:db`
- `npm run test:unfar:phase5a2:db` — rerun alone; passed 29 assertions with exit code 0
- `npm run test:unfar:phase5a3:db`
- `npm run test:unfar:phase5a4:db`
- `npm run test:unfar:phase5b:db`
- `npm run test:unfar:phase5d1:db`
- `npm run test:phase5f:db`
- `npm run test:safety-reporting:phase1:db`
- `npm run test:safety-reporting:phase4d:db`
- `npm run test:phase6:integration:db`

## Privacy findings

No private account identifiers were captured. Structural and database evidence confirms coarse pre-Agreement discovery, role-owned Agreement projections, privacy-safe unrelated access, and participant-owned downstream records.

## Remaining risks

- Authenticated UI state propagation across two Clerk sessions remains unexecuted.
- Browser-visible stale conflict copy and refresh recovery remain unexecuted.
- Account/pilot/readiness/Safety variants need authorized prepared accounts.
- Physical LiveKit media, chat, switching, and reconnect remain Phase 8.5.

## Recommendations

- **Phase 8.3:** validate protected-route reflow, keyboard operation, focus, dialogs, and screen-reader announcements with legitimate sessions.
- **Phase 8.4:** execute two-session stale-state cases and capture authoritative response/reload evidence.
- **Phase 8.5:** use paired desktop/mobile devices for LiveKit media certification.
