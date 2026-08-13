// OpenAI-compatible chat completions call for vision, ported from the
// upstream image-vision skill (scripts/vision_query.py). Pure fetch; no
// runtime dependencies. Cooperative cancellation via AbortSignal.

const DEFAULT_TIMEOUT_MS = 300_000;

/**
 * Call an OpenAI-compatible `/chat/completions` endpoint with image content.
 * @param options
 *   apiKey - bearer token (required).
 *   apiBase - base URL, e.g. https://openrouter.ai/api/v1.
 *   model - vision model name.
 *   messages - [{ role, content }] where content is a multimodal part array.
 *   maxTokens / temperature - sampling controls.
 *   jsonMode - request a JSON-only answer.
 *   signal - optional AbortSignal (tool cancellation).
 *   timeoutMs - hard timeout (default 300 s, like the upstream script).
 * @returns { text, model, usage }.
 * @throws Error with actionable messages on auth / endpoint / model failures.
 */
export async function callVisionApi({
  apiKey,
  apiBase,
  model,
  messages,
  maxTokens,
  temperature,
  jsonMode = false,
  signal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  if (!apiKey) {
    throw new Error(
      "vision API key is not configured: set VISION_API_KEY (env, ~/.dsh/image-vision.env, or DSH credentials)",
    );
  }
  const url = apiBase.replace(/\/+$/, "") + "/chat/completions";
  const payload = { model, messages, max_tokens: maxTokens, temperature };
  if (jsonMode) payload.response_format = { type: "json_object" };

  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  signal?.addEventListener("abort", onAbort, { once: true });

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    if (signal?.aborted) throw new Error("vision request aborted");
    if (timedOut) throw new Error(`vision request timed out after ${timeoutMs} ms`);
    throw new Error(`network error calling ${url}: ${error.message}`);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = body?.error?.message ? `: ${body.error.message}` : ` (HTTP ${response.status})`;
    if (response.status === 401) {
      throw new Error(`vision API authentication failed (HTTP 401)${detail} — check VISION_API_KEY`);
    }
    if (response.status === 404) {
      throw new Error(`vision API endpoint not found (HTTP 404)${detail} — check VISION_API_BASE`);
    }
    if (response.status === 400) {
      throw new Error(
        `vision API rejected the request (HTTP 400)${detail} — the configured model may not support image input; try a different VISION_MODEL`,
      );
    }
    throw new Error(`vision API error ${response.status}${detail}`);
  }

  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== "string" && !Array.isArray(content)) {
    throw new Error(`unexpected vision API response: ${JSON.stringify(body).slice(0, 2000)}`);
  }
  const text = Array.isArray(content)
    ? content.map((part) => (typeof part?.text === "string" ? part.text : "")).join("")
    : content;
  return { text, model: body?.model ?? model, usage: body?.usage ?? null };
}
