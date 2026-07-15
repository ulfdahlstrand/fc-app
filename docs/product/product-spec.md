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
| Login | `/login` | Sign in with Google/Apple |
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
| Groups | `/groups` | Custom member groups (e.g. "A squad", "born 2014") used for filtering, call-ups, and posts |
| Call-ups | `/callups` | Overview of squad selections and response status per match |
| Statistics | `/statistics` | Attendance statistics per member, period, and activity type |
| Posts | `/posts` | Announcements to the whole team or targeted groups |
| Tracking lists | `/tracking` | Matrix (members × items) of configurable checklists — e.g. "Grönt kort", "picked up discount booklets" |
| Team settings | `/settings/team` | Activity types, attendance statuses, member field definitions, tracking list definitions, seasons |
| Club settings | `/settings/club` | Club profile, teams, roles & permissions, users & invitations |
| My profile | `/profile` | Own account, linked members, language |

## Features by area

### 1. Accounts, clubs & roles
- OAuth sign-in (Google first; Apple when a developer account is in place — ADR-004).
- Create club → creates first team, seeds default configuration, makes creator `Admin`.
- Invite users by link/email with a preset role; configurable roles per club.

### 2. Members
- Roster CRUD; core fields kept minimal (name, birth year, contact).
- **Custom field definitions** per team: text, number, date, boolean, select
  (e.g. jersey number, position, allergies, photo consent).
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
- Members/guardians respond (accept/decline) — response tracking for coaches.

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
