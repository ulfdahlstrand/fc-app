/**
 * Importing a SportAdmin export: the dry run (#63) and the commit (#64).
 *
 * Both go through `buildImportPlan`, so what the preview promised is by
 * construction what the commit carries out.
 */
import { getDb } from "../db/client.js";
import { applyImportPlan } from "../members/import-apply.js";
import { buildImportPlan } from "../members/import-plan.js";
import { os, requireUser } from "../orpc.js";
import { requireTeamPermission } from "../tenancy/membership.js";

export const previewMemberImportHandler = os.previewMemberImport.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "members.import");

    const plan = await buildImportPlan(db, input.teamId, input.rows);
    return {
      rows: plan.results,
      summary: plan.summary,
      newGroups: plan.newGroups,
      newCustomFields: plan.newCustomFields,
    };
  }
);

export const commitMemberImportHandler = os.commitMemberImport.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "members.import");

    // Planned and applied inside one transaction, so the roster cannot move
    // between the two and a failure half-way leaves nothing behind.
    const plan = await db.transaction().execute(async (trx) => {
      const planned = await buildImportPlan(trx, input.teamId, input.rows);
      await applyImportPlan(trx, input.teamId, planned);
      return planned;
    });

    return {
      rows: plan.results,
      summary: plan.summary,
      newGroups: plan.newGroups,
      newCustomFields: plan.newCustomFields,
    };
  }
);
