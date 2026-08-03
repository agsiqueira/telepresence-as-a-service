# Prototype Demo Readiness Checklist

This checklist prepares a controlled functional-prototype demonstration. It is not evidence of production readiness, pilot readiness, or real LiveKit passage. Record only synthetic labels and pass/fail results; never record secrets, passwords, tokens, cookies, database URLs, participant IDs, or private participant data.

## Environment

- [ ] Application URL is the intended prototype environment.
- [ ] Clerk configuration is present and sign-in works.
- [ ] Database configuration points to an authorized disposable prototype dataset.
- [ ] LiveKit configuration is present and the intended project is confirmed.
- [ ] Required environment secrets are present; no secret values are copied into evidence.
- [ ] Production build for the exact demo revision passes.
- [ ] Browser/device/network combination is recorded without unrelated machine data.

## Accounts

- [ ] Synthetic Explorer demo account is active and has the required pilot state.
- [ ] Synthetic Teleporter demo account is active, approved, ready, and setup-complete.
- [ ] Synthetic Administrator account is available only if the script requires administration.
- [ ] Explorer and Teleporter use genuinely separate authenticated contexts.
- [ ] Compatible language, accessibility, destination, duration, and assignment capabilities are confirmed.
- [ ] Neither participant has a Safety restriction that conflicts with the scripted action.
- [ ] Refresh preserves each account's role and route access.

## Demo data

- [ ] Compatible synthetic destination is available.
- [ ] Scheduled Request example is prepared.
- [ ] Proposal example is prepared without private real-person information.
- [ ] Confirmed Agreement example is prepared.
- [ ] Live Moment example is prepared in an appropriate lifecycle state.
- [ ] Guided Experience and occurrence example are prepared in appropriate lifecycle states.
- [ ] No real participant data, credentials, tokens, or private Journey details appear.

## Pre-demo smoke test

- [ ] Sign in independently as Explorer and Teleporter.
- [ ] Confirm role routes, primary navigation, deactivated-account boundary, and Safety access.
- [ ] Create and accept one immediate Journey without duplicate assignment.
- [ ] Create/open a scheduled Request, submit/select a Proposal, and confirm one Agreement.
- [ ] Exercise rescheduling and verify the confirmed time changes only after acceptance.
- [ ] Load Live Moments and Guided Experiences and verify expected lifecycle/capacity state.
- [ ] Open Feedback, Review, simulated Tip, and Safety surfaces only in eligible states.
- [ ] Join one real paired LiveKit room; confirm role-specific tracks and remote receipt.
- [ ] Exercise camera/microphone controls and physical camera switching where supported.
- [ ] Send chat in both directions, verify unread behavior, and perform a temporary reconnect.
- [ ] Refresh each participant separately and confirm authoritative active-Journey restoration.
- [ ] End once through the Teleporter confirmation and verify remote teardown and history.
- [ ] Verify keyboard focus, dialog containment, protected responsive layouts, and actual 200% zoom.

## Fallback plan

- [ ] Pre-created Agreement exists in the authorized synthetic dataset.
- [ ] Backup signed-out browser profile is available for reauthentication.
- [ ] Backup tested device, network, camera, and microphone are available.
- [ ] Recovery owner knows how to reload authoritative state without creating a second Journey.
- [ ] If LiveKit fails, stop claiming live passage and switch to a clearly labeled static screenshot or recording presentation fallback.
- [ ] Recovery notes include retry, permission reset, participant rejoin, and authoritative ending steps.
- [ ] A failed end request is retried through the existing endpoint; clients are not optimistically disconnected.

## Accepted limitations and waivers

- [ ] `AUTH-W01` acknowledged: protected authenticated visual passage remains incomplete.
- [ ] `A11Y-W01` acknowledged: screen-reader execution remains incomplete.
- [ ] `RESP-W01` acknowledged: physical mobile and actual 200% zoom remain incomplete.
- [ ] `LIVE-W01` acknowledged: real paired LiveKit room remains unexecuted.
- [ ] `LIVE-W02` acknowledged: physical front/rear camera switching remains unexecuted.
- [ ] `LIVE-W03` acknowledged: real network reconnection remains unexecuted.
- [ ] `LIVE-W04` acknowledged: real bidirectional chat delivery remains unexecuted.
- [ ] `LIVE-W05` acknowledged: remote authoritative teardown remains unexecuted.
- [ ] `IA-W01` acknowledged: Explorer `IA-01` Home/Discover decision remains unresolved.

## Readiness decision

- **Demo-ready:** A controlled presentation with prepared synthetic accounts, data, devices, networks, and facilitator support. Non-media flows may be demonstrated after their smoke checks pass. A live Journey segment requires the paired-device smoke test above.
- **Pilot-ready:** External participants can complete protected and real-time workflows with reasonable reliability and support. The current prototype is **not pilot-ready** while paired LiveKit, physical mobile, authenticated browser, assistive-technology, and recovery evidence remain incomplete.
- **Production-ready:** Not assessed and not claimed.
