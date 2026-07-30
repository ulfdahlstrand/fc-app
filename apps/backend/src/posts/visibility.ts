import type { Kysely } from "kysely";
import type { Database } from "../db/types.js";

/**
 * The whole security surface of posts (issue #18).
 *
 * Everything else in this feature is a list and a form. This is the part that
 * must not be got wrong — a post targeted at "A-truppen" reaching a guardian
 * whose child is not in it is a privacy failure, not a cosmetic bug — so the
 * decision lives here as a pure function with its own tests rather than as a
 * clause buried in a query.
 *
 * Two things make a post visible:
 *
 *  - **Managing posts.** A coach sees everything, drafts included; they are the
 *    ones writing them.
 *  - **Being addressed.** A published post with no targets is for the whole
 *    team. A published post with targets reaches you if any of your linked
 *    members (#9) is in one of those groups.
 *
 * Note what is *not* here: holding `members.view` does not grant sight of a
 * targeted post. Seeing the roster and being addressed by an announcement are
 * different questions.
 */
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

/**
 * The groups a user is reachable through in one team, via their linked members
 * (#9). A guardian with two children in the same team is reachable through the
 * union of both children's groups.
 *
 * Scoped to the team so a group membership in another team can never make a
 * post visible here — group ids are unguessable, but relying on that instead of
 * scoping would be relying on the wrong thing.
 */
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
