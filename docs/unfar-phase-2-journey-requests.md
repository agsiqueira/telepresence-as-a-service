# Unfar Phase 2: durable Journey Requests

`JourneyRequest` is durable Explorer demand. Creation does not create a `Trip`, run immediate matching, or fail when no Teleporter is available.

## Lifecycle

- `OPEN`: available until withdrawal, expiration, or a legitimate conversion.
- `WITHDRAWN`: historical demand retained after an owner withdrawal.
- `EXPIRED`: historical demand retained after `expiresAt` passes.
- `CONVERTED`: reserved for a future concurrency-safe handoff that links exactly one existing `Trip` through unique `tripId`.

Valid transitions are `OPEN → WITHDRAWN`, `OPEN → EXPIRED`, and later `OPEN → CONVERTED`. Phase 2 does not implement conversion, proposals, negotiation, or agreements. Repeating withdrawal of an already-withdrawn request is idempotent; other terminal states reject withdrawal.

Expiration is lazily materialized by request reads and mutations. Discovery additionally filters `expiresAt` against the current time, so correctness never depends on a background scheduler.

## Privacy and compatibility

Discovery exposes the public place label, coarse location, time window, duration, and proposed price. It never exposes `privateMeetingDetails`, Explorer identity, Clerk identifiers, or unrelated profile data. Owner detail may return private meeting details. Admin visibility is operational metadata only and also excludes precise private information.

Precise meeting information may become visible to the assigned parties only after a future legitimate conversion or agreement policy explicitly authorizes it. Phase 2 does not expose it to Teleporters.

Existing `Trip`, `Viewer`, `Operator`, `OperatorProfile`, destinations, and historical rows remain unchanged. Nullable `tripId` is the narrow future compatibility boundary; legacy Trips are not backfilled as Journey Requests because they do not necessarily contain the required demand fields.
