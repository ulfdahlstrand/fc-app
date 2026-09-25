/**
 * Password hashing (ADR-024). The one place a password is ever touched.
 *
 * scrypt from `node:crypto`: memory-hard, no native dependency to build on the
 * host. Parameters are OWASP's `N=2^15, r=8, p=3` row — 32 MiB per hash, which
 * a small instance can afford a few of at once, where the `2^17` row's 128 MiB
 * could not. Each hash has its own random salt, and the parameters are stored
 * alongside it, so raising them later needs no migration: old hashes still
 * verify, and `needsRehash` says when to replace one at the next sign-in.
 *
 * Stored form: `scrypt$N$r$p$<salt b64url>$<hash b64url>`.
 */
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

interface ScryptParams {
  N: number;
  r: number;
  p: number;
}

const CURRENT: ScryptParams = { N: 2 ** 15, r: 8, p: 3 };
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/** Refuses stored parameters that would let a bad row eat the process. */
const MAX_N = 2 ** 20;

function derive(
  password: string,
  salt: Buffer,
  params: ScryptParams
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize("NFKC"),
      salt,
      KEY_LENGTH,
      // 128 * N * r bytes is what scrypt needs; the default cap is 32 MiB,
      // exactly what these parameters use, so give it headroom.
      { ...params, maxmem: 256 * params.N * params.r },
      (error, key) => (error ? reject(error) : resolve(key))
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, CURRENT);
  const { N, r, p } = CURRENT;
  return [
    "scrypt",
    N,
    r,
    p,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

interface ParsedHash extends ScryptParams {
  salt: Buffer;
  key: Buffer;
}

function parse(stored: string): ParsedHash | null {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;
  const [N, r, p] = parts.slice(1, 4).map(Number) as [number, number, number];
  if (![N, r, p].every((n) => Number.isInteger(n) && n > 0)) return null;
  if (N > MAX_N || (N & (N - 1)) !== 0) return null;
  const salt = Buffer.from(parts[4] ?? "", "base64url");
  const key = Buffer.from(parts[5] ?? "", "base64url");
  if (salt.length === 0 || key.length === 0) return null;
  return { N, r, p, salt, key };
}

/**
 * Whether `password` matches `stored`. The comparison is constant-time, and a
 * malformed stored value is a mismatch, never an exception.
 */
export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const parsed = parse(stored);
  if (!parsed) return false;
  const key = await derive(password, parsed.salt, parsed);
  return key.length === parsed.key.length && timingSafeEqual(key, parsed.key);
}

/** True when `stored` was made with weaker parameters than today's. */
export function needsRehash(stored: string): boolean {
  const parsed = parse(stored);
  if (!parsed) return true;
  return (
    parsed.N < CURRENT.N || parsed.r < CURRENT.r || parsed.p < CURRENT.p
  );
}

let dummy: Promise<string> | undefined;

/**
 * Spends the same time as a real verification, for an email with no password
 * behind it — so response time does not tell an attacker which addresses have
 * accounts.
 */
export async function burnVerification(password: string): Promise<void> {
  dummy ??= hashPassword(randomBytes(16).toString("hex"));
  await verifyPassword(password, await dummy);
}
