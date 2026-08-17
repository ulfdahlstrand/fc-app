/**
 * Player development (#96): from an empty club to a renamed scale step.
 *
 * The assertions scattered through this are load-bearing. A recording that
 * looks right but filled in the wrong thing is worse than no recording, so the
 * flow checks what it claims to be showing and fails instead of rolling on.
 */
export const meta = {
  title: "Utvecklingsplan — mätvärden över tid",
  viewport: { width: 1280, height: 720 },
  requiresEmptyDatabase: true,
};

const STEP_NAMES = ["Extra lätt", "Lätt", "Medel", "Svår", "Extra svår"];

/** The step deliberately left blank, to show the all-or-nothing rule refusing. */
const BLANK_STEP = 2;

const ASSESSMENTS = [
  ["2026-03-01", "2 Lätt", "4,9"],
  ["2026-05-01", "3 Medel", "4,8"],
  ["2026-07-01", "4 Svår", "4,5"],
];

export default async function run(d) {
  const { page, dlg, say, clearCaption, click, type, fillDate, scrollTo, nav, pause, log } = d;

  /** A dialog that closed without writing anything must not pass silently. */
  async function expectMetric(name) {
    if ((await dlg().count()) !== 0) {
      throw new Error(`the dialog was still open after saving ${name}`);
    }
    await page.getByText(name, { exact: true }).first().waitFor({ timeout: 5000 });
    log("  saved metric:", name);
  }

  const metricNameField = () => dlg().getByLabel("Namn", { exact: true });
  const stepBoxes = () => dlg().locator('input[placeholder="Namn på steget"]');
  const save = () => dlg().getByRole("button", { name: "Spara" });

  await d.goto("/");
  await say("FC App — följ en spelares utveckling över tid", 3000);

  // ---------------------------------------------------------- onboarding
  if (page.url().includes("/onboarding")) {
    await say("Ett lag bestämmer själv vad det följer", 2600);
    const inputs = page.locator("form input");
    await type(inputs.nth(0), "Testklubben");
    if ((await inputs.count()) > 1) await type(inputs.nth(1), "P14");
    await click(page.getByRole("button", { name: /skapa|create/i }).first(), 2500);
  }
  await clearCaption();

  // ------------------------------------------------------- the metrics
  await say("Först: bestäm vad laget mäter", 2600);
  await click(nav("Laginställningar"), 1600);
  await clearCaption();
  await scrollTo(page.getByRole("heading", { name: "UTVECKLINGSMÅTT" }));

  await click(page.getByRole("button", { name: "Nytt mått" }), 900);
  await say("En skala 1–5 där stegen har namn", 2600);
  await type(metricNameField(), "Svårighet");

  log("  step-name boxes:", await stepBoxes().count());
  await clearCaption();
  for (const [index, name] of STEP_NAMES.entries()) {
    if (index === BLANK_STEP) continue;
    await type(stepBoxes().nth(index), name);
  }

  await say("Alla steg måste ha namn — eller inga alls", 2400);
  await click(save(), 1400);
  if ((await dlg().count()) !== 1) {
    throw new Error("a half-named scale was accepted; it should have been refused");
  }
  log(
    "  half-named refused:",
    (await dlg().locator('[role="alert"]').innerText().catch(() => "")).trim(),
  );
  await pause(1800);
  await clearCaption();

  await type(stepBoxes().nth(BLANK_STEP), STEP_NAMES[BLANK_STEP]);
  await click(save(), 1800);
  await expectMetric("Svårighet");

  await say("Ett tal med enhet — där lägre är bättre", 2600);
  await click(page.getByRole("button", { name: "Nytt mått" }), 900);
  await type(metricNameField(), "30 m sprint");
  await click(dlg().getByRole("combobox"), 600);
  await click(page.getByRole("option", { name: "Tal med enhet" }), 700);
  await type(dlg().getByLabel("Enhet"), "s");
  await clearCaption();
  await say("En sprinttid blir bättre när den sjunker", 2400);
  await click(dlg().getByRole("switch"), 800);
  await click(save(), 1800);
  await expectMetric("30 m sprint");
  await clearCaption();

  await scrollTo(page.getByRole("heading", { name: "UTVECKLINGSMÅTT" }));
  await pause(1600);

  // -------------------------------------------------------- the player
  await say("En spelare att följa", 2400);
  await click(nav("Medlemmar"), 1600);
  await clearCaption();

  if ((await page.getByText("Ture").count()) === 0) {
    await click(
      page.getByRole("button", { name: /lägg till medlem|ny medlem/i }).first(),
      900,
    );
    await type(dlg().getByLabel("Förnamn"), "Ture");
    await type(dlg().getByLabel("Efternamn"), "Testsson");
    await click(save(), 2000);
  }
  await click(page.getByText("Ture").first(), 2000);

  // --------------------------------------------------- the assessments
  await say("En bedömning är ett tillfälle: ett datum, alla mått", 3000);
  await clearCaption();

  for (const [index, [date, step, sprint]] of ASSESSMENTS.entries()) {
    if (index === 1) await say("Samma sak igen några månader senare", 2200);
    await click(page.getByRole("button", { name: "Ny bedömning" }), 900);
    await fillDate(page.locator("#assessed-on"), date);

    if (index === 0) {
      const options = await dlg().getByRole("group").locator("button").allInnerTexts();
      log("  step picker:", JSON.stringify(options));
      if (options.length !== STEP_NAMES.length) {
        throw new Error("the step picker did not render one option per step");
      }
      await say("Stegen har namn, inte bara siffror", 2400);
    }

    await click(dlg().getByRole("button", { name: step, exact: true }), 700);
    await clearCaption();
    // A decimal comma on purpose: it is what a Swedish keyboard types.
    await type(dlg().locator('input[inputmode="decimal"]'), sprint);
    await click(save(), 2000);
  }

  // ------------------------------------------------------- the history
  await scrollTo(page.getByRole("heading", { name: "UTVECKLING" }));
  await say("Historiken bygger sig själv", 2800);
  await clearCaption();
  await pause(1200);

  const charts = page.locator("svg[role='img']");
  if ((await charts.count()) !== 2) {
    throw new Error(`expected a sparkline per numeric metric, got ${await charts.count()}`);
  }
  for (const chart of await charts.all()) {
    log("  sparkline:", await chart.getAttribute("aria-label"));
  }

  await say("Sprinttiden sjunker — därför är chipet grönt", 3400);
  await clearCaption();
  await pause(800);
  await scrollTo(page.getByText("BEDÖMNINGSTILLFÄLLEN"), 140);
  await say("Varje tillfälle står kvar, med datum och vem som satte det", 3000);
  await clearCaption();
  await pause(900);

  // ------------------------------------------------- rename, and prove
  await say("Namnen går att ändra i efterhand", 2600);
  await click(nav("Laginställningar"), 1600);
  await clearCaption();
  await scrollTo(page.getByRole("heading", { name: "UTVECKLINGSMÅTT" }));

  // Each metric is one `bg-card` row; filtering by name lands on that row
  // rather than on an ancestor that merely contains the word.
  const row = page.locator("div.bg-card").filter({ hasText: "Svårighet" }).first();
  await click(row.getByRole("button", { name: "Redigera" }), 1200);
  log(
    "  edit dialog prefilled:",
    JSON.stringify(await stepBoxes().evaluateAll((n) => n.map((e) => e.value))),
  );
  await type(stepBoxes().nth(BLANK_STEP), "Mellan", { clear: true });
  await click(save(), 2000);

  await say("…utan att något registrerat flyttar sig", 2800);
  await click(nav("Medlemmar"), 1600);
  await click(page.getByText("Ture").first(), 2000);
  await scrollTo(page.getByRole("heading", { name: "UTVECKLING" }));
  await pause(1200);
  await clearCaption();
  await scrollTo(page.getByText("BEDÖMNINGSTILLFÄLLEN"), 140);

  // The point of the whole last act: renaming step 3 changed what a 3 is
  // called and nothing else. A 4 recorded in July is still "Svår (4)".
  if ((await page.getByText("Svår (4)").count()) === 0) {
    throw new Error("a recorded value moved when its step was renamed");
  }
  const rows = await page
    .locator("text=/^(Extra lätt|Lätt|Medel|Mellan|Svår|Extra svår) \\(\\d\\)$/")
    .allInnerTexts();
  log("  occasion rows:", JSON.stringify(rows));

  await pause(2600);
}
