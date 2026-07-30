# Design Decisions (DDR Log)

> Append-only. Never delete or modify past decisions.
>
> **ADR vs DDR.** An ADR records a *technical* decision — data model, API shape,
> permissions, dependencies. A DDR records a *design* decision — what the
> product looks like, how it behaves under the hand, and what its words mean.
> When code needs to explain itself, it cites the record instead of restating
> the reasoning: `// See DDR-006.`

## Template
### DDR-XXX — [DATE] — [DECISION TITLE]
**Status:** Proposed | Accepted | Superseded
**Context:** Why was this decision needed?
**Decision:** What was decided?
**Consequences:** What does this mean going forward?

---

## DDR-001 — 2026-07-29 — Kit as the design language, and its three colour families

**Status:** Accepted

**Context:**
The app needed one visual language rather than shadcn's defaults. The chosen
direction ("Kit") was authored against this repo's own data model, so it maps
onto real screens instead of needing translation. Its colour system is the part
most easily eroded: a stray blue-grey or a second green undoes it.

**Decision:**
Three colour families and nothing else, with fixed meanings:

| Family | Token | Means |
|---|---|---|
| Pitch green | `--green-500` `#00B341` | the brand, and **"present"** |
| Ink | `--ink-800` `#111413` | primary surfaces and text |
| Orange | `--orange-500` `#FF5A1F` | **needs action** |
| Amber | `--amber-500` `#F5A524` | late / partial |
| Warm neutrals | `--neutral-*` | app background `#F1F3EE`, body text `#5C635F` |

Neutrals are green-tinted warm greys — **never blue-grey**. Kit is a daylight
system with no dark mode; the `.dark` block in `globals.css` exists only as
graceful degradation and is derived from the ink scale.

Kit's tokens are declared once in `styles/globals.css` in three layers: the raw
palette under Kit's own names, shadcn's semantic contract mapped onto it, and
`@theme inline` exposing both as Tailwind utilities. That middle layer is what
lets every shadcn component pick up the theme without markup changes.

**Consequences:**
- New colour must come from an existing family, or it is a new DDR.
- Because green means "present", it cannot also mean "primary" — see DDR-002.
- Status colours are stored as **token names, not hex** (`activityColourSchema`),
  so a re-theme moves every stored colour at once.

---

## DDR-002 — 2026-07-29 — Primary actions are ink, not green

**Status:** Accepted

**Context:**
The obvious reading of a brand colour is "use it for primary buttons". Doing
that here would put green on every Save button in the app, and green already
carries a meaning in the domain: a green disc means a player was present.

**Decision:**
`--primary` maps to ink. The default `Button` is ink; a `brand` variant exists
for the few places green is the *subject* (accepting a call-up, a marked-present
toggle).

**Consequences:**
- Green stays readable as "present" everywhere, including on screens with save
  buttons on them.
- `--destructive` maps to **orange**, because Kit has no red at all.

---

## DDR-003 — 2026-07-29 — Colour separates surfaces, not shadow

**Status:** Accepted

**Context:**
shadcn's `Card` ships with a border and a shadow. Stacking those on a warm
neutral background produces the muddy grey-on-grey look Kit was chosen to avoid.

**Decision:**
Panels have **no border and no shadow**. Separation comes from the surface
colour: white `--surface-card` panels on the `--neutral-050` app background, ink
panels for the loud ones. Shadow tokens exist (`--shadow-frame`,
`--shadow-overlay`) and are reserved for genuinely floating things — dialogs.

**Consequences:**
- Anything that needs to feel raised gets a different background, not elevation.
- A pinned post is marked with a 2px ink outline rather than a shadow.
- Alternating row tints, not rules, separate rows in a long table.

---

## DDR-004 — 2026-07-29 — Type: Anton for display, Archivo for body, one loud number per screen

**Status:** Accepted

**Context:**
Kit's identity is largely typographic, and its screens have a clear focal point.

**Decision:**
- **Anton** for display: one weight, always uppercase, tight leading, `.3px`
  tracking. Exposed as `.font-display` and `--font-display`.
- **Archivo** for body: 400–700, 12–16px. `--font-sans`.
- Both loaded from Google Fonts via `<link rel="preconnect">` plus a stylesheet
  in `index.html`, not a CSS `@import`, so the request starts with the document.
- `.kit-overline` is the small uppercase label above a heading. Named
  `kit-overline` because Tailwind owns `.overline`.
- **One oversized number per screen**, and it is the thing the reader came for:
  the start time on the dashboard hero (64px), the attendance rate on a stat
  card (54px).

**Consequences:**
- Headings are set in Anton and therefore render uppercase; sentence-case
  strings are still written normally in the locale files (see DDR-007).
- A screen with two competing giant numbers is a design bug.

---

## DDR-005 — 2026-07-29 — Shape and motion

**Status:** Accepted

**Context:**
Kit specifies these numerically, and left to per-component judgement they drift.

**Decision:**
Radii as Tailwind scale tokens: `sm` 9px, `md` 16px (row), `lg` 18px (tile),
`xl` 22px (panel — every Card), plus `--radius-pill` 999px on **anything
clickable**. Nothing is square-cornered.

Motion: 120ms for state flips, 180ms for layout, 260ms slow, all on
`cubic-bezier(.2,.8,.3,1)` (`--ease-standard`, declared inside `@theme` so it
also emits the `ease-standard` utility). Press scales to `0.97`. Disabled is 40%
opacity. **Hover changes background colour, never opacity.**

**Consequences:**
- `transition-colors duration-[120ms] ease-standard` is the house hover
  treatment, repeated deliberately rather than abstracted.
- Buttons are pills with 44/52px touch targets — sized for a coach at the pitch
  side, not for a mouse.

---

## DDR-006 — 2026-07-29 — A dashed ring always means "not decided yet"

**Status:** Accepted

**Context:**
Several features have a third state that is neither yes nor no: attendance not
taken, a call-up unanswered, a tracking box never ticked. Reusing "no" for these
would tell the reader something untrue — and reusing the dashed treatment for
"retired" or "archived" would do the same in the other direction.

**Decision:**
A **dashed ring** (`--border-dashed`) means *nobody has said yet*, everywhere,
and means nothing else. Never "no", never "retired".

Consequently:
- Unmarked attendance, a pending call-up, and an unticked tracking box all draw
  the same dashed ring.
- Clearing a value **deletes the record** rather than storing a false, so the
  data model can actually represent "not decided" (see ADR-014).
- Archived things get a `secondary` badge, not a dashed one.
- A filled-in date or note gets a *solid* disc — it has been decided, even
  though it is not a tick.

**Consequences:**
- The `unset` badge variant and `RESPONSE_DISC.pending` share this treatment on
  purpose.
- Anyone adding a third state should reach for this rather than invent one.

---

## DDR-007 — 2026-07-29 — Voice: reasons, not codes

**Status:** Accepted

**Context:**
The audience is volunteer coaches and parents, and the app is Swedish-first with
an English locale alongside it.

**Decision:**
- Sentence case everywhere, except Anton headlines and overlines which render
  uppercase from normally-written strings.
- **Reasons, not codes.** An error says what is wrong and what would fix it:
  *"There is already a tracking list called Grönt kort"*, not a constraint name.
  Server messages are surfaced verbatim where the server knows more than the
  client does.
- ` · ` (spaced middle dot) is the house separator, exported as `SEPARATOR`.
- No emoji. Kit is nearly icon-free; state is carried by colour plus a small
  glyph alphabet (`✓ ✕ ?` and letters).
- Swedish names and places stay Swedish in both locales — a person's name is not
  a translatable string.
- Empty states say what to do next, and say something different to a reader than
  to someone who can act.

**Consequences:**
- Backend handlers own their user-facing wording; `assertNameAvailable`-style
  helpers exist to turn a constraint into a sentence before the database does.
- Numbers are paired with words: "7 left", not a bare percentage.

---

## DDR-008 — 2026-07-29 — The attendance toggle

**Status:** Accepted

**Context:**
Kit's source design has four fixed attendance states. A team defines its own
statuses (ADR-005), so the treatment has to follow a status's colour token
rather than its identity. The screen is used standing at the side of a pitch.

**Decision:**
- Tapping cycles unmarked → each status in order → unmarked. Twenty players is
  then a job of seconds rather than a form.
- **Every marked status fills solid.** Kit's source fills only green and tints
  the rest; ours also tints the *row* on the wide layout, and a tinted toggle on
  a tinted row of the same colour disappears.
- Row tint is wide-layout only (`md:`). Kit keeps the phone row white so the
  list stays readable in sunlight; state lives in the disc there.
- The glyph is drawn from Kit's alphabet: green takes `✓`, orange takes `✕`,
  anything else takes the status's initial.
- Colour classes are a **static lookup keyed by token**, never interpolated, so
  Tailwind sees every class at build time (see ADR-018).

**Consequences:**
- Saving is one bulk write, not a request per tap (ADR-019).
- Adding a status needs no new styling — it inherits from its colour token.

---

## DDR-009 — 2026-07-30 — Wide tables pin the identifying column

**Status:** Accepted

**Context:**
The tracking matrix is members × definitions. At six definitions it is wider
than a phone. A tick recorded against the wrong person is the one mistake that
screen must not make easy.

**Decision:**
The member column is `sticky left-0` inside an `overflow-x-auto` wrapper. The
**page** never scrolls horizontally; the table scrolls inside its own container.
Rows alternate a faint tint (DDR-003) so a long row stays readable across the
columns.

**Consequences:**
- The sticky cell needs the same background as its row, so the tint is applied
  to both the row and the sticky `<th>`.
- Any future wide table follows this rather than shrinking text to fit.
