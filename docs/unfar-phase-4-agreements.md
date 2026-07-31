# Unfar Phase 4: atomic Agreement confirmation

An owning active Explorer may accept exactly one effectively active Proposal on an unexpired OPEN Journey Request. Acceptance is a single serializable transaction that locks the request and selected Proposal, revalidates both participants, claims the Teleporter reservation, marks the selected Proposal `ACCEPTED`, marks competing active Proposals `NOT_SELECTED`, creates one already-confirmed internal `Trip`, creates one immutable Agreement snapshot, and converts the request.

`NOT_SELECTED` is distinct from `DECLINED`: it records that another Proposal won, not that the Explorer independently rejected its terms. All Proposal terminal states remain historical and cannot return to active.

## Idempotency and invariants

The same Explorer retrying acceptance of the same accepted Proposal receives the existing Agreement. A different-Proposal retry conflicts. Unique Agreement keys for Journey Request, Proposal, and Trip, composite ownership foreign keys, conditional updates, row locks, and serializable isolation prevent duplicate or mismatched confirmation. Agreement update and deletion triggers preserve the copied terms.

The Agreement is canonical for agreed timing and price because the legacy Trip has no corresponding fields. Trip is created in `ACCEPTED` state with the Explorer, selected Teleporter, destination, duration, private fulfillment instructions, and a LiveKit room. Legacy matching and offer broadcasting are not invoked.

## Privacy and compatibility

Precise meeting details remain hidden before confirmation. They become visible after the transaction commits only through owner-scoped Explorer and selected-Teleporter Agreement projections. Competing Teleporters retain coarse Proposal history. Admin listings omit precise details.

Legacy Trips do not require Agreements and are not backfilled. Existing lifecycle, LiveKit, suspension-obligation, recovery, cancellation, ending, and feedback paths continue to operate on both legacy and Agreement-backed Trips.

The migration is additive. Rollback drops Agreement triggers and their function, then Agreement foreign keys/table and supporting indexes. PostgreSQL enum additions are retained unless a separately controlled forward migration rebuilds the enum.

Phase 4 adds no bargaining, messaging, payment, refund, tip, review, Guided Experience, Live Moment, notification, map, or tracking functionality.
