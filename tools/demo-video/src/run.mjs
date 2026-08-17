#!/usr/bin/env node
/** CLI: `npm run record <flow>`. */
import { mkdir, readdir, rm, rename } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { config, flowsDir } from "./config.mjs";
import { createDriver } from "./driver.mjs";
import { toMp4, describe } from "./encode.mjs";
import { preflight, PreflightError } from "./preflight.mjs";

const log = console.log;

async function listFlows() {
  const files = await readdir(flowsDir);
  return files.filter((f) => f.endsWith(".mjs")).map((f) => f.replace(/\.mjs$/, ""));
}

async function main() {
  const [name] = process.argv.slice(2);
  const available = await listFlows();

  if (!name || name === "--list") {
    log("Flows:");
    for (const flow of available) log(`  ${flow}`);
    log(`\nUsage: npm run record <flow>`);
    process.exit(name ? 0 : 1);
  }

  if (!available.includes(name)) {
    log(`Unknown flow "${name}". Available: ${available.join(", ") || "(none)"}`);
    process.exit(1);
  }

  const module = await import(pathToFileURL(path.join(flowsDir, `${name}.mjs`)));
  const flow = module.default;
  const meta = module.meta ?? {};
  const viewport = meta.viewport ?? { width: 1280, height: 720 };

  log(`\n${meta.title ?? name}`);
  log(`  app ${config.appUrl} · api ${config.apiUrl} · lang ${config.lang}`);
  log(`  viewport ${viewport.width}x${viewport.height}\n`);

  await preflight({ requiresEmptyDatabase: meta.requiresEmptyDatabase ?? true });

  // Playwright names the video by an internal id and only writes it on close,
  // so it goes to a scratch directory and gets renamed afterwards.
  const raw = path.join(config.outDir, ".raw");
  await rm(raw, { recursive: true, force: true });
  await mkdir(raw, { recursive: true });

  const driver = await createDriver({ viewport, outDir: raw, log });

  let failed = false;
  try {
    // Every flow needs a signed-in browser, so it happens here rather than
    // being a line each one can forget.
    await driver.signIn();
    await flow(driver);
  } catch (error) {
    failed = true;
    log(`\nFAILED: ${error.message.split("\n")[0]}`);
    await driver.describeFailure(path.join(config.outDir, `${name}-fail.png`));
  }

  const recorded = await driver.close();

  if (failed) {
    // The partial recording is more confusing than useful, and leaving it
    // invites mistaking it for a good one.
    await rm(raw, { recursive: true, force: true });
    process.exit(1);
  }

  const webm = path.join(config.outDir, `${name}.webm`);
  await rename(recorded, webm);
  await rm(raw, { recursive: true, force: true });

  const mp4 = await toMp4(webm, path.join(config.outDir, `${name}.mp4`));
  if (mp4) {
    await rm(webm, { force: true });
    log(`\n${mp4}`);
    const summary = await describe(mp4);
    if (summary) log(`  ${summary}`);
  } else {
    log(`\n${webm}`);
    log("  ffmpeg-static is not installed, so this stayed WebM.");
    log("  Run `npm install` in tools/demo-video to get an MP4 as well.");
  }
}

main().catch((error) => {
  if (error instanceof PreflightError) {
    log(`\n${error.message}\n`);
    process.exit(1);
  }
  throw error;
});
