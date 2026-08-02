# Phase 5D bilateral Journey Review inspection and design

## 1. Initial repository state

- Inspected on 2026-08-02 on `main` at `8e9516f00f7e7a80ec7bafae711f69f0f069e6c1` (`feat: add reversible account safety restrictions`).
- `main` matched `origin/main` (`0 0`).
- The tracked tree was clean. The only untracked item was `reference-materials/`, which was not opened or modified.
- No applicable `AGENTS.md` was present under the repository outside excluded reference material.

## 2. Existing architecture inspected

The implementation uses `Trip` as the immutable participation source in services, `JourneyReview` for bilateral marketplace reviews, `Feedback` for private Explorer research responses, and `SafetyReport` plus its later workflow tables for safety operations. Review state is reached from completed-Journey history in both participant dashboards. Authentication is server-derived through `authorizeApiUser`; review authorship is then derived from the authenticated database user and persisted Trip participation.

## 3. Current Journey Review data model

`JourneyReview` stores `tripId`, reviewer/reviewee IDs, performed reviewer/reviewee roles (`EXPLORER`/`TELEPORTER`), rating, optional 1,000-character comment, and `submittedAt`. Unique indexes enforce one row per `(tripId, reviewerId)` and one per `(tripId, reviewerRole)`. Checks enforce rating 1–5, distinct participants, opposite roles, and comment length. Database triggers reject update and delete, so reviews are append-only and immutable.

`Trip.reviewDeadlineAt` is nullable `TIMESTAMPTZ(3)`. New eligible completions set it to exactly 14 days after authoritative `endedAt`. Historical Trips were deliberately not backfilled and therefore remain unsupported when the deadline is null.

## 4. Current API, service, and UI behavior

- `GET /api/trips/[id]/review` returns only participant-authorized state, the authenticated participant's performed role, counterparty role, own submitted review, revealed reviews, and the counterparty's role-specific reputation.
- `POST /api/trips/[id]/review` accepts rating/comment and derives all identities and roles server-side.
- Only `ENDED` and `FEEDBACK_COMPLETED` Trips with two distinct assigned participants, `endedAt`, and a deadline are supported.
- Same-payload retry is idempotent; a changed retry conflicts. Database uniqueness and a serializable Trip-row-locked transaction protect concurrent submission.
- The UI is present for both completed Explorer history and accepted completed Teleporter history. It restores authoritative state on reload, prevents client double submission, preserves failed drafts, and renders text through React rather than HTML injection APIs.

## 5. Existing reveal behavior

Reveal is already bilateral and request-time authoritative. A valid review pair is revealed immediately when both performed roles have submitted. Otherwise, any genuinely submitted review is revealed when PostgreSQL server time reaches the immutable deadline. No scheduler is required and no absent review is fabricated. Before reveal, an author sees their own review; the counterparty sees no review and no explicit other-submission flag. At the deadline, late submission is rejected inclusively.

There is no persisted reveal-state row or finalization job. This is acceptable because reveal is a deterministic projection from valid stored reviews and authoritative server time.

## 6. Existing reputation projections

`getRoleReputation` filters received reviews by both `revieweeId` and immutable `revieweeRole`. Explorer-performed reputation and Teleporter-performed reputation are therefore genuinely separate. Only reviews already revealable by the bilateral/deadline rule contribute. Average, count, comments, and a timestamp/ID cursor are calculated dynamically. No blended User reputation is stored.

Current weakness: all candidate reviews and their paired Trip reviews are loaded before filtering and slicing. The public result is bounded, but database work is unbounded. An unknown cursor silently restarts at the first page rather than failing validation.

## 7. Performed-role attribution

The service maps persisted `Trip.viewerId` to performed `EXPLORER` and `Trip.operatorId` to performed `TELEPORTER`. It does not consult current `User.role`, current capabilities, Operator profile/pilot status, or client role fields. Stored reviews are revalidated against the Trip before reveal or reputation use.

This is correct at the service/projection boundary. It is not fully database-enforced: direct SQL can insert distinct users with opposite role enums who are not the Trip participants, and no database trigger currently makes completed-Trip participant IDs immutable. Invalid rows are excluded by application projections, but should be impossible to persist.

## 8. Private Feedback separation

`Feedback` remains an Explorer-only private research model with presence, media quality, and optional mood measurements. It has separate endpoints, service transitions, and UI. Feedback completion changes the Trip to `FEEDBACK_COMPLETED` but does not create reviews, alter the deadline, reveal reviews, or contribute to reputation. The dashboard explicitly describes Feedback as private and not shared with the Teleporter.

## 9. Safety Reporting separation

Review code does not query or mutate Safety Reports, triage, assignment, conversations, restrictions, or safety events. Safety submission and support remain separate UI/API paths. A Safety Report or restriction does not automatically hide, reveal, modify, delete, or weight a review. No safety narrative or status enters review or reputation projections.

## 10. Current strengths

- Already bilateral and role-specific.
- Server-derived authorship, subject, and performed roles.
- Completed-Journey and participant authorization with privacy-safe 404 responses.
- Immutable review rows and immutable non-null deadlines.
- Server-time deadline decisions with no scheduler dependency.
- Retaliation-resistant pre-reveal projection.
- Idempotent identical retries and concurrency handling.
- Separate reputations and clean Feedback/Safety boundaries.
- Accessible participant UI with reload recovery and no polling-based reveal leak.

## 11. Defects and obsolete assumptions

1. Database checks do not bind reviewer/reviewee IDs and roles to the referenced Trip.
2. Completed Trip participant IDs are not database-immutable; service code treats them as authoritative, but the database does not guarantee that premise.
3. The deadline trigger permits a null historical deadline to be populated later and does not itself prove `deadline = endedAt + 14 days`.
4. POST does not reject unexpected JSON properties; it merely projects `rating` and `comment`.
5. Reputation calculation performs unbounded reads and in-memory reveal filtering.
6. Cursor syntax/existence is not strictly validated; an invalid cursor can restart pagination.
7. Role enum names are modern, but legacy variable/model naming (`viewerId`, `operatorId`, `Role.VIEWER`, `Role.OPERATOR`) remains in fixtures and Trip persistence. This is acceptable only where interpreted as historical persisted participation, not current account type.
8. Dashboard entry is limited to recent history (currently ten results), so an older completed Journey may lack a reachable review UI even though its API remains valid.

## 12. Missing requirements

- Database-enforced Trip participant/role attribution for reviews.
- Database immutability for the completed Trip participant snapshot used by reviews.
- Exact request-shape validation.
- Bounded SQL-level reputation queries and strict stable cursors.
- Focused tests for unexpected properties, malicious direct attribution, completed-Trip participant rewrites, cursor failures, account-status edges, and older-history reachability.

No new fundamental bilateral-review feature is missing.

## 13. Privacy and authorization threat review

| Risk | Existing boundary | Required hardening |
|---|---|---|
| Cross-Journey/cross-user access | Trip participant lookup and privacy-safe 404 | Preserve; add API tests for guessed IDs/cursors |
| Client author/subject/role IDs | Route never accepts them; service derives from Trip | Reject all unexpected keys explicitly |
| Current-role misattribution | Service uses Trip viewer/operator participation | Preserve and add capability/role-change regressions |
| Direct fabricated attribution | `validReview` excludes invalid rows from reveal | Add database trigger/constraint to reject the row |
| Premature reveal/submission inference | Valid pair or server-time deadline; no counterparty submitted flag | Preserve exact minimal projection |
| Injection | Comment trimmed and rendered as React text | Preserve; test script/markup strings end-to-end |
| Malformed/oversized payload | Service rating/type/length validation and DB checks | Add exact-object and control-character policy |
| Duplicate/concurrent submission | Trip lock, serializable transaction, unique indexes | Preserve and expand independent-connection tests |
| Early/late/ineligible Journey | Status, participant, deadline and server clock checks | Add direct database attribution/deadline safeguards |
| Aggregate leakage | Hidden reviews excluded from reputation | Move filtering into bounded SQL without changing reveal semantics |
| Feedback/Safety leakage | Separate models/services/projections | Preserve explicit negative tests |

## 14. Recommended bilateral-review contract

- Eligibility: exactly the two distinct persisted participants of an ended Journey; `ENDED` and `FEEDBACK_COMPLETED` are eligible completion states.
- Identity: authenticated user server-derived; author, subject, and both performed roles derived only from the immutable Trip participation snapshot.
- Cardinality: at most one immutable review per author and performed role per Journey.
- Rating: integer 1–5.
- Comment: optional, trimmed, plain text, null when empty, maximum 1,000 characters; reject non-string, invalid control characters, and unexpected request fields.
- Correction policy: no edit, withdrawal, or deletion. An identical retry is idempotent; a differing retry conflicts.
- Deadline: exactly `endedAt + 14 days`, set in the completion transaction from database-authoritative time and immutable thereafter.
- Submission: allowed strictly before the deadline; never fabricate an unsubmitted review.
- Account edges: retain historical rows through role/capability/status changes. Follow existing deactivated-account access policy, but never recalculate performed role from current state.

## 15. Recommended reveal-window contract

- Before both submissions and before deadline: return only the caller's own review, if present; do not disclose whether the other participant submitted.
- When both valid reviews exist: reveal both atomically as a projection.
- At or after deadline: reveal every valid review actually submitted before the deadline, including a single review; keep a missing review missing.
- Reject submission at `now >= deadline`.
- Evaluate reveal on every request using PostgreSQL time. Optional idempotent materialization may be added only for performance, never as the authority.

## 16. Recommended separate reputation projections

Expose `{ average, count }` plus bounded revealed comments independently for `(revieweeId, EXPLORER)` and `(revieweeId, TELEPORTER)`. Hidden reviews contribute nothing. A one-sided review submitted on time contributes after expiration. Safety Reports, restrictions (including reversed restrictions), Feedback, Tips, capabilities, current roles, and account status never alter rating arithmetic.

Keep projections dynamic for now; volume does not justify mutable aggregate tables. Use SQL-level reveal predicates, bounded keyset pagination, and strict cursor validation. The current authenticated contextual projection can show a count of one; any future broadly public profile should separately decide whether a minimum-count privacy threshold is needed.

## 17. Concurrency and idempotency requirements

- Lock the authoritative Trip row before eligibility and deadline checks.
- Preserve unique `(tripId, reviewerId)` and `(tripId, reviewerRole)` constraints.
- Two independent bilateral submissions may both succeed and then reveal together.
- Duplicate same-author submissions create one row only.
- Same normalized retry returns the original; changed retry conflicts.
- Deadline, completion, and submission races use database time and leave no partial review or reveal state.
- Reputation pagination is deterministic by `(submittedAt DESC, id DESC)`.

## 18. Historical-data strategy

Preserve all existing Trips, Feedback, and reviews. Do not fabricate deadlines or reviews for historical Trips with null deadlines. If database attribution enforcement is added, first run a read-only audit for invalid review rows. Because current projections already exclude invalid rows and existing tests create only valid rows, the preferred migration adds safeguards without rewriting valid history. Any discovered invalid historical row requires an explicit quarantine/remediation decision rather than silent deletion or mutation.

## 19. Proposed schema changes

Phase 5D.1A should add a database trigger validating on insert that reviewer/reviewee IDs equal the Trip's Explorer/Teleporter participants and roles match that participation. Add a completed-Trip trigger preventing changes to `viewerId`, `operatorId`, `endedAt`, and non-null `reviewDeadlineAt` once the Journey becomes review-eligible. Strengthen deadline creation so only the completion transition may set it and it equals the approved window. No new review table or reveal table is presently necessary.

## 20. Proposed API contracts

- Retain `GET /api/trips/[id]/review?cursor=...` with participant-only authorization and the current minimal state.
- Retain `POST /api/trips/[id]/review`, accepting exactly `{ rating, comment? }`.
- Return stable codes already established: `INVALID_REVIEW`, `JOURNEY_NOT_FOUND`, `JOURNEY_NOT_COMPLETED`, `JOURNEY_REVIEW_UNSUPPORTED`, `REVIEW_WINDOW_CLOSED`, `REVIEW_ALREADY_SUBMITTED`, and `REVIEW_CHANGED_CONCURRENTLY`.
- Validate cursors strictly; malformed or unknown cursors should return a bounded 400 rather than restart the page.
- Do not add arbitrary user reputation lookup, Administrator mutation, review moderation, or participant-supplied identity endpoints in Phase 5D.1.

## 21. Proposed UI states

Preserve the existing loading, retry, eligible form, immutable-submitted receipt, closed/no-review, revealed pair/single, role-specific reputation, pagination, validation, conflict, and live-announcement states. Preserve draft text after failure and clear/lock only after success. Add a durable completed-Journey detail/history path so eligible older Journeys are reachable beyond the ten-item dashboard window. Do not show an other-participant submission indicator before reveal.

## 22. Required PostgreSQL safeguards

- Existing rating, distinct-participant, opposite-role, uniqueness, FK, append-only, and deadline triggers.
- New review-to-Trip attribution trigger.
- New completed-Trip participant/ended-at immutability safeguard.
- Exact deadline derivation safeguard where practical.
- Migration preflight confirming no rewrite/backfill and auditing existing reviews.
- Disposable-database variables must be present, matching, distinct from `DATABASE_URL`, and never silently fall back.

## 23. Required tests

- Structural: schema, triggers, no Feedback/Safety/Tip coupling.
- Service/API: exact input shape, server-derived identity/roles, all completion/account-state edges, stable errors.
- PostgreSQL: direct fabricated identities/roles rejected; completed participant/deadline rewrites rejected; append-only and uniqueness retained.
- Privacy: cross-user/Journey IDs, pre-reveal non-inference, hidden reputation exclusion, no Administrator bypass.
- Concurrency: independent clients for bilateral submits, duplicate submit, deadline boundary, and completion/submission races.
- Projection: bounded SQL, strict cursors, separate role averages/counts, one-sided expiry.
- UI: reload, old-history entry, accessible errors/focus, draft preservation, text injection, no submission inference.
- Isolation: Feedback, Safety Reports/restrictions, Agreements, Journey lifecycle, reputation inputs, Tips, and payments unchanged.

## 24. Recommended implementation phases

1. **Phase 5D.1A — service/data hardening:** exact request shape, database attribution and completed-participant immutability, deadline safeguard, focused PostgreSQL/concurrency/privacy tests.
2. **Phase 5D.1B — reveal/reputation projection hardening:** preserve semantics while moving reveal filtering/count/average/pagination into bounded SQL with strict cursors.
3. **Phase 5D.2 — participant UI correction only:** preserve the existing UI; add durable older-history reachability and any error-state changes required by 5D.1A/B.

Rebuilding the bilateral system is not justified.

## 25. Exact acceptance criteria for Phase 5D.1

- Direct database insertion cannot attribute a review to anyone except the two immutable Trip participants with correct performed roles.
- Completed review-eligible Trip participants, completion time, and deadline cannot be rewritten.
- Deadline remains exactly 14 days and no historical null deadline is fabricated.
- POST accepts exactly rating plus optional comment and rejects all extra/malformed fields.
- Existing bilateral reveal, same-payload idempotency, immutable rows, and stable errors remain unchanged.
- Hidden reviews never enter any reputation query; Explorer and Teleporter projections remain separate.
- Reputation reads are bounded, deterministic, and use strict cursors.
- Feedback, Safety, restrictions, Journey/Agreement lifecycle, Tips, payments, roles, and capabilities are unchanged.
- Full structural, API, PostgreSQL, privacy, concurrency, UI, and historical regression suites pass.

## 26. Explicit out of scope

Simulated Tips (Phase 5F), real payments, review editing/deletion, appeals, review moderation, Safety-driven review suppression, blended reputation, public profiles, external notifications, historical review fabrication, Feedback conversion, and any Phase 5D implementation during this inspection.

## 27. Files inspected

`prisma/schema.prisma`; migration `20260801060000_phase5d1_bilateral_journey_reviews`; `lib/journey-reviews.ts`; review deadline paths in `lib/trip-lifecycle.ts`; `app/api/trips/[id]/review/route.ts`; `components/JourneyReviewPanel.tsx`; Explorer and Teleporter dashboard/history entry points; Trip history API/services; Feedback API/component/model; Safety Report and restriction models/migrations/services; Phase 5D.1 database harness; Phase 5D.1 structural validator; Phase 5D.2 UI validator; Feedback reload validator; package scripts and database runner safeguards.

## 28. Commands and exact results

- `git status --short`: only `?? reference-materials/` before this document.
- `git log -1`: `8e9516f feat: add reversible account safety restrictions`.
- `git rev-list --left-right --count origin/main...HEAD`: `0 0`.
- Repository `rg` and direct file inspection: completed; findings above.
- `npm run test:unfar:phase5d1`: passed, `25/25`.
- `npm run test:unfar:phase5d2`: passed, `40/40`.
- `npm run test:feedback-reload`: passed, `23/23`.
- `npx tsc --noEmit`: passed.
- `git diff --check`: passed before documentation creation.
- PostgreSQL review suite: not run. Although disposable variables could be checked, the inspection-only phase forbids database modification and the existing integration suite creates/mutates temporary fixtures; execution was therefore declined before contacting or changing the database. No migration was run.

## 29. Final repository state

The only intended tracked-tree change from this inspection is this design document. `reference-materials/` remains untracked and untouched. Application code, schema, migrations, tests, and database state were not modified. Nothing was staged, committed, or pushed.

## 30. Readiness to begin Phase 5D.1

Ready for a bounded Phase 5D.1A implementation after explicit approval. There is no product-design blocker and no reason to rebuild the existing bilateral system. The implementation should preserve current behavior and address only database attribution/Trip immutability, exact API shape, bounded reputation projection, strict cursors, and the tests needed to prove those corrections.
