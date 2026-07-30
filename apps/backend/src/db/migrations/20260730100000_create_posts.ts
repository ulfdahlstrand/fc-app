import { sql, type Kysely } from "kysely";

/**
 * Posts and announcements (issue #18).
 *
 * A post is either for the whole team or for particular groups (#10). That is
 * expressed by absence: **no rows in `post_targets` means the whole team.** The
 * alternative — a row per group at creation, or a boolean saying "everyone" —
 * would let the two disagree with each other, and then a post could be both
 * team-wide and targeted at once.
 *
 * `published_at` is nullable: null is a draft, visible only to whoever may
 * manage posts. An announcement written in two sittings should not be half-told
 * to the team in between, the same reason a call-up squad (#17) stays a draft
 * until a coach publishes it.
 *
 * `author_id` survives the account that wrote it (ON DELETE SET NULL) — a
 * notice on the board does not stop being true when its author leaves the club.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("posts")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("team_id", "uuid", (col) =>
      col.notNull().references("teams.id").onDelete("cascade")
    )
    .addColumn("author_id", "uuid", (col) =>
      col.references("users.id").onDelete("set null")
    )
    .addColumn("title", "text", (col) => col.notNull())
    .addColumn("body", "text", (col) => col.notNull())
    .addColumn("published_at", "timestamptz")
    .addColumn("pinned", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute();

  // The feed reads a team's posts newest first, pinned above the rest.
  await db.schema
    .createIndex("posts_team_id_published_at_idx")
    .on("posts")
    .columns(["team_id", "published_at"])
    .execute();

  await db.schema
    .createTable("post_targets")
    .addColumn("post_id", "uuid", (col) =>
      col.notNull().references("posts.id").onDelete("cascade")
    )
    .addColumn("group_id", "uuid", (col) =>
      col.notNull().references("groups.id").onDelete("cascade")
    )
    .addPrimaryKeyConstraint("post_targets_pk", ["post_id", "group_id"])
    .execute();

  // Visibility is resolved group-first: "which posts reach these groups?"
  await db.schema
    .createIndex("post_targets_group_id_idx")
    .on("post_targets")
    .column("group_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("post_targets").execute();
  await db.schema.dropTable("posts").execute();
}
