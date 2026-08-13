// Local image preprocessing, ported from the upstream image-vision skill
// (scripts/vision_query.py). Uses macOS `sips` for format conversion, resizing
// and recompression; falls back to sending the original bytes when sips is
// unavailable or fails. Everything that is not a local file path (http(s) URL
// or data URL) is passed through untouched by the caller.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileP = promisify(execFile);

const MAGIC = [
  [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, "image/png"],
  [0xff, 0xd8, 0xff, "image/jpeg"],
  [0x47, 0x49, 0x46, 0x38, 0x37, 0x61, "image/gif"],
  [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, "image/gif"],
  [0x42, 0x4d, "image/bmp"],
  [0x49, 0x49, 0x2a, 0x00, "image/tiff"],
  [0x4d, 0x4d, 0x00, 0x2a, "image/tiff"],
];

/** Detect image MIME type from magic bytes; throws for unsupported formats. */
export function detectMime(path) {
  const head = readFileSync(path).subarray(0, 16);
  if (head.subarray(0, 4).toString("latin1") === "RIFF" && head.subarray(8, 12).toString("latin1") === "WEBP") {
    return "image/webp";
  }
  if (head.subarray(4, 8).toString("latin1") === "ftyp") {
    const brand = head.subarray(8, 12).toString("latin1");
    if (["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand)) return "image/heic";
    if (["avif", "avis"].includes(brand)) return "image/avif";
  }
  for (const sig of MAGIC) {
    const bytes = sig.slice(0, -1);
    const mime = sig.at(-1);
    if (bytes.every((b, i) => head[i] === b)) return mime;
  }
  throw new Error(
    `unsupported image format: ${path} (supported: PNG/JPEG/GIF/WebP/BMP/TIFF/HEIC/HEIF/AVIF)`,
  );
}

function pngHasAlpha(path) {
  const head = readFileSync(path).subarray(0, 26);
  if (head.subarray(0, 8).toString("latin1") !== "\x89PNG\r\n\x1a\n") return false;
  return head[25] === 4 || head[25] === 6;
}

async function runSips(args) {
  try {
    const { stdout, stderr } = await execFileP("sips", args, { timeout: 120_000 });
    return { stdout, stderr };
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error("sips is not available on this system");
    if (error?.killed) throw new Error("sips timed out");
    throw new Error(`sips failed: ${String(error?.stderr ?? error?.stdout ?? error).trim()}`);
  }
}

async function sipsDimensions(path) {
  const { stdout } = await runSips(["-g", "pixelWidth", "-g", "pixelHeight", path]);
  const dims = {};
  for (const line of stdout.split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon >= 0) {
      const key = line.slice(0, colon).trim();
      const value = Number.parseInt(line.slice(colon + 1).trim(), 10);
      if (Number.isFinite(value)) dims[key] = value;
    }
  }
  if (dims.pixelWidth === undefined || dims.pixelHeight === undefined) {
    throw new Error(`cannot read dimensions of ${path}`);
  }
  return [dims.pixelWidth, dims.pixelHeight];
}

/**
 * Convert / resize / recompress a local image before sending.
 * @param path - local image path.
 * @param options - { maxEdge = 2048, maxBytes = 10 MiB }.
 * @returns { path, note, tempDir } — when tempDir is set, `path` lives inside
 *   it and the caller must remove tempDir afterwards.
 */
export async function preprocessImage(path, { maxEdge = 2048, maxBytes = 10 * 1024 * 1024 } = {}) {
  let current = path;
  let tempDir = null;
  const notes = [];

  const convert = async (fmt, quality) => {
    tempDir = tempDir ?? mkdtempSync(join(tmpdir(), "image-vision-"));
    const out = join(tempDir, "image." + (fmt === "jpeg" ? "jpg" : fmt));
    const args = ["-s", "format", fmt];
    if (quality !== undefined) args.push("-s", "formatOptions", String(quality));
    args.push(current, "--out", out);
    await runSips(args);
    current = out;
  };

  try {
    const mime = detectMime(path);
    if (mime === "image/heic" || mime === "image/avif") {
      await convert("jpeg", 85);
      notes.push(`converted ${mime} -> jpeg`);
    } else if (mime === "image/tiff" || mime === "image/bmp") {
      await convert("png");
      notes.push(`converted ${mime} -> png`);
    }

    if (maxEdge > 0) {
      const [width, height] = await sipsDimensions(current);
      if (Math.max(width, height) > maxEdge) {
        const ext =
          mime === "image/png" ? "png" : mime === "image/jpeg" ? "jpg" : mime.split("/").at(-1);
        tempDir = tempDir ?? mkdtempSync(join(tmpdir(), "image-vision-"));
        const out = join(tempDir, `resized.${ext}`);
        await runSips(["-Z", String(maxEdge), current, "--out", out]);
        current = out;
        notes.push(`resized ${width}x${height} -> max edge ${maxEdge}`);
      }
    }

    if (statSync(current).size > maxBytes) {
      if (mime === "image/png" && !pngHasAlpha(current)) {
        await convert("jpeg", 85);
        notes.push("recompressed png -> jpeg");
      } else if (mime === "image/jpeg") {
        await convert("jpeg", 80);
        notes.push("recompressed jpeg");
      } else {
        notes.push(`still exceeds ${maxBytes} bytes, format kept as-is`);
      }
    }
  } catch (error) {
    // sips missing / failed: send the original bytes untouched.
    notes.push(`preprocessing skipped (${error.message})`);
    if (tempDir !== null) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
    current = path;
  }

  return { path: current, note: notes.join("; "), tempDir };
}

/** Build a data URL for a local image file. */
export function toDataUrl(path) {
  const mime = detectMime(path);
  const base64 = readFileSync(path).toString("base64");
  return `data:${mime};base64,${base64}`;
}
