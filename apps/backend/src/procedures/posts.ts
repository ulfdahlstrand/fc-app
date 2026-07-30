import { ORPCError } from "@orpc/server";
import type { Kysely } from "kysely";
import type { Post } from "@fc-app/contracts";
import { getDb } from "../db/client.js";
import type { Database } from "../db/types.js";
import { canSeePost, viewerGroupIds } from "../posts/visibility.js";
import { os, requireUser } from "../orpc.js";
import {
  requireTeamAccess,
  requireTeamPermission,
} from "../tenancy/membership.js";

/**
 * Posts and announcements (issue #18).
 *
 * Writing needs `posts.manage`. Reading needs only team access — being
 * announced to is not a permission, it is what belonging to a team means — and
 * *what* a reader gets back is decided by `canSeePost` in `posts/visibility.ts`,
 * which is where the rule and its tests live.
 *
 * Targeting is stored as absence: no rows in `post_targets` means the whole
 * team. Nothing here ever writes a row per group to mean "everyone".
 */

interface PostRow {
  id: string;
  team_id: string;
  title: string;
  body: string;
  published_at: Date | null;
  pinned: boolean;
  author_id: string | null;
  author_name: string | null;
  created_at: Date;
  updated_at: Date;
}

/** Targets for a set of posts: one query, not one per post. */
async function loadTargets(
  db: Kysely<Database>,
  postIds: string[]
): Promise<Map<string, { id: string; name: string }[]>> {
  if (postIds.length === 0) return new Map();

  const rows = await db
    .selectFrom("post_targets")
    .innerJoin("groups", "groups.id", "post_targets.group_id")
    .select([
      "post_targets.post_id as post_id",
      "groups.id as group_id",
      "groups.name as group_name",
    ])
    .where("post_targets.post_id", "in", postIds)
    .orderBy("groups.name")
    .execute();

  const byPost = new Map<string, { id: string; name: string }[]>();
  for (const row of rows) {
    const list = byPost.get(row.post_id) ?? [];
    list.push({ id: row.group_id, name: row.group_name });
    byPost.set(row.post_id, list);
  }
  return byPost;
}

function toPost(
  row: PostRow,
  targets: { id: string; name: string }[] = []
): Post {
  return {
    id: row.id,
    teamId: row.team_id,
    title: row.title,
    body: row.body,
    publishedAt: row.published_at?.toISOString() ?? null,
    pinned: row.pinned,
    targetGroupIds: targets.map((target) => target.id),
    targetGroupNames: targets.map((target) => target.name),
    authorId: row.author_id,
    authorName: row.author_name,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function selectPosts(db: Kysely<Database>, teamId: string) {
  return (
    db
      .selectFrom("posts")
      // Left join: the notice outlives the account that wrote it.
      .leftJoin("users", "users.id", "posts.author_id")
      .select([
        "posts.id as id",
        "posts.team_id as team_id",
        "posts.title as title",
        "posts.body as body",
        "posts.published_at as published_at",
        "posts.pinned as pinned",
        "posts.author_id as author_id",
        "users.name as author_name",
        "posts.created_at as created_at",
        "posts.updated_at as updated_at",
      ])
      .where("posts.team_id", "=", teamId)
  );
}

async function loadPostRow(
  db: Kysely<Database>,
  teamId: string,
  postId: string
): Promise<PostRow> {
  const row = await selectPosts(db, teamId)
    .where("posts.id", "=", postId)
    .executeTakeFirst();
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "Post not found" });
  }
  return row;
}

/** Reloads a post with its targets, for the shape every mutation returns. */
async function reload(
  db: Kysely<Database>,
  teamId: string,
  postId: string
): Promise<Post> {
  const row = await loadPostRow(db, teamId, postId);
  const targets = await loadTargets(db, [postId]);
  return toPost(row, targets.get(postId) ?? []);
}

/**
 * Every target must be a group in *this* team. Without this, a valid group id
 * from another team would silently widen who a post reaches.
 */
async function assertGroupsInTeam(
  db: Kysely<Database>,
  teamId: string,
  groupIds: string[]
): Promise<void> {
  if (groupIds.length === 0) return;
  const unique = [...new Set(groupIds)];
  const rows = await db
    .selectFrom("groups")
    .select("id")
    .where("team_id", "=", teamId)
    .where("id", "in", unique)
    .execute();
  if (rows.length !== unique.length) {
    throw new ORPCError("BAD_REQUEST", {
      message: "One of those groups does not belong to this team",
    });
  }
}

async function replaceTargets(
  db: Kysely<Database>,
  postId: string,
  groupIds: string[]
): Promise<void> {
  const unique = [...new Set(groupIds)];
  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom("post_targets").where("post_id", "=", postId).execute();
    if (unique.length > 0) {
      await trx
        .insertInto("post_targets")
        .values(unique.map((groupId) => ({ post_id: postId, group_id: groupId })))
        .execute();
    }
  });
}

/**
 * Pinned first, then newest. Drafts sort by when they were written, since they
 * have no publication date yet — they only ever appear to their own author's
 * role, at the top, which is where unfinished work belongs.
 */
function feedOrder(a: Post, b: Post): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  const aTime = new Date(a.publishedAt ?? a.createdAt).getTime();
  const bTime = new Date(b.publishedAt ?? b.createdAt).getTime();
  return bTime - aTime;
}

export const listPostsHandler = os.listPosts.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    // Team access, not a permission: being announced to is what belonging to a
    // team means.
    const access = await requireTeamAccess(db, user.id, input.teamId);
    const canManage = access.membership.permissions.includes("posts.manage");

    const rows = await selectPosts(db, input.teamId).execute();
    if (rows.length === 0) return { posts: [] };

    const [targets, groupIds] = await Promise.all([
      loadTargets(
        db,
        rows.map((row) => row.id)
      ),
      // Only needed for readers; a manager sees everything regardless.
      canManage
        ? Promise.resolve(new Set<string>())
        : viewerGroupIds(db, user.id, input.teamId),
    ]);

    const viewer = { canManage, groupIds };
    const visible = rows.filter((row) =>
      canSeePost(
        {
          publishedAt: row.published_at,
          targetGroupIds: (targets.get(row.id) ?? []).map((t) => t.id),
        },
        viewer
      )
    );

    const posts = visible
      .map((row) => toPost(row, targets.get(row.id) ?? []))
      // A manager can ask for the feed as the team sees it, to check their own
      // work before publishing the rest.
      .filter((post) => input.includeDrafts === true || post.publishedAt !== null)
      .sort(feedOrder);

    return { posts };
  }
);

export const getPostHandler = os.getPost.handler(async ({ input, context }) => {
  const user = requireUser(context);
  const db = getDb();
  const access = await requireTeamAccess(db, user.id, input.teamId);
  const canManage = access.membership.permissions.includes("posts.manage");

  const row = await loadPostRow(db, input.teamId, input.postId);
  const targets = (await loadTargets(db, [input.postId])).get(input.postId) ?? [];

  const groupIds = canManage
    ? new Set<string>()
    : await viewerGroupIds(db, user.id, input.teamId);

  // NOT_FOUND rather than FORBIDDEN: that a post exists is itself part of what
  // targeting withholds, so a reader must not be able to tell the difference
  // between "no such post" and "not for you".
  if (
    !canSeePost(
      {
        publishedAt: row.published_at,
        targetGroupIds: targets.map((target) => target.id),
      },
      { canManage, groupIds }
    )
  ) {
    throw new ORPCError("NOT_FOUND", { message: "Post not found" });
  }

  return { post: toPost(row, targets) };
});

export const createPostHandler = os.createPost.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "posts.manage");

    const targetGroupIds = input.targetGroupIds ?? [];
    await assertGroupsInTeam(db, input.teamId, targetGroupIds);

    const inserted = await db
      .insertInto("posts")
      .values({
        team_id: input.teamId,
        author_id: user.id,
        title: input.title,
        body: input.body,
        published_at: input.publish === true ? new Date() : null,
        pinned: input.pinned ?? false,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    if (targetGroupIds.length > 0) {
      await replaceTargets(db, inserted.id, targetGroupIds);
    }

    return { post: await reload(db, input.teamId, inserted.id) };
  }
);

export const updatePostHandler = os.updatePost.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "posts.manage");

    await loadPostRow(db, input.teamId, input.postId);

    if (input.targetGroupIds !== undefined) {
      await assertGroupsInTeam(db, input.teamId, input.targetGroupIds);
    }

    const updates: Record<string, unknown> = {};
    if (input.title !== undefined) updates["title"] = input.title;
    if (input.body !== undefined) updates["body"] = input.body;
    if (input.pinned !== undefined) updates["pinned"] = input.pinned;

    if (Object.keys(updates).length > 0) {
      await db
        .updateTable("posts")
        .set({ ...updates, updated_at: new Date() })
        .where("id", "=", input.postId)
        .where("team_id", "=", input.teamId)
        .execute();
    }

    // Sent explicitly, including as an empty array — which is how a targeted
    // post is widened back out to the whole team.
    if (input.targetGroupIds !== undefined) {
      await replaceTargets(db, input.postId, input.targetGroupIds);
    }

    return { post: await reload(db, input.teamId, input.postId) };
  }
);

export const setPostPublishedHandler = os.setPostPublished.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "posts.manage");

    const existing = await loadPostRow(db, input.teamId, input.postId);

    // Re-publishing keeps the original date: a corrected typo does not make an
    // announcement new, and it must not jump back to the top of the feed.
    const publishedAt = input.published
      ? (existing.published_at ?? new Date())
      : null;

    await db
      .updateTable("posts")
      .set({ published_at: publishedAt, updated_at: new Date() })
      .where("id", "=", input.postId)
      .where("team_id", "=", input.teamId)
      .execute();

    return { post: await reload(db, input.teamId, input.postId) };
  }
);

export const deletePostHandler = os.deletePost.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "posts.manage");

    await loadPostRow(db, input.teamId, input.postId);

    // Genuinely deleted, unlike activities or members. A post is a message, not
    // a record: withdrawing one that was wrong is the point, and an archived
    // announcement nobody can see is just a row nobody will ever read.
    // `post_targets` goes with it by cascade.
    await db
      .deleteFrom("posts")
      .where("id", "=", input.postId)
      .where("team_id", "=", input.teamId)
      .execute();

    return { deleted: true };
  }
);
