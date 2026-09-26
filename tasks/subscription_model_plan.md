# Subscription model: plan for review (not built)

Status: draft for Charlie's verification, 2026-09-24. Nothing below is implemented yet.

## 1. The tiers

| | Single | Parent | Family |
|---|---|---|---|
| Price / month | Free | DKK 29.00 | DKK 59.00 |
| Price / year (−20%) | Free | DKK 278.40 (today: 275.00) | DKK 566.40 (today: 559.00) |
| Children | 2 | 3 | 8 |
| Storage | 500 MB | 1 GB | 100 GB |
| Who can be invited | nobody (see D1) | co-parent(s) | co-parents, extended family, caregivers |
| Moments | yes (own journal) | yes, between parents | yes, with the family |
| Necessities & Wishlists (Lists) | yes | yes | yes |
| Custody planning | no | yes | yes |
| Media Library | no | yes | yes |
| 30-day free trial | see D3 | yes | yes |

Today's code, for comparison:
- Free allows 1 child and invites with no limit.
- Paid plans allow unlimited children.
- Nothing is gated by feature.
- Storage has no limit.
- The first charge happens when the customer checks out, with no trial.
- The only trial is a per-person 30 days of Family-level access.

## 2. How to enforce it: each child is paid for by exactly one plan

Today, a child counts as "covered" if **any** of its parents happens to have a plan good enough. That works for yes/no questions, but it can't:
- count children against a limit (8 children *on which plan?*)
- block a downgrade
- tell anyone whose card a child depends on

**Proposal:** every child has exactly one **paying plan**, stored as `Child.planId`. Everything follows from that one field.

1. **Limits are counted per plan.**
   - Children: the number of children whose `planId` is this plan.
   - Storage: the media of those children (§5).
   - Features: a child's features come from its paying plan. Custody planning and the Media Library are on for a child whose plan is Parent or Family, for everyone who can see that child.
2. **Who can be invited is decided by the child's plan.**
   - Inviting a co-parent to a child needs Parent or higher.
   - Inviting family (grandmother, aunt, caregiver) needs Family.
   - The invite screen shows the upgrade before the invite is sent.
3. **Who can add a child to a plan:**
   - the plan owner can
   - on a **Family** plan, anyone the owner has invited *into the plan* can too
   - on Single and Parent, only the owner can

   This single rule makes both of your examples work (§3).
4. **Moving a child to another plan** ("take over"): any parent or guardian of the child can move it onto their own plan if their plan has room. This already exists as the "take over this subscription" offer; it becomes a single action that sets `planId`.
5. **Downgrading or cancelling:** a lower tier can't be picked if the plan's current use exceeds it. That means more children than the lower tier allows, an invited role the lower tier doesn't allow, or storage over its limit. The checkout shows the lower tier greyed out, with the reason ("You have 3 children; Single allows 2"). The server refuses it too; the check isn't only in the app.
6. **One source of truth:**
   - A plan catalogue in `packages/shared` holds the limits, features, allowed roles and prices.
   - The API checks it on every write: add child, invite, upload, custody routes, media library routes, plan change.
   - The app reads the same catalogue for the paywalls, and the greyed-out tiers in checkout.

## 3. Your examples, under this rule

**a) Single parent A with one child (C1) invites co-parent B.**
- Inviting a co-parent needs Parent, so A upgrades Single → Parent (DKK 29). B joins C1; C1 is paid for by A's plan.
- B also has a child C2 from another relationship.
  - B can add C2 on B's own free Single: B is on no paid plan of their own, and a Single covers 2 children.
  - A's Parent plan doesn't take C2, because on a Parent plan only the owner adds children (rule 3).
- To invite C2's other parent D, B upgrades to Parent. B then manages C1 (A pays) and C2 (B pays).
- D sees only C2. A never sees C2. Access is per child, as today.
- ✅ **Makes sense.** One consequence to confirm (D4): B's Parent plan has room (C2 + 2 free slots), so if A stops paying, B can take over C1 instead of it locking.

**b) Single parent A (child C1) invites grandmother G.**
- ⚠️ **Correction:** inviting a family member needs Family. So **A must upgrade to Family first** (DKK 59), or G can't see C1. In your example G joins before anyone pays for Family.
  - Alternative: allow a Single to invite a few viewers (D1).
- G invites her two other children P2 and P3 *into her plan* and pays Family.
  - This is a new "invite to my plan" flow. Today every invite is to a specific child.
  - P2 and P3 add their children onto G's Family plan (rule 3), up to 8 children in total.
  - A can move C1 onto G's plan and drop back to Single, which the downgrade rule allows once C1 has moved. That's 7 of 8 children.
- When P2 invites their co-parent or the other grandparents to P2's child, it works because the child's plan (G's) is Family.
  - If that co-parent has children from another relationship, those aren't added to G's plan automatically. They go on the co-parent's own plan, unless G invites the co-parent into her plan.
- ✅ **Makes sense, with the correction above.**
- ⚠️ **Risk:** the whole extended family depends on one card. If G's payment is declined, 7 children lock for 4 households at once. Each parent gets a "take over" prompt (§4), which softens it.

## 4. Trial, declined payment, lock

- **Trial:** at signup, the user picks a plan and gets 30 days free.
  - The signup screen and the welcome email state the trial end date. The subscription page shows "Trial ends on …" and then "Renews on …".
  - Reminders go out 7 days and 1 day before the trial ends.
  - Still one trial per person, ever (as today).
- **At the end of the trial:** a paid plan starts charging.
  - If the user never added a card: the plan falls to Single if the use fits Single, otherwise the account **locks** (below).
  - Card at signup or not (D3): asking for the card up front converts better. It works with QuickPay, which authorises now and charges on day 30.
- **Declined payment (your rule: declined is declined):**
  - On the first failed charge the plan goes **LOCKED**. The 7-day grace period is removed.
  - The owner gets email and push with an "update card" link.
  - The other parents of the affected children get a "take over" prompt.
- **What locked means (D5):** read-only.
  - Everything stays visible and downloadable.
  - Nothing new can be posted, uploaded, planned or invited to the plan's children.
  - Nothing is ever deleted.
  - Paying, or moving the child to another plan, unlocks it immediately.
- **Legal:** price changes for existing paying customers need advance notice (Danish consumer rules). New prices apply to new subscriptions; existing ones move at their next renewal after notice (D7).

## 5. Storage: "per user, by what they can access"

**My reading:** a user's usage is the total size of all media they can see, not the space it takes on the server. Taken literally, that breaks in two places:
- **One upload counts many times.** A photo of a grandchild counts for the parent, the co-parent and the grandmother at once.
- **The smallest plan blocks everyone.** Say G is on Single (500 MB) and can see a family's 20 GB. Either G's own uploads are blocked, or the parents' uploads are refused because G is "full".

**Recommendation:** count per **plan**, by what its children hold.
- A child's media counts toward the plan that pays for that child. Uploads by anyone who can post to the child count there, whoever the uploader is.
- Each file counts once, at its original size. Thumbnails and previews are free, so the number matches what customers see.
- It is still "by access, not by physical disk". A photo shared into a message thread doesn't count again.

A per-user reading is possible, but a Family member would then see one number and the parents another for the same photos. That's confusing and hard to explain in support (D6).

**Enforcement:**
- A running total per plan.
- Uploads are checked before they're accepted, with a `STORAGE_FULL` upgrade prompt.
- A usage bar on the subscription page, with warnings at 80% and 95%.
- A daily upload cap per user against abuse (e.g. 2 GB a day).

## 6. Selling points (USPs) worth highlighting

These already exist in v3.0 but aren't in your tier lists:
- **Privacy built for children:**
  - Photos, videos and medical info are encrypted at rest.
  - No GPS or location tracking, and no ads.
  - Data stays with KidCom (EU); GDPR-ready account deletion.
- **Fewer conflicts between homes:**
  - Custody schedules with Danish presets (7/7, 9/5, 14/2 …) and Danish holidays.
  - **Swap requests** with approve/decline, a clear record of who agreed to what.
  - Messages stay about the child.
- **Each person sees only their own children.** A step-family's children stay separate, and each adult only sees the children they were invited to (example a).
- **The child's essentials in one place:** health and medical info, contacts, growth, school timetable, and packing lists that travel with the child between homes.
- **Signs in the way parents want:** Google, Microsoft or password; two-step sign-in; stays signed in on the phone.
- **Nordic languages:** Danish, Norwegian and Swedish are ready to translate.

Suggested for Family's page: "one subscription covers the grandparents' whole family: up to 8 grandchildren".

## 7. Decisions needed from you

- **D1.** Can a Single user invite anyone at all?
  - My proposal: no; any invite means an upgrade.
  - Alternative: a Single may invite 1–2 viewers (e.g. grandparents) who can only look at Moments.
- **D2.** Caregivers (babysitter, daycare): Family only, or Parent as well?
- **D3.** Trial:
  - Does Single have a trial at all? Being free, it doesn't need one. Or does every new user get 30 days of Family and then choose?
  - Card at signup, or no card?
- **D4.** A child paid for by A: if A lapses, can co-parent B take it over on B's own plan? (Recommended: yes, prompted.)
- **D5.** Locked = read-only (recommended), or fully blocked?
- **D6.** Storage counted per plan (recommended), or literally per user?
- **D7.** Annual prices: exact 20% (278.40 / 566.40), or rounded (e.g. 279 / 566)? Existing subscribers: keep today's price (grandfathered), or move them with notice?
- **D8.** Existing v2 users over the new limits (e.g. a Free user with 3 children): lock, or grandfather until they change plan?

## 8. Build plan, once the decisions above are made

1. **Catalogue and data model.**
   - Plan catalogue in `packages/shared`: limits, features, allowed roles, prices.
   - Migration: `Child.planId`, a `PlanMember` table (the "invite to my plan" people), `LOCKED` status, `Plan.storageUsedBytes`.
   - Backfill: each existing child goes to its creator's plan.
2. **Entitlement.**
   - Replace today's "any parent's plan covers it" check with the child's paying plan.
   - Add feature checks (custody, media library), the child limit, invite-role gating and the storage check.
3. **Billing.**
   - Trial on signup (with or without a card, per D3) and reminders at 7 and 1 days.
   - Lock on decline (grace period removed); unlock on payment.
   - Take over and move a child; downgrade blocking; new prices.
4. **App.**
   - Plan picker at signup with the trial end date; subscription page showing trial end, renewal date, usage bars and greyed-out tiers with reasons.
   - Upgrade prompts at invite, add child, custody and media library.
   - Locked banner with "update card" and "take over"; the "invite to my plan" flow.
5. **Tests.**
   - Both examples as end-to-end scenarios.
   - Every tier × role × action as an API matrix.
   - Downgrade blocking, lock/unlock, trial expiry, storage limits.
   - A price test against QuickPay test mode.
6. **Docs.** Deployment guide and translations.

Rough size: 4–6 days of work, most of it in steps 2–4.
