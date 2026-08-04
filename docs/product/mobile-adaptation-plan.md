# Mobile adaptation plan

> Working plan, not a decision record. When a phase lands, the durable parts of
> it belong in `docs/design-decisions.md` as a DDR; this file is deleted once
> the last phase ships.

## Why

The frontend is built for a single width. Across every route and component
there are roughly twenty breakpoint utilities in total, and most of those are
shadcn defaults inside `Dialog` rather than deliberate responsive work.

| Finding | Where |
|---|---|
| Fixed `max-w-6xl` + `px-[30px]`, no mobile gutter | `routes/__root.tsx` |
| 12+ nav pills that wrap onto several rows on a narrow screen | `routes/__root.tsx` |
| `<Table>` with dynamic custom-field columns | `routes/members.tsx`, `routes/import.tsx` |
| No `safe-area-inset`, no minimum tap target | `styles/globals.css` |

This is not a redesign. Kit is already implemented in `styles/globals.css`, and
the design reference's mobile layer is purely additive: every component is
unchanged except `NavPill` (which gains a `touch` prop), plus three new
navigation components. Desktop stands still; the phone gets a new shell.

## What the reference specifies

From `guidelines/mobile.md` and `tokens/mobile.css` in `design-reference.zip`:

- **One breakpoint: 700px.** Two shells, nothing designed in between. A tablet
  gets the desktop shell, centred and **capped at 1100px** — today the app caps
  at `max-w-6xl` (1152px). Phone design width is 390px.
- Crossing the breakpoint swaps *which components build a screen*, not how they
  look. Only the gutter (16 → 30px) and the Anton display steps scale.
- **Four fixed bands:** `MobileTopBar` → scrolling content → save bar →
  `TabBar`. Only the middle moves. "A coach marking attendance in the rain must
  never scroll to find Save."
- **44px is a hard floor** for anything tappable. Rows 54px, tab items 46px.
  Buttons use `md`, never `lg`. A bare text shortcut gains the height as
  invisible slop — padding plus matching negative margin — so the row does not
  grow.
- **No modals, dropdowns or popovers on a phone: a choice is a sheet.**
  `MenuSheet` is the only overlay pattern, and its 45% ink scrim is the one
  translucent surface Kit permits.
- **Anton drops about two steps** (hero 100 → 64, lg 54 → 40, md 38 → 30,
  sm 28 → 24) and `xl` disappears. **Body type does not scale** — 13px floor,
  captions never below 12px.
- Long row metas are shortened **in the data** (`mobileMeta`), never truncated
  with CSS. "A coach should not have to guess at a clipped word."
- Two flex traps, documented as rules because they each cost the kit a bug:
  a horizontally scrolling row inside a column flex resolves `min-height` to 0
  and collapses (needs `flex: none`); an inline-flex button inside a flex row
  shrinks to min-content and wraps its label (needs `flex: none` and
  `white-space: nowrap`).
- Every component must declare one of three mobile outcomes — **same**,
  **adjust**, or **swap**. The matrix is in `guidelines/mobile-adapt.html`.

## Decisions

- **Navigation:** a five-item `TabBar` — four sections plus `Menu`. No
  hamburger in the header; the sheet opens from the bottom where the thumb
  already is. The team pill is the one exception, opening the same sheet at its
  team section.
- **Which four:** an ordered priority list filtered by permission — the top
  four the user may see become tabs, the rest fall into the sheet. No
  role-specific code, and it degrades correctly on its own. For a coach that is
  **Overview, Members, Activities, Statistics**; the dashboard serves as Kit's
  "Matchday" because it already shows today's session, attendance and call-up
  responses. A player or guardian falls out with Overview, Call-ups and Posts.
- Unanswered call-ups raise the orange `alert` dot on the `Menu` tab, which is
  what `TabBarItem.alert` exists for.
- **Scope:** favour the better whole over the smaller diff.
- **Delivery:** one PR per phase.

## Phases

### Phase 0 — Replace the design reference — done

`design-reference.zip` replaced with the mobile-capable kit (117 files).

### Phase 1 — Foundations and the shell

The 700px breakpoint and the mobile token set; desktop cap 1152 → 1100px;
gutter 30 → 16px below the breakpoint; the 44px tap floor; `Dialog` and
`Select` become sheets on a phone, which reaches all seven dialog components at
once. Then the shell itself: `MobileTopBar`, `TabBar`, `MenuSheet`, with the
permission-filtered tab list and `safe-area-inset-bottom`.

### Phase 2 — The pages

In the order they are actually used, standing at the pitch, one-handed:

1. `index` (dashboard), `activities_.$activityId` (attendance), `callups`
2. `members` (table → `PlayerRow` cards), `activities`, `groups`, `posts`
3. `statistics`, `tracking`, `settings.*`, `profile`
4. `import` — a 621-line wizard that admins run at a desk. Lowest priority;
   possibly just an "open this on a computer" notice.

### Phase 3 — Verification

Every page at 390×844 in the browser: no horizontal scroll, no undersized or
unreachable tap targets, no clipped metas. Screenshots with each PR.
