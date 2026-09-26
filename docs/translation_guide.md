# Kinnd — Translation guide

How to translate the app into Danish (`da-DK`), Norwegian Bokmål (`nb-NO`) and
Swedish (`sv-SE`), check the result, and switch a language on.

English (`en-US`) is the source. Every other language is translated from it,
and anything not yet translated falls back to English, so a half-done language
never shows blank text.

## 1. What gets translated

| Part | Where | Translated by this guide? |
|---|---|---|
| All app screens, buttons, messages, empty states | `packages/core/locales/<locale>/<namespace>.json` (16 files per language) | **Yes** |
| Dates, times, numbers, first day of the week | Follow the account's country, not the language (Profile → Preferences → Country formats) | Automatic, nothing to translate |
| Emails (sign-in codes, invites, receipts, reminders) | `apps/api/src/lib/emailTemplates`, `apps/api/src/lib/*.ts` | **No**, English only for now |
| SMS codes | `apps/api/src/lib/phoneVerification.ts` | **No**, English only for now |
| A few server messages without an error code | `apps/api/src/routes/**` | **No**, shown in English |
| Screens before sign-in (login, sign-up) | The app's language comes from the account | Shown in English |

Size: about 1,200 texts, roughly 4,400 English words, per language.

The last four rows need code changes: server-side language support, and
picking a language from the phone before sign-in. They are a separate task.

## 2. The workflow at a glance

```
npm run i18n:export   →  i18n/export/<locale>.json   (what's still untranslated)
        translate     →  i18n/import/<locale>.json   (same file, translated)
npm run i18n:import   →  merged into packages/core/locales/<locale>/
npm run i18n:check    →  keys, placeholders and coverage verified
enable the language   →  packages/shared/src/preferences.ts
commit, push, deploy
```

All commands run from the repository root (`app/`). The `i18n/` folder is a
scratch area and git ignores it.

## 3. Export what needs translating

```bash
npm run i18n:export
```

This writes one file per language, `i18n/export/da-DK.json` and so on. Each
holds every English text that language is still missing, as flat
`"namespace:key": "text"` pairs:

```json
{
  "billing:trialInfo": "No card needed. We'll remind you 7 days and 1 day before your <span translate=\"no\">{{days}}</span>-day trial ends.",
  "calendar:form.categories": "Categories"
}
```

- The `<span translate="no">…</span>` wrappers protect placeholders from machine
  translation. Keep them, or keep just the `{{days}}` inside; the import accepts
  both.
- Run the export again at any time: it only ever contains what's still
  missing, so later rounds are small.

## 4. Translate

Copy each export file to `i18n/import/` under the same name and translate the
**values**. Choose one of these ways.

### Option A — Ask Claude (recommended)
Ask in a Claude Code session: *"Translate the app to Danish, Norwegian and
Swedish."* Claude runs the export, translates with this guide's rules and
glossary, imports, runs the check and shows you a sample to review. This keeps
the placeholders, plurals and tone consistent across all three languages.

### Option B — A human translator or agency
Send them the three export files and sections 5 and 6 of this guide. They
return the same files with translated values. Put them in `i18n/import/`.

### Option C — Machine translation
- Google Translate's website doesn't accept `.json` files. Use the **Cloud
  Translation API** with `mimeType: "text/html"` (that's what the `translate="no"`
  wrappers are for), or DeepL's API with `tag_handling=html`.
- Or paste the file into ChatGPT or Claude, together with section 5.
- Always have a native speaker read the result (section 8). Machine
  translation gets tone and short button labels wrong most often.

## 5. Rules for translators

1. **Translate values only.** Never change a key (`"billing:trialInfo"`), add
   keys or remove any.
2. **Keep placeholders exactly:** `{{name}}`, `{{count}}`, `{{date}}` and the
   rest. You may move them within the sentence, but not rename, translate or
   drop them. The import refuses a text whose placeholders changed.
3. **Plurals:** keys ending in `_one` and `_other` are the singular and plural
   forms of one text (`"lockSoon_one": "…in {{count}} day…"`,
   `"lockSoon_other": "…in {{count}} days…"`). Translate both. Danish,
   Norwegian and Swedish use the same two forms as English.
4. **Tone:** warm, calm and plain, as for tired parents on a phone.
   - Address the reader informally (**du**, not De/Ni).
   - Use short sentences and no exclamation marks.
   - No legal or bureaucratic wording outside the terms and privacy texts.
5. **Length:** texts sit on small screens. Buttons, tabs and chips should stay
   about as short as the English (`"Save"`, `"Add child"`, `"Today"`). If the
   literal translation is much longer, choose a shorter word.
6. **Capitalisation:** use the target language's own conventions. English Title
   Case ("Add Child") becomes sentence case in Danish, Norwegian and Swedish.
7. **Leave untouched:** the product name **Kinnd**, email addresses, URLs,
   emoji, and the `<span translate="no">` markup.
8. **Formats:** don't write dates or numbers into texts. They come in through
   placeholders and follow the user's country automatically.
9. **Language names** (`preferences:language.names.*`) are always written in
   the language itself: `Dansk`, `Norsk`, `Svenska`, `English`.

## 6. Glossary

Decide these once, before the first round, so all screens agree. The
suggestions are a starting point. Change the table here, and translators and
Claude will follow it.

| English | Meaning in the app | Danish | Norwegian | Swedish |
|---|---|---|---|---|
| Kinnd | Product name | Kinnd | Kinnd | Kinnd |
| Moments | Shared posts with photos/videos | Øjeblikke | Øyeblikk | Ögonblick |
| Circle | The paid family group (plan) | Cirkel | Sirkel | Cirkel |
| Single / Parent Circle / Family Circle | Plan names | Single / Forældrecirkel / Familiecirkel | Single / Foreldresirkel / Familiesirkel | Single / Föräldracirkel / Familjecirkel |
| Custody plan | Who has the child when | Samværsplan | Samværsplan | Umgängesplan |
| Swap request | Asking to trade custody days | Bytteanmodning | Bytteforespørsel | Bytesförfrågan |
| Handover | Moving the child between homes | Aflevering | Overlevering | Överlämning |
| Guardian | Legal guardian role | Værge | Verge | Vårdnadshavare |
| Caregiver | Babysitter, teacher etc. role | Omsorgsperson | Omsorgsperson | Omsorgsperson |
| Lists / necessities | Shared shopping and packing lists | Lister / fornødenheder | Lister / nødvendigheter | Listor / förnödenheter |
| Bookmark | Saved moment or photo | Bogmærke | Bokmerke | Bokmärke |
| Category | Tag on events, moments, tasks | Kategori | Kategori | Kategori |

## 7. Import and check

```bash
npm run i18n:import
npm run i18n:check
```

- `i18n:import` merges each `i18n/import/<locale>.json` into
  `packages/core/locales/<locale>/`. It stops with a clear message on an unknown
  key or a changed placeholder. Fix the text in the import file and run it
  again; nothing is half-written.
- `i18n:check` fails on keys that don't exist in English or on placeholder
  mismatches, and reports coverage:
  ```
  da-DK: 1206/1206 translated
  ```
- Also run the usual checks before committing:
  ```bash
  npm run typecheck && npm run lint
  ```

Remove the scratch files afterwards: `rm -rf i18n`.

## 8. Review in the app

Machine and first-round translations need a native speaker's pass on a real
phone.

1. Start the app locally (`npm run dev`), or use a test account on the server.
2. Until a language is switched on (section 9), you can try it by setting it on
   your own account directly (`da-DK`, `nb-NO` or `sv-SE`). On the server, for
   a deployed build that includes the translations:
   ```bash
   cd /var/www/vhosts/kinnd.eu/app && npx dotenv -e apps/api/.env -- sh -c 'psql "$DATABASE_URL" -c "UPDATE users SET locale = '"'"'da-DK'"'"' WHERE email = '"'"'you@example.com'"'"';"'
   ```
   Or ask Claude to switch a local test account.
3. Walk through the main flows:
   - Today and the Calendar views, a new appointment, a task and a note
   - Moments: create, and the viewer's details
   - Children: add a child, the profile, health, custody plan and swap
   - Lists, Messages, Notifications
   - Profile: Plan & billing, Preferences, Categories
4. Look especially for:
   - text cut off on buttons or chips
   - English left over (a missed key shows the English text)
   - the wrong singular/plural form (try counts of 1 and 2)
   - tone and consistency with the glossary
5. Fix wording directly in `packages/core/locales/<locale>/*.json`, then run
   `npm run i18n:check`.

## 9. Switch a language on

A language only shows under Profile → Preferences → Language once it's
enabled. In `packages/shared/src/preferences.ts`:

```ts
export const ENABLED_LOCALES: readonly Locale[] = ["en-US", "da-DK"];
```

Then:
- Update the "on their way" note in all four languages,
  `preferences:language.more` (e.g. "Norwegian and Swedish are on their way."),
  or set it to an empty text once all are enabled.
- Run `npm run build --workspace=packages/shared`, then the checks in section 7.
- Commit, push and deploy as usual (`docs/deployment_quick.md`).

People then choose the language under Profile → Preferences → Language. It's
saved on their account and follows them to every device.

## 10. Keeping translations up to date

New features add English texts. Those show in English in the other languages
until translated; nothing breaks. Before each release:

```bash
npm run i18n:check     # coverage per language: anything below 100 % needs a round
npm run i18n:export    # only the new texts
```

Translate, import and check as above. Changed English wording isn't flagged
automatically: when a text's meaning changes, update the other languages in the
same commit, or delete that key from them so it's exported again.
