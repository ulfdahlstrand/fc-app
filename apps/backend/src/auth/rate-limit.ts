/**
 * Attempt counting for the password routes (ADR-024).
 *
 * In memory, because the API runs as one instance (ADR-020); a second instance
 * would need this moved to the database or a shared store. Counts are keyed by
 * whatever the caller chooses — the email address for sign-in, so guessing one
 * account's password is slow no matter how many addresses the guesses come
 * from, and the client IP as a second, coarser brake.
 */

export interface RateLimitRule {
  /** How many attempts a key may make per window. */
  limit: number;
  windowMs: number;
}

export type RateLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

interface Window {
  startedAt: number;
  count: number;
}

export class RateLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly rule: RateLimitRule,
    private readonly now: () => number = Date.now
  ) {}

  /** Records one attempt for `key` and says whether it may go ahead. */
  hit(key: string): RateLimitDecision {
    const now = this.now();
    this.sweep(now);

    const current = this.windows.get(key);
    const window =
      current && now - current.startedAt < this.rule.windowMs
        ? current
        : { startedAt: now, count: 0 };

    window.count += 1;
    this.windows.set(key, window);

    if (window.count <= this.rule.limit) return { allowed: true };
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((window.startedAt + this.rule.windowMs - now) / 1000)
      ),
    };
  }

  /** Forgets `key` — after a successful sign-in, its failures stop counting. */
  reset(key: string): void {
    this.windows.delete(key);
  }

  /** Drops expired windows so the map cannot grow without bound. */
  private sweep(now: number): void {
    if (this.windows.size < 10_000) return;
    for (const [key, window] of this.windows) {
      if (now - window.startedAt >= this.rule.windowMs) this.windows.delete(key);
    }
  }
}
