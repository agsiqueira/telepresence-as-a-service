# Phase 6 — Teleporter-Created Supply design contract

## 1. Purpose and phase sequence

Phase 6 lets an eligible Teleporter publish supply that an Explorer can convert into the existing Journey lifecycle. It adds no second Proposal, Agreement, Trip, reservation, cancellation, rescheduling, completion, Review, Feedback, Safety, reputation, or simulated-Tip engine.

Implement in separately verified checkpoints:

1. **Phase 6 foundation** — shared supply ownership, projections, state rules, capacity ledger, conversion seam, database integrity, and disposable-database harness.
2. **Phase 6A Live Moments** — time-bounded supply available now or soon, discovery, initiation, closure, and history.
3. **Phase 6B Guided Experiences** — reusable offering templates, occurrences, publication/pause/archive controls, discovery, initiation, and history.
4. **Phase 6 integration checkpoint** — lifecycle convergence, concurrency, privacy, accessibility, and all earlier-phase regressions.

Phase 7 visual redesign is not part of any Phase 6 checkpoint.

## 2. Shared supply architecture

Use a small shared `SupplyListing` authority plus mode-specific records; do not overload one table with unrelated nullable fields.

`SupplyListing` owns a UUID, immutable Teleporter owner, type (`LIVE_MOMENT` or `GUIDED_EXPERIENCE`), lifecycle state, privacy-safe location text, duration, integer price minor units, ISO currency, capacity, created/published/paused/archived timestamps, and optimistic version. The owner is derived from the authenticated persisted user and never accepted from the client. Restrictive foreign keys preserve history. Published terms become immutable for existing downstream commitments; later edits create a new version or affect only future occurrences.

- `LiveMoment` owns one availability window and expiration. It is not reusable.
- `GuidedExperience` owns reusable descriptive terms and publication controls.
- `GuidedExperienceOccurrence` owns each concrete one-time scheduled window, capacity, state, and optional occurrence-specific term snapshot. Phase 6 stores no recurrence rule or speculative series fields.
- `SupplyCapacityClaim` owns a unique, append-only claim for a concrete Live Moment or occurrence, exact nonoverlapping interval, Explorer, and server-created Proposal/Journey Request pair. States are `HELD`, `COMMITTED`, `RELEASED`, or `EXPIRED`; timestamps and transitions are database-validated.

Discovery returns only published, active, unexpired supply with remaining capacity and a privacy-safe Teleporter display name. Draft, paused, archived, exhausted, and another Teleporter's historical supply are not discoverable. Ownership and guessed IDs use privacy-safe not-found behavior.

Location remains bounded public-place/coarse-location text compatible with Journey Request and Agreement snapshots. Phase 6 adds no map, coordinates, private meeting details, or ranking policy unless separately approved.

## 3. Lifecycle convergence

Explorer initiation transactionally creates a supply-sourced `JourneyRequest`, a server-authored `Proposal` whose Teleporter and terms come from the supply version/occurrence, and a capacity claim lasting exactly 10 minutes from the database clock. The Explorer then explicitly accepts that Proposal through the existing acceptance service. This preserves the established rule that the Teleporter proposes terms and the Explorer confirms them.

Add nullable, immutable source references from the generated Journey Request and Proposal to the listing/version and concrete occurrence. Source absence continues to mean an ordinary Explorer-created Request. Generated records use the existing fields and statuses; participant IDs, location, duration, price, currency, exact start/window, validity, and source are server-owned.

Acceptance must use the existing Agreement/Trip transaction and snapshots. It atomically validates and commits the capacity claim, creates the existing Agreement and Trip, and creates a `ScheduledJourneyReservation` for scheduled supply. A genuinely immediate Live Moment may use the existing immediate Journey path only when its exact start semantics satisfy that path; otherwise it uses the scheduled path. Failed acceptance releases no committed capacity and leaves no partial lifecycle state.

Proposal decline, withdrawal, supersession, explicit abandonment, or expiration releases its held claim exactly once. Agreement or confirmed-Journey cancellation follows existing cancellation and reservation-release rules; it does not delete historical supply or rewrite Agreement snapshots. A cancellation restores saleable capacity only when it occurs before Journey start, the source remains published and active, the Live Moment or occurrence has not expired, and the interval still satisfies the published availability rules. It never recreates capacity for paused, archived, expired, or otherwise unavailable supply. Closing, pausing, expiring, or archiving supply blocks new initiation but does not revoke an accepted Agreement, confirmed Journey, Review window, Feedback, Safety access, reputation input, or Tip receipt. Existing rescheduling applies only after Agreement/Trip creation and remains bounded by current participant and reservation rules.

Historical performed roles always derive from `Trip.viewerId` and `Trip.operatorId`, not current account role, listing ownership projections, or client state.

## 4. Live Moments

A Teleporter may draft a Live Moment with public/coarse location, availability start/end, Journey duration, price/currency, capacity, and expiration. Publication requires an active account, Teleporter capability, complete approved profile, no effective safety restriction, valid future window, and expiration no later than the availability end.

“Available now” means the database clock is within the published availability window; “available soon” means its start is in the future within a bounded discovery horizon. Both are server-derived. The Explorer selects an exact start. The server derives the end from the published duration and accepts the selection only when the full interval is inside the availability window and overlaps neither a committed Journey nor a valid capacity claim for that Teleporter. Client clocks and calculated timestamps are never authoritative. Expiration and window closure are inclusive, database-clock-based, and make new claims unavailable.

The owner may pause or close future availability. Closure releases only uncommitted claims according to their transition rules. It never changes accepted Agreements or confirmed Journeys. Capacity claims and existing scheduled-reservation exclusion constraints jointly prevent oversubscription and overlapping Teleporter obligations under concurrent initiation/acceptance. Historical owner and participant projections remain readable to authorized inactive or restricted users, but no new publication, initiation, or acceptance is offered.

## 5. Guided Experiences

A Guided Experience is a reusable template with public/coarse location, duration, price/currency, default capacity, and state `DRAFT`, `PUBLISHED`, `PAUSED`, or `ARCHIVED`. Archival is terminal. Pausing suppresses discovery and creation of new claims but preserves occurrences and downstream history.

Concrete one-time `GuidedExperienceOccurrence` rows provide the authoritative start/end window, capacity, publication state, and term version used for booking. An Explorer selects an occurrence and an exact start whose published-duration interval fits fully within it; initiation then enters the shared Journey Request/Proposal/capacity path. Accepted Agreements snapshot occurrence terms and reference the source only for provenance.

Once an occurrence has a claim, Proposal, Agreement, or Trip, its owner, time authority, currency, and committed term version cannot be rewritten. Corrections require cancelling future uncommitted claims or publishing a replacement occurrence/version. Template edits affect only future occurrences. Archived templates and past occurrences remain readable to their owner and persisted Journey participants through bounded history.

Phase 6B supports explicitly created one-time occurrences only. Recurrence is deferred and must not appear in dormant columns, speculative enums, or unused scheduling infrastructure.

## 6. Pricing and capacity

Supply price and currency are server-authoritative from the published immutable version. The Proposal and Agreement retain their existing price/currency snapshots. Later listing edits never rewrite them. Simulated Tips remain independent and never use, alter, or imply payment of supply or Agreement values. Phase 6 introduces no charge, transfer, payout, refund, fee, tax, settlement, processor, balance, or financial account.

Capacity means a count of nonoverlapping one-Explorer/one-Teleporter bookable slots; it never means seats in a group Journey. Capacity is enforced with a database transaction and row/advisory locks on the concrete supply unit and Teleporter interval. `HELD + COMMITTED` may never exceed capacity, and no valid claim may overlap another valid claim or committed Journey for the Teleporter.

A `HELD` claim is temporary: it expires exactly 10 minutes after database creation, consumes capacity only while unexpired, and is not historical Agreement/Journey authority. One Explorer may hold at most one active claim for the same supply occurrence and at most three active claims across all supply. Claim creation, expiry materialization, limit checks, interval checks, and capacity validation occur in one transaction. Claim identity and state constraints make identical initiation retries return the same live claim/Proposal while changed retries conflict. Rejection, explicit abandonment, Proposal withdrawal/supersession, expiration, and transaction failure release the claim exactly once without relying on a client timer.

Successful acceptance converts or closes the claim and creates downstream `COMMITTED` capacity represented authoritatively by the existing Agreement, Journey, and scheduled reservation. Historical Agreements and Journeys remain immutable even when a qualifying pre-start cancellation restores a new saleable slot. The original committed claim remains append-only historical evidence; restoration is a separate availability decision, not deletion or rewriting.

Existing scheduled-reservation exclusion and `activeTripId` rules remain authoritative: supply capacity and claims add an earlier booking guard but never permit overlapping Teleporter Journeys.

## 7. Authorization, safety, and privacy

- Active, approved, unrestricted Teleporters may create, publish, pause, close, and archive only their own supply.
- Active, unrestricted Explorers may discover and initiate eligible supply. Current role does not override persisted Journey attribution.
- Inactive or effectively restricted users cannot create, publish, initiate, or accept new supply activity. Authorized historical supply/Proposal/Agreement/Journey reads remain available without exposing the restriction reason.
- Administrators receive no new mutation authority unless a later approved contract requires existing governance integration.
- Nonowners and guessed IDs receive the same privacy-safe not-found response for private supply.

Supply projections must not expose internal user IDs, hidden Reviews or reveal timing, reputation inputs, private Feedback, Safety Reports or conversations, restriction status/reasons, Administrator identities/notes, simulated Tips, unrelated Agreements/Journeys, or unpublished supply belonging to another Teleporter. Supply actions never alter those domains, account roles, capabilities, marketplace reputation, or historical participant roles.

All mutations use strict exact-body validation, bounded domain errors, database-clock decisions, transaction-scoped participant safety locks, ownership checks, optimistic/state predicates, and no raw Prisma/PostgreSQL messages.

## 8. Participant UI and accessibility

Preserve the current dashboard and visual system.

Teleporter UI provides mode entry points, bounded draft/publish forms, active/paused/expired/archived state text, remaining versus committed capacity, occurrence management, and historical read-only views. Inactive/restricted states remain readable but nonactionable.

Explorer UI provides bounded discovery with privacy-safe Teleporter name, performed-role wording, location, availability/schedule, duration, price/currency, and honest capacity state. Initiation, Proposal confirmation, full/expired/unavailable, temporary failure, retry, and reload recovery use authoritative APIs rather than local storage. Existing Agreement and Journey surfaces take over after acceptance.

All controls must be keyboard operable, visibly labelled, and expose state programmatically. Date/time, capacity, price, currency, and location inputs require accessible names, formats, associated errors, and text instructions. Publication, initiation, expiration, conflict, success, and failure are announced; focus moves predictably. Disabled/read-only and availability states cannot rely on color.

## 9. Migration and database integrity

Use forward-only migrations that create only Phase 6 supply, version/occurrence, source-reference, and capacity-integrity objects. Create no fabricated supply, claims, Proposals, Agreements, or Trips. Do not backfill or rewrite Requests, Proposals, Agreements, reservations, reschedules, Trips, Reviews, Feedback, Safety, Tips, reputation, or users.

Database enforcement must cover immutable ownership/source/term snapshots, valid lifecycle transitions, positive bounded duration/price/capacity, supported ISO currency, valid availability/expiration intervals, unique claim identity, capacity bounds, attribution to the authoritative Teleporter, append-only committed history, and restrictive referential behavior. Cross-table availability and capacity rules require descriptive triggers/functions following existing patterns. Supply authority changes that would invalidate a claim or downstream record are rejected.

Before migration tests, both approved disposable database variables must be present, identify the same database, differ from `DATABASE_URL`, and authenticate. Report only redacted hostname, database name, and aggregate categories. Deploy with `prisma migrate deploy`; never use `db push` or fallback credentials.

## 10. Acceptance criteria and regression plan

Dedicated structural, service/API/privacy, UI/accessibility, PostgreSQL integrity, historical-data, and independent-client concurrency suites must prove:

- authoritative ownership, mode separation, publication/discovery, pause/close/archive, expiration, occurrence validity, strict bodies, and guessed-ID privacy;
- exact price/currency snapshots, 10-minute claim expiry, per-occurrence uniqueness, three-claim Explorer limit, claim transitions, idempotency, capacity boundaries, concurrent last-capacity booking, oversubscription prevention, overlap prevention, qualified cancellation restoration, and rollback/release behavior;
- generated Journey Request and Proposal attribution, explicit Explorer acceptance, existing Agreement/Trip creation, immediate/scheduled compatibility, cancellation/rescheduling/completion, reload recovery, and immutable historical roles;
- inactive/restricted mutation denial with historical reads; accessible forms, status semantics, announcements, focus, responsive behavior, and no Viewer/Operator terminology in participant-facing performed roles;
- isolation from Reviews/reveal, both reputations, Feedback, Safety/restrictions, simulated Tips, Agreement history, and account lifecycle; no payment dependency or duplicate Journey engine.

Implementation verification must run Prisma format/validate/generate, TypeScript `--noEmit`, zero-warning ESLint, production build, `git diff --check`, and the relevant existing Phase 3/4 Journey lifecycle and concurrency suites; Phase 5A exact-start/reservation/activation/release; Phase 5B rescheduling; Phase 5D.1/5D.2 Reviews and reputation; Feedback reload; Safety Reporting Phase 1–4D and restriction concurrency; Phase 5F simulated Tips; account lifecycle/access synchronization; three-role, terminology, viewer runtime, polling, active-visit, and camera regressions.

## 11. Deferred capabilities

- **Group Journeys:** Phase 6 preserves exactly one Explorer and one Teleporter per Journey. Multi-Explorer capacity, group participation, and group lifecycle semantics require a separate approved design.
- **Recurring Guided Experiences:** Phase 6 supports one-time occurrences only. Recurrence grammar, timezone/DST policy, generation horizons, exceptions, and series operations require a separate approved design and must not be prebuilt speculatively.

## 12. Explicit exclusions

Phase 6 excludes Phase 7 redesign; real payments and processors; payouts, refunds, fees, taxes, settlement, and chargebacks; maps or coordinates without separate approval; photos; sharing; richer chat; push notifications; Tip-derived behavior; new Review/reputation policy; marketplace ranking; unapproved recurrence; group Journeys; separate lifecycle engines; and any behavior outside the approved Phase 6 roadmap.

## 13. Phase 6B Guided Experiences amendment

This amendment resolves the Phase 6B implementation details and supersedes any earlier description of an occurrence as a selectable availability window. A Guided Experience occurrence is one exact, explicitly persisted, capacity-one Journey interval owned by one Teleporter and bookable by at most one Explorer. Its UUID is server-generated; the Explorer selects only that UUID and never supplies an interval. The server derives `endAt` from the submitted absolute `startAt` and the current server-owned duration when the draft occurrence is created.

Phase 6B supports manually authored one-time occurrences only. Timestamps must contain `Z` or an explicit numeric UTC offset and are normalized to `TIMESTAMPTZ(3)`. There is no recurrence grammar, named-time-zone schedule, DST generation, preview generator, horizon, exception, series operation, worker, cron job, or background materializer.

`GuidedExperience.title` is required, trimmed, and 3–120 characters. `GuidedExperience.description` is required, trimmed, and 20–2,000 characters. The shared listing continues to own public place, coarse location, duration, price minor units, ISO currency, owner, lifecycle, and optimistic version. Every occurrence snapshots at publication: listing version, title, description, public place, coarse location, duration, price, and currency. Those snapshots, its exact interval, and its owner/provenance become immutable when first published and are authoritative for claims and downstream Request, Proposal, Agreement, and Trip conversion. No general listing-version table is introduced.

The occurrence UUID is the public identity and `(guidedExperienceId, startAt)` is the database retry/duplicate key. An identical authorized draft-creation retry returns the existing draft; a conflicting retry at that schedule position returns a stable conflict. Concurrent identical attempts converge. Clients cannot provide UUIDs, end times, snapshots, listing versions, participants, lifecycle states, or historical timestamps.

A never-published future DRAFT occurrence with no claim or downstream provenance may be edited or deleted by its authorized owner. A PUBLISHED occurrence is immutable except for terminal archival. Publishing requires a PUBLISHED parent listing, a future exact interval, capacity one, and complete current terms; it atomically captures snapshots and listing version. Parent publication never generates occurrences.

ARCHIVED is the occurrence cancellation state. A future published occurrence may be archived only without a valid held claim, unrestored committed claim, confirmed reservation, or active downstream Journey. Archive is terminal and preserves the row and snapshots. Correction archives an eligible original and explicitly creates a distinct replacement with `replacesOccurrenceId`. The relation points from replacement to archived original, permits at most one direct replacement, requires the same listing, and prohibits replacement chains.

Claims target `occurrenceId`, take their exact interval and commercial/descriptive authority from the published occurrence snapshot, and expire exactly ten minutes after the database creation time. One active claim per Explorer/occurrence, three active claims globally, Teleporter interval locking, reservation overlap enforcement, explicit abandonment, lazy expiration, deterministic retry, and restoration-aware capacity remain shared foundation rules.

Guided conversion uses the existing Journey Request → Proposal → Agreement → Trip engine. It stores immutable listing, listing-version, and occurrence provenance and uses occurrence snapshots for interval, duration, price, currency, public place, coarse location, title, and description attribution available in existing snapshot fields. Guided Trips cannot be rescheduled in Phase 6B. Existing rescheduling services return a stable conflict without mutation and instruct participants to cancel and book another available occurrence. Non-Guided rescheduling is unchanged.

Eligible pre-start Guided Trip cancellation transactionally releases the confirmed reservation and appends at most one immutable `SupplyCapacityRestoration`. The original claim remains COMMITTED. Restoration requires matching complete provenance, a future PUBLISHED occurrence and parent listing, eligible owner, valid immutable interval/snapshots, and no competing claim, reservation, or Journey. Archived, elapsed, draft, paused, archived-parent, ineligible-owner, started, completed, immediate, non-supply, mismatched, conflicting, and duplicate cases do not restore. Ordinary cancellation still succeeds when restoration is ineligible. Rebooking always creates a distinct claim while the original claim and restoration remain historical evidence.
