/**
 * Post visibility (issue #18).
 *
 * The acceptance criterion asks for this explicitly: "a guardian whose members
 * are not in the targeted group does not see the targeted post (tested)". A
 * targeted announcement leaking to the wrong family is a privacy failure, so
 * every branch of the rule is pinned down here.
 */
import { describe, expect, it } from "vitest";
import { canSeePost, type PostViewer, type VisiblePost } from "./visibility.js";

const PUBLISHED = new Date("2026-07-30T09:00:00Z");

function post(overrides: Partial<VisiblePost> = {}): VisiblePost {
  return { publishedAt: PUBLISHED, targetGroupIds: [], ...overrides };
}

function viewer(overrides: Partial<PostViewer> = {}): PostViewer {
  return { canManage: false, groupIds: new Set(), ...overrides };
}

describe("canSeePost", () => {
  it("shows a published team-wide post to anybody in the team", () => {
    expect(canSeePost(post(), viewer())).toBe(true);
  });

  it("hides a draft from everyone but a manager", () => {
    const draft = post({ publishedAt: null });
    expect(canSeePost(draft, viewer())).toBe(false);
    expect(canSeePost(draft, viewer({ canManage: true }))).toBe(true);
  });

  it("shows a targeted post to a viewer in the targeted group", () => {
    expect(
      canSeePost(
        post({ targetGroupIds: ["a-truppen"] }),
        viewer({ groupIds: new Set(["a-truppen"]) }),
      ),
    ).toBe(true);
  });

  // The acceptance criterion, stated directly.
  it("hides a targeted post from a guardian whose members are elsewhere", () => {
    expect(
      canSeePost(
        post({ targetGroupIds: ["a-truppen"] }),
        viewer({ groupIds: new Set(["b-truppen"]) }),
      ),
    ).toBe(false);
  });

  it("hides a targeted post from a viewer in no groups at all", () => {
    expect(
      canSeePost(post({ targetGroupIds: ["a-truppen"] }), viewer()),
    ).toBe(false);
  });

  it("reaches a guardian through any one of their children's groups", () => {
    // Two children, one in each squad; a post to either squad reaches them.
    const both = viewer({ groupIds: new Set(["a-truppen", "b-truppen"]) });
    expect(canSeePost(post({ targetGroupIds: ["a-truppen"] }), both)).toBe(true);
    expect(canSeePost(post({ targetGroupIds: ["b-truppen"] }), both)).toBe(true);
    expect(canSeePost(post({ targetGroupIds: ["c-truppen"] }), both)).toBe(false);
  });

  it("reaches a viewer matching any one of several targets", () => {
    expect(
      canSeePost(
        post({ targetGroupIds: ["a-truppen", "målvakter"] }),
        viewer({ groupIds: new Set(["målvakter"]) }),
      ),
    ).toBe(true);
  });

  it("shows a manager a targeted post they are not addressed by", () => {
    expect(
      canSeePost(
        post({ targetGroupIds: ["a-truppen"] }),
        viewer({ canManage: true }),
      ),
    ).toBe(true);
  });

  it("does not let group membership rescue a draft", () => {
    expect(
      canSeePost(
        post({ publishedAt: null, targetGroupIds: ["a-truppen"] }),
        viewer({ groupIds: new Set(["a-truppen"]) }),
      ),
    ).toBe(false);
  });
});
