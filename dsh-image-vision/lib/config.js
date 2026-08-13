// Config resolution for the vision API.
// Precedence (per call, so changes take effect immediately):
//   1. per-call tool arguments (model / base_url / api_key override)
//   2. process environment: VISION_API_KEY / VISION_API_BASE / VISION_MODEL
//      (VISION_API_KEY falls back to OPENAI_API_KEY)
//   3. DSH credentials service (ctx.credentials, e.g. ~/.dsh/.credentials.yaml)
//   4. dotfile: ~/.dsh/image-vision.env, then ~/.codex/image-vision.env
//   5. built-in defaults (OpenRouter + qwen/qwen3-vl-32b-instruct)
//
// This module intentionally imports only Node builtins so the plugin can be
// loaded from any location (symlinked or copied) without package resolution.

import { homedir } from "node:os";
import { existsSync, readFileSync } from "node:fs";

export const DEFAULT_BASE = "https://openrouter.ai/api/v1";
export const DEFAULT_MODEL = "qwen/qwen3-vl-32b-instruct";

const DOTFILE_PATHS = ["~/.dsh/image-vision.env", "~/.codex/image-vision.env"];

function expandHome(path) {
  return path === "~" ? homedir() : path.startsWith("~/") ? homedir() + path.slice(1) : path;
}

/** Parse a `KEY=VALUE` dotfile (blank lines and `#` comments skipped). */
function readDotfile(path) {
  try {
    const out = {};
    for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

/** First existing dotfile wins (DSH first, then Codex). */
function dotfileDefaults() {
  for (const path of DOTFILE_PATHS) {
    const full = expandHome(path);
    if (existsSync(full)) return readDotfile(full);
  }
  return {};
}

/**
 * Opportunistic read of one DSH credential. The plugin does not import
 * @deepseek-ai/dsh-credentials, so this duck-types the service: any failure
 * (missing service or branded-ref rejection) is treated as "not configured".
 */
async function credentialValue(ctx, name) {
  try {
    const credentials = ctx?.get?.("credentials") ?? ctx?.credentials;
    if (!credentials || typeof credentials.resolve !== "function") return undefined;
    const hit = await credentials.resolve({ name });
    return hit?.value ?? undefined;
  } catch {
    return undefined;
  }
}

function envValue(name, fallbackName) {
  return process.env[name] ?? (fallbackName === undefined ? undefined : process.env[fallbackName]);
}

/**
 * Resolve the effective vision API configuration for one call.
 * @param ctx - the plugin context (used only for the optional credentials service).
 * @param overrides - per-call overrides: { apiKey?, apiBase?, model? }.
 */
export async function resolveVisionConfig(ctx, overrides = {}) {
  const dotfile = dotfileDefaults();
  const apiKey =
    overrides.apiKey ??
    envValue("VISION_API_KEY", "OPENAI_API_KEY") ??
    (await credentialValue(ctx, "VISION_API_KEY")) ??
    dotfile.VISION_API_KEY ??
    (await credentialValue(ctx, "OPENAI_API_KEY")) ??
    dotfile.OPENAI_API_KEY ??
    undefined;
  const apiBase =
    overrides.apiBase ??
    envValue("VISION_API_BASE") ??
    (await credentialValue(ctx, "VISION_API_BASE")) ??
    dotfile.VISION_API_BASE ??
    DEFAULT_BASE;
  const model =
    overrides.model ??
    envValue("VISION_MODEL") ??
    (await credentialValue(ctx, "VISION_MODEL")) ??
    dotfile.VISION_MODEL ??
    DEFAULT_MODEL;
  return { apiKey, apiBase, model };
}
