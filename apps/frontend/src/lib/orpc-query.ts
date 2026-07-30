/** TanStack Query utilities generated from the oRPC client. */
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { orpc } from "../orpc-client";

export const orpcQuery = createTanstackQueryUtils(orpc);
