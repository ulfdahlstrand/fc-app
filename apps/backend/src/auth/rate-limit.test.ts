/** The brake on password guessing and inbox flooding. */
import { describe, expect, it } from "vitest";
import { RateLimiter } from "./rate-limit.js";

function limiter(limit: number, windowMs = 60_000) {
  let now = 1_000_000;
  const clock = {
    advance: (ms: number) => {
      now += ms;
    },
  };
  return { limiter: new RateLimiter({ limit, windowMs }, () => now), clock };
}

describe("RateLimiter", () => {
  it("allows up to the limit, then refuses", () => {
    const { limiter: rl } = limiter(3);
    expect(rl.hit("a").allowed).toBe(true);
    expect(rl.hit("a").allowed).toBe(true);
    expect(rl.hit("a").allowed).toBe(true);
    expect(rl.hit("a")).toEqual({ allowed: false, retryAfterSeconds: 60 });
  });

  it("counts keys separately", () => {
    const { limiter: rl } = limiter(1);
    expect(rl.hit("a").allowed).toBe(true);
    expect(rl.hit("b").allowed).toBe(true);
    expect(rl.hit("a").allowed).toBe(false);
  });

  it("opens again once the window has passed", () => {
    const { limiter: rl, clock } = limiter(1);
    rl.hit("a");
    clock.advance(30_000);
    expect(rl.hit("a")).toEqual({ allowed: false, retryAfterSeconds: 30 });
    clock.advance(30_000);
    expect(rl.hit("a").allowed).toBe(true);
  });

  it("keeps refusing while hammered — refused attempts still count", () => {
    const { limiter: rl, clock } = limiter(1);
    rl.hit("a");
    for (let i = 0; i < 50; i++) rl.hit("a");
    clock.advance(59_000);
    expect(rl.hit("a").allowed).toBe(false);
  });

  it("forgets a key on reset", () => {
    const { limiter: rl } = limiter(1);
    rl.hit("a");
    rl.reset("a");
    expect(rl.hit("a").allowed).toBe(true);
  });
});
