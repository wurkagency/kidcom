# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Four confirmed personas (per the approved PRD — see Evidence on Hand):

- **Primary Co-Parent** — the account owner and daily organizer. Coordinates custody shifts, tracks pediatrician appointments, manages clothing/shoe sizes, logs shared memories, keeps private notes.
- **Secondary Co-Parent** — an invited collaborative partner. Views custody schedules, syncs external calendars, requests date swaps, participates in messaging/wishlists.
- **Extended Family** (grandparents, step-parents) — the "circle of care." Views approved journal photos/videos, contributes to wishlists, receives logistical updates when authorized.
- **The Child** (represented profile, not a login) — the beneficiary the product organizes around: consistent parenting, up-to-date sizes, timely medical checkups, a preserved memory bank.

## Product Purpose

SplitKid ("KidCom" in-product — see Brand Commitments) is a child-centered well-being and communication platform for separated parents, co-parents, and blended families. It exists to put the child's joy, developmental milestones, health, and daily rhythms at the center of family collaboration, rather than logging conflict or building a legal record.

Success is transparent day-to-day coordination between households (custody, medical, sizing, memories) that reduces friction between co-parents rather than adding to it.

## Positioning

Unlike traditional co-parenting tools built around legal contention, conflict logging, or courtroom documentation, SplitKid is deliberately not conflict-focused — it treats the child's needs and memories as the organizing principle instead. Confirmed as durable, cross-skin product positioning (2026-09-22), independent of which visual skin is active.

Note: individual skins may add their own emotional register on top of this (e.g. Quiet Architecture's and Aura's design docs both separately describe a "calm, de-escalating" visual language) — that tone is scoped to those skins' own design docs, confirmed **not** to be a cross-skin product requirement every future skin must inherit.

## Operating Context

- Custody scheduling: repeating patterns (7/7, 10/4, 9/3, 2-2-3, custom), swap requests with one-tap approval, multi-category events (handovers, school, medical, holidays), external calendar sync (Google, Outlook).
- Child health: medical/preventative schedule timeline (age-appropriate milestones, seeded per country — Denmark's schedule is the one currently seeded), allergy/condition badges, WHO growth percentile charts.
- Shared lists: sized Necessities (synced to the child's current clothing/shoe size) and collaborative Wishlists ("I'll provide this" claiming, without spoiling surprises for the child).
- Journal/Moments: chronological photo/video/story feed, multi-child filtering, reactions and comments.
- Media gallery: centralized asset hub across journal/messages/profiles, filter by child/date/type, batch export of originals.
- Messaging: direct/group channels between co-parents and family, plus a private "notes to self" feature explicitly not visible to the other parent.
- Billing/onboarding: a paying parent invites co-parents and extended family as free users; every invitee gets a 30-day all-access trial, so collaboration starts before any billing friction.

## Capabilities and Constraints

- **Denmark-specific data**: Danish public holidays auto-populate the calendar; the medical milestone schedule currently seeded is Denmark's (`countryCode: "DK"`, `packages/db/prisma/seed.ts`) — other countries' schedules are an open gap, not yet built.
- **GDPR / minor data**: medical info (condition/description/emergencyNote) is encrypted at rest (Art. 9 special-category data about a minor) — see `apps/api/src/lib/medicalEncryption.ts`. Data export/anonymization is a stated requirement per the PRD.
- **Subscription tiers** (DKK): Father/Mother (free, 1 child, basic features), Parents (29 DKK/mo, full 2-parent collaboration), Family (59 DKK/mo, unlimited children + extended family). See the roles/subscription spec under Evidence on Hand for the fuller permissions model.
- **Multi-skin theming is a durable, user-facing product feature** (confirmed 2026-09-22), not a transitional migration toward one final look. Users pick their own skin in Settings → Themes; today's skins are Greenkeeper (default), Sky, Quiet Architecture, and Aura. New skins are expected to keep appearing over time as real, permanently-selectable options, not one-off experiments to be torn down later.
- **Web/PWA only** — no native app is currently planned; "mobile" means the responsive/PWA web experience, not a native build.
- **Storage**: media currently lives on local disk (`MEDIA_STORAGE_PATH`) behind a `MediaStorage` interface specifically so it can move to S3-compatible object storage later without touching route/worker code — that move hasn't happened yet.

## Brand Commitments

- The project/legal name is **SplitKid**; the in-product brand name shown to users is **KidCom** ("Kidcom" in some copy) — both names are correct and refer to the same product, future work should not treat this as a typo or inconsistency to "fix."
- Primary typeface is **Plus Jakarta Sans**, used across every skin to date — a deliberate, pinned choice (confirmed against multiple skins' own design docs), not a default left unconsidered.

## Evidence on Hand

Paths below are relative to this repo (`app/`) unless noted otherwise. The product brief, subscription spec, and per-skin design docs live one directory **above** this repo, in the wider project workspace, not inside git — treat them as real authored evidence, just not something a build step or deploy can read from a relative path inside `app/`.

- Approved product brief (outside this repo): `docs/KidCom - Assets/splitkid_project_prd_product_brief_v2.md`.
- Roles/subscription spec (outside this repo): `docs/roles_and_subscription_spec.md`.
- Per-skin design systems (outside this repo): `docs/Themes/Aura/haven_aura/DESIGN.md`, `docs/Themes/Spring Morning/DESIGN.md` (Quiet Architecture), `docs/stitch_splitkid/kindred_path/DESIGN.md` (Greenkeeper).
- Real, licensed project photography (inside this repo): `apps/web/public/images/welcome-hero.jpg`, `apps/web/public/images/auth-hero.jpg` — use these (or request new ones from the project owner) rather than sourcing/generating stock or hotlinked imagery.
- No native app exists or is planned — do not assume iOS/Android-specific patterns apply.

## Product Principles

1. Child-centered, not conflict-focused — every feature should read as organizing around the child's needs/memories, never as a conflict-logging or evidentiary tool.
2. Transparent logistical harmony between two (or more) households — custody, medical, and sizing state should be visible and current to everyone authorized, without either parent having to chase the other for it.
3. The journal/media feed is a living memory archive, not just an activity log — treat it as something a family would want to revisit years later.
4. Frictionless multi-party onboarding — a paying parent's invite should never put a co-parent or grandparent behind a paywall.
5. Visual skin is a user choice, not a brand mandate — product and interaction decisions must hold up across every skin; a skin's own emotional/visual register (e.g. Aura's calm tone) is that skin's design decision, not a constraint on the others.
