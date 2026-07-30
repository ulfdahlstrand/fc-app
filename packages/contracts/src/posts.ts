import { z } from "zod";

import { isoInstantSchema, queryBooleanSchema } from "./common.js";

// Posts and announcements (issue #18)
//
// A post reaches either the whole team or particular groups (#10), and that is
// expressed by absence: an empty `targetGroupIds` means everyone. There is no
// separate "everyone" flag that could contradict the target list.
//
// `publishedAt` is nullable, and null means draft — visible only to whoever may
// manage posts. Writing an announcement in two sittings should not half-tell it
// to the team in between, the same reason a squad (#17) stays a draft until a
// coach publishes it.
//
// Who may see what is decided by one function, `canSeePost` in the backend's
// `posts/visibility.ts`. It is the whole security surface of this feature, so it
// lives on its own with tests rather than inline in a query.
// ---------------------------------------------------------------------------

export const postSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  title: z.string(),
  body: z.string(),
  /** null = draft. */
  publishedAt: isoInstantSchema.nullable(),
  pinned: z.boolean(),
  /** Empty = the whole team. */
  targetGroupIds: z.array(z.string()),
  /** Resolved for display, so the feed needs no second call. */
  targetGroupNames: z.array(z.string()),
  authorId: z.string().nullable(),
  /** null when the account that wrote it is gone. */
  authorName: z.string().nullable(),
  createdAt: isoInstantSchema,
  updatedAt: isoInstantSchema,
});

export type Post = z.infer<typeof postSchema>;

/** Title and body limits, shared so the form and the API agree (ADR-007). */
export const postWriteFields = {
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(10000),
};

export const listPostsInputSchema = z.object({
  teamId: z.string(),
  /** Drafts are only ever returned to callers holding `posts.manage`. */
  includeDrafts: queryBooleanSchema.optional(),
});

export const listPostsOutputSchema = z.object({
  posts: z.array(postSchema),
});

export const getPostInputSchema = z.object({
  teamId: z.string(),
  postId: z.string(),
});

export const getPostOutputSchema = z.object({ post: postSchema });

export const createPostInputSchema = z.object({
  teamId: z.string(),
  title: postWriteFields.title,
  body: postWriteFields.body,
  /** Omit or leave empty for the whole team. */
  targetGroupIds: z.array(z.string()).optional(),
  pinned: z.boolean().optional(),
  /** Publish straight away, rather than saving a draft. */
  publish: z.boolean().optional(),
});

export const createPostOutputSchema = z.object({ post: postSchema });

export const updatePostInputSchema = z.object({
  teamId: z.string(),
  postId: z.string(),
  title: postWriteFields.title.optional(),
  body: postWriteFields.body.optional(),
  /** Replaces the whole target list; an empty array means the whole team. */
  targetGroupIds: z.array(z.string()).optional(),
  pinned: z.boolean().optional(),
});

export const updatePostOutputSchema = z.object({ post: postSchema });

export const setPostPublishedInputSchema = z.object({
  teamId: z.string(),
  postId: z.string(),
  published: z.boolean(),
});

export const setPostPublishedOutputSchema = z.object({ post: postSchema });

export const deletePostInputSchema = z.object({
  teamId: z.string(),
  postId: z.string(),
});

export const deletePostOutputSchema = z.object({ deleted: z.boolean() });

// ---------------------------------------------------------------------------
