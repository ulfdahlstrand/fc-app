/**
 * Groups moved into the members page's menu; this keeps old links and
 * bookmarks landing on them.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/groups")({
  beforeLoad: () => {
    throw redirect({ to: "/members", search: { view: "groups" }, replace: true });
  },
});
