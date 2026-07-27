# Phase 5B: participant and destination administration

The `/admin` area is authorized server-side by persisted `User.role === ADMIN`; Clerk metadata and hidden navigation never grant access. Phase 5B navigation contains only Participants and Destinations. Every API independently returns JSON `401`, `403`, validation `400`, hidden-resource `404`, stale/conflict `409`, or sanitized `500` responses.

## Participants and privacy

The participant list is capped at 50, page-bounded, and ordered by creation time and opaque internal reference. Search is limited to normalized display names; role and pilot-status filters are allowlisted. Results contain display name, role, joined date, and—for operators only—profile completeness, pilot status, online state, and a coarse active-state indicator. Clerk IDs, email, accessibility details, trip contents, LiveKit data, chat, and exact locations are omitted. The existing opaque user CUID is exposed only as the action reference because mutable display names cannot safely identify mutation targets.

Allowed pilot transitions are `PENDING → APPROVED|SUSPENDED`, `APPROVED → SUSPENDED`, and `SUSPENDED → APPROVED|PENDING`. Repeating the current state is idempotent. Mutations require the expected current status; stale and invalid transitions return `409`. Pending-offer reservations also return `409` rather than rewriting offer lifecycle. Every status change takes the operator offline. Approval and restore never put an operator online or bypass readiness. Suspension and forced-offline preserve accepted/in-progress trips, ownership, media state, and history.

## Destinations

Administrators may create and edit name, viewer description, service area, default starting guidance, category, supported durations, optional HTTPS image URL, custom-template flag, and active state. Inputs are normalized, bounded, allowlisted, and checked for case-insensitive duplicate names. The stable slug is generated at creation and used as the safe administrative reference. Updates require the last `updatedAt` value and return `409` on concurrent changes.

Active destinations remain available to viewer requests and new operator configuration. Inactive destinations are rejected server-side for new requests and cannot be newly offered. Existing operator relationships remain visible but disabled and do not satisfy readiness. Trip destination snapshots and foreign-key relationships remain unchanged.

Deletion is intentionally omitted. Deactivation already supplies the required lifecycle, while deletion would risk operator relationships and historical references. No delete endpoint or UI exists.

## Audit and schema

The repository has no existing durable audit mechanism. A partial console-based or standalone Phase 5B audit table would be inconsistent with later visit operations, so durable cross-administration audit events are deferred to integrated hardening. State changes remain transactional and console output is not treated as audit evidence.

Phase 5B requires no Prisma schema change and therefore has no empty migration. It reuses Phase 5A roles/status and the existing destination `slug`, `active`, relationships, and trip snapshot. Phase 5C visit operations/reporting, Phase 5D pilot reporting, and Phase 5E camera switching remain deferred.
