/** Renders a post body (issue #18) from the token tree `parseRichText` produces. */
import { Fragment } from "react";
import type { Inline } from "@/lib/rich-text";
import { parseRichText } from "@/lib/rich-text";

function Inlines({ tokens }: { tokens: Inline[] }) {
  return (
    <>
      {tokens.map((token, index) => {
        if (token.type === "bold") {
          return <strong key={index}>{token.text}</strong>;
        }
        if (token.type === "link") {
          return (
            <a
              key={index}
              href={token.href}
              target="_blank"
              rel="noreferrer noopener"
              className="underline"
            >
              {token.text}
            </a>
          );
        }
        return <Fragment key={index}>{token.text}</Fragment>;
      })}
    </>
  );
}

export function RichText({ body }: { body: string }) {
  const blocks = parseRichText(body);

  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block, blockIndex) => {
        if (block.type === "list") {
          return (
            <ul key={blockIndex} className="flex flex-col gap-1 pl-5">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} className="list-disc">
                  <Inlines tokens={item} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={blockIndex}>
            {block.lines.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex > 0 && <br />}
                <Inlines tokens={line} />
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
