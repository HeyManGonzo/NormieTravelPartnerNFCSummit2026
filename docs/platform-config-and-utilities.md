# Platform: Configuration Dashboard & Utilities Backlog

_Post-summit product direction. Companion to [`post-summit-roadmap.md`](./post-summit-roadmap.md)
(which covers the white-label vision, multi-tenancy, and the sponsor→event→city information
hierarchy). This doc focuses on two things: (1) the **configuration dashboard** that lets us
theme and content-manage Gemel per event — including live/ad-hoc content — and (2) a
**prioritised utilities backlog** for future features. Opinions are marked **[My take]**._

_Author's framing: after NFC Summit 2026, Gemel becomes a **generic, themeable event
concierge**. The summit deployment is the reference implementation; everything hardcoded for it
becomes configuration. The dashboard is how that configuration gets managed without code +
redeploy (which is the current process — see the checklist in the roadmap)._

---

## Part A — The Configuration Dashboard

### A.1 What it is

A web admin where an organiser configures and runs their event's concierge. It replaces today's
"edit `lib/prompts/system.js` + `programme.json`, regenerate embeddings, redeploy" procedure
with editable data. The runtime reads a per-event config object (shape sketched in the roadmap)
instead of hardcoded constants.

### A.2 The four content types it manages

You named three (event-specific, sponsored, ad-hoc). Mapping them to the existing 3-layer
hierarchy, plus the identity/theme layer that sits above all of them:

| # | Content type | Lifespan | How it reaches the visitor | Maps to |
|---|---|---|---|---|
| 0 | **Identity & theme** — event name, dates, venue, city, logo, colours, fonts, agent name/persona, languages | Whole event | Branding + system-prompt identity block | (config object) |
| 1 | **Sponsored content** — sponsors, placements, disclosure text, priority, offers/deals | Whole event | Prompt sponsor block + disclosed in answers | Layer 1 |
| 2 | **Event content** — programme/sessions, side events, speakers, venue map, organiser picks | Whole event | Baked into prompt (compact) + retrievable (KB) | Layer 2 |
| 3 | **Ad-hoc content** — live, perishable updates: room changes, "free coffee at booth X till 3pm", shuttle delays, surprise sets | Minutes–hours (TTL) | Injected into live context + optional push + optional banner | **New layer** |

**[My take]** The ad-hoc layer is the genuinely new and valuable idea here. It turns Gemel from
a static planner into a **live event companion**. It's also the layer that most needs good
tooling, because it's edited *during* the event, often from a phone, under time pressure.

### A.3 How ad-hoc content should work

Each ad-hoc item ("announcement") is a row with: `title`, `body`, `startsAt`, `expiresAt`,
`priority` (info / important / urgent), `channels` (context | push | banner), optional
`audienceFilter` (e.g. only people attending Day 2, or interested in art), and `status`.

Three delivery channels, in build order:

1. **Passive (in-context)** — active announcements are injected into the system prompt's
   *dynamic* block (the uncached tail, already separated for caching). Gemel surfaces them when
   relevant: _"Quick heads-up — the keynote moved to Stage B."_ **[My take] Build this first.**
   Zero new infrastructure, immediately useful, and it rides the prompt split we already shipped.
2. **Proactive (push)** — web-push for high-priority items (room change). Depends on the
   Notifications utility (B1) + PWA (B-foundation).
3. **Visual (banner)** — a dismissible in-app banner for the single most urgent item.

**Critical safety rule:** ad-hoc (and all organiser) content is **untrusted input to the LLM**.
Treat it as data, never instructions — sanitise it and wrap it so a malicious/typo'd
announcement can't become a prompt injection ("ignore your rules…"). This is non-negotiable.

### A.4 Roles (who touches the dashboard)

- **Org admin** — billing, branding, users.
- **Event editor** — programme, sponsors, pre-event setup.
- **On-site ops** — a dead-simple **mobile** view whose only job is pushing ad-hoc announcements
  in ~10 seconds during the event. **[My take]** Don't make ops navigate the full dashboard on
  their phone mid-event — give them a stripped "post an update" screen. This detail decides
  whether the ad-hoc feature actually gets used on the day.

### A.5 Data model (extends the roadmap's `organisations` / `events`)

```
organisations { id, name, plan, ... }
events        { id, orgId, config(jsonb), status, ... }   ← identity/theme/branding live here
sponsors      { id, eventId, name, description, placement, disclosureText, priority, offer }
announcements { id, eventId, title, body, startsAt, expiresAt, priority, channels, audience, status, createdBy }
admin_users   { id, orgId, role }                          ← org-admin | editor | ops
audit_log     { id, orgId, actor, action, target, before, after, at }
sessions/itineraries: add eventId FK (from roadmap)
```

### A.6 Design principles **[My take]**

- **Config as data, not code.** Every checklist step in the roadmap becomes an editable row.
- **Preview before publish** — especially sponsor disclosures and ad-hoc wording. The organiser
  must see how it reads in chat *and* hear it in voice before it's live.
- **Disclosure is a structural guarantee, not a prompt hope.** The platform should make it
  *impossible* to ship undisclosed paid placement — disclosure text is a required field and the
  prompt builder always emits it. This honesty is your ethical moat; enforce it in code.
- **Versioning + audit** on sponsors and announcements (money + live ops = you need rollback and
  "who changed what").
- **Don't build a CMS from scratch, and don't build self-serve too early.** Build an **internal
  admin** first (you configure events for your first 2–3 clients). You'll learn the real
  abstractions from doing it manually. Only then build organiser self-serve UI. Building
  self-serve before you have paying events = building the wrong thing well.
- **Reuse the stack you have.** Supabase already gives you Postgres + Auth (organiser/attendee
  accounts) + **Realtime** (for live ad-hoc + meetups). Resend is already wired for email. Don't
  add new vendors for these.

---

## Part B — Utilities & Features Backlog

Prioritised by visitor/organiser value vs. effort. Your two seeds (notifications, attendee
meetups) are B1 and B2.

### Foundation — PWA + offline (build before B1)
Installable web app + offline cache of the latest itinerary. **[My take]** This is the
enabler: web-push needs a service worker, attendees roam on patchy venue WiFi, and "add to home
screen" gives an app-like presence with zero app-store friction. Low effort, unlocks everything
proactive. Do this first.

### B1 — Notifications (your idea #1)
- **Channels:** web-push (primary, via PWA), email (pre/post-event, via existing Resend), in-app.
  Skip SMS unless premium — it's expensive and consent-heavy.
- **Use cases:** ad-hoc pushes (room changes), **itinerary reminders** ("Normies talk starts in
  15 min", "your dinner's in an hour"), "what's on now/next today", post-event follow-up.
- **Needs:** consent + a preference centre + quiet hours; a scheduler (cron) anchored to the
  user's itinerary timestamps. **[My take]** The reminder use-case is the quiet winner — it makes
  the itinerary *active* instead of a static document, and it's the feature attendees will
  actually thank you for. Note CLAUDE.md §14 excluded push from V1 — this is the deliberate
  post-summit expansion.

### B2 — Attendee meetups / interest matchmaking (your idea #2) **[My take: this is the differentiator]**
Leverage that attendees are **physically co-located** and you **already know their interests**
(trip profile + chat). Gemel becomes a social broker:
> _"Three other attendees into generative art are free around 3pm near Stage B — want me to
> suggest a coffee?"_

- **Mechanics:** opt-in directory → interest + availability matching → Gemel proposes → **double
  opt-in** → reveal identities + a neutral meeting point/time. Works for 1:1 or small groups
  ("anyone want dinner in Cais do Sodré tonight?").
- **Safety/privacy is make-or-break:** opt-in only; double opt-in before any identity reveal;
  **no exact location sharing** (suggest neutral points like a stage or café, never a live pin);
  block/report from day one; easy "leave". For EU events this is real personal data — consent +
  retention + deletion required.
- **Why it matters:** serendipitous meetings are *the point* of events. This turns a solo tool
  into an engagement + retention engine, opens sponsor tie-ins (sponsored meetup spots/lounges),
  and is something no competitor is doing well. **It could be the headline feature of the
  platform.**
- **Scope discipline:** Gemel is the **matchmaker/broker**, not a social network. Don't build
  profiles/feeds/DMs. She suggests, humans confirm, the rest happens in person. Keep it small.
- Effort: medium-high (matching + consent flows + light realtime + moderation). Use Supabase
  Realtime — you already have it.

### B3 — Other backlog candidates (my additions)
| Feature | Value | Effort | Note |
|---|---|---|---|
| **Map view + directions deep-links** | High | Low–Med | Travel-app table stakes; coords already exist. Also in the app review. |
| **Personal schedule builder** | High | Med | Star sessions → conflict detection ("2 talks at 3pm") → feeds reminders (B1). |
| **Organiser analytics** | High (sales) | Med | What attendees asked, popular venues, sponsor engagement, unanswered Qs. A sellable upsell + product moat. |
| **Post-event recap & follow-up** | Med | Low–Med | "Sessions you saw, people you met, redeem sponsor offers." Extends engagement past the event. |
| **Reservations / booking hand-off** | Med | Med | Restaurant booking links; possible affiliate/sponsor revenue. |
| **Feedback / session ratings** | Med | Low | Feeds organiser analytics. (Note: CLAUDE.md V1 excluded ratings — revisit here.) |
| **Group / companion itinerary sharing** | Med | Med | Share a live plan with travel companions, not just the read-only export. |
| **Wallet / ticket integration** | Med (Web3 events) | Med | Token-gated content, POAPs, ticket verification — natural for NFC-style events. |
| **Help-desk / "ask the organiser" escalation** | Med | Low | Route questions Gemel can't answer to a human; logs become analytics. |
| **Dietary/mobility-aware routing** | Med | Low | We already collect these — actually *use* them in recommendations + accessibility. |

### B4 — Recommended sequencing **[My take]**
1. **PWA/offline foundation** → unlocks proactive everything.
2. **Ad-hoc content (passive in-context)** → cheap, high live-ops value, rides the prompt split.
3. **Notifications** (reminders first, then ad-hoc push) → makes the itinerary active.
4. **Map + directions** → fills the obvious travel-app gap.
5. **Organiser analytics** → in parallel; it's what sells the platform to the next organiser.
6. **Attendee meetups** → once consent/safety groundwork from notifications + accounts exists.
   This is the flagship — do it deliberately, not first.

---

## Part C — Cross-cutting opinions, risks & tips

- **Untrusted content → LLM.** Organiser, sponsor, and ad-hoc content are all prompt-injection
  surface. Sanitise; wrap as data; never let it override Gemel's rules. The constitutional rules
  in the system prompt are the backstop, but defence starts at ingestion.
- **Disclosure as code.** Make undisclosed sponsorship structurally impossible (see A.6). It's
  both ethics and differentiation — "the honest concierge" is a brand.
- **Privacy/GDPR is now load-bearing.** Meetups + notifications + profiles = real personal data,
  much of it at EU events. You need consent flows, a retention policy, deletion, and a DPA with
  organisers *before* shipping social features. The app review (P1) already flags the current
  lack of a retention/deletion mechanism — fix that as the foundation.
- **Per-event cost controls.** The P0 rate-limiting + spend alerts should become a **platform
  feature**: per-event quotas and budgets, so one event (or one abuser) can't burn another's
  budget. Multi-tenancy makes cost isolation a requirement, not a nicety.
- **Keep Gemel as broker, not platform.** Across all of this, the product's soul is a *concierge
  that does things for you* — planning, brokering meetups, surfacing what matters. Resist
  turning it into a generic event app with a chatbot bolted on. The agent is the product.
- **Realtime + scheduling:** Supabase Realtime (live ad-hoc/meetups) + a cron/scheduler
  (reminders) cover the new dynamic needs without new vendors. Vercel cron is fine for scheduled
  reminders; Realtime for the live bits.

---

## Quick reference — what's parked where

- **White-label vision, multi-tenancy, info hierarchy, per-event config extraction, config object
  shape, deployment checklist** → [`post-summit-roadmap.md`](./post-summit-roadmap.md)
- **Config dashboard (incl. ad-hoc live content) + utilities backlog (notifications, meetups, +)
  + product opinions** → this doc
- **Security/cost/testing hardening (rate limits done; shared-secret, CI, tests, GDPR retention
  pending)** → [`app-review-2026-06.md`](./app-review-2026-06.md)
- **Service consolidation (Tripadvisor→Places, key consolidation)** → `service-consolidation.md`

_End of document._
