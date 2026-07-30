/**
 * The small markdown subset a post body understands (issue #18).
 *
 * Parsed to a token tree here and rendered as React elements by `RichText`.
 * Deliberately **not** an HTML pipeline: nothing this produces is ever handed to
 * `dangerouslySetInnerHTML`, so a body containing `<script>` is text, exactly as
 * typed, and there is no sanitiser to get wrong. It also needs no dependency.
 *
 * What it supports is what a club announcement actually uses:
 *
 *   Blank line          — new paragraph
 *   Single newline      — line break inside a paragraph
 *   `- item`            — bullet list
 *   `**bold**`          — bold
 *   `[text](url)`       — link
 *   bare https://…      — link
 *
 * Anything else stays literal. A body that renders `**` as two asterisks is a
 * small disappointment; a half-parsed one that swallows a coach's text is worse.
 */

export type Inline =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "link"; text: string; href: string };

export type Block =
  | { type: "paragraph"; lines: Inline[][] }
  | { type: "list"; items: Inline[][] };

/**
 * Only http and https survive. `javascript:` in a link is the one way a body
 * could otherwise become executable, and a scheme allowlist is the check that
 * cannot be talked around — not a blocklist of the schemes we thought of.
 */
function safeHref(raw: string): string | null {
  const trimmed = raw.trim();
  // Reject anything with whitespace or control characters rather than trying to
  // clean it: a URL that needed cleaning is not one we should be linking.
  if (trimmed === "" || /[\s<>"]/.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/** `**bold**`, `[text](url)`, and bare URLs, in one left-to-right pass. */
const INLINE = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<>"）)]+)/g;

export function parseInline(line: string): Inline[] {
  const tokens: Inline[] = [];
  let lastIndex = 0;

  for (const match of line.matchAll(INLINE)) {
    const start = match.index;
    if (start > lastIndex) {
      tokens.push({ type: "text", text: line.slice(lastIndex, start) });
    }

    const [whole, bold, linkText, linkHref, bareUrl] = match;

    if (bold !== undefined) {
      tokens.push({ type: "bold", text: bold });
    } else if (linkText !== undefined && linkHref !== undefined) {
      const href = safeHref(linkHref);
      // A refused scheme falls back to the literal source, so the reader sees
      // what was written rather than a link silently losing its target.
      tokens.push(
        href === null
          ? { type: "text", text: whole }
          : { type: "link", text: linkText, href },
      );
    } else if (bareUrl !== undefined) {
      const href = safeHref(bareUrl);
      tokens.push(
        href === null
          ? { type: "text", text: bareUrl }
          : { type: "link", text: bareUrl, href },
      );
    }

    lastIndex = start + whole.length;
  }

  if (lastIndex < line.length) {
    tokens.push({ type: "text", text: line.slice(lastIndex) });
  }
  return tokens;
}

const BULLET = /^\s*-\s+(.*)$/;

export function parseRichText(body: string): Block[] {
  const blocks: Block[] = [];
  // Normalise line endings so a body pasted from Windows behaves the same.
  const lines = body.replace(/\r\n?/g, "\n").split("\n");

  let paragraph: Inline[][] = [];
  let list: Inline[][] = [];

  const flush = () => {
    if (list.length > 0) {
      blocks.push({ type: "list", items: list });
      list = [];
    }
    if (paragraph.length > 0) {
      blocks.push({ type: "paragraph", lines: paragraph });
      paragraph = [];
    }
  };

  for (const line of lines) {
    if (line.trim() === "") {
      flush();
      continue;
    }

    const bullet = BULLET.exec(line);
    if (bullet) {
      // A bullet ends any paragraph it interrupts, but consecutive bullets
      // gather into one list.
      if (paragraph.length > 0) {
        blocks.push({ type: "paragraph", lines: paragraph });
        paragraph = [];
      }
      list.push(parseInline(bullet[1] ?? ""));
      continue;
    }

    if (list.length > 0) {
      blocks.push({ type: "list", items: list });
      list = [];
    }
    paragraph.push(parseInline(line));
  }

  flush();
  return blocks;
}

/** The first line or so, for a feed preview. Formatting is dropped, not shown. */
export function plainSummary(body: string, limit = 160): string {
  const flat = body
    .replace(/\r\n?/g, "\n")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "$1")
    .replace(/^\s*-\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1).trimEnd()}…`;
}
