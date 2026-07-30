/** Seasons: a named date range, with no foreign key from activities (ADR-008). */

import { z } from "zod";
import { localDateSchema } from "./activities.js";

export const seasonSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  name: z.string(),
  startsOn: localDateSchema,
  endsOn: localDateSchema,
});

export type Season = z.infer<typeof seasonSchema>;

export const seasonWriteFields = {
  name: z.string().min(1).max(100),
  startsOn: localDateSchema,
  endsOn: localDateSchema,
};

export const listSeasonsInputSchema = z.object({
  teamId: z.string(),
});

export const listSeasonsOutputSchema = z.object({
  seasons: z.array(seasonSchema),
});

export const createSeasonInputSchema = z
  .object({
    teamId: z.string(),
    name: seasonWriteFields.name,
    startsOn: seasonWriteFields.startsOn,
    endsOn: seasonWriteFields.endsOn,
  })
  .refine((value) => value.endsOn >= value.startsOn, {
    path: ["endsOn"],
    error: "The last date must not precede the first",
  });

export const createSeasonOutputSchema = z.object({
  season: seasonSchema,
});

/** Every field optional, so the handler validates the merged range. */
export const updateSeasonInputSchema = z.object({
  teamId: z.string(),
  seasonId: z.string(),
  name: seasonWriteFields.name.optional(),
  startsOn: seasonWriteFields.startsOn.optional(),
  endsOn: seasonWriteFields.endsOn.optional(),
});

export const updateSeasonOutputSchema = z.object({
  season: seasonSchema,
});

export const deleteSeasonInputSchema = z.object({
  teamId: z.string(),
  seasonId: z.string(),
});

export const deleteSeasonOutputSchema = z.object({
  deleted: z.literal(true),
});

