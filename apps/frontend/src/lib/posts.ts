/** Posts and announcements (issue #18). */
import { useMutation, useQuery } from "@tanstack/react-query";
import { createPostInputSchema } from "@fc-app/contracts";
import { z } from "zod";
import { orpc } from "../orpc-client";
import { queryClient } from "../query-client";
import { requiredText } from "./form";
import { orpcQuery } from "./orpc-query";

/** The editor's form, derived from the contract's create input (ADR-007). */
export const postFormSchema = z.object({
  title: requiredText(createPostInputSchema.shape.title),
  body: requiredText(createPostInputSchema.shape.body),
});

export type PostFormValues = z.input<typeof postFormSchema>;
export type PostFormOutput = z.output<typeof postFormSchema>;

export function postsQueryOptions(teamId: string, includeDrafts = false) {
  return orpcQuery.listPosts.queryOptions({ input: { teamId, includeDrafts } });
}

export function usePosts(teamId: string, includeDrafts = false) {
  return useQuery(postsQueryOptions(teamId, includeDrafts));
}

async function invalidatePosts(teamId: string): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: orpcQuery.listPosts.key({ input: { teamId } }),
  });
}

export function useCreatePost(teamId: string) {
  return useMutation({
    mutationFn: (input: {
      title: string;
      body: string;
      targetGroupIds?: string[];
      pinned?: boolean;
      publish?: boolean;
    }) => orpc.createPost({ teamId, ...input }),
    onSuccess: () => invalidatePosts(teamId),
  });
}

export function useUpdatePost(teamId: string) {
  return useMutation({
    mutationFn: (input: {
      postId: string;
      title?: string;
      body?: string;
      targetGroupIds?: string[];
      pinned?: boolean;
    }) => orpc.updatePost({ teamId, ...input }),
    onSuccess: () => invalidatePosts(teamId),
  });
}

export function useSetPostPublished(teamId: string) {
  return useMutation({
    mutationFn: (input: { postId: string; published: boolean }) =>
      orpc.setPostPublished({ teamId, ...input }),
    onSuccess: () => invalidatePosts(teamId),
  });
}

export function useDeletePost(teamId: string) {
  return useMutation({
    mutationFn: (input: { postId: string }) =>
      orpc.deletePost({ teamId, ...input }),
    onSuccess: () => invalidatePosts(teamId),
  });
}
