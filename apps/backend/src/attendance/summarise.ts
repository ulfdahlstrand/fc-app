/**
 * Attendance aggregation (issue #15).
 *
 * Kept as a pure function over rows the handler has already fetched, rather
 * than as SQL: this is the arithmetic a coach will check by hand against the
 * app, so it is the part that most deserves tests. A team-season is hundreds
 * of rows, not millions, so counting in TypeScript costs nothing.
 *
 * The rate is **attended ÷ marked**. A session nobody took attendance at is
 * unknown, not an absence — counting it in the denominator would punish every
 * member for the coach's forgotten phone.
 */
import type { MemberAttendanceStats } from "@fc-app/contracts";

export interface SummariseMember {
  id: string;
  first_name: string;
  last_name: string;
}

export interface SummariseRecord {
  member_id: string;
  status_id: string;
}

export interface SummariseInput {
  members: SummariseMember[];
  /** Records for the in-scope activities only — the handler filters. */
  records: SummariseRecord[];
  /** Ids of the statuses whose `counts_as_present` is set. */
  presentStatusIds: Set<string>;
  /** In-scope activities, cancelled ones already excluded. */
  activities: number;
}

export interface SummariseOutput {
  members: MemberAttendanceStats[];
  activities: number;
  teamRate: number | null;
}

/** A rate rounded to whole percent, or null when there is nothing to divide. */
export function rateOf(attended: number, marked: number): number | null {
  return marked === 0 ? null : Math.round((attended / marked) * 100);
}

export function summariseAttendance(input: SummariseInput): SummariseOutput {
  const attended = new Map<string, number>();
  const marked = new Map<string, number>();

  for (const record of input.records) {
    marked.set(record.member_id, (marked.get(record.member_id) ?? 0) + 1);
    if (input.presentStatusIds.has(record.status_id)) {
      attended.set(record.member_id, (attended.get(record.member_id) ?? 0) + 1);
    }
  }

  const members = input.members.map((member) => {
    const memberAttended = attended.get(member.id) ?? 0;
    const memberMarked = marked.get(member.id) ?? 0;
    return {
      memberId: member.id,
      firstName: member.first_name,
      lastName: member.last_name,
      attended: memberAttended,
      marked: memberMarked,
      rate: rateOf(memberAttended, memberMarked),
    };
  });

  // Lowest rate first: the page exists to surface who is drifting away, and
  // that name should not be somewhere in the middle of an alphabet. Members
  // with nothing marked have no rate to rank on and go last.
  members.sort((a, b) => {
    if (a.rate === null && b.rate === null) {
      return compareNames(a, b);
    }
    if (a.rate === null) return 1;
    if (b.rate === null) return -1;
    return a.rate - b.rate || compareNames(a, b);
  });

  // The team rate is computed from the totals, not as an average of the
  // members' rates — otherwise someone marked once at 100% would weigh as
  // heavily as someone marked twenty times.
  const totalAttended = members.reduce((sum, m) => sum + m.attended, 0);
  const totalMarked = members.reduce((sum, m) => sum + m.marked, 0);

  return {
    members,
    activities: input.activities,
    teamRate: rateOf(totalAttended, totalMarked),
  };
}

function compareNames(
  a: { lastName: string; firstName: string },
  b: { lastName: string; firstName: string }
): number {
  return (
    a.lastName.localeCompare(b.lastName, "sv") ||
    a.firstName.localeCompare(b.firstName, "sv")
  );
}
