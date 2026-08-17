/**
 * The recording driver: a browser with video on, an overlay, and a handful of
 * helpers that pace a flow like a person rather than a script.
 *
 * Each helper carries a lesson from a recording that came out wrong. The
 * comments say which — they are the reason these are not one-liners.
 */
import { chromium } from "playwright";
import { config } from "./config.mjs";
import { installOverlay } from "./overlay.mjs";

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function createDriver({ viewport, outDir, log = console.log }) {
  const browser = await chromium.launch(
    config.chromium ? { executablePath: config.chromium } : {},
  );
  const context = await browser.newContext({
    viewport,
    // Matching the video size to the viewport keeps the frame unscaled and
    // unletterboxed.
    recordVideo: { dir: outDir, size: viewport },
  });
  await context.addInitScript(installOverlay);

  const page = await context.newPage();
  page.on("pageerror", (error) => log("PAGE ERROR:", error.message));

  const dlg = () => page.getByRole("dialog");

  /** Shows a caption and holds it long enough to be read. */
  async function say(text, hold = 2600) {
    await page.evaluate((t) => window.__caption?.(t), text).catch(() => {});
    await pause(hold);
  }

  async function clearCaption() {
    await page.evaluate(() => window.__caption?.("")).catch(() => {});
    await pause(400);
  }

  /**
   * Glides the pointer to an element and presses it.
   *
   * The viewport check is not cosmetic. `page.mouse.move` clamps to the
   * viewport, so a target below the fold gets clicked *somewhere else* — and
   * over a modal that lands outside the dialog, which dismisses it instead of
   * pressing the button. That failure is silent and produces a recording of
   * something that never happened, so it throws here instead.
   */
  async function click(locator, settle = 700) {
    await locator.scrollIntoViewIfNeeded();
    await pause(250);
    const box = await locator.boundingBox();
    if (!box) throw new Error("click target has no bounding box");

    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const size = page.viewportSize();
    if (x < 0 || y < 0 || x > size.width || y > size.height) {
      throw new Error(
        `click target outside the viewport at ${Math.round(x)},${Math.round(y)} ` +
          `(viewport ${size.width}x${size.height}) — it would have clicked elsewhere`,
      );
    }

    await page.mouse.move(x, y, { steps: 24 });
    await pause(280);
    await page.mouse.down();
    await pause(90);
    await page.mouse.up();
    await pause(settle);
  }

  /** Clicks into a field and types it out at a speed you can watch. */
  async function type(locator, text, { clear = false } = {}) {
    await click(locator, 200);
    if (clear) await locator.fill("");
    await locator.pressSequentially(text, { delay: 55 });
    await pause(450);
  }

  /** A date input is fiddly to type into; set it and let the form settle. */
  async function fillDate(locator, value) {
    await click(locator, 200);
    await locator.fill(value);
    await pause(700);
  }

  /**
   * Scrolls an element up to near the top of the viewport, in wheel increments
   * so it reads as scrolling rather than jumping.
   *
   * `scrollIntoViewIfNeeded` is no use for this: it does nothing once the
   * element is technically visible at the bottom edge, which leaves everything
   * below it — usually the thing the flow is about to talk about — off camera.
   */
  async function scrollTo(locator, offset = 100) {
    await page.mouse.move(
      Math.round(viewport.width / 2),
      Math.round(viewport.height / 2),
      { steps: 6 },
    );
    const box = await locator.boundingBox();
    if (!box) return;

    const distance = box.y - offset;
    const steps = 14;
    for (let i = 0; i < steps; i += 1) {
      await page.mouse.wheel(0, distance / steps);
      await pause(45);
    }
    await pause(600);
  }

  /**
   * The app's nav pills. Clicking them keeps this an SPA transition, which is
   * both what real use looks like and one less full reload for the overlay.
   */
  const nav = (name) => page.getByRole("link", { name, exact: true });

  /**
   * Signs the *browser* in through the dev bypass.
   *
   * Preflight already signed in over `fetch`, but that cookie lives in the Node
   * process; the browser context has its own jar and would land on /login. The
   * endpoint redirects to the frontend, so this doubles as the opening
   * navigation.
   */
  async function signIn() {
    await page.goto(`${config.apiUrl}/auth/dev-login`, {
      waitUntil: "networkidle",
    });
    await pause(800);
  }

  /** Opens an app route directly. Prefer `nav` where a pill exists. */
  async function goto(pathname) {
    const url = new URL(pathname, config.appUrl);
    url.searchParams.set("lng", config.lang);
    await page.goto(url.toString(), { waitUntil: "networkidle" });
    await pause(1200);
  }

  return {
    page,
    dlg,
    say,
    clearCaption,
    click,
    type,
    fillDate,
    scrollTo,
    nav,
    goto,
    signIn,
    pause,
    log,
    config,
    async close() {
      const video = page.video();
      const videoPath = video ? await video.path() : null;
      // The file is only flushed when the context closes.
      await context.close();
      await browser.close();
      return videoPath;
    },
    /** Best-effort context for a failure, then let the caller exit non-zero. */
    async describeFailure(file) {
      try {
        log("  url:", page.url());
        log("  dialogs open:", await dlg().count());
        log(
          "  headings:",
          JSON.stringify(await page.locator("h1,h2,h3").allInnerTexts()),
        );
        await page.screenshot({ path: file, fullPage: true });
        log("  wrote", file);
      } catch (error) {
        log("  (could not describe the failure:", error.message + ")");
      }
    },
  };
}
