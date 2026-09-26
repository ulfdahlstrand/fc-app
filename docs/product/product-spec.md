# FC App — Product Specification

> The what and why of the product. Technical decisions live in
> [`../tech-decisions.md`](../tech-decisions.md); system structure in
> [`../architecture.md`](../architecture.md).

## Vision

FC App is an administration app for football teams. Coaches and team managers
use it to keep the team organised: the roster, the calendar, attendance,
match call-ups, and team communication.

The guiding principle is **flexibility**: every team works differently, so the
app must adapt to the team — not the other way around. Anything that varies
between teams (member fields, activity types, attendance statuses, roles,
tracked items) is **configuration data, not code**.

## Guiding principles

1. **Configurable over hardcoded** — teams define their own member fields,
   activity types, attendance statuses, roles, and tracking lists.
2. **Sensible defaults** — a new team is seeded with a working default setup
   (e.g. activity types "Training"/"Match", attendance statuses
   "Present"/"Absent"/"Ill") that can be edited or removed.
3. **Multi-tenant from day one** — any club can register. All domain data
   belongs to a club; clubs contain teams; data is isolated per club.
4. **Roster ≠ accounts** — a *member* (e.g. a 10-year-old player) exists in
   the roster without needing a login. A *user* (account) can be linked to one
   or more members (as self, or as guardian).

## Users & roles

- **User** — a person with an account (Google/Apple sign-in). Global identity,
  can belong to several clubs/teams.
- **Membership** — connects a user to a club/team with a **role**.
- **Role** — a named set of permissions, configurable per club
  (ADR-005). Seeded defaults: `Admin`, `Coach`, `Player`, `Guardian`.
  The *permission catalog* (e.g. `members.manage`, `activities.manage`,
  `attendance.record`, `callups.respond`, `settings.manage`) is fixed in code;
  which permissions a role has is data.
- **Member** — a person in the team roster (usually a player). Optionally
  linked to user accounts (their own, and/or guardians').

## Pages

### Public / entry
| Page | Route | Purpose |
|---|---|---|
| Login | `/login` | Sign in with Google, or email and password; the register and forgot-password links show only once mail works |
| Register | `/register` | Create an email/password account; confirmed by a mailed link |
| Forgot / reset password | `/forgot-password`, `/reset-password` | Mailed single-use link to choose a new password |
| Verify email | `/verify-email` | Confirms the address from the signup mail and creates the account |
| Club onboarding | `/onboarding` | Create a club + first team after first sign-in |
| Accept invitation | `/invite/$token` | Join a club/team from an emailed/shared invite link |

### App (within a club/team context; club & team switcher in the shell)
| Page | Route | Purpose |
|---|---|---|
| Dashboard | `/` | Upcoming activities, unanswered call-ups, attendance trend, incomplete tracking lists |
| Calendar & activities | `/activities` | Calendar/list of trainings, matches, and custom activity types; recurring activities |
| Activity detail | `/activities/$id` | Info, attendance tab, call-up tab |
| Members | `/members` | Roster with configurable columns, filtering by group |
| Member detail | `/members/$id` | Profile with custom fields, guardians, attendance history, tracking status |
| Groups | `/members?view=groups` | Custom member groups (e.g. "A squad", "born 2014") used for filtering, call-ups, and posts. A section in the members page's menu rather than a top-level destination; the old `/groups` redirects there |
| Call-ups | `/callups` | Overview of squad selections and response status per match |
| Statistics | `/statistics` | Attendance statistics per member, period, and activity type |
| Posts | `/posts` | Announcements to the whole team or targeted groups |
| Tracking lists | `/tracking` | Matrix (members × items) of configurable checklists — e.g. "Grönt kort", "picked up discount booklets" |
| Team settings | `/settings/team` | A section menu over coaches of the team (admin only), activity types, attendance statuses, seasons, adding a member and inviting imported guardians, member field definitions, tracking list definitions, development metrics. One section at a time, addressed by `?section=` |
| Club settings | `/settings/club` | Club profile, teams, roles & permissions, users & invitations |
| My profile | `/profile` | Own account, linked members, language |
| Site admin | `/admin` | Site admins only (ADR-025, ADR-026): create an account with email and password, placed in the current club with a role; below that every account in the installation, searchable, with a new password for one that already has one; read every sign-in attempt, filterable by address and to failures (ADR-027) |

## Features by area

### 1. Accounts, clubs & roles
- OAuth sign-in (Google first; Apple when a developer account is in place — ADR-004).
- **Email and password** for those without Google (ADR-024). The account is only
  created once the address is confirmed through a mailed link, since invitations
  and coach appointments are matched by address. A Google account can get a
  password the same way, through "Forgot password". Passwords are at least 10
  characters and are stored only as a scrypt hash.
- **Site admins** (ADR-025) — whoever runs the installation, flagged with SQL —
  can read the sign-in audit (ADR-027) and create an account directly, with an address and password they hand over,
  and place it in a club with a role. It only creates: an address that already
  has an account is refused. Signing in with a password works without mail;
  registering and resetting wait until mail is configured.
- A site admin also **sees every account** in the installation, searched by name
  or address, with how each one signs in and which clubs and teams it belongs
  to, and can **give one a new password** (ADR-026) — but only an account that
  already has one, never a Google account, whose owner proved that address to
  Google. The new password signs the account out everywhere, and the page can
  suggest a readable strong one so nobody has to invent it.
- Create club → creates first team, seeds default configuration, makes creator `Admin`.
- Invite users by link/email with a preset role; configurable roles per club.
- **Coaches per team** (`/settings/team`, `settings.club`): a membership scoped
  to one team, holding the club's `Coach` role — so the same person can coach
  several teams, and stop coaching one without leaving the club. Somebody whose
  club-wide role is wider than `Coach` cannot be added: a team-scoped role
  replaces the club-wide one inside that team, so it would take their access
  away exactly there (#74).
  **Every appointment takes effect immediately** — an admin administering the
  club does not wait for anybody to accept anything. The picker offers two
  lists, the **team's own roster** and the **club's accounts**, and a third way
  in by address for somebody in neither. Where no account holds the address
  yet, one is created and holds the role from that moment; signing in with that
  address later lands on it, because sign-in resolves an OAuth profile to an
  existing user by e-mail. Each roster row says which account it will appoint
  before it is pressed — including *whose* account, when the address belongs to
  someone under another name, since a child's row usually carries a parent's.
  A member with no address at all cannot be appointed; give them one on the
  roster first. Coach invitations issued elsewhere are still shown, and are
  retired automatically when an appointment overtakes them.

### 2. Members
- Roster CRUD; core fields kept minimal (name, birth year, contact) with one
  deliberate exception: the **personnummer**, which is what identifies a person
  across imports and the licence register. It is stored apart from the roster,
  masked for anyone without `members.manage`, and never logged — see ADR-022.
- **Custom field definitions** per team: text, number, date, boolean, select
  (e.g. jersey number, position, allergies, photo consent). Team settings sets
  their **order**, which every screen reads, and whether each one may appear as
  a **roster column** or belongs on the player's own page only; within the
  roster columns each user still picks what to show.
- One of them may be the team's **presentation field** — a text or number
  field that helps say *who* a row is, so it is drawn before the name in the
  roster and takes the place of the initials in the circle on a phone. One per
  team, and it is always in the list.
- A field may belong to a **season** ("Stuvsta häfte" for "höst 2026"). It is
  then labelled with the season after its name — "Stuvsta häfte höst 2026" —
  and it leaves the roster's columns the day after the season ends. The values
  stay on the player's own page; deleting the season unties the field rather
  than removing it.
- Adding a member by hand and inviting the guardians an import brought in are
  **team settings**, not roster controls: both are done a handful of times a
  year, and the roster is a page opened to read.
- Guardians: link user accounts to members.
- Groups: manual member groups, usable everywhere a "who" is selected.

### 3. Activities & calendar
- **Configurable activity types** (seeded: Training, Match; teams add their
  own — cup, team party, parent meeting…).
- Single and recurring activities; season association; location, time, notes.
- Calendar and list views.

### 4. Attendance & statistics
- Register attendance per activity with **configurable statuses**
  (seeded: Present, Absent, Ill — teams can add e.g. "Late", "Injured").
- Statistics per member/period/activity type; export.

### 5. Call-ups (matchtrupp)
- Select a squad for an activity (typically a match), from roster or group.
- A call-up is a **draft until published** — picking a squad is not telling it.
- Members/guardians respond (accept/decline) — response tracking for coaches.
- **Removing a member from a squad is silent**, published or not. It stays
  silent when notifications arrive later: being taken out of a squad is a
  conversation a coach should have, not a message an app should send.

### 6. Communication
- Posts/announcements to the team or targeted groups.
- Future: comments, email/push notification on new posts.

### 7. Tracking lists (uppföljningslistor)
- **Configurable checklist definitions** per team: a name + status type
  (done/not done, date, or free text) — e.g. "Grönt kort obtained",
  "Discount booklet picked up", "Membership fee paid".
- Matrix view members × items with quick toggling; per-member view on the
  member detail page.
- This is the flexible replacement for ad-hoc spreadsheets, and covers simple
  fee tracking until a dedicated payments feature exists.

## Data model (sketch)

```
users ─┬─ identities (oauth provider + subject)
       └─ sessions
clubs ──< teams ──< seasons
users >──< memberships (club/team, role) ──> roles ──< role_permissions
teams ──< members ──< member_guardians >── users
members ──1 member_personal_ids          (personnummer, gated — ADR-022)
members ──< member_contacts >── users     (guardians without an account yet)
teams ──< member_field_definitions ──< member_field_values >── members
teams ──< groups ──< group_members >── members
teams ──< activity_types ──< activities
activities ──< attendance_records >── members  (status → attendance_statuses, per team)
activities ──< callups ──< callup_invitations >── members (+ response)
teams ──< posts ──< post_targets >── groups
teams ──< tracking_definitions ──< tracking_entries >── members
```

All domain tables carry a `club_id` (directly or via their parent) — tenant
isolation is enforced in every query (ADR-003).

## Delivery stages

| Stage | Scope |
|---|---|
| **0. Foundation** | Monorepo skeleton, Docker, CI, health end-to-end *(this stage)* |
| **1. Auth & tenancy** | Google sign-in, sessions, club/team onboarding, invitations, roles & permissions |
| **2. Members** | Roster, custom fields, guardians, groups |
| **3. Activities** | Activity types, calendar, recurring activities, seasons |
| **4. Attendance** | Registration, configurable statuses, statistics |
| **5. Call-ups** | Squad selection, invitations, responses |
| **6. Communication** | Posts, group targeting |
| **7. Tracking lists** | Definitions, matrix view, member view |
| Later | Payments/fees, file storage, push/email notifications, calendar feed (iCal), Apple sign-in |

Out of MVP scope (explicitly deferred): payment integration, match results/
league tables, external federation integrations.
