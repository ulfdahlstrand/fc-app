/** The post body's markdown subset (issue #18). */
import { describe, expect, it } from "vitest";
import { parseInline, parseRichText, plainSummary } from "./rich-text";

describe("parseInline", () => {
  it("leaves plain text alone", () => {
    expect(parseInline("Träningen är flyttad")).toEqual([
      { type: "text", text: "Träningen är flyttad" },
    ]);
  });

  it("reads bold and keeps the text around it", () => {
    expect(parseInline("Ta med **vattenflaska** imorgon")).toEqual([
      { type: "text", text: "Ta med " },
      { type: "bold", text: "vattenflaska" },
      { type: "text", text: " imorgon" },
    ]);
  });

  it("reads a titled link", () => {
    expect(parseInline("[Anmäl er här](https://vallby.se/cup)")).toEqual([
      { type: "link", text: "Anmäl er här", href: "https://vallby.se/cup" },
    ]);
  });

  it("links a bare URL", () => {
    const tokens = parseInline("Se https://vallby.se/cup för info");
    expect(tokens[1]).toEqual({
      type: "link",
      text: "https://vallby.se/cup",
      href: "https://vallby.se/cup",
    });
  });

  it("does not swallow a trailing bracket after a bare URL", () => {
    const tokens = parseInline("(se https://vallby.se)");
    expect(tokens.at(-1)).toEqual({ type: "text", text: ")" });
  });

  it("refuses a javascript: link and keeps the source visible", () => {
    const source = "[klicka](javascript:alert(1))";
    const tokens = parseInline(source);
    expect(tokens.some((token) => token.type === "link")).toBe(false);
    expect(tokens.map((token) => token.text).join("")).toBe(source);
  });

  it("refuses every scheme but http and https", () => {
    for (const href of [
      "javascript:alert(1)",
      "data:text/html,hello",
      "file:///etc/passwd",
      "vbscript:msgbox",
      "JavaScript:alert(1)",
    ]) {
      const source = `[x](${href})`;
      const tokens = parseInline(source);
      expect(tokens.some((token) => token.type === "link")).toBe(false);
      expect(tokens.map((token) => token.text).join("")).toBe(source);
    }
  });

  // http and https pass, and the href comes back canonicalised by `URL` — the
  // displayed text stays as written, the target is normalised.
  it("still allows http and https", () => {
    const cases: [string, string][] = [
      ["http://vallby.se", "http://vallby.se/"],
      ["https://vallby.se/cup?a=1", "https://vallby.se/cup?a=1"],
    ];
    for (const [written, href] of cases) {
      expect(parseInline(`[x](${written})`)).toEqual([
        { type: "link", text: "x", href },
      ]);
    }
  });

  it("treats markup in the body as text, never as elements", () => {
    expect(parseInline("<script>alert(1)</script>")).toEqual([
      { type: "text", text: "<script>alert(1)</script>" },
    ]);
  });

  it("leaves an unclosed bold marker literal", () => {
    expect(parseInline("2 ** 3 = 8")).toEqual([
      { type: "text", text: "2 ** 3 = 8" },
    ]);
  });
});

describe("parseRichText", () => {
  it("splits paragraphs on a blank line and keeps single newlines as breaks", () => {
    const blocks = parseRichText("Rad ett\nRad två\n\nNytt stycke");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: "paragraph" });
    if (blocks[0]?.type === "paragraph") {
      expect(blocks[0].lines).toHaveLength(2);
    }
    expect(blocks[1]).toMatchObject({ type: "paragraph" });
  });

  it("gathers consecutive bullets into one list", () => {
    const blocks = parseRichText("- Skor\n- Vattenflaska\n- Benskydd");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.type).toBe("list");
    if (blocks[0]?.type === "list") expect(blocks[0].items).toHaveLength(3);
  });

  it("keeps a paragraph, its list, and the paragraph after it in order", () => {
    const blocks = parseRichText("Ta med:\n- Skor\n- Skydd\nSes imorgon");
    expect(blocks.map((block) => block.type)).toEqual([
      "paragraph",
      "list",
      "paragraph",
    ]);
  });

  it("formats inside a bullet", () => {
    const blocks = parseRichText("- Ta med **skor**");
    if (blocks[0]?.type === "list") {
      expect(blocks[0].items[0]).toEqual([
        { type: "text", text: "Ta med " },
        { type: "bold", text: "skor" },
      ]);
    }
  });

  it("returns nothing for an empty or blank body", () => {
    expect(parseRichText("")).toEqual([]);
    expect(parseRichText("\n\n   \n")).toEqual([]);
  });

  it("treats Windows line endings the same as Unix", () => {
    expect(parseRichText("A\r\n\r\nB")).toEqual(parseRichText("A\n\nB"));
  });
});

describe("plainSummary", () => {
  it("strips formatting and collapses whitespace", () => {
    expect(plainSummary("Ta med **skor**\n- och skydd")).toBe(
      "Ta med skor och skydd",
    );
  });

  it("shows a link's text rather than its target", () => {
    expect(plainSummary("[Anmäl er](https://vallby.se/cup)")).toBe("Anmäl er");
  });

  it("truncates with an ellipsis and never past the limit", () => {
    const summary = plainSummary("abcdefghij ".repeat(30), 20);
    expect(summary.endsWith("…")).toBe(true);
    expect(summary.length).toBeLessThanOrEqual(20);
  });
});
