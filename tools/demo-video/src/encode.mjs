/** WebM (what Playwright records) → MP4 (what everything else plays). */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";

const run = promisify(execFile);
const require = createRequire(import.meta.url);

function ffmpegPath() {
  try {
    return require("ffmpeg-static");
  } catch {
    return null;
  }
}

/**
 * Returns the mp4 path, or null when ffmpeg is unavailable — in which case the
 * WebM is still there and the caller says so, rather than reporting a failure.
 *
 * `-pix_fmt yuv420p` is not optional: without it QuickTime and Safari refuse to
 * play the file at all. `+faststart` moves the index to the front so it can be
 * streamed instead of fully downloaded first. There is no audio to keep.
 */
export async function toMp4(webmPath, mp4Path) {
  const ffmpeg = ffmpegPath();
  if (!ffmpeg) return null;

  await run(ffmpeg, [
    "-y",
    "-i", webmPath,
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-crf", "23",
    "-preset", "medium",
    "-movflags", "+faststart",
    "-an",
    mp4Path,
  ]);
  return mp4Path;
}

/** A one-line summary of a rendered file, read back from the file itself. */
export async function describe(file) {
  const ffmpeg = ffmpegPath();
  if (!ffmpeg) return null;

  // ffmpeg reports stream details on stderr and exits non-zero with no output
  // file, which is expected here — we only want what it printed.
  const { stderr } = await run(ffmpeg, ["-hide_banner", "-i", file]).catch(
    (error) => error,
  );
  const duration = /Duration: (\S+?),/.exec(stderr ?? "")?.[1];
  const video = /Video: ([^,]+).*?(\d{3,}x\d{3,})/.exec(stderr ?? "");
  if (!duration || !video) return null;
  return `${duration} · ${video[2]} · ${video[1].trim()}`;
}
