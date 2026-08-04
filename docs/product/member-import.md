# Member import from SportAdmin

Plan for importing a whole team from a SportAdmin member export (`.xlsx`) into
an fc-app team. Written 2026-08-02. Not yet implemented.

## Why

Every team that adopts fc-app already has its roster somewhere else — in
practice SportAdmin. Typing 20 players plus their parents by hand is the single
largest thing standing between "signed in" and "using the app". The import is
therefore an onboarding feature, not an admin convenience.

The export is also the only place the *parents* exist as data. Getting them in
is what makes call-ups and posts useful on day one.

## What the export actually looks like

Columns, in order:

```
Grupp · Gruppkoppling · Kommentar · Personnummer · Kön · Förnamn · Efternamn ·
c/o · Adress · Postnummer · Stad · Land · Mobiltelefon · Telefon hem ·
Telefon jobb · E-post · Målsman 1 · Relation · E-post · Telefon · Målsman 2 ·
Relation · E-post · Telefon · Skapad · Uppdaterad · Licens ·
Grupprekommendation · Övrigt · Medlems Nr · Start År · Allergi
```

Four facts from the sample data constrain everything below:

1. **Header names are not unique.** `E-post` appears three times (member,
   guardian 1, guardian 2); `Relation` and `Telefon` twice. Parsing must be
   **positional** — a name-keyed map silently overwrites the member's e-mail
   with a guardian's.
2. **The same person appears in several roles.** A coach has their own row
   (`Gruppkoppling: Tränare`) *and* appears as `Målsman 2` on their child's row.
   The import must recognise this instead of creating two records.
3. **A member's `E-post` is often a parent's.** In the sample, the 8-year-old
   player carries their father's address. That makes e-mail useless as an
   *identity* key — but the field itself matters more than that sounds, because
   it is the address the app writes to. It has to be imported as-is, and it has
   to be able to become the member's own later. See "Growing up".
4. **`Personnummer` is the only stable identifier present.** `Medlems Nr` was
   empty for every sampled row, so it cannot be relied on — but should be used
   when present.

## Column mapping

| SportAdmin column | Destination | Notes |
|---|---|---|
| Grupp | — | The target team is chosen in the UI. Several distinct values in one file → warn, offer one `group` per value |
| Gruppkoppling | `groups` / `group_members` | There is no role column on `members`. Groups are the right home: they already drive call-up squads and post targeting |
| Kommentar | custom field (text) | Stored raw; no parsing of `Kläder: 152-152-31/33` |
| Personnummer | `persons` via `members.person_id` (+ derived `birth_date`, `birth_year`) | Stored — it is the identity we match on. See "Personnummer" below, ADR-022 and ADR-023 |
| Kön | custom field (select) | Optional, off by default |
| Förnamn / Efternamn | `first_name` / `last_name` | |
| c/o, Adress, Postnummer, Stad, Land | custom fields | Optional, off by default — data minimisation |
| Mobiltelefon / Telefon hem / Telefon jobb | `phone` | First non-empty, mobile preferred. The rest → custom fields or dropped |
| E-post | `email` | |
| Målsman 1/2 (+ Relation, E-post, Telefon) | `member_contacts` | See "Guardians" below |
| Skapad / Uppdaterad | — | SportAdmin's own timestamps; ignored |
| Licens, Grupprekommendation, Övrigt, Start År | custom fields | Optional |
| Medlems Nr | `members.external_ref` | Best idempotency key when present |
| Allergi | custom field | Health data — special category under GDPR. Off by default, with its own confirmation in the mapping step |

Any column that is empty in every row is hidden from the mapping step.

## Personnummer

The personnummer is stored, because it is what actually identifies a person
across the club's systems — the roster, the licence register, and every future
import. Nothing else in the file survives a name change, a new phone number or
a re-export.

Handling rules are settled in **ADR-022**; the short version:

- **Its own table**, `persons` (`id`, `club_id`, `personal_id`), normalised to
  twelve digits (`201703142412`) — no separator, century always present. Unique
  on `(club_id, personal_id)`, with `members.person_id` pointing at it.
  Separate from `members` so that a `.selectAll()` on the roster can never carry
  it along: what you did not join, you cannot leak. The person is the record and
  a member is that person in one team, so the same child in P14 and P17 is one
  entry — see ADR-023.
- **Validation.** Shared in `@fc-app/contracts` as a pure function with its own
  tests (ADR-016): length, date validity, and the Luhn check digit. It must
  accept **samordningsnummer** (day + 60) and every input form the export or a
  human may produce — `YYYYMMDD-NNNN`, `YYMMDD-NNNN`, `YYMMDD+NNNN`, and the
  same without separators. An invalid number fails its row in the preview; it
  never fails the file.
- **Derived, not duplicated.** `birth_date` and `birth_year` are computed from
  the number when there is one, and remain independently writable for members
  who have none (a new arrival without a Swedish number is a real case).
- **Read gate.** The full number requires `members.manage`. `members.view`
  receives it masked (`20170314-****`) in the same field. Both the check and the
  masking live in `apps/backend/src/members/personal-id.ts`, the only module
  that touches the table.
- **Never logged.** Not in request logging, not in error messages, not in the
  import report. The preview diff shows "personnummer" as changed without
  showing either value.
- **Displayed on purpose only.** The member detail page shows it behind a
  "visa"-toggle for users with `members.manage`; the roster table never shows it.

Legal basis, for the record: 3 kap. 10 § dataskyddslagen permits processing a
personnummer when clearly justified by the purpose. Unambiguous identification
of members for registration and licensing is such a purpose. Convenience is not
— which is why the read gate above is part of the feature, not a later hardening
pass.

Rejected alternatives (a column on `members`, a hash, `pgcrypto`, storing only
the birth date) are recorded in ADR-022 rather than repeated here.

## Guardians

`member_guardians` requires a `user_id` — an existing account. The guardians in
the file have no accounts, and most never will have one on import day. Two ways
out:

- **A.** Create member-bound `invitations` (the table already carries
  `member_id` and `relation`) from each guardian e-mail. No schema change, but
  the guardian's *name and phone number are discarded* until they accept —
  which is precisely the data a coach needs when a child does not show up.
- **B — decided.** New table `member_contacts`:
  `member_id, name, relation, email, phone, user_id (nullable), sort_order`.
  The import fills it; `user_id` is set when that person later signs in through
  an invitation. `member_guardians` becomes the subset of contacts that have an
  account, and the existing guardian UI reads from the union.

A was rejected because it loses parent phone numbers, which is a large part of
why the import is worth building at all.

Relation values in the file are free text in Swedish (`Mamma`, `Pappa`, …).
Keep them as typed-in text on `member_contacts.relation`; do not force them into
the `guardian | self` enum, which describes something else (whether the linked
account *is* the member).

## Growing up

A member imported at eight has their parent's e-mail address in
`members.email`. That is correct then and wrong later: at eighteen the
vårdnadshavare relationship ends in law, and the member has to keep receiving
what the club sends without a parent in between. The roster therefore has to
survive people growing up — the import is only the first day of a record that
outlives the reason it was created.

Three things follow, none of which need new columns:

- **Is this address still a parent's?** Computed, not stored:
  `members.email` equal to any of that member's `member_contacts.email`. Keeping
  it derived means it self-corrects the moment either address changes, and
  nothing can go stale.
- **When does it matter?** `birth_date` makes "turns eighteen" an exact date
  rather than a guess from birth year — a second reason to derive it from the
  personnummer, beyond matching. The team is shown a notice, not a silent
  change: *"Ture fyller 18 om en månad — hans e-postadress är fortfarande en
  vårdnadshavares."*
- **What happens then?** Nothing automatic to the address itself; a coach cannot
  invent someone's e-mail. But when a member accepts an invitation for
  themselves (`relation: self`), `members.email` becomes their account's
  address. That is the well-defined moment the transition can be made without
  guessing.

The guardian *links* are the sharper question, and it is deliberately left open
below: a parent who can still answer call-ups for an adult member is wrong by
default, but silently cutting a family off on a birthday is worse. Whatever the
answer, it is a prompt, never a background job.

## Architecture

Parsing happens **in the browser**; the server only ever sees structured rows,
never the file.

- oRPC stays plain JSON — no multipart upload path to build (ADR-001).
- The spreadsheet itself — including columns the coach chose to skip — is never
  uploaded, so unmapped data has no chance to end up in a request log or a
  temporary file. Personnummer is sent, because it is stored; the columns nobody
  asked for are not.

Two procedures, both gated on a **new permission, `members.import`**:

| Procedure | Route | Effect |
|---|---|---|
| `previewMemberImport` | `POST /members/import/preview` | Pure dry run. Returns a diff; writes nothing |
| `commitMemberImport` | `POST /members/import/commit` | One transaction, returns a report |

`members.import` is seeded to the **Admin** role only — not to Coach, which is
what makes the feature admin-only in practice. It is a permission rather than a
check for `system_key = 'admin'` because ADR-005 makes *which role holds what*
data: a club that wants its head coach to run the import can grant it, and one
that does not, does not. Rewriting the roster in one action is not the same
authority as editing a member, so it is not folded into `members.manage`.

### Its own page

The import lives at **`/import`** — a separate route, not a tab or a dialog on
the members page. Three reasons: the wizard owns the whole screen for several
steps, a half-finished import must not look like the roster, and a destructive
one-off belongs somewhere you go on purpose rather than somewhere you land.

It gets no nav pill. Entry points are **club settings** (already the admin-only
area) and, for the case it exists for, a call to action on an **empty roster** —
both rendered only for users holding `members.import`.

The wizard has four steps:

1. **Upload** — `.xlsx` (and `.csv`) dropped on the members page.
2. **Map** — auto-detected columns by position, each with *skip / built-in field
   / new custom field*. Also: whether `Tränare` rows are imported at all.
3. **Preview** — *N new · N updated (with a per-field diff) · N unchanged ·
   N errors*. Errors are listed per row and never block the rest of the file.
4. **Commit** — with a report, linked to the imported members.

Row cap: 500 per file, rejected in the contract schema.

## Matching and idempotency

Match key per member row, in priority order:

1. personnummer — the real identity, unique per club. A person already known
   from another team becomes a **new member here pointing at the same person**,
   with a warning; never an update of the other team's row (ADR-023)
2. `Medlems Nr` → `members.external_ref`
3. normalised `(first_name, last_name, birth_date)`
4. normalised `email`, only when it is not also a guardian e-mail on some other
   row (fact 3 above)

Keys 2–4 exist for the members who have no personnummer on file, and for the
rows already in the database from before the first import. A row that matches on
personnummer and disagrees on name is an update, not a conflict — people change
their names.

Normalisation (trim, case-fold, collapse whitespace) lives in
`@fc-app/contracts` so the preview UI and the server agree on what "matched"
means (ADR-010).

Guardian rows are matched against members of the same team first (so the coach
who is also `Målsman 2` links to their existing member row), then against
`users.email`, then created as a bare contact.

**Importing the same file twice must produce zero changes.** This is the
acceptance test for the whole feature.

Existing values are never blanked by an empty cell in the file — an absent
value means "unknown", not "cleared" (the same reading as ADR-014's stance on
absence).

## Phases

Each phase is independently mergeable.

### Phase 1 — Schema groundwork and personnummer · M · #62

- Migration: `member_personal_ids` table, `members.birth_date` (date, nullable),
  `members.external_ref` (text, nullable, unique per team),
  `members UNIQUE (id, team_id)` for the composite FK, `member_contacts` table.
- `apps/backend/src/db/types.ts` updated to match.
- `packages/contracts/src/personal-id.ts` — parse, validate (Luhn,
  samordningsnummer), normalise to twelve digits, mask, derive birth date. Pure
  functions with `personal-id.test.ts` alongside (ADR-016).
- `apps/backend/src/members/personal-id.ts` — the only module that reads or
  writes the table; owns the `members.manage` check and the masking.
- `memberSchema` gains `personalId` (masked or full), `birthDate`,
  `externalRef`. `birth_year` keeps being written, derived from the date when
  one is known.
- Test asserting a `members.view`-only caller never receives a full number.
- Member create/edit form takes a personnummer; the detail page reveals it
  behind a toggle for `members.manage`.

This phase is worth shipping on its own — it makes the roster identify people
correctly whether or not anything is ever imported. See ADR-022.

### Phase 2 — Parse, map, preview · L · #63

- Frontend dependency for `.xlsx` parsing (`read-excel-file` — small, MIT,
  browser-native; note it does not read legacy `.xls`, so an `.xls` file must be
  re-saved. `exceljs` is the fallback if that turns out to matter).
- `apps/frontend/src/lib/sportadmin.ts` — positional header detection, phone
  selection, and normalisation through the contracts' personnummer functions.
  Pure functions, `sportadmin.test.ts` alongside, seeded with the real sample
  rows.
- `packages/contracts/src/member-import.ts` — row schema, mapping schema,
  preview in/out.
- `apps/backend/src/members/import-match.ts` + test — the matching rules as
  pure functions (ADR-016).
- `apps/backend/src/procedures/member-import.ts` — preview handler only.
- `members.import` added to the permission catalog and to the Admin default
  role; a migration granting it to existing clubs' admin roles.
- `apps/frontend/src/routes/import.tsx` — wizard steps 1–3, with entry points in
  club settings and on an empty roster.
- i18n keys in `en.json` / `sv.json`.

Ships as a dry run: a coach can see exactly what would happen, and nothing can
go wrong yet.

### Phase 3 — Commit · M · #64

- `commitMemberImport` in a single transaction: members, group memberships,
  custom field definitions (auto-created from the mapping) and values,
  `member_contacts`.
- Wizard step 4 and the result report.
- Member detail page shows contacts without accounts next to linked guardians
  (extends `GuardiansSection.tsx`).
- Test: import the sample file twice, assert the second run reports zero
  changes.

### Phase 4 — Invitations from contacts · S · #65

- Generate guardian invitations from `member_contacts` rows that have an e-mail,
  in bulk, from the member list.
- Accepting one links `member_contacts.user_id` and creates the
  `member_guardians` row.
- Accepting one *for oneself* (`relation: self`) also sets `members.email` to
  that account's address — the transition described in "Growing up".

### Phase 5 — Coming of age · S · #66

- Derived "this member's address is still a guardian's" flag on the member
  detail page and in the roster's warnings.
- A notice when a member is about to turn eighteen, listing what needs a
  decision: the e-mail address, and the guardian links.
- Depends on the guardian-links policy below being settled first.

## Out of scope

- Writing back to SportAdmin, or any live integration with it.
- Importing activities, attendance history, or fees.
- Photos.
- Scheduled/automatic re-import. Re-running the wizard is the mechanism.

## Decided

- **Guardians: option B** — `member_contacts`. 2026-08-03.
- **Personnummer: stored, in its own table, behind a read gate** — ADR-022.
  2026-08-03.

## Open

1. **Is `Gruppkoppling` groups or something stronger?** Groups work today and
   cost nothing. A real `members.kind` (player/staff) would let the roster
   separate coaches from players everywhere, at the cost of a concept the
   product spec does not have yet. Recommendation: groups now, revisit if the
   roster starts feeling wrong with coaches in it.
2. **How much history does the read gate need?** No audit log of who revealed a
   personnummer is planned. Recommendation: skip it — an audit trail for a
   handful of coaches in a single team is more data about people, not less.
   Revisit if fc-app is ever used at club-wide scale.
3. **What happens to guardian links when a member turns eighteen?** The
   vårdnadshavare relationship ends in law; a parent who can still answer
   call-ups for an adult member is answering for someone who did not ask them
   to. But an eighteen-year-old who still wants a parent kept in the loop is
   completely ordinary, and cutting a family off on a birthday would be a
   feature nobody asked for. Recommendation: keep the links, drop
   `callups.respond` on behalf of an adult member, and prompt the member — not
   the coach — to confirm who stays. Needs deciding before phase 5.
