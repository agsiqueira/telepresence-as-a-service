# Unfar Phase 3: immutable versioned proposals

A Proposal is a Teleporter-authored immutable set of terms for one open Journey Request. Version 1 starts a Teleporter/request chain. Revision transactionally supersedes the active version and inserts a new row whose `revisesProposalId` points to its immediate predecessor.

## Lifecycle and invariants

Valid transitions are `ACTIVE → SUPERSEDED`, `ACTIVE → WITHDRAWN`, `ACTIVE → DECLINED`, and `ACTIVE → EXPIRED`. Terminal proposals never return to active. Withdrawal of an already-withdrawn proposal is idempotent; other terminal actions conflict.

A partial unique database index permits at most one active Proposal per Teleporter and Journey Request. Unique version and parent-reference indexes prevent duplicate versions and lineage branching. Database triggers preserve authored terms and prohibit deleting proposal history. Serializable transactions and conditional lifecycle claims prevent concurrent revisions from both becoming active.

Expiration is lazily materialized. Active decision paths additionally require `validUntil` to be in the future. Proposal expiration never changes its Journey Request.

## Authorization and privacy

Only an approved, operational Teleporter may submit or revise, and never on their own request. Teleporters see only their own history and the Phase 2 coarse request projection. The owning Explorer sees received terms and a minimal Teleporter display name and may decline an active version. Admin visibility is safe and separately authorized.

No projection exposes precise meeting details, Clerk identifiers, private profiles, or moderation data. There is no durable event/outbox pattern yet; service results are explicit and transactionally complete so a future outbox can wrap them without moving lifecycle logic.

Phase 3 does not accept proposals, create Agreements or Trips, set `JourneyRequest.tripId`, convert or close requests, process payments, add chat, or implement Explorer counterproposals.
