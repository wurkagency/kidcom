# Management data — security, abuse and unlawful-media signals

Inventory of the data Kinnd holds (or could hold) that the admin tool
**manage.kinnd.eu** and the planned **alarm system** can use to protect the
app against abuse, fraud and unlawful media. Written 2026-09-26 against the
v3.0 schema (`packages/db/prisma/schema.prisma`).

**Status legend**

| Mark | Meaning |
|---|---|
| ✅ | Stored today |
| 🟡 | Derivable on demand from stored data (no new collection) |
| ⬜ | Not collected yet — listed with what it would take |

**Ground rules** (apply to everything below)

- Management data is **never shown in the app** — not to family members, not to
  the user it's about (except a user's own sign-in history, if we choose to
  show it). Only manage.kinnd.eu reads it, through the RLS bypass, with
  every admin read logged (⬜ — see "Governance").
- It's personal data about adults and, indirectly, children. Proposed lawful
  basis: legitimate interest in protecting children and accounts (GDPR
  Art. 6(1)(f)). Needs a DPIA, a privacy-notice section and a retention limit
  per item **before** the alarm system goes live. It is also in scope of
  data-subject access requests.
- Unlawful media (child sexual abuse material, CSAM) has its own legal rules —
  see §8. The alarm system must never "investigate" such media itself.

---

## 1. Account identity (`users`, `oauth_accounts`, `subscriptions`)

| Data | Status | Where | Security use |
|---|---|---|---|
| Email address | ✅ | `users.email` | Duplicate / throwaway accounts; disposable-domain check; match against invites |
| Email verified at | ✅ | `users.emailVerifiedAt` | Unverified accounts acting (invites, uploads) |
| Mobile number (E.164) | ✅ | `users.phone` | One verified number = one account (unique index); recycled-number detection |
| Mobile verified at | ✅ | `users.phoneVerifiedAt` | Ban evasion: a banned number can't be re-verified |
| Country of the mobile number | 🟡 | prefix of `users.phone` | Mismatch with GeoIP country / capture location |
| Number type (mobile / VoIP / virtual) and carrier | ⬜ | — | VoIP and virtual numbers are a common fraud marker. Needs a number-lookup service (e.g. Brevo/Twilio Lookup), paid per lookup |
| Number changes (requested numbers) | ✅ short-lived | `phone_verification_codes` (purpose + number, while a code is pending) | Frequent number changes. A permanent number-change history is ⬜ (codes are deleted once used) |
| Name | ✅ | `users.firstName`, `lastName` | Same person, several accounts; offensive names |
| Account created at | ✅ | `users.createdAt` | New accounts that act fast (mass invites, mass uploads) |
| Terms accepted at | ✅ | `users.termsAcceptedAt` | Evidence of consent |
| Sign-in providers | ✅ | `oauth_accounts.provider`, `providerUserId` | Same Google/Microsoft identity behind several accounts (impossible by design; a hit means tampering) |
| Provider email | ✅ | `oauth_accounts.email` | Microsoft emails are unverified ("nOAuth") — never trusted for linking; a mismatch with `users.email` is informative |
| Has a password | ✅ | `users.passwordHash IS NOT NULL` | Provider-only accounts |
| Password changes | ✅ | `password_history` (hashes + dates) | Password changed right after a new-device sign-in (account-takeover pattern) |
| Language | ✅ | `users.locale` | Weak signal against IP country |
| Profile photo | ✅ | `media_assets.avatarForUserId` | Same photo on unrelated accounts (needs media hashes, §4) |
| Subscription tier, status, trial dates | ✅ | `subscriptions`, `users.trial*` | Trial farming (new account per trial), payment failures (`pastDueSince`) |
| QuickPay customer / subscription ids | ✅ | `subscriptions.quickpay*` | Cross-reference with QuickPay's fraud data. **Card data is never stored by Kinnd** |
| Card country, BIN, 3-D Secure result | ⬜ | QuickPay API | Card country vs phone / IP country; stolen-card patterns. Readable from QuickPay per payment |
| Push devices | ✅ | `push_subscriptions.endpoint` | Number of devices; the push host reveals the platform (Apple / Google / Mozilla) |

## 2. Sign-in and session security (`login_events`, codes, Redis)

| Data | Status | Where | Security use |
|---|---|---|---|
| Every sign-in: method, time | ✅ | `login_events` (method: password+2FA, Google, Microsoft, signup, password reset, invite) | Baseline of normal behaviour per user |
| Failed sign-ins | ✅ | `login_events.outcome = FAILED` (wrong password, wrong 2FA code) | Brute force per account; credential stuffing (many emails, one IP) |
| Email typed on a failed attempt | ✅ | `login_events.email` (also when no account exists) | Enumeration and stuffing lists |
| IP address per sign-in | ✅ | `login_events.ip` | Shared IPs across unrelated accounts; new-network sign-ins |
| User agent per sign-in | ✅ | `login_events.userAgent` | New device / browser; automation (headless browsers, scripts) |
| **GeoIP** — country, region, city, approximate coordinates, time zone | 🟡 | `geoip-lite` on the stored IP (already used for the 2FA email's "Copenhagen, DK (approximate)") | Impossible travel (two sign-ins too far apart in too little time); sign-ins from unexpected countries. **Recommendation:** store a GeoIP snapshot with each event (⬜) — the GeoIP database changes, so a lookup months later may disagree with the truth at the time |
| IP network owner (ASN), hosting/VPN/Tor flag | ⬜ | — | Datacenter, VPN and Tor traffic on a family app is unusual. `geoip-lite` has no ASN; needs MaxMind GeoLite2-ASN (free, offline) plus a Tor exit-node list |
| 2FA code attempts | ✅ | `login_two_factor_codes.attempts` (short-lived) | Guessing codes |
| SMS code attempts and purposes | ✅ | `phone_verification_codes` (purpose, attempts, short-lived) | SMS pumping (fraudulent SMS traffic), code guessing |
| Every SMS sent: number, purpose, account, time | ✅ | `sms_sends`, kept 90 days (added 2026-09-24) | SMS pumping; one number targeted from many accounts; country mix. The API already enforces a per-number cap (5 per 24 h) and a total cap (`SMS_DAILY_LIMIT`), and logs `[ALERT] SMS daily limit reached` |
| Password reset requests | ✅ | `password_reset_tokens` (short-lived) | Reset storms against one account |
| Email verification requests | ✅ | `email_verification_tokens` (short-lived) | — |
| Active sessions per user | ✅ | Redis `kinnd:usess:<userId>` (session ids) | Many concurrent sessions; "sign out everywhere" used after an alarm |
| Rate-limit hits | ⬜ | — | The auth rate limiter blocks but doesn't record. Logging hits (IP, route) is cheap and a strong abuse signal |
| Device fingerprint beyond the user agent | ⬜ | — | Not recommended: invasive, and weak on mobile browsers |

## 3. Family graph and access (`child_access`, `invites`, `children`)

| Data | Status | Where | Security use |
|---|---|---|---|
| Who has access to which child, role and relationship | ✅ | `child_access` (PARENT / GUARDIAN / FAMILY, relationship) | Implausible families (three "mothers", a stranger as "grandfather") |
| When access was granted | ✅ | `child_access.createdAt` | Rapid access churn |
| Medical-info access, minor member | ✅ | `child_access.medicalInfoAccess`, `isMinorMember` | Who can see health data; minors' accounts need extra protection |
| Invites: invited email/phone, inviter, relationship, accepted at | ✅ | `invites` | One adult inviting many unrelated people; invites accepted from an unexpected country |
| Invite accepted from IP / device | 🟡 | `login_events` (method INVITE) | As above |
| Children per account, creation times | ✅ | `children.createdAt` via `child_access` | Many children created quickly by one account |
| Child birthday, gender, country | ✅ | `children` | Implausible ages; country vs family's sign-in countries |
| Child deletion requests | ✅ | `child_deletion_requests`, `children.deletedAt` | Deletions right after a dispute or an alarm |
| Custody plan and swap requests | ✅ | `custody_plans`, `swap_requests` | Context for disputes (not an abuse signal on its own) |
| Anonymous access analytics | ✅ | `access_grant_events` | **Not usable** — deliberately unlinkable to people (by design) |
| Members removed / left, and by whom | ⬜ | — | Removal is a hard delete today. An access-change log (who added/removed whom, when) would matter in disputes and for the alarm system |

## 4. Media — photos and videos (`media_assets`)

All files are encrypted at rest; the fields below are database columns.

| Data | Status | Where | Security use |
|---|---|---|---|
| Uploader | ✅ | `ownerId` | Per-user upload patterns |
| Upload time | ✅ | `createdAt` | Volume spikes; uploads at unusual hours for this user |
| **Upload IP** | ✅ | `uploadIp` | Upload location vs sign-in history; several accounts uploading from one network |
| **Upload user agent** | ✅ | `uploadUserAgent` | Uploads from scripts or desktop tools rather than phones |
| **Upload GeoIP** | 🟡 | `geoip-lite` on `uploadIp` | Distance between upload and capture location |
| **Capture location (GPS)** — latitude, longitude, altitude | ✅ where the phone kept it | `capturedLatitude`, `capturedLongitude`, `capturedAltitude` | Capture far from the family's usual area; the same location across unrelated families; photos taken at a child's school by a non-family account |
| **Capture time** | ✅ | `capturedAt` | Capture-to-upload delay (old photos, or photos not taken by the uploader); "taken in the future" (tampered clock) |
| **Device make and model** | ✅ | `deviceMake`, `deviceModel` | A user's usual devices; one device model uploading for many families |
| File type, codec | ✅ | `mimeType`, `codec`, `type` | Unusual formats (e.g. images re-saved by editing tools) |
| Dimensions, duration | ✅ | `width`, `height`, `durationSeconds` | Screenshot sizes (a phone's exact screen resolution) = screenshotted content, not a camera photo |
| Sizes | ✅ | `originalBytes`, `derivedBytes`, `playableBytes` | Very small "originals" = heavily recompressed, likely from the web |
| Processing failures | ✅ | `status = FAILED` | Crafted or corrupt files |
| Where it's used | ✅ | `momentId`, `avatarForUserId`, `avatarForChildId`, `listItemImageForId` | Context |
| Camera metadata presence | 🟡 | `capturedAt` / `deviceModel` null | No camera metadata at all often means a downloaded, forwarded or screenshotted image (weak signal on its own: browsers strip some) |
| Editing software tag (EXIF `Software`) | ⬜ | original file | Edited or generated images. Add to capture extraction (small change) |
| Camera serial numbers (EXIF `BodySerialNumber`, `LensSerialNumber`) | ⬜ | original file | Ties images to one physical camera across accounts. Privacy-heavy; collect only with a clear need |
| **Exact-duplicate hash** (SHA-256 of the original) | ⬜ | — | The same file uploaded by unrelated accounts; known-bad file lists. Cheap: computed at upload |
| **Perceptual hash** (e.g. PDQ for photos, TMK+PDQF for video) | ⬜ | — | Near-duplicates (resized, re-compressed, cropped); **required for matching known unlawful material** (§8). Moderate work; runs in the worker |
| AI-generated / manipulated image detection | ⬜ | — | Third-party classifier; unreliable today — treat as a weak signal |

## 5. Content and sharing (`journal_posts`, comments, messages)

| Data | Status | Where | Security use |
|---|---|---|---|
| Moment title, story, typed place, category, date | ✅ | `journal_posts` | Keyword signals (see caution below) |
| Hidden from extended family | ✅ | `journal_posts.familyVisible` | Who hides what from whom |
| Tagged children | ✅ | `journal_post_children` | A child tagged in moments by someone with little other activity |
| Comments and reactions | ✅ | `comments`, `journal_reactions` | Harassment between family members |
| Messages and attachments | ✅ | `messages` (text, media), `threads`, `thread_members` | Harassment; grooming patterns (Phase 6 feature) |
| Bookmarks | ✅ | `bookmarks` | Someone bookmarking many photos of one child (weak on its own) |
| Emailed download links (who, which files, when) | ✅ | `media_download_links` (7 days) | Bulk exfiltration of a child's photos |
| **Individual views and downloads** (per file, per user) | ⬜ | — | The strongest exfiltration signal ("an aunt downloaded 400 originals of one child in an hour"). Needs a `media_access_events` table written by `GET /media/:id?variant=source` and the archive routes |
| Report / flag by a family member | ⬜ | — | User reports are the most reliable abuse signal. Needs a "Report" action in the app (Phase 6/7) |

**Caution on text analysis.** Keyword or AI screening of private family text
is intrusive, error-prone and legally sensitive (e-privacy rules for private
communications). If used at all: narrow, documented patterns, human review,
and in the DPIA.

## 6. Service and infrastructure

| Data | Status | Where | Security use |
|---|---|---|---|
| Web server access logs (IP, path, status, time) | ✅ (server) | Plesk / nginx logs, outside the database | Scraping, scanning, route abuse. Retention set by the host — align with this document |
| Application error logs | ✅ (server) | PM2 logs | Crafted requests |
| API request audit (who called what, when) | ⬜ | — | A general `audit_events` table (actor, action, target, IP, time) would cover views, downloads, access changes and admin reads in one place |
| **Admin reads of management data** | ⬜ | — | Must be logged: who in manage.kinnd.eu looked at whose data, and why |

## 7. Derived signals — ready for the alarm system

Signals computable **today** from stored data (✅ / 🟡 only):

| Signal | Built from |
|---|---|
| Brute force on one account | `login_events` FAILED per user / per email within N minutes |
| Credential stuffing | `login_events` FAILED across many emails from one IP |
| Impossible travel | Consecutive `login_events` per user + GeoIP distance ÷ time |
| New country for this user | `login_events` + GeoIP vs the user's history |
| Several accounts behind one network or device | `login_events.ip` / `userAgent`, `media_assets.uploadIp` shared by unrelated families |
| Capture far from where the family lives | `capturedLatitude/Longitude` vs the family's usual sign-in / capture area |
| Capture-to-upload anomaly | `capturedAt` vs `createdAt` (e.g. years old, or in the future) |
| Upload location ≠ capture location, repeatedly | `uploadIp` GeoIP vs `captured*` |
| Screenshot / non-camera media from one uploader | `width` × `height` at screen resolutions, no `deviceModel` / `capturedAt` |
| Implausible family structure | `child_access` roles + relationships per child |
| Rapid growth | Children, invites, uploads per account per day since `createdAt` |
| Trial farming | New accounts with trials sharing phone prefix / IP / device |
| Bulk download requests | `media_download_links` per user per day |
| SMS pumping | `sms_sends` per number, per country and in total per hour; the `[ALERT] SMS daily limit reached` log line |

Signals that need new collection first (⬜): VoIP numbers, VPN / datacenter
IPs, per-file downloads, access changes, duplicate / perceptual hashes,
rate-limit hits, user reports.

## 8. Unlawful media (child sexual abuse material)

Kinnd stores photos and videos of children, so detection of known abuse
material deserves a deliberate design. **Get legal advice before building
this part.** The notes below are orientation, not legal guidance.

- **Hash matching against known material** is the established approach:
  compare perceptual hashes of uploads (§4, ⬜) with hash lists maintained by
  NCMEC, the Internet Watch Foundation or Thorn (Safer), or via Microsoft
  PhotoDNA. These services have access agreements and conditions; Kinnd never
  holds the reference material itself.
- **Classifiers for "unknown" material** (nudity of minors) will flag normal
  family photos (bath, beach) constantly. Too noisy to act on automatically;
  if used at all, only as a prompt for a trained human reviewer.
- **What happens on a match** must be defined with a lawyer and the police
  beforehand. Typically: block access to the file for everyone at once, keep
  the evidence untouched (encrypted, with its metadata, IP and account
  details), report to the police (in Denmark the National Cyber Crime Center,
  NC3; the Danish INHOPE hotline is run by Red Barnet), and **do not** let
  admins open, download or forward the material. The alarm system should
  surface the *case* (account, time, match source), never the image.
- **Which EU rules apply** to a private family-sharing service with
  messaging, and their current status (the temporary derogation that allows
  voluntary detection in communications, and the proposed CSA Regulation), is
  a question for legal review at the time of building.
- **Capture metadata, upload IP and sign-in data (§1–4)** are what make a
  report actionable for the police. That's one more reason to keep them intact
  and access-controlled.

## 9. Governance (to settle before the alarm system ships)

- **Access:** manage.kinnd.eu only, named admins, two-factor, every read
  logged (⬜). No bulk exports of location data.
- **Retention** (current and proposed):
  - login events: **12 months** (implemented, daily purge)
  - capture metadata and upload origin: with the media file
  - short-lived codes and tokens: minutes to 24 hours (existing)
  - proposed, for new logs: `media_access_events` 12 months; `audit_events`
    24 months; rate-limit hits 90 days; admin read log 5 years
- **Precision:** store full GPS precision only because §7's rules need it. If
  a rule only needs "same city", round before storing.
- **Transparency:** privacy notice section describing these categories and
  purposes; DPIA covering children's data, location and automated flags.
- **Automated decisions:** alarms should flag for human review, not ban
  automatically (GDPR Art. 22), except clear-cut technical abuse such as
  brute force, which can be rate-limited automatically.
- **Related documents:** `docs/data_retention_policy.md` (retention per data
  category), `docs/deployment_guide.md` (encryption keys).

## 10. Suggested collection backlog (for the alarm-system phase)

| Item | Effort | Value |
|---|---|---|
| GeoIP snapshot (country, city, coordinates) stored on `login_events` and uploads | Small | High — stable history |
| ASN + VPN/datacenter/Tor flag (GeoLite2-ASN, exit-node list) | Small | High |
| SHA-256 of every original | Small | Medium |
| EXIF `Software` tag | Small | Low–medium |
| Rate-limit hit log | Small | Medium |
| `media_access_events` (views/downloads of originals) | Medium | High |
| Access-change log (members added/removed, by whom) | Medium | High |
| "Report" action for family members | Medium | Very high |
| Perceptual hashes (PDQ / video TMK) | Medium | Required for §8 |
| Hash-list integration (NCMEC / IWF / Thorn / PhotoDNA) | Large + legal | Required for §8 |
| Phone number type lookup (VoIP) | Small + per-lookup cost | Medium |
| Card country / 3-D Secure from QuickPay | Small | Medium |
| Admin read log in manage.kinnd.eu | Small | Required |
