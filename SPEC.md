# VirtualTrip — Technical Spec (prototype, v0.1)

## 0. Provenance / status

This spec describes a codebase scaffolded collaboratively with Claude
(Anthropic) in a sandboxed environment with **no network access** — every
file was hand-written and statically checked (brace/paren balance, and
`tsc --noEmit` against hand-written ambient type stubs for the external
packages), but **`npm install` has never been run and the app has never
actually booted.** Treat first boot as the real test. This document is the
source of truth for intent; the code is the source of truth for what's
actually implemented — if they disagree, trust the code and flag the drift.

## 1. Background

VirtualTrip is a functional prototype of the system described in:

> Siqueira, Peres, Mauricio, Nunes & Teixeira, "Tele-Presence-as-a-Service:
> Smart-Glasses Streaming for Older Adults with Reduced Mobility," SVR 2025.

The paper's concept: an operator wearing smart glasses livestreams a visit
to a real place (park, beach, museum, family event) to an older adult
viewer with reduced mobility, who watches hands-free on a familiar device.
The paper's own pilot found high presence/adoption scores and validated
the concept; its own Section IV explicitly frames the delivery model as
gig-economy-inspired (Uber/DoorDash analogy).

## 2. Scope for this MVP

**In scope:**
- Phone-to-phone video — **no smart glasses.** Both the operator and the
  viewer use their phone's own camera via the browser (`getUserMedia`).
  This sidesteps the fact that Ray-Ban Meta (and similar) glasses have no
  public developer API for live video ingestion — a real constraint the
  original paper's own pilot had to work around.
- An on-demand **request → dispatch → accept** flow (explicitly modeled
  on rideshare apps), not a browse-a-list-of-broadcasts model.
- A lightweight post-session feedback check-in echoing two constructs from
  the paper's own instrument (TWEQ-Short): presence and media quality.

**Out of scope for v0.1** (see §10 for details): distance-based matching,
a map UI, in-call "adjust the camera" requests, push notifications,
payments, and locking users to a single role.

## 3. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 14 (App Router, TypeScript) | Runs as a standard Node web service |
| Styling | Tailwind CSS | Custom tokens themed to Michigan State's Spartan Green palette |
| Auth | Clerk (`@clerk/nextjs` v5) | Route protection via `clerkMiddleware` |
| Database | Neon (Postgres) via Prisma | `prisma db push` for schema sync, no migration files yet |
| Real-time video | LiveKit (Cloud or self-hosted) | WebRTC SFU, adaptive simulcast, `@livekit/components-react` |
| Hosting | Render | Web service; Build: `npm install && npm run build`, Start: `npm run start` |

**Why LiveKit specifically:** the paper's own pilot data showed media
quality (not the concept) was the failure point for the one participant
on a slower connection. LiveKit's adaptive simulcast targets that exact
failure mode. It also exposes a server-side Room API that could replace
the current polling-based "who's online" logic later.

## 4. Architecture overview

```
┌─────────────┐        ┌──────────────────┐        ┌─────────────┐
│   Viewer     │──HTTP──▶  Next.js app on   │──HTTP──▶  Operator    │
│  (phone)    │        │      Render        │        │  (phone)    │
└─────┬───────┘        └────────┬──────────┘        └──────┬──────┘
      │                          │                          │
      │        ┌─────────────────┼─────────────────┐        │
      │        │                 │                 │        │
      ▼        ▼                 ▼                 ▼        ▼
   Clerk    Neon (Postgres,   LiveKit Cloud    Clerk    Clerk
  (auth)    via Prisma)      (WebRTC media)   (auth)   (auth)
```

The Next.js app is the only backend. It talks to Neon for app data, Clerk
for identity, and mints short-lived LiveKit JWTs server-side so the
client never sees API secrets. Once a LiveKit token is issued, video/audio
flows directly between the browser and LiveKit's edge — it does not
transit the Next.js server.

## 5. Data model (Prisma schema)

```prisma
enum Role {
  OPERATOR
  VIEWER
}

enum TripStatus {
  REQUESTED  // viewer asked to visit somewhere, waiting for an operator
  ACCEPTED   // an operator claimed it — LiveKit room is live
  ENDED      // finished normally
  CANCELLED  // viewer cancelled before anyone accepted
}

model User {
  id        String   @id @default(cuid())
  clerkId   String   @unique
  name      String?
  role      Role     @default(VIEWER)
  online    Boolean  @default(false) // operator's "go online" toggle
  createdAt DateTime @default(now())

  tripsAsViewer   Trip[]     @relation("TripsAsViewer")
  tripsAsOperator Trip[]     @relation("TripsAsOperator")
  feedback        Feedback[]
}

model Trip {
  id          String     @id @default(cuid())
  viewer      User       @relation("TripsAsViewer", fields: [viewerId], references: [id])
  viewerId    String
  operator    User?      @relation("TripsAsOperator", fields: [operatorId], references: [id])
  operatorId  String?
  destination String
  lat         Float?
  lng         Float?
  livekitRoom String     @unique
  status      TripStatus @default(REQUESTED)
  requestedAt DateTime   @default(now())
  acceptedAt  DateTime?
  endedAt     DateTime?

  feedback    Feedback[]

  @@index([status])
}

model Feedback {
  id           String   @id @default(cuid())
  trip         Trip     @relation(fields: [tripId], references: [id])
  tripId       String
  viewer       User     @relation(fields: [viewerId], references: [id])
  viewerId     String
  presence     Int      // 1-5, "I felt like I was really there"
  mediaQuality Int      // 1-5, "The video was clear enough to see details"
  moodBefore   Int?     // 0-10 VAS
  moodAfter    Int?     // 0-10 VAS
  createdAt    DateTime @default(now())

  @@index([tripId])
}
```

`User` rows are created lazily: `lib/current-user.ts` upserts a `User` on
`clerkId` every time an authenticated request needs one, so there's no
Clerk webhook to keep in sync yet (noted as a v0.1 shortcut, not a design
decision — swap for a `/api/webhooks/clerk` route once user volume matters).

## 6. Core user flows

### 6.1 Viewer: request a visit
1. Viewer opens `/viewer`, types a destination (free text), submits.
2. Client attempts `navigator.geolocation` for lat/lng (best-effort — a
   denial just means the trip has no coordinates).
3. `POST /api/trips` creates a `Trip` with `status: REQUESTED`. One active
   trip per viewer is enforced server-side (returns the existing one if
   present rather than erroring).
4. Client shows a "Finding someone…" screen and polls
   `GET /api/trips/[id]` every 2.5s.
5. When `status` flips to `ACCEPTED`, the client immediately requests a
   LiveKit token (`POST /api/livekit-token`) and joins the room as a
   subscriber.
6. Viewer can hit **Cancel** while still `REQUESTED`
   (`POST /api/trips/[id]/cancel`) — this is a no-op if an operator has
   already accepted (race handled server-side, see §6.3).
7. On leaving an active trip, `POST /api/trips/[id]/end` fires, and the
   viewer is shown a two-question feedback form
   (`POST /api/feedback`, skippable).

### 6.2 Operator: go online and accept requests
1. Operator opens `/operator`, taps **Go online**
   (`POST /api/operator/online { online: true }`, also sets `role: OPERATOR`).
2. While online, the client polls `GET /api/trips?status=REQUESTED` every
   3s and renders each pending request as a card with an **Accept** button.
3. Tapping Accept calls `POST /api/trips/[id]/accept`. On success, the
   client immediately requests a LiveKit token with `canPublish: true`
   and starts broadcasting.
4. **End trip** calls `POST /api/trips/[id]/end`.

### 6.3 Matching / dispatch semantics
There is no queue, no reservation, and no assignment algorithm. Matching
is "broadcast every pending request to every online operator; whoever
accepts first wins." The race is closed server-side:

```ts
// app/api/trips/[id]/accept/route.ts
const result = await db.trip.updateMany({
  where: { id: params.id, status: "REQUESTED" },
  data: { operatorId: user.id, status: "ACCEPTED", acceptedAt: new Date() },
});
if (result.count === 0) {
  // someone else already claimed it — 409, client refetches the list
}
```

If two operators tap Accept within the same event loop tick, only the
`updateMany` whose `WHERE status = 'REQUESTED'` clause still matches at
execution time succeeds; the other gets `count: 0` and a 409.

## 7. API reference

All routes are under `app/api/`, all require an authenticated Clerk
session (enforced by `middleware.ts`) except the routes matched by
`isPublicRoute` (`/`, `/sign-in*`, `/sign-up*`).

| Method | Path | Purpose | Body | Notes |
|---|---|---|---|---|
| GET | `/api/trips` | List trips | — | `?status=REQUESTED` (default) for operators' pending queue; `?mine=1` for the caller's own active trip as viewer or operator |
| POST | `/api/trips` | Viewer requests a destination | `{ destination, lat?, lng? }` | Enforces one active trip per viewer |
| GET | `/api/trips/[id]` | Poll one trip | — | 404 unless caller is that trip's viewer or operator |
| POST | `/api/trips/[id]/accept` | Operator claims a pending trip | — | Atomic; 409 if already claimed |
| POST | `/api/trips/[id]/end` | End an active trip | — | Either party |
| POST | `/api/trips/[id]/cancel` | Viewer cancels before acceptance | — | 409 if already accepted or not found |
| POST | `/api/operator/online` | Toggle operator availability | `{ online: boolean }` | Also sets `role: OPERATOR` |
| POST | `/api/livekit-token` | Mint a scoped LiveKit JWT | `{ tripId }` | `canPublish: true` only if caller is `trip.operatorId`; requires `trip.status === "ACCEPTED"` |
| POST | `/api/feedback` | Post-trip check-in | `{ tripId, presence, mediaQuality, moodBefore?, moodAfter? }` | `presence`/`mediaQuality` required, 1-5 |

## 8. Frontend structure

```
app/
  layout.tsx          — ClerkProvider, header nav, global styles
  page.tsx             — landing page (two entry points: request / go online)
  operator/page.tsx    — go-online toggle, pending-request list, accept → broadcast
  viewer/page.tsx      — destination form, waiting screen, auto-join, leave → feedback
  sign-in/[[...]]/page.tsx
  sign-up/[[...]]/page.tsx
  api/...              — see §7
components/
  VideoRoom.tsx         — shared LiveKit <LiveKitRoom><VideoConference/></LiveKitRoom> wrapper
  FeedbackForm.tsx       — two-question Likert check-in
lib/
  db.ts                 — Prisma client singleton (dev hot-reload safe)
  current-user.ts        — Clerk → local User upsert
  livekit.ts             — server-side LiveKit AccessToken minting
middleware.ts             — Clerk route protection
prisma/schema.prisma      — see §5
```

## 9. Environment variables

```
DATABASE_URL                          # Neon pooled connection string
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
NEXT_PUBLIC_CLERK_SIGN_IN_URL         # /sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL         # /sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL   # /
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL   # /
LIVEKIT_API_KEY
LIVEKIT_API_SECRET
LIVEKIT_URL                           # wss://your-project.livekit.cloud
NEXT_PUBLIC_LIVEKIT_URL               # same value, exposed to the client
NEXT_PUBLIC_MAPBOX_TOKEN              # unused in v0.1, reserved for the map view
```

## 10. Known simplifications (explicit non-goals for v0.1)

- **Distance-based matching** — currently first-accept-wins, not
  nearest-operator. `lat`/`lng` already exist on `Trip`; turning this on
  is a query change (sort/filter the pending list by distance to the
  operator), not a schema change.
- **Map view** — both the operator's pending-request list and the
  viewer's waiting screen are plain lists/text, not the map shown in the
  paper's Fig. 6. `react-map-gl` + Mapbox is the natural next step now
  that `lat`/`lng` flow through the whole lifecycle.
- **In-call camera adjustment requests** — the paper describes viewers
  asking the operator to reframe. LiveKit's data channel
  (`canPublishData: true`) is already enabled in every token; this needs
  a UI (a button that sends a data message, a toast on the operator's
  side) but no new infrastructure.
- **Notifications** — an operator only sees new requests while
  `/operator` is open and actively polling. No push notifications, SMS,
  or the original paper prototype's WhatsApp deep-link fallback exist yet.
- **Role locking** — nothing stops a signed-in user from visiting both
  `/operator` and `/viewer`. The `Role` enum exists on `User` but isn't
  enforced anywhere yet.
- **Payments** — none. Would be Stripe Connect if/when this moves past
  prototype (matches the gig-economy framing in the paper's Section IV).
- **Clerk sync** — lazy upsert-on-request rather than a webhook (see §5).

## 11. Open decisions (unresolved as of this spec)

1. Should matching become distance-based now, or stay first-accept-wins
   until there's a reason to change it?
2. What's the notification strategy for operators who aren't actively
   watching `/operator` — web push, SMS, or a WhatsApp-link fallback
   matching the original paper's prototype?

## 12. What's never been verified

- The app has never run against real Neon/Clerk/LiveKit credentials.
- No `npm install` has been run; dependency versions in `package.json`
  are pinned to what was current at time of writing but not
  lockfile-verified.
- No mobile-browser testing (camera permission prompts, `getUserMedia`
  behavior, geolocation prompts) has happened — this is the phone-to-phone
  app's core interaction and the most likely source of first-run bugs.
