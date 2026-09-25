/** The wording of the sign-in emails. Swedish, like the club's own language. */
import type { Mail } from "./mailer.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function build(
  to: string,
  subject: string,
  paragraphs: string[],
  link?: { url: string; label: string }
): Mail {
  const text = [...paragraphs, ...(link ? [link.url] : [])].join("\n\n");
  const html = [
    ...paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`),
    ...(link
      ? [
          `<p><a href="${escapeHtml(link.url)}">${escapeHtml(link.label)}</a></p>`,
        ]
      : []),
  ].join("\n");
  return { to, subject, text, html };
}

const IGNORE =
  "Om det inte var du kan du ignorera det här mejlet — ingenting händer då.";

export function signupMail(to: string, name: string, url: string): Mail {
  return build(
    to,
    "Bekräfta din e-postadress",
    [
      `Hej ${name}!`,
      "Någon har skapat ett konto med den här e-postadressen. Bekräfta att det var du genom att öppna länken nedan. Länken gäller i 60 minuter och kan bara användas en gång.",
      IGNORE,
    ],
    { url, label: "Bekräfta e-postadressen" }
  );
}

export function alreadyRegisteredMail(to: string, loginUrl: string): Mail {
  return build(
    to,
    "Du har redan ett konto",
    [
      "Någon försökte skapa ett konto med den här e-postadressen, men det finns redan ett. Logga in som vanligt, eller välj ”Glömt lösenord” om du inte minns det.",
      IGNORE,
    ],
    { url: loginUrl, label: "Logga in" }
  );
}

export function resetMail(to: string, url: string): Mail {
  return build(
    to,
    "Återställ ditt lösenord",
    [
      "Någon har bett om att få återställa lösenordet för kontot med den här e-postadressen. Öppna länken nedan för att välja ett nytt. Länken gäller i 30 minuter och kan bara användas en gång.",
      "När lösenordet är bytt loggas alla andra enheter ut.",
      IGNORE,
    ],
    { url, label: "Välj nytt lösenord" }
  );
}
