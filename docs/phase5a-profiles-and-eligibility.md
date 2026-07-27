# Phase 5A: roles, profiles, and pilot eligibility

Application authorization uses the persisted `User.role`; Clerk establishes identity only. Roles are exclusive: `VIEWER`, `OPERATOR`, and `ADMIN`. No public route accepts a role or pilot-status field.

## Initial administrator

After deploying the Phase 5A migration, an authorized operator may deliberately promote exactly one existing viewer with:

`node scripts/provision-initial-admin.mjs --clerk-user-id=<exact-id> --confirm=PROVISION_INITIAL_ADMIN`

Run this only in a secured administrative environment after independently verifying the target. The command is not an application route, never runs automatically, refuses missing/ambiguous targets and operator/admin transitions, and does not print the supplied identifier. It was not executed during Phase 5A.

## Profiles and privacy

Viewers may edit display name, preferred language, and the bounded accessibility-preference list. Operators may edit display name separately from eligibility-affecting service settings. Avatar duplication was omitted because the current application has no safe, stable identity-provider avatar projection.

Self-profile responses omit internal IDs, Clerk IDs, email, role, reservation fields, LiveKit data, and the other role's settings. There is no participant directory or cross-user profile endpoint.

Operator eligibility fields are operating area, service radius, destinations, custom-destination support, languages, accessibility capabilities, and supported durations. Saving these service settings takes the operator offline. Display-name changes do not. Neither kind of edit alters an active visit or its ownership.

## Pilot status and readiness

`OperatorPilotStatus` is a single enum: `PENDING`, `APPROVED`, or `SUSPENDED`, avoiding contradictory approval/suspension flags. The safe default is `PENDING`, including for existing profiles, and migration takes existing operators offline. Only `APPROVED` operators can receive new assignments. The future-admin status service always takes an operator offline; suspension prevents new offers and online activation but does not change an accepted or in-progress visit.

The authoritative readiness service requires an operator role, complete valid service configuration, approval, no suspension, at least one active offered destination or custom support, and no pending or active assignment. The online API returns a sanitized readiness reason with HTTP 409. Matching independently requires approved status inside both selection and reservation predicates.

## Migration and deferred work

The migration adds `ADMIN`, viewer preference columns, and operator pilot status only. Apply it through the normal reviewed `prisma migrate deploy` process; Phase 5A generated but did not apply it to the application database. Phase 5B participant administration, Phase 5C catalog administration, Phase 5D visit reporting/operations, and Phase 5E camera switching remain deferred.
