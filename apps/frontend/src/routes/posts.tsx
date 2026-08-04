/** Posts and announcements (issue #18) — the team's noticeboard. */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { Post } from "@fc-app/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { RichText } from "../components/RichText";
import { ensureMe } from "../lib/auth";
import { ensureMyClubs, useHasPermission, useSelectedTeam } from "../lib/clubs";
import { formatDateLong, SEPARATOR, useDateLocale } from "../lib/dates";
import { useZodResolver } from "../lib/form";
import { useGroups } from "../lib/groups";
import {
  postFormSchema,
  useCreatePost,
  useDeletePost,
  usePosts,
  useSetPostPublished,
  useUpdatePost,
  type PostFormOutput,
  type PostFormValues,
} from "../lib/posts";

export const Route = createFileRoute("/posts")({
  beforeLoad: async () => {
    const user = await ensureMe();
    if (!user) throw redirect({ to: "/login" });
    const clubs = await ensureMyClubs();
    if (clubs.length === 0) throw redirect({ to: "/onboarding" });
  },
  component: PostsPage,
});

function PostsPage() {
  const { t } = useTranslation();
  const selected = useSelectedTeam();

  if (!selected) {
    return (
      <Alert>
        <AlertDescription>{t("members.noTeam")}</AlertDescription>
      </Alert>
    );
  }
  return <Posts teamId={selected.team.id} />;
}

function Posts({ teamId }: { teamId: string }) {
  const { t } = useTranslation();
  const canManage = useHasPermission("posts.manage");
  const [showDrafts, setShowDrafts] = useState(canManage);
  const [editing, setEditing] = useState<Post | null>(null);
  const [creating, setCreating] = useState(false);

  const posts = usePosts(teamId, canManage && showDrafts);
  const list = posts.data?.posts ?? [];
  const drafts = list.filter((post) => post.publishedAt === null).length;

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kit-overline">
            {canManage && drafts > 0
              ? t("posts.draftCount", { count: drafts })
              : t("posts.subtitle")}
          </p>
          <h1 className="font-display text-4xl">{t("posts.heading")}</h1>
        </div>
        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            {/* Lets a coach read the board as the team reads it, which is the
                only honest way to check targeting before publishing. */}
            <Button
              variant="outline"
              onClick={() => setShowDrafts((value) => !value)}
            >
              {showDrafts ? t("posts.hideDrafts") : t("posts.showDrafts")}
            </Button>
            <Button onClick={() => setCreating(true)}>{t("posts.new")}</Button>
          </div>
        )}
      </div>

      {posts.isPending ? (
        <p className="text-muted-foreground">{t("common.loading")}</p>
      ) : posts.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{t("posts.loadError")}</AlertDescription>
        </Alert>
      ) : list.length === 0 ? (
        <div className="bg-card flex flex-col gap-2 rounded-xl px-5 py-[18px] kit:px-6 kit:py-8">
          <p className="font-display text-2xl">{t("posts.empty")}</p>
          <p className="text-muted-foreground">
            {canManage ? t("posts.emptyHint") : t("posts.emptyReader")}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-[14px]">
          {list.map((post) => (
            <PostCard
              key={post.id}
              teamId={teamId}
              post={post}
              canManage={canManage}
              onEdit={() => setEditing(post)}
            />
          ))}
        </div>
      )}

      {creating && (
        <PostDialog teamId={teamId} onClose={() => setCreating(false)} />
      )}
      {editing && (
        <PostDialog
          teamId={teamId}
          post={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function PostCard({
  teamId,
  post,
  canManage,
  onEdit,
}: {
  teamId: string;
  post: Post;
  canManage: boolean;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const setPublished = useSetPostPublished(teamId);
  const updatePost = useUpdatePost(teamId);
  const deletePost = useDeletePost(teamId);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const isDraft = post.publishedAt === null;
  const pending =
    setPublished.isPending || updatePost.isPending || deletePost.isPending;

  const meta = [
    post.authorName ?? t("posts.unknownAuthor"),
    formatDateLong(post.publishedAt ?? post.createdAt, locale),
  ].join(SEPARATOR);

  return (
    <article
      className={cn(
        "bg-card flex flex-col gap-3 rounded-xl px-5 py-[18px] kit:px-6 kit:py-5",
        // A pinned post is louder by weight, not by a shadow.
        post.pinned && "outline-2 outline-ink",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="kit-overline flex flex-wrap items-center gap-2">
            {post.pinned && <span>{t("posts.pinned")}</span>}
            {post.pinned && <span aria-hidden>·</span>}
            <span>{meta}</span>
          </span>
          <h2 className="font-display text-2xl">{post.title}</h2>
        </div>
        {isDraft && <Badge variant="unset">{t("posts.draft")}</Badge>}
      </div>

      {/* Targeting is stated plainly. A reader seeing "A-truppen" knows why it
          reached them; a coach can see at a glance who it did not. */}
      <div className="flex flex-wrap items-center gap-2">
        {post.targetGroupNames.length === 0 ? (
          <Badge variant="secondary">{t("posts.wholeTeam")}</Badge>
        ) : (
          post.targetGroupNames.map((name) => (
            <Badge key={name} variant="brand">
              {name}
            </Badge>
          ))
        )}
      </div>

      <div className="text-foreground">
        <RichText body={post.body} />
      </div>

      {canManage && (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            size="sm"
            variant={isDraft ? "default" : "outline"}
            disabled={pending}
            onClick={() =>
              setPublished.mutate({ postId: post.id, published: isDraft })
            }
          >
            {isDraft ? t("posts.publish") : t("posts.unpublish")}
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={onEdit}>
            {t("common.edit")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              updatePost.mutate({ postId: post.id, pinned: !post.pinned })
            }
          >
            {post.pinned ? t("posts.unpin") : t("posts.pin")}
          </Button>
          {confirmingDelete ? (
            <>
              <Button
                size="sm"
                variant="destructive"
                disabled={pending}
                onClick={() => deletePost.mutate({ postId: post.id })}
              >
                {t("posts.confirmDelete")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirmingDelete(false)}
              >
                {t("posts.keep")}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => setConfirmingDelete(true)}
            >
              {t("common.delete")}
            </Button>
          )}
        </div>
      )}

      {(setPublished.isError || updatePost.isError || deletePost.isError) && (
        <Alert variant="destructive">
          <AlertDescription>
            {setPublished.error?.message ??
              updatePost.error?.message ??
              deletePost.error?.message ??
              t("posts.saveError")}
          </AlertDescription>
        </Alert>
      )}
    </article>
  );
}

function PostDialog({
  teamId,
  post,
  onClose,
}: {
  teamId: string;
  post?: Post;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const groups = useGroups(teamId);
  const createPost = useCreatePost(teamId);
  const updatePost = useUpdatePost(teamId);
  const isEdit = post !== undefined;

  const form = useForm<PostFormValues, unknown, PostFormOutput>({
    resolver: useZodResolver(postFormSchema, "posts.validation"),
    defaultValues: { title: post?.title ?? "", body: post?.body ?? "" },
  });

  // Held outside the form: "no groups means everyone" is a rule stated in words
  // below, not a validation a resolver could express.
  const [targets, setTargets] = useState<string[]>(post?.targetGroupIds ?? []);
  const [pinned, setPinned] = useState(post?.pinned ?? false);

  const pending = createPost.isPending || updatePost.isPending;
  const error = createPost.error ?? updatePost.error;

  const toggleTarget = (groupId: string) =>
    setTargets((current) =>
      current.includes(groupId)
        ? current.filter((id) => id !== groupId)
        : [...current, groupId],
    );

  const save = (publish: boolean) =>
    form.handleSubmit(async (data) => {
      if (isEdit) {
        await updatePost.mutateAsync({
          postId: post.id,
          title: data.title,
          body: data.body,
          targetGroupIds: targets,
          pinned,
        });
      } else {
        await createPost.mutateAsync({
          title: data.title,
          body: data.body,
          targetGroupIds: targets,
          pinned,
          publish,
        });
      }
      onClose();
    })();

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("posts.editHeading") : t("posts.newHeading")}
          </DialogTitle>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>
              {error.message ?? t("posts.saveError")}
            </AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form
            id="post-form"
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void save(true);
            }}
          >
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("posts.title")}</FormLabel>
                  <FormControl>
                    <Input {...field} autoFocus maxLength={200} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="body"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("posts.body")}</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={8} maxLength={10000} />
                  </FormControl>
                  <p className="text-muted-foreground text-xs">
                    {t("posts.bodyHint")}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex flex-col gap-2">
              <Label>{t("posts.targets")}</Label>
              <p className="text-muted-foreground text-xs">
                {targets.length === 0
                  ? t("posts.targetsAll")
                  : t("posts.targetsSome", { count: targets.length })}
              </p>
              {(groups.data?.groups.length ?? 0) === 0 ? (
                <p className="text-muted-foreground text-sm">
                  {t("posts.noGroups")}
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {groups.data?.groups.map((group) => (
                    <label
                      key={group.id}
                      className="flex items-center gap-3 text-sm font-semibold"
                    >
                      <Checkbox
                        checked={targets.includes(group.id)}
                        onCheckedChange={() => toggleTarget(group.id)}
                      />
                      {group.name}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <label className="flex items-center gap-3 text-sm font-semibold">
              <Checkbox
                checked={pinned}
                onCheckedChange={(value) => setPinned(value === true)}
              />
              {t("posts.pinLabel")}
            </label>
          </form>
        </Form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
          {!isEdit && (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => void save(false)}
            >
              {t("posts.saveDraft")}
            </Button>
          )}
          <Button type="submit" form="post-form" disabled={pending}>
            {isEdit ? t("common.save") : t("posts.publish")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
