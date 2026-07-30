/** The security surface of posts: who may see what (ADR-016). */
import type { Kysely } from "kysely";
import type { Database } from "../db/types.js";

export interface VisiblePost {
  /** null = draft. */
  publishedAt: Date | null;
  /** Empty = addressed to the whole team. */
  targetGroupIds: string[];
}

export interface PostViewer {
  /** Holds `posts.manage` in this team. */
  canManage: boolean;
  /** Groups the viewer's linked members belong to, in this team. */
  groupIds: ReadonlySet<string>;
}

export function canSeePost(post: VisiblePost, viewer: PostViewer): boolean {
  // The author's own view: drafts included, targeting ignored.
  if (viewer.canManage) return true;

  // A draft has not been told to anybody yet.
  if (post.publishedAt === null) return false;

  // No targets means the whole team — expressed by absence, so a post can
  // never be both team-wide and targeted.
  if (post.targetGroupIds.length === 0) return true;

  return post.targetGroupIds.some((groupId) => viewer.groupIds.has(groupId));
}

/** The groups a user is reachable through in one team, via their linked members (#9). */
export async function viewerGroupIds(
  db: Kysely<Database>,
  userId: string,
  teamId: string
): Promise<Set<string>> {
  const rows = await db
    .selectFrom("member_guardians")
    .innerJoin("group_members", "group_members.member_id", "member_guardians.member_id")
    .innerJoin("groups", "groups.id", "group_members.group_id")
    .select("groups.id as group_id")
    .where("member_guardians.user_id", "=", userId)
    .where("groups.team_id", "=", teamId)
    .execute();
  return new Set(rows.map((row) => row.group_id));
}
