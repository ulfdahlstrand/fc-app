/**
 * The roster split into sections, one per group (#99).
 *
 * A member can be in several groups, so "group the list by group" is genuinely
 * ambiguous. The decision: **every member appears exactly once, under the
 * alphabetically first group they belong to.** Repeating a member under each
 * of their groups was rejected — it makes the visible total exceed the roster
 * and turns "who is missing" into a counting exercise.
 *
 * The consequence, which the caller must not paper over: a section counts
 * **the rows under it**, not the group's real size. A member of both
 * `A-truppen` and `Född 2014` is drawn under `A-truppen`, so `Född 2014` shows
 * fewer people here than `groups.memberCount` says it has. That is the honest
 * number for the groups page and the wrong one here.
 */
import type { Member } from "@fc-app/contracts";

export interface MemberSection {
  /** Null for the members who belong to no group at all. */
  groupId: string | null;
  name: string;
  members: Member[];
}

export interface GroupNames {
  id: string;
  name: string;
}

/**
 * Sections in group-name order, with the members who are in no group last.
 *
 * Members keep the order they arrived in — the server has already sorted them
 * (`compareMemberNames`), so this never re-sorts and cannot disagree with the
 * flat list. Sections that end up empty are dropped: a search narrows the
 * roster, and a heading over nothing is noise.
 *
 * `ungroupedName` is passed in rather than looked up, so this stays pure and
 * the caller owns the translation.
 */
export function groupMembers(
  members: readonly Member[],
  groupIds: Readonly<Record<string, string[]>>,
  groups: readonly GroupNames[],
  ungroupedName: string
): MemberSection[] {
  const names = new Map(groups.map((group) => [group.id, group.name]));
  const sections = new Map<string, Member[]>();
  const ungrouped: Member[] = [];

  for (const member of members) {
    // The server orders each member's groups by name, so the first is the
    // alphabetically first — no need to resolve names to decide.
    const first = (groupIds[member.id] ?? []).find((id) => names.has(id));
    if (first === undefined) {
      ungrouped.push(member);
      continue;
    }
    sections.set(first, [...(sections.get(first) ?? []), member]);
  }

  const named = [...sections.entries()]
    .map(([groupId, sectionMembers]) => ({
      groupId,
      name: names.get(groupId) ?? "",
      members: sectionMembers,
    }))
    // Matches `listGroups`, which orders by name.
    .sort((a, b) => a.name.localeCompare(b.name, "sv"));

  return ungrouped.length === 0
    ? named
    : [...named, { groupId: null, name: ungroupedName, members: ungrouped }];
}
