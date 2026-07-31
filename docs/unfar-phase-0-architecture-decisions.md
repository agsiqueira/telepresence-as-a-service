# Unfar canonical architecture and product decisions

This document is the canonical Phase 0 baseline for Unfar. It supersedes role assumptions in the current prototype without erasing the implementation history that produced them.

## Capabilities and authorization

- Every active, non-admin participant has Explorer capability.
- An approved, operational Teleporter profile additionally grants Teleporter capability.
- Explorer and Teleporter are situational capabilities, not mutually exclusive account identities. A Teleporter remains an Explorer.
- Admin capability is separate and continues to be authorized independently.
- `User.role` remains temporarily as a legacy migration/backfill compatibility field. It is not the target participant-authorization model.
- Account deactivation blocks all operational access. Teleporter suspension blocks new Teleporter activity, while access needed to discharge an already-confirmed Journey obligation remains available.
- During the transition, the existing `OperatorProfile` record is the implementation backing for the product concept `TeleporterProfile`; existing tables, relations, and history are not renamed destructively.

## Marketplace lifecycle

- Explorer requests will eventually remain durable demand signals when no Teleporter is available.
- Negotiation will use immutable, versioned proposals.
- An Agreement creates exactly one confirmed Journey.
- `Trip` may remain the temporary internal implementation name for Journey while the migration is in progress.
- The prototype performs no real payment processing.

These decisions describe later architecture only. Phase 0 and Phase 1 do not add JourneyRequest, Proposal, Agreement, negotiation, payments, reviews, Guided Experiences, or Live Moments.

## Design reference boundary

Claude Design v29 is a visual and product reference only. Its HTML implementation, localStorage architecture, hard-coded lifecycle, and generic violet/coral/rounded-card visual system are not production requirements. Production behavior, data integrity, authorization, accessibility, and the established application architecture take precedence.
