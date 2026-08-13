// dsh-image-vision — DeepSeek Harness plugin.
//
// Registers:
//   1. `vision_query` — a model-facing tool that sends one or more images to an
//      OpenAI-compatible vision API (OpenRouter, SiliconFlow, Zhipu, Kimi,
//      Qwen, Ollama, ...) and returns the model's answer. This is the primary
//      path: the model no longer needs to shell out to a Python script.
//   2. `image-vision` — a runtime skill (DSH skill catalog + GUI `/image-vision`
//      slash menu) whose body documents the tool and the fallback script.
//
// Zero runtime imports (Node builtins only) so the package loads from any
// location — copied or symlinked — without package resolution.

import { rmSync } from "node:fs";
import { resolveVisionConfig, DEFAULT_BASE, DEFAULT_MODEL } from "./config.js";
import { callVisionApi } from "./provider.js";
import { preprocessImage, toDataUrl } from "./preprocess.js";
import { loadSkillDefinition } from "./skill.js";

export const name = "image-vision";
export const inject = ["tools", "skills"];

const DEFAULT_PROMPT = "Describe this image in detail.";
const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_MAX_EDGE = 2048;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 300_000;

function buildPrompt(prompt, jsonMode) {
  if (!jsonMode) return prompt;
  return (
    prompt +
    "\n\nRespond with valid JSON only. Output the JSON directly, without markdown fences or extra text."
  );
}

function isRemoteImage(value) {
  return /^(https?:|data:)/.test(value);
}

/**
 * Resolve one image argument to a sendable URL (data URL for local files).
 * Local preprocessing notes are collected into `notes`.
 */
async function prepareImage(value, options, notes) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`invalid image argument: ${JSON.stringify(value)}`);
  }
  if (isRemoteImage(value)) return value;
  const { path, note, tempDir } = await preprocessImage(value, options);
  if (note) notes.push(note);
  if (tempDir) return { url: toDataUrl(path), tempDir };
  return { url: toDataUrl(path), tempDir: null };
}

export async function apply(ctx, config = {}) {
  const options = {
    maxEdge: config.maxEdge ?? DEFAULT_MAX_EDGE,
    maxBytes: config.maxBytes ?? DEFAULT_MAX_BYTES,
  };

  const disposeTool = ctx.tools.register({
    name: "vision_query",
    description:
      "Analyze one or more images with an external vision model API: describe content, answer questions about it, or extract text (OCR). Use when the current model cannot see images (e.g. DeepSeek text-only models) but the task needs image content.",
    parameters: {
      images: {
        type: "array",
        required: true,
        minItems: 1,
        items: {
          type: "string",
          description: "Local file path, http(s) URL, or data URL of one image.",
        },
        description: "One or more images to analyze together.",
      },
      prompt: {
        type: "string",
        description: `Question or instruction for the vision model. Defaults to: ${DEFAULT_PROMPT}`,
      },
      json: {
        type: "boolean",
        description: "Ask the vision model to answer with valid JSON only.",
      },
      max_tokens: {
        type: "integer",
        description: `Maximum output tokens. Defaults to ${DEFAULT_MAX_TOKENS}.`,
      },
      temperature: {
        type: "number",
        description: `Sampling temperature. Defaults to ${DEFAULT_TEMPERATURE}.`,
      },
      model: {
        type: "string",
        description: `Override the configured vision model (default ${DEFAULT_MODEL}).`,
      },
      base_url: {
        type: "string",
        description: `Override the configured OpenAI-compatible API base URL (default ${DEFAULT_BASE}).`,
      },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["text", "model", "images"],
        properties: {
          text: { type: "string" },
          model: { type: "string" },
          images: { type: "integer" },
          notes: {
            type: "array",
            items: { type: "string" },
            description: "Preprocessing notes (e.g. converted HEIC to JPEG, resized).",
          },
        },
      },
      render: (_args, value) => [{ type: "text", text: value.text }],
      presentationMeta: (_args, value) => ({
        text: value.text,
        model: value.model,
        images: value.images,
        ...(value.notes?.length ? { notes: value.notes } : {}),
      }),
    },
    isConcurrencySafe: () => true,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    async execute(args, exec) {
      const images = Array.isArray(args.images) ? args.images : [args.images];
      const notes = [];
      const tempDirs = [];
      try {
        const contentParts = [
          {
            type: "text",
            text: buildPrompt(
              typeof args.prompt === "string" && args.prompt.trim()
                ? args.prompt
                : DEFAULT_PROMPT,
              args.json === true,
            ),
          },
        ];
        for (const image of images) {
          const prepared = await prepareImage(image, options, notes);
          if (prepared.tempDir) tempDirs.push(prepared.tempDir);
          contentParts.push({ type: "image_url", image_url: { url: prepared.url } });
        }

        const { apiKey, apiBase, model } = await resolveVisionConfig(ctx, {
          apiBase: typeof args.base_url === "string" && args.base_url.trim() ? args.base_url : undefined,
          model: typeof args.model === "string" && args.model.trim() ? args.model : undefined,
        });
        const result = await callVisionApi({
          apiKey,
          apiBase,
          model,
          messages: [{ role: "user", content: contentParts }],
          maxTokens: Number.isInteger(args.max_tokens) ? args.max_tokens : DEFAULT_MAX_TOKENS,
          temperature:
            typeof args.temperature === "number" ? args.temperature : DEFAULT_TEMPERATURE,
          jsonMode: args.json === true,
          signal: exec.signal,
        });
        return {
          text: result.text,
          model: result.model,
          images: images.length,
          ...(notes.length ? { notes } : {}),
        };
      } finally {
        for (const dir of tempDirs) {
          try {
            rmSync(dir, { recursive: true, force: true });
          } catch {
            // best-effort cleanup
          }
        }
      }
    },
  });

  const disposeSkill = ctx.skills.register(loadSkillDefinition());

  ctx.logger?.info?.(
    "dsh-image-vision: registered vision_query tool and image-vision skill",
  );

  return () => {
    disposeSkill();
    disposeTool();
  };
}
