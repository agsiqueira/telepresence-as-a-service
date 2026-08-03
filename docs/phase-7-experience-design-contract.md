# Phase 7 — Unfar experience design contract

## 1. Status and authority

This document is the authoritative design contract for original-roadmap Phase 7. It governs the visual and interaction redesign of every current Unfar surface after the completed Phase 6 integration checkpoint. It does not authorize product-policy, lifecycle, database, authorization, privacy, Safety, pricing, capacity, claim, payment, Review, reputation, Feedback, or simulated-Tip changes.

The implemented application remains authoritative for behavior. `SPEC.md` supplies original intent; the Phase 0–6 design documents define later product and integrity decisions. Where an attractive presentation would conflict with implemented authority, the authority wins and the presentation must represent it honestly.

Phase 7 is delivered only through separately reviewed checkpoints:

1. **Phase 7A — Design foundation.**
2. **Phase 7B — Explorer surfaces.**
3. **Phase 7C — Teleporter surfaces.**
4. **Phase 7D — Admin and Safety surfaces.**
5. **Phase 7E — Integration, accessibility, responsiveness, and visual QA.**

No checkpoint may silently absorb work assigned to a later checkpoint. Every implementation remains independently reviewable, uncommitted until verified, and subject to existing disposable-database safeguards when database suites run.

## 2. Approved decisions

- The product name is **Unfar**.
- The visual direction is a **warm travel marketplace**: welcoming, credible, human, experience-oriented, and polished without imitating a named marketplace.
- All current public, authenticated, participant, Admin, and Safety surfaces are in Phase 7, delivered through the five checkpoints above.
- Shared UI is repository-owned and implemented with Tailwind CSS. A broad component-library replacement is not approved.
- The accessibility target is WCAG 2.2 Level AA.
- Layout is mobile-first and responsive.
- Phase 7 changes presentation and interaction quality, not product policy.
- Existing server and database authorities remain decisive.
- Dark mode is deferred. Phase 7 delivers one complete, accessible light theme; adding a second theme would multiply token, media, chart, Clerk, LiveKit, screenshot, and state verification without improving the approved core flow.

## 3. Product and brand direction

### 3.1 Brand promise

**Unfar brings meaningful places and personal perspective within reach through a live, human-guided Journey.**

This promise describes connection and access. It must not promise physical travel, guaranteed availability, professional care, safety outcomes, or financial settlement.

### 3.2 Personality and voice

Unfar is warm, clear, respectful, calm, capable, and encouraging. Copy uses plain language, short sentences, concrete next steps, and participant-centered descriptions. Operational urgency may become firmer, particularly in Safety and time-sensitive claim states, but never alarming without cause.

Preferred participant terminology:

- **Explorer** for the person experiencing a Journey.
- **Teleporter** for the person performing the remote visit.
- **Journey** for the accepted or active experience.
- **Journey Request**, **Proposal**, and **Agreement** where those persisted lifecycle concepts must be distinguished.
- **Live Moment** and **Guided Experience** for the two supply modes.
- Historical role descriptions derive from the Trip participants and use “as Explorer” or “as Teleporter,” never a current account role.
- “Starting-point preference,” “Visit instructions,” “active Journey,” and “completed Journey” follow the established terminology validators.

Avoid: Viewer, Operator, rider, driver, passenger, ride, booking engine, purchase, payment, paid, refund, balance, guaranteed, risk-free, violation reason, database, constraint, row, UUID, internal status codes, and language that diagnoses or blames a participant. Internal route and source names may remain unchanged when renaming them would create behavioral risk; participant-facing copy must use Unfar terminology.

### 3.3 Visual character

- Warm natural neutrals create a travel-journal quality without beige-on-beige contrast loss.
- Deep evergreen anchors trust and primary actions.
- Terracotta is a restrained experiential accent, never a substitute for a semantic warning or error.
- Surfaces are solid and tactile. Avoid glassmorphism, excessive gradients, neon, sci-fi motifs, and decorative animation.
- Generous whitespace and comfortable line lengths take priority over dashboard density on participant surfaces.
- Admin and Safety surfaces use the same system with denser spacing and quieter decoration. Safety severity never becomes theatrical.
- The system supports future supplied photography through predictable aspect-ratio media slots, but Phase 7 neither fabricates imagery nor adds upload, storage, sharing, or image metadata.

### 3.4 Wordmark, iconography, imagery, and motion

The header uses a text wordmark, “Unfar,” until a separately approved final mark exists. It must remain legible at 200% text size, work without an icon, include no rasterized text, and not imply a geographic pin, payment, medical care, or emergency service. Phase 7 does not generate a final logo.

Icons are optional supports, not sole labels. Use one coherent outline style, 1.5–2px optical stroke, familiar shapes, and `aria-hidden` for decorative icons. Icon-only controls require accessible names and at least 44 by 44 CSS pixels. Do not encode role, status, Safety severity, or availability through icons alone.

Future photography should feel authentic, place-led, and respectful of participants; avoid inaccessible text baked into images, stereotypical depictions of age or disability, identifiable private locations, or imagery implying a supplied experience that is unavailable. Every meaningful image requires useful alternative text; decorative images use empty alt text.

Motion clarifies cause and continuity only. Default transitions use 120–220ms durations and never delay authority changes. Under `prefers-reduced-motion: reduce`, nonessential transitions and transforms are removed, animated scrolling is disabled, and loading remains understandable without motion. Countdown authority is textual and database-derived, never communicated by animation alone.

## 4. Current-state inventory

### 4.1 Shells and navigation

- The root Clerk shell supplies a global header, authentication affordance, access-state synchronizer, and main landmark.
- Explorer, Teleporter, and Admin server layouts enforce page authorization before rendering context navigation.
- Explorer navigation exposes Explore, Journey Requests, existing Teleporter capability/setup access, and Teleporter application.
- Teleporter navigation exposes Explore, Teleport, and Requests.
- Admin navigation maps Participants, Destinations, Operator applications, Journey Requests, Proposals, Agreements, and Safety Reports.
- Safety Support has a dedicated inbox surface but no separate committed layout.
- Mobile navigation currently wraps desktop links rather than transforming into an explicit mobile model.

Phase 7 must preserve server-owned route access. It may improve grouping, labels, active-route indication, responsive presentation, and context cues. It must not invent a new capability switch, role mutation, or cross-context permission. Existing links are shown only when the current server-authorized layout already permits the destination.

### 4.2 Current visual system

Tailwind currently defines three Spartan green values; global CSS applies a white canvas and gray text. Pages and components directly compose Tailwind colors, borders, radii, shadows, widths, spacing, status blocks, and focus rings. Common patterns include white or gray canvases, `rounded-lg` through `rounded-2xl`, bordered cards, `max-w-md` through `max-w-5xl`, 44–48px controls, responsive card grids, and dark active-Journey media shells.

The foundations are functional but inconsistent:

- VirtualTrip and Unfar names coexist.
- Viewer/Operator source terms coexist with Explorer/Teleporter presentation.
- Alerts, errors, success notices, cards, page headers, buttons, empty states, metadata, and loading treatments are repeated rather than shared.
- Large Explorer and Teleporter pages own many unrelated view states.
- Focus rings, border colors, disabled opacity, heading scale, content width, status tone, and action placement vary.
- Admin detail pages sometimes compose several sibling components without one page hierarchy.
- Dense operational data has no shared responsive table contract.
- Loading is mostly message-based; no common skeleton contract exists.

### 4.3 Existing interaction and accessibility foundations

The application already uses semantic buttons and links, labels and fieldsets, headings, definition lists, `role="status"` and `role="alert"`, minimum-height touch controls, focus-visible rings, server-side page guards, resilient polling, explicit retry controls, no-storage recovery, and text labels alongside status color. Phase 7 must strengthen these foundations rather than replace them with visually custom but semantically weaker controls.

### 4.4 Lifecycle facts the interface must represent

- Immediate activity uses existing Request, offer, Trip acceptance, start, active media, completion, cancellation, Feedback, Review, Tip, and Safety authorities.
- Scheduled activity uses Journey Request → Proposal → Agreement → Trip and confirmed reservation authority.
- A fixed Proposal start cannot be changed; eligible windowed Proposals accept an exact explicit-offset time within inclusive bounds.
- Agreement terms and historical participant attribution are immutable.
- Non-Guided eligible Journeys may use existing mutual rescheduling; Guided Trips are not reschedulable and instruct participants to cancel and book an available occurrence.
- Live Moment and Guided Experience claims expire exactly ten minutes after database creation. Reloaded state, not a client timer, decides whether a claim remains valid.
- Claims, committed capacity, restoration, reservation release, and rebooking are distinct facts. Cancellation does not rewrite historical Agreement or claim evidence.
- Account inactivity or effective Safety restriction blocks new activity while preserving authorized historical reads. The interface must not disclose restriction reasons.
- Reviews, reputation, private Feedback, Safety information, and simulated Tips have separate visibility and authority.
- Prices and currencies are server-owned snapshots; simulated Tips remain explicitly simulated and independent.
- Raw database, Prisma, constraint, internal identifier, Administrator-note, private Feedback, hidden Review, Safety, and unrelated participant data never appear in participant errors.

## 5. Design principles

1. **Authority before optimism.** Display server-confirmed status; label locally pending work as pending and recover after stale or failed mutations.
2. **One product, distinct contexts.** Explorer, Teleporter, Admin, and Safety share primitives while their shells clearly identify the current operational context.
3. **Human destinations first.** Lead with place, experience, schedule, and participant-relevant next action—not internal lifecycle nomenclature.
4. **Text carries meaning.** Color, icon, position, animation, and countdown visuals are supplementary.
5. **Progressive disclosure.** Show the immediate decision first; preserve detailed terms, provenance, and history in accessible secondary structure.
6. **Mobile is complete, not reduced.** No authorized action or essential detail disappears at narrow widths.
7. **Failure is a designed state.** Every asynchronous surface defines loading, empty, stale, unavailable, conflict, restricted, offline, retry, and success treatment.
8. **Privacy shapes presentation.** Absence and not-found states do not reveal whether hidden data exists.
9. **Safety is calm and serious.** Safety actions are clear, isolated from ordinary commerce-style accents, and never expose confidential coordination.
10. **Refactor presentation incrementally.** A shared component may replace markup only when behavior, request payloads, focus, polling, and authorization remain equivalent.

## 6. Semantic design tokens

Tokens are exposed as CSS custom properties and mapped into Tailwind semantic names. Components consume semantic roles, not raw palette names. Exact values may change only through a reviewed token amendment with contrast evidence.

### 6.1 Color tokens

| Token | Value | Required use |
|---|---:|---|
| `canvas` | `#FBF8F3` | Application background |
| `surface` | `#FFFFFF` | Primary cards, forms, dialogs |
| `surface-subtle` | `#F5EFE6` | Grouped content and quiet sections |
| `surface-raised` | `#FFFCF8` | Raised overlays and emphasized panels |
| `text-primary` | `#241F1A` | Body and headings |
| `text-secondary` | `#51483F` | Supporting content |
| `text-muted` | `#6B625A` | Nonessential metadata; never disabled-by-color alone |
| `border` | `#D8CFC4` | Standard borders and dividers |
| `border-strong` | `#9E9184` | Selected, grouped, or high-definition boundaries |
| `brand` | `#1F5A4A` | Primary action and brand emphasis |
| `brand-hover` | `#17483B` | Primary-action hover/active |
| `brand-subtle` | `#E3F0EA` | Selected and informational brand surface |
| `accent` | `#A5482D` | Restrained travel/experience accent, not status |
| `action-secondary` | `#EFE7DD` | Secondary action background |
| `link` | `#1D5A76` | Text links on light surfaces |
| `focus` | `#1D5A76` | 2px focus ring with 2px contrasting offset |
| `success-fg` / `success-bg` | `#1F6B45` / `#E7F5EC` | Confirmed success |
| `warning-fg` / `warning-bg` | `#7A4B00` / `#FFF3D6` | Attention, expiry, recoverable interruption |
| `danger-fg` / `danger-bg` | `#9B2C2C` / `#FDECEC` | Destructive action, error, Safety-critical failure |
| `info-fg` / `info-bg` | `#1D5A76` / `#E7F3F8` | Neutral operational information |
| `live-fg` / `live-bg` | `#8A4B08` / `#FFF1DB` | Live Moment mode supplement |
| `guided-fg` / `guided-bg` | `#5B3F8C` / `#F0EAF8` | Guided Experience mode supplement |
| `scrim` | `rgb(36 31 26 / 0.64)` | Modal backdrop |

Verified WCAG contrast ratios for essential pairings:

- `text-primary` on `canvas`: 15.42:1; on `surface`: 16.33:1.
- `text-secondary` on `canvas`: 8.44:1.
- `text-muted` on `canvas`: 5.63:1.
- white on `brand`: 8.02:1; white on `brand-hover`: 10.36:1.
- `brand` on `canvas`: 7.57:1; `link` on `canvas`: 7.14:1.
- `focus` on white: 7.56:1.
- state foreground on its state background: success 5.75:1, warning 6.72:1, danger 6.59:1, information 6.69:1, Live Moment 6.10:1, Guided Experience 7.03:1.

Borders, focus indicators, selected states, icons, and disabled controls must also satisfy applicable 3:1 non-text contrast. Disabled controls retain readable labels and add semantic text or attributes; opacity alone is insufficient. Automated contrast tooling and rendered-browser verification remain required because transparency, fonts, and compositing can alter effective contrast.

### 6.2 Typography

Use a system-font strategy with no new network font dependency: `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. This is reliable during authentication, poor connectivity, and media setup and avoids layout shift. Use tabular numerals for countdowns, prices, dates, and operational identifiers where alignment helps.

| Token | Size / line height | Weight | Use |
|---|---|---:|---|
| `display` | 2.5rem / 1.1 | 700 | Public hero only |
| `heading-1` | 2rem / 1.2 | 700 | Page title |
| `heading-2` | 1.5rem / 1.3 | 700 | Major section |
| `heading-3` | 1.125rem / 1.4 | 650 | Card or subsection |
| `body-lg` | 1.125rem / 1.65 | 400 | Introductory copy |
| `body` | 1rem / 1.6 | 400 | Default text |
| `body-sm` | 0.875rem / 1.55 | 400 | Supporting content |
| `label` | 0.875rem / 1.4 | 600 | Control and metadata label |
| `caption` | 0.75rem / 1.5 | 500 | Nonessential annotation only |

Text remains user-scalable. No required content uses less than `body-sm`; `caption` never carries an error, availability decision, price, time limit, or primary control label.

### 6.3 Spacing, dimensions, and layout

- Spacing scale in rem: `0`, `0.25`, `0.5`, `0.75`, `1`, `1.25`, `1.5`, `2`, `2.5`, `3`, `4`, `5`, `6`.
- Radius: `sm 0.375rem`, `md 0.625rem`, `lg 0.875rem`, `xl 1.25rem`, `pill 9999px`.
- Elevation: `none`; `sm 0 1px 2px rgb(36 31 26 / .08)`; `md 0 8px 24px rgb(36 31 26 / .10)`; `lg 0 18px 48px rgb(36 31 26 / .16)`. Shadows never replace borders or focus.
- Content widths: prose `42rem`; participant form `36rem`; participant page `72rem`; operational page `90rem`; full media `100%`.
- Breakpoints follow mobile-first minimum widths: `sm 40rem`, `md 48rem`, `lg 64rem`, `xl 80rem`, `2xl 96rem`. Components respond to content and available width; breakpoints do not imply capabilities.
- Control height: at least 44px; primary mobile actions prefer 48px. Pointer targets meet WCAG 2.2 Target Size (Minimum), including adequate spacing for smaller inline targets.
- Field and card gaps: 12–16px mobile, 16–24px tablet/desktop. Section spacing: 32–48px mobile, 48–64px desktop.
- Body measure targets 45–75 characters per line.

### 6.4 Layering and motion

- `base 0`, `sticky 20`, `dropdown 40`, `scrim 60`, `dialog 70`, `toast 80`, `critical 90`.
- Tooltips never contain required information or interactive content.
- Motion durations: `instant 0ms`, `fast 120ms`, `standard 180ms`, `slow 220ms`; easing `cubic-bezier(.2,.8,.2,1)`.
- No infinite decorative animation. Skeleton shimmer is excluded; use a static or gently pulsing placeholder disabled by reduced-motion preference.
- Sticky/fixed layers must not obscure focus, headings, errors, or the LiveKit controls at 400% zoom.

## 7. Shared component contract

All shared components forward appropriate native attributes and refs, preserve native semantics, accept semantic variants rather than arbitrary status colors, and remain usable without pointer input.

### 7.1 Actions and navigation

**Button:** variants `primary`, `secondary`, `subtle`, `danger`, and `quiet`; sizes never reduce the required target. Supports idle, hover, active, focus-visible, pending, disabled, and success handoff. Pending retains its label context (“Publishing…”), prevents duplicate activation, and exposes status without replacing the accessible name with a spinner. A link styled as a button remains an anchor; a button never performs navigation by assigning location.

**Text link:** underlined by default in prose and messages or gains another persistent non-color affordance. Visited styling is optional and must not disclose sensitive navigation history.

**Navigation:** one current destination uses `aria-current="page"`. Context identity (“Explorer,” “Teleporter,” “Admin,” or “Safety operations”) is visible. Desktop navigation may be horizontal or a bounded sidebar. Mobile navigation may use a compact top bar plus visible destinations or an accessible disclosure; it must not hide active-Journey access or fabricate a context switch.

**Breadcrumbs:** use only on nested detail routes; wrap in a labelled `nav`, use an ordered list, and mark the current page. Breadcrumbs supplement rather than replace the page title or back behavior.

**Menus:** use only for a set of immediate actions, not site navigation unless a native disclosure pattern is more appropriate. Arrow-key menu semantics are required only when implementing the ARIA menu pattern; otherwise use a disclosure containing ordinary links/buttons.

### 7.2 Forms

**Text field, text area, and select:** visible label, optional/required indicator in text, description and error linked with `aria-describedby`, error state with `aria-invalid`, appropriate autocomplete/input mode, bounded server-compatible values, and no placeholder-only label. Text areas expose remaining constraints without live-announcing every keystroke.

**Checkbox and radio:** native controls with a clickable label and at least a 44px row target. Related choices use `fieldset` and `legend`. Checkbox groups preserve existing payload values.

**Date/time:** render an absolute localized date, time, and timezone/offset context appropriate to the existing authoritative timestamp. Relative text may supplement but never replace the absolute value. Forms that already require explicit offsets continue to do so; Phase 7 adds no named-time-zone or DST policy.

**Validation:** validate helpful client-known constraints without claiming success before the server. On submission error, announce a concise summary, move focus to the summary or first invalid field as appropriate, and preserve non-sensitive input. Unknown fields and stale versions retain stable server errors.

### 7.3 Content and lifecycle components

**Card:** variants `default`, `interactive`, `selected`, `historical`, and `operational`. An interactive card contains one primary link or button and does not create nested interactive controls. Selection is textually identified.

**Supply card:** always identifies Live Moment or Guided Experience in text; includes place/title, privacy-safe Teleporter display name, exact schedule/window, duration, server-projected price/currency, availability, and the allowed action. It never infers hidden inventory, owner identity, rank, coordinates, imagery, or payment status.

**Journey card:** leads with place/experience and current participant-relevant state; separates requested, proposed, agreed/current scheduled, active, completed, and canceled facts. Historical performed role comes from the projection, not current navigation context.

**Status badge:** supplements a sentence or labelled status field. Approved semantic variants are neutral, info, success, warning, danger, Live Moment, and Guided Experience. Database enum names are converted to clear content.

**Availability indicator:** uses text such as “Available,” “1 place remaining,” “Unavailable,” “Expired,” or “Read-only history.” It never relies on a green/red dot.

**Claim countdown:** displays a tabular `mm:ss` supplement and an absolute expiry explanation. It reads authority from API timestamps, resynchronizes after reload/focus, stops at zero, announces threshold changes sparingly, and refreshes authoritative state on expiration. It must not trap a user in a forced timed interaction or claim that client zero caused expiration.

**Price/currency:** format integer minor units with `Intl.NumberFormat` and the server-owned ISO currency. Never add payment, charge, discount, payout, refund, or paid language. Simulated Tips remain labelled simulated and visually separate.

**Definition list / metadata group:** use `dl`, `dt`, and `dd` for term/value snapshots. Responsive layout may become columns but retains reading order.

**Participant identity:** show only the authorized display projection and performed role. Never render internal IDs, unpublished ownership, restriction facts, hidden Reviews, reputation inputs, private Feedback, Safety data, Tips, or unrelated Journey data.

### 7.4 Feedback, overlays, and system states

**Page header:** one `h1`, optional eyebrow/context, concise description, and primary actions. On mobile actions stack after context; on desktop they may align to the end.

**Tabs:** only for peer views that can remain mounted or navigate through established routes. Use native links when a tab changes URL; use the ARIA tabs pattern only with complete keyboard behavior. Tabs may not hide required errors or active-Journey access.

**Dialog / confirmation dialog:** labelled title, described consequence, initial focus chosen by risk, focus trap, Escape handling unless an irreversible server request is already pending, close control, background inertness, and return focus. Destructive confirmation names the affected object and consequence. Safety reporting must not be dismissible in a way that loses already submitted data.

**Alert / notice:** variants map to semantic state tokens; error uses `role="alert"` only when interruption is warranted, while informative or successful asynchronous updates use a polite status region. Repeated polling messages must not continuously reannounce unchanged text.

**Toast or mutation feedback:** use a single repository-owned, keyboard-reachable region for brief noncritical confirmation. Critical errors, form errors, expiry, restrictions, and actions requiring recovery remain inline. Toasts pause on hover/focus only when their content is not available elsewhere and provide enough time under WCAG timing requirements.

**Empty state:** states what is absent, why when safely known, and the authorized next action. It never confirms existence of private data behind a guessed identifier.

**Error state:** uses bounded participant-safe copy, preserves usable surrounding content where possible, and provides Retry, Return, or Refresh only when meaningful. Raw response bodies, Prisma errors, PostgreSQL errors, constraints, stack traces, IDs, notes, or restriction reasons are prohibited.

**Loading / skeleton:** preserve heading and layout stability, identify the region as busy, and provide meaningful text for long operations. Skeletons are decorative, not announced individually, and must not mimic false loaded data.

**Tables:** use semantic caption/header/cell relationships. On narrow screens, either preserve a labelled horizontal scroll region or transform each row into a card with every header repeated as a label. Do not remove columns containing status, authority, or required actions merely to fit.

**Pagination/result continuation:** preserve existing limits and continuation behavior. Phase 7 may style existing controls but cannot introduce a new server pagination contract. Focus moves to the result heading after explicit page changes, not after passive polling.

**Restricted/inactive notice:** explains only the allowed consequence and next safe action. It does not expose the restriction category, report, Administrator, reason, duration beyond an already authorized projection, or other participant.

**Safety-sensitive interface:** visually separates confidential coordination from participant-visible content, labels audience and permanence, requires confirmation for established consequential actions, and never makes privileged controls resemble ordinary participant actions.

### 7.5 Focus and announcements

- Route navigation lands at the new page’s `h1` or a skip-linked main landmark according to normal browser behavior.
- Validation failure focuses the summary or first invalid control.
- Successful create/update focuses the resulting heading or announces confirmation while retaining logical focus.
- Removed dialogs return focus to the invoker when it still exists.
- Expired/withdrawn items move focus to the refreshed region heading or next safe action, never to `body`.
- Stale conflict preserves context, announces that data changed, and offers an authoritative refresh.
- Live regions are centralized and deduplicate identical polling messages.

## 8. Information architecture and navigation

### 8.1 Public and authentication

The public shell presents the Unfar wordmark, concise promise, and sign-in/sign-up entry without implying unauthenticated discovery. Clerk controls remain Clerk-owned. Authentication pages receive a coherent Unfar frame but Phase 7 does not customize authentication policy or identity synchronization.

The account-deactivated page is a focused account-state surface with no ordinary product navigation. It preserves sign-out and the existing contact guidance without disclosing governance details.

### 8.2 Explorer context

The Explorer shell visibly identifies **Explore** context. Existing destinations remain:

- Explore: `/viewer`.
- Journey Requests: `/viewer/requests` and detail routes.
- Teleporter application: `/viewer/operator-application`.
- Existing Teleporter destination when currently authorized by the server layout.

The dashboard organizes existing content into understandable regions: active Journey first when present; held supply claims and Proposal confirmation next; discovery; upcoming Agreements/Journeys; Request activity; and completed/canceled history. This is presentation hierarchy, not a new route or aggregation authority. Data unavailable from current authorized APIs is not fabricated.

### 8.3 Teleporter context

The Teleporter shell visibly identifies **Teleport** context. Existing destinations remain:

- Teleport dashboard: `/operator`.
- Explorer context: `/viewer` when already authorized.
- Journey Requests: `/operator/opportunities` and detail routes.

Within `/operator`, visual sections distinguish eligibility/setup, online immediate opportunities, active Journey, Live Moment supply, Guided Experience supply, Agreements, and history. Phase 7 may extract presentational components but must preserve polling, online/offline authority, offer expiry, activeTrip behavior, and profile/supply service calls.

### 8.4 Multiple authorized contexts

Phase 7 labels the current context and may present existing authorized links between Explorer and Teleporter. It does not create a role-switch mutation, persist a preferred context, infer capability client-side, or show Admin/Safety destinations without their existing server authorization. Current role changes never alter performed-role history.

### 8.5 Admin and Safety

Admin uses a quieter operational shell with persistent context, current-route indication, and existing destinations. `/admin` remains a redirect, not a dashboard feature. Safety Reports stay inside Admin navigation; `/safety-support` remains the established Safety-support inbox for authorized coordinators. Confidential participant conversations and internal notes are visually and semantically separated.

Desktop may use a sidebar for seven Admin destinations; mobile uses an accessible disclosure or horizontally constrained destination list. Privileged operations remain explicit, labelled, and server-authorized. Presentation never implies that Administrator status grants undocumented supply or participant mutation powers.

### 8.6 Active, pending, and historical placement

- Active Journeys take precedence and remain reachable without traversing discovery.
- Held claims remain in their current Explorer discovery/claim projections and show expiry plus Proposal-confirmation next action.
- Journey Requests and received Proposals remain under existing Request routes.
- Agreements and current scheduled facts use existing participant projections.
- History remains role-aware and includes ordinary, supplied, completed, and canceled Journeys as already projected.
- Restrictions and required setup appear before actions they disable, with historical content retained where authorized.

## 9. Content-design rules

### 9.1 Page structure

- Title: concrete noun or task, normally 2–6 words: “Explore Journeys,” “Journey Requests,” “Live Moments,” “Safety Reports.”
- Description: one sentence describing what can be done now, not roadmap or system implementation.
- Primary action: verb + object: “Create Live Moment,” “Publish occurrence,” “Accept Proposal.” Avoid generic “Submit,” “Continue,” or “Yes” when a more precise label exists.

### 9.2 State templates

- Empty: “No [items] yet.” Follow with an authorized next action or explanation.
- Loading: “Loading [items]…” for meaningful waits; avoid playful copy in operational/Safety flows.
- Success: “[Object] [past-tense result].” Add the resulting state or next step.
- Stale/conflict: “This [object] changed while you were viewing it. Refresh to see its current status.” Do not imply who changed it.
- Unavailable supply: “This experience is no longer available. Explore other available Journeys.” Do not disclose hidden capacity or owner state.
- Claim expiry: “This 10-minute hold expires at [absolute time]. Confirm the Proposal before then to continue.” On expiry: “This hold expired. Refresh availability before trying again.”
- Account restriction: “You cannot start new activity right now. Your available history remains accessible.” Show only established support guidance.
- Safety: “Your report was submitted.” Never promise a response time or outcome not established by policy.
- Destructive: “[Action] [object]?” followed by the accurate consequence and whether history is preserved. Use “Cancel Journey,” not “Delete booking,” when cancellation is authoritative.
- Restoration: “Cancellation completed. Availability was restored” only when the server projection confirms restoration. Otherwise state only that cancellation completed.
- Guided rescheduling: “Guided Experiences cannot be rescheduled. Cancel this Journey and book another available occurrence.”
- Historical role: “You joined as Explorer” / “You performed this Journey as Teleporter,” based on persisted Trip attribution.
- Simulated Tip: always includes “simulated”; never says charged, paid, received funds, refund, or balance.

Errors never include private state, internal identifiers, another participant’s data, database terminology, restriction reasons, Administrator identities/notes, hidden Review/reputation input, private Feedback, Safety content, or unrelated records.

## 10. Responsive behavior

Representative verification widths are 320px and 390px mobile, 768px tablet, 1024px laptop, and 1440px wide desktop. Also verify 400% browser zoom at a 1280px viewport, producing an approximately 320 CSS-pixel reflow width.

- **Navigation:** mobile uses a compact labelled context and accessible destination disclosure or bounded bottom/top navigation; tablet/desktop exposes primary destinations. No horizontal page overflow.
- **Content:** participant content stays within 72rem and readable prose within 42rem. Operational content may reach 90rem. Wide screens add whitespace or columns, not stretched text.
- **Cards:** one column through narrow mobile; two columns only when content retains readable measure; three columns only at large widths for truly parallel discovery cards.
- **Forms:** one column by default. Related short controls may form two columns from `md`; labels, descriptions, and errors remain adjacent.
- **Actions:** primary action follows content on mobile and may align with headers on desktop. Destructive and safe alternatives do not reverse order unpredictably across breakpoints.
- **Tables:** use semantic scroll containers or labelled row cards on mobile. Sticky headers must not obscure focused elements.
- **Dialogs:** near-full-width with safe 16px margins on mobile; bounded width on desktop; vertically scrollable inside the viewport; actions remain reachable without fixed overlays covering content.
- **Sticky/fixed UI:** allowed only for active-Journey access, dialog actions, or a clearly justified primary action. It respects safe areas and does not cover errors, LiveKit controls, or focused fields.
- **Long content:** wrap names, places, currencies, timestamps, and status text; do not truncate required distinctions. User-generated text uses safe wrapping and preserves no unsafe markup.
- **Countdowns:** reserve width using tabular numerals and pair with text; a changing countdown cannot cause layout shift or repeated screen-reader interruption.

## 11. Accessibility requirements

Every Phase 7 checkpoint must meet its relevant WCAG 2.2 AA requirements before handoff; Phase 7E audits the integrated application.

- Complete keyboard operation with logical order and no traps outside conforming dialogs.
- A visible, contrast-compliant focus indicator on every interactive element.
- Skip link to main content and correct header/nav/main/footer landmarks.
- One logical `h1` per rendered page state and no skipped heading hierarchy caused by component composition.
- Accessible page titles that identify both page and Unfar context.
- Visible labels, programmatic names, descriptions, required state, error association, and grouping.
- Status, supply mode, availability, selection, severity, and role never conveyed by color/icon alone.
- Mutation, expiry, polling interruption/recovery, success, and validation announcements that do not chatter.
- Predictable focus recovery after route navigation, dialogs, errors, stale refreshes, mutation success, removed items, and expiration.
- Minimum target size and spacing per WCAG 2.2; primary touch controls are at least 44px, preferably 48px.
- Reflow without two-dimensional scrolling at 400% zoom except genuinely tabular content in an accessible scroll region.
- Text spacing overrides do not clip or overlap content.
- Reduced-motion behavior follows Section 3.4.
- Every semantic token pairing is contrast-tested in code and in rendered context.
- Dialogs, disclosures, tabs, and menus implement their complete native/ARIA keyboard and focus patterns.
- Tables have captions or labelled regions, correct header associations, and equivalent mobile labels.
- Claim countdowns provide absolute expiry, do not force interaction beyond authoritative expiry, and recover from reload using server state.
- Clerk and LiveKit third-party surfaces receive wrapper-level accessibility verification; unsupported internal defects are documented rather than hidden.
- Screen-reader spot checks cover current context, navigation, discovery card, form error, claim expiry, Proposal acceptance, active Journey, dialog, Admin table, and Safety conversation.

## 12. Phase contracts

### 12.1 Phase 7A — Design foundation

Scope:

- Add semantic CSS/Tailwind tokens, system typography, Unfar metadata and text wordmark treatment.
- Build repository-owned primitives defined in Section 7.
- Introduce shared responsive root, participant, Admin, and Safety navigation primitives without moving authorization out of server layouts.
- Add skip link, focus, live-region, reduced-motion, page-width, and state infrastructure.
- Restyle `/`, `/sign-in/[[...sign-in]]`, `/sign-up/[[...sign-up]]`, and `/account-deactivated` as foundation proving surfaces.
- A component showcase is optional only when development-only, excluded from production routing/build output, free of real participant data, and removable without affecting application behavior. A production-accessible showcase route is prohibited.

Dependencies: approved tokens and terminology; existing Clerk/root/access-state layouts; no database dependency.

Exclusions: Explorer workflow redesign, Teleporter workflow redesign, Admin/Safety workflow redesign, API changes, schema changes, lifecycle changes, new images/logo, or new component framework.

Exit criteria:

- Tokens and primitives have structural, interaction, accessibility, and contrast tests.
- Four assigned routes render coherently at representative widths.
- Existing server guards, Clerk behavior, access synchronization, and deactivated routing pass unchanged.
- TypeScript, zero-warning ESLint, production build, and `git diff --check` pass.

### 12.2 Phase 7B — Explorer surfaces

Routes: `/viewer`, `/viewer/requests`, `/viewer/requests/[id]`, `/viewer/operator-application`.

Scope includes current discovery, ordinary destination request, Live Moments, Guided Experiences, supply details within existing components, held claims and expiration, Request/Proposal/Agreement progression, active Journey and media recovery, authorized cancellation/rescheduling, history, Reviews, Feedback, Safety Reporting, simulated Tips, profile, Teleporter application, and every existing loading/empty/error/stale/conflict/expired/unavailable/restricted/read-only/recovery state.

Dependencies: Phase 7A primitives; existing Explorer layout and API projections; completed Phase 3–6 authorities.

Exclusions: new discovery route, search/ranking/filter policy, map, coordinates, new claim or acceptance behavior, new account/role switch, payment semantics, or API aggregation solely for design convenience.

Exit criteria:

- Every Explorer state uses the shared system and Unfar terminology.
- Immediate, ordinary scheduled, Live Moment, and Guided Experience paths remain behaviorally identical.
- Reload recovery works for claim, Proposal, accepted/upcoming, active, completed, and canceled states.
- Keyboard, screen-reader, 320–1440px, 400% zoom, reduced-motion, privacy, lifecycle, concurrency-facing error, and browser screenshot checks pass.
- Relevant Phase 3–6, Feedback, Reviews, Safety, Tips, account, polling, active-visit, camera, Prisma, TypeScript, lint, build, and diff checks pass.

### 12.3 Phase 7C — Teleporter surfaces

Routes: `/operator`, `/operator/opportunities`, `/operator/opportunities/[id]`.

Scope includes current profile/eligibility setup, online state, immediate offers, Request discovery, Proposal creation/revision/withdrawal, Agreements, active Journey/media preparation, Live Moment creation and management, Guided Experience template/occurrence creation/publication/archive/replacement, cancellation/restoration representation, history, Reviews, Safety Reporting, simulated Tip receipt where exposed, and all restricted/inactive/ineligible/stale/loading/empty/error/recovery states.

Dependencies: Phase 7A; existing Teleporter server guard, marketplace readiness, supply, Proposal, Agreement, Trip, and history projections.

Exclusions: new Teleporter capability, owner/admin mutation, occurrence recurrence, rescheduling Guided Trips, notification, matching, ranking, or supply policy.

Exit criteria:

- Context, setup requirements, online state, incoming activity, supply modes, active Journey, and history are visually distinct and semantically clear.
- Offer/claim expiry, stale supply version, concurrent capacity conflict, restoration, and ineligible cancellation use authoritative results.
- Existing activeTrip, polling, media, proposal, reservation, cancellation, supply, Safety, Review, and Tip behavior passes unchanged.
- Full responsive, accessibility, privacy, Phase 3–6, and engineering verification passes.

### 12.4 Phase 7D — Admin and Safety surfaces

Routes: `/admin`, `/admin/participants`, `/admin/destinations`, `/admin/operator-applications`, `/admin/operator-applications/[id]`, `/admin/journey-requests`, `/admin/proposals`, `/admin/agreements`, `/admin/safety-reports`, `/admin/safety-reports/[id]`, `/safety-support`.

Scope includes existing participant governance, destination management, Teleporter applications, lifecycle read projections, Safety report list/detail, triage, assignment, internal notes, isolated participant conversations, restriction proposal/dual authorization/reversal, and Safety-support inbox. It supplies dense desktop presentation and complete mobile fallbacks while separating participant-visible, Administrator-only, and Safety-confidential information.

Dependencies: Phase 7A; existing Admin and Safety authorization, account lifecycle, projection, concurrency, audit, and privacy boundaries.

Exclusions: new Administrator authority, bulk action, report category/severity policy, moderation policy, notification, export, analytics, Safety outcome promise, or cross-conversation data.

Exit criteria:

- All operational tables have semantic and mobile equivalents.
- Privilege and content audience are clear without exposing internal details to unauthorized users.
- Guessed identifiers and nonowner access remain privacy-safe.
- Admin navigation, application authorization, account governance, Safety Phase 1–4D, restriction concurrency, lifecycle projection, responsive, accessibility, and engineering suites pass.

### 12.5 Phase 7E — Integration and visual QA

Phase 7E owns no new user-facing route and introduces no capability. It reconciles all 22 routes and shared states.

Scope includes cross-role visual consistency; terminology/content audit; mobile/tablet/laptop/wide verification; WCAG 2.2 AA audit; keyboard-only walkthroughs; screen-reader spot checks; reduced-motion; 400% zoom and text spacing; loading/offline/retry; stale and concurrency conflicts; Clerk/account transitions; active media; route-by-route visual regression; supported-browser review; and every established functional/database regression.

Dependencies: completed and separately checkpointed 7A–7D.

Exclusions: redesigning during QA without diagnosis, weakening tests to accept drift, introducing product decisions, or folding deferred capability into a visual fix.

Exit criteria:

- Every route/state in Sections 13 and 14 has reviewed browser evidence at required widths.
- No unresolved critical/serious accessibility issue; any third-party limitation is documented with safe mitigation.
- No unintended horizontal overflow, clipped focus, obscured action, inaccessible dialog, announcement churn, private-data leak, or lifecycle misrepresentation.
- All structural, browser, accessibility, API/privacy, PostgreSQL, concurrency, lifecycle, Prisma, TypeScript, lint, build, and diff verification passes independently.

## 13. Route-to-phase inventory

All 22 current page routes are assigned below. Dynamic identifiers are existing route parameters, never display authority.

| Route | Context | Primary phase | Phase 7E evidence |
|---|---|---|---|
| `/` | Public entry and authenticated redirect | 7A | Public, signed-in, deactivated redirects |
| `/sign-in/[[...sign-in]]` | Authentication | 7A | Clerk loading/error/mobile/zoom |
| `/sign-up/[[...sign-up]]` | Authentication | 7A | Clerk loading/error/mobile/zoom |
| `/account-deactivated` | Account state | 7A | Authorized redirect and sign-out |
| `/viewer` | Explorer discovery/dashboard/active Journey/history | 7B | All lifecycle and supply states |
| `/viewer/requests` | Explorer Journey Requests | 7B | Empty/loading/open/terminal/history |
| `/viewer/requests/[id]` | Explorer Request, Proposals, Agreement | 7B | Guessed ID, stale, accept/conflict/retry |
| `/viewer/operator-application` | Explorer Teleporter application | 7B | Eligibility/status/withdrawal/error |
| `/operator` | Teleporter setup/offers/supply/active/history | 7C | Eligibility, supply, media, restoration |
| `/operator/opportunities` | Teleporter Request discovery | 7C | Empty/loading/private/stale |
| `/operator/opportunities/[id]` | Teleporter Proposal management | 7C | Create/revise/withdraw/conflict/history |
| `/admin` | Authorized redirect | 7D | Redirect and unauthorized denial |
| `/admin/participants` | Participant governance | 7D | Dense/mobile/actions/errors |
| `/admin/destinations` | Destination governance | 7D | Empty/edit/state/mobile |
| `/admin/operator-applications` | Application queue | 7D | Empty/filter-state/detail navigation |
| `/admin/operator-applications/[id]` | Application review | 7D | Guessed ID/concurrency/audit-safe detail |
| `/admin/journey-requests` | Lifecycle inspection | 7D | Privacy-safe dense/mobile projection |
| `/admin/proposals` | Lifecycle inspection | 7D | Privacy-safe dense/mobile projection |
| `/admin/agreements` | Lifecycle inspection | 7D | Legacy-null/current schedule/history |
| `/admin/safety-reports` | Safety queue | 7D | Triage states/confidentiality/mobile |
| `/admin/safety-reports/[id]` | Safety detail and coordination | 7D | Assignment/notes/conversations/restrictions |
| `/safety-support` | Safety-support inbox | 7D | Empty/loading/conversation/privacy/mobile |

## 14. State and visual verification matrix

For each applicable route, capture deterministic rendered-browser evidence at 390px and 1440px. Add 320px for constrained mobile, 768px for navigation/form transformation, 1024px for operational layout, and 400% zoom where the layout pattern changes. Sensitive fixtures use synthetic disposable data and screenshots contain no credentials or real participant information.

| Area | Required states |
|---|---|
| Shell/navigation | public, signed out, Explorer, Teleporter-capable, Admin, Safety support, current route, wrapped/mobile, unauthorized |
| Authentication/account | Clerk loading/error, sign-in/up, active, inactive, deactivated, restricted notice, sign-out |
| Discovery | loading, empty, populated, mixed modes, exhausted, expired, unavailable, partial network failure |
| Claims | initiating, held, countdown thresholds, reload, abandon, expired, stale, capacity conflict, three-claim limit |
| Request/Proposal | draft/open, no Proposals, active Proposal, fixed/windowed confirmation, invalid time, decline/withdraw/revise, converted, expired, conflict |
| Agreement/reservation | accepted, upcoming, legacy null, current reschedule, released/canceled, privacy-safe participant projections |
| Journey | waiting, accepted, media preparing, active, reconnecting, end/cancel pending, completed, canceled, no Teleporter available |
| Supply management | draft, published, paused, archived, expired, occurrence draft/published/archive/replacement, claims, committed/restored capacity, stale version |
| Post-Journey | Review unavailable/available/submitted/hidden, Feedback pending/submitted/skipped/reloaded, simulated Tip available/submitted/retry |
| Safety | report dialog, submitted, list/detail, triage, assignment, internal note, isolated conversations, restriction proposal/approval/rejection/reversal, concurrent change |
| Admin | empty/populated tables, row cards, pending actions, success, validation, stale conflict, guessed ID, unauthorized |
| General | loading, empty, success, warning, error, offline, retry, reduced motion, keyboard focus, long text, large text, no horizontal overflow |

Automated checks:

- Axe or an equivalently maintained accessibility engine against rendered representative routes, with manual review because automation is incomplete.
- Programmatic contrast verification for every foreground/background token and rendered-state override.
- Keyboard scripts/walkthroughs for navigation, forms, claim acceptance, Journey actions, dialogs, tables, and Safety workflows.
- Screen-reader spot checks with at least one Windows/browser pairing and one mobile-equivalent pairing available to the team; document tool/version.
- Screenshot snapshots with stable synthetic fixtures, fixed viewport, disabled nondeterministic motion, and masked authoritative countdown seconds where necessary. Snapshot approval must not hide functional or accessibility failures.
- Overflow detection at all representative widths and text spacing/zoom overrides.
- Real-browser inspection is mandatory; source-text validators alone cannot approve a checkpoint.

## 15. Functional regression matrix

Run each relevant suite independently; do not replace database/concurrency verification with screenshots.

- Phase 3 and 4 immediate lifecycle, Trip roles, polling, active-visit recovery, camera switching, and PostgreSQL concurrency.
- Journey Request, versioned Proposal, Agreement, exact-start, reservation, activation, release, and historical projection suites.
- Rescheduling service, database, and participant UI suites; prove Guided rejection and ordinary scheduled preservation.
- Bilateral Review integrity/UI and both performed-role reputation projections.
- Private Feedback and reload recovery.
- Safety Reporting Phase 1–4D, Admin/Safety UI, PostgreSQL integrity, restriction/account-state concurrency, and conversation isolation.
- Simulated Tips structural, privacy, UI, and PostgreSQL suites.
- Account lifecycle, access-state synchronization, Teleporter application/governance, Administrator authorization, and three-role compatibility.
- Terminology and viewer-runtime contracts.
- Phase 6 foundation, Live Moment, Guided Experience, integration, lifecycle convergence, restoration, and cross-mode concurrency suites.
- Every new Phase 7 token, primitive, route, content, accessibility, responsive, and visual validator.

Database suites use only their existing explicitly configured disposable variables and safety locks. They never fall back to `DATABASE_URL`, print credentials, use `db push`, alter prior migrations, or perform destructive work after a guard failure.

Engineering verification for every checkpoint:

1. `prisma format`.
2. `prisma validate`.
3. `prisma generate`.
4. TypeScript with `--noEmit`.
5. Repository-wide ESLint with zero warnings/errors.
6. Production build.
7. Phase-specific browser/accessibility/visual checks.
8. Relevant functional and PostgreSQL regressions.
9. `git diff --check`.
10. Exact changed-file and working-tree review excluding `reference-materials/`.

## 16. Explicit exclusions

Phase 7 does not add:

- New lifecycle states, booking records, or a parallel lifecycle.
- New authorization, capability, role-switch mutation, Administrator power, or account-state policy.
- Recurrence, named-time-zone scheduling, DST generation, workers, cron, or materialization horizons.
- Group Journeys or multi-Explorer capacity.
- Maps, coordinates, distance-aware matching, or geolocation policy.
- Photo upload/storage, supplied imagery, sharing, public profiles, or social features.
- Push, SMS, email, WhatsApp, or other notifications.
- Richer chat or LiveKit data-channel camera-request features.
- Ranking, recommendations, personalization, analytics, or export.
- Real payments, processors, payouts, refunds, taxes, fees, balances, settlement, or chargebacks.
- Pricing-policy or simulated-Tip behavior changes.
- New Review, reputation, Feedback, moderation, or Safety policy.
- Database schema/migration changes unless a later checkpoint first proves they are strictly necessary to represent already approved behavior and receives separate approval. A visual preference alone is insufficient.
- Broad dependency replacement, a hosted design system, or a third-party component framework without explicit approval.
- Dark mode.
- A final logo, generated brand asset, or fabricated photography.
- Inspection or use of `reference-materials/`.

## 17. Risks and constraints

- Explorer and Teleporter dashboards are large stateful client components. Extract presentation in small behavior-neutral slices; preserve effect dependencies, abort controllers, refs, polling cadence, and recovery transitions.
- Server layouts are authorization boundaries. Shared shells must accept already-authorized context and must not move guards into client code.
- Polling can steal focus or cause live-region chatter if refreshed collections remount. Stable keys, deduplicated announcements, and explicit focus policy are required.
- Countdown screenshots and tests are nondeterministic unless time is controlled; do not freeze production authority to make a visual test pass.
- Clerk and LiveKit own parts of the rendered experience. Wrapper styling must not rely on unsupported internal selectors or conceal third-party accessibility limitations.
- Admin and Safety density creates mobile and confidentiality risk. Responsive transformations must preserve labels, audience, status, and action authority.
- Brand renaming must change participant-facing metadata/copy without renaming database/API concepts merely for aesthetics.
- Semantic token adoption can create large diffs. Phase 7A should introduce tokens/primitives and proving routes, not mechanically rewrite all later-phase surfaces.
- Visual regression baselines can normalize defects. Each baseline requires semantic, responsive, and privacy review before approval.

## 18. Settled decisions

- Product name, visual direction, all-surface scope, checkpoint order, repository-owned Tailwind approach, WCAG 2.2 AA target, mobile-first strategy, light-only theme, and behavior-preservation boundary are settled.
- Existing authorization, lifecycle, supply, capacity, reservation, Safety, privacy, pricing, Review, Feedback, reputation, Tip, and historical-access authorities are not redesigned.
- The exact semantic token proposal in this contract is the implementation baseline.
- The existing route structure remains the Phase 7 route structure; presentation may improve without inventing routes or permissions.
- Current authorized context links may be restyled and clarified; no new role-switch policy is introduced.

## 19. Genuinely unresolved decisions

No unresolved product decision blocks Phase 7A under this contract. The following implementation selections remain bounded engineering decisions and must be documented in their checkpoint without changing product behavior:

- The exact file/module organization and naming of repository-owned primitives.
- Whether mobile context navigation uses an always-visible bounded list or an accessible disclosure on a particular shell, chosen from route count and rendered testing.
- The browser/accessibility automation package, if a new narrowly scoped development dependency is needed. Adding it requires explicit dependency review but not a product-policy amendment.
- The available screen-reader/browser combinations used for Phase 7E spot checks.
- Whether deterministic visual fixtures use an existing test harness or a development-only nonproduction mechanism. Production showcase exposure remains prohibited.

If implementation discovers that an existing authorized projection cannot render a required fact without exposing private data, stop for a separate projection decision. Do not infer a new API, schema, or privacy policy from this design contract.

## 20. Definition of Phase 7 completion

Phase 7 is complete only when Phases 7A–7D are separately implemented, verified, reviewed, and checkpointed, and Phase 7E demonstrates that:

- all 22 current user-facing routes and every applicable state in Section 14 use the approved Unfar system coherently;
- the product presents one light-theme warm travel marketplace across public, Explorer, Teleporter, Admin, and Safety contexts;
- every authorized workflow remains functionally equivalent to the completed Phase 6 checkpoint;
- WCAG 2.2 AA, keyboard operation, visible focus, accessible names/errors/status, reduced motion, target size, contrast, 400% reflow, and screen-reader spot checks pass;
- mobile, tablet, laptop, wide desktop, long-content, network-failure, stale-state, reload, and active-media behavior is verified in real browsers;
- privacy and audience boundaries remain intact;
- all relevant structural, service, API, PostgreSQL, concurrency, lifecycle, and engineering suites pass independently;
- no excluded capability, schema drift, historical rewrite, generated brand asset, or broad dependency replacement was introduced;
- the final diff and working tree contain only reviewed Phase 7 work, with `reference-materials/` untouched.

Completion of this design document authorizes planning and review of Phase 7A. It does not itself authorize implementation, staging, committing, or pushing.
