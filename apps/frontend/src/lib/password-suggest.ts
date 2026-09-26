/**
 * Suggesting a password an admin can read out loud.
 *
 * A password chosen for someone else is typed once by whoever sets it, read
 * over the phone or in a chat, and typed again by its owner — so the
 * generator optimises for being transcribed without a mistake, not for looking
 * impressive. Hence groups of four from an alphabet with no character that
 * looks like another (`l`/`1`, `O`/`0`, `i`), and no mixed case: an admin
 * dictating "capital B" is how a wrong password gets set.
 *
 * Strength comes from length instead. Twelve characters from a 31-character
 * alphabet is a little over 59 bits — far beyond anything guessable against a
 * scrypt hash, and well past the ten-character floor (ADR-024).
 */

/** No `i`, `l`, `o`, `0` or `1`: the pairs that get misread. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const GROUPS = 3;
const GROUP_SIZE = 4;

/**
 * Random indices into `ALPHABET`, drawn without modulo bias: a byte that falls
 * in the incomplete last block of 256 is thrown away rather than folded back,
 * which would make the first few characters of the alphabet likelier.
 */
function randomIndices(count: number, random: RandomBytes): number[] {
  const limit = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
  const out: number[] = [];

  while (out.length < count) {
    // A batch, so a few rejections do not mean a call to the OS each time.
    const bytes = random(count);
    for (const byte of bytes) {
      if (byte >= limit) continue;
      out.push(byte % ALPHABET.length);
      if (out.length === count) break;
    }
  }

  return out;
}

export type RandomBytes = (count: number) => Uint8Array;

/** The browser's CSPRNG. `Math.random` is never acceptable here. */
const cryptoRandom: RandomBytes = (count) =>
  crypto.getRandomValues(new Uint8Array(count));

/**
 * A suggestion of the shape `k7fp-2mqx-9vth`. `random` exists for the tests;
 * production always uses the browser's CSPRNG.
 */
export function suggestPassword(random: RandomBytes = cryptoRandom): string {
  const indices = randomIndices(GROUPS * GROUP_SIZE, random);
  const chars = indices.map((index) => ALPHABET[index]).join("");
  const groups: string[] = [];
  for (let at = 0; at < chars.length; at += GROUP_SIZE) {
    groups.push(chars.slice(at, at + GROUP_SIZE));
  }
  return groups.join("-");
}
