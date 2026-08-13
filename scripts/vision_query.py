#!/usr/bin/env python3
"""Send images to an OpenAI-compatible vision model API and print the answer.

This is the core script of the `image-vision` skill. It sends one or more
images together with a text prompt to a vision-capable chat model and prints
the model's text answer to stdout.

Usage:
  python3 vision_query.py <image> [<image> ...] [--prompt "question"] [options]

Each <image> can be:
  - a local file path (PNG/JPEG/GIF/WebP/BMP/TIFF/HEIC/HEIF/AVIF)
  - an http(s) URL
  - a data URL (data:image/png;base64,...)

Local images are preprocessed before sending (macOS, via sips):
  - HEIC/HEIF/AVIF -> JPEG, TIFF/BMP -> PNG
  - resized when the long edge exceeds --max-edge (default 2048 px)
  - recompressed when larger than --max-bytes (default 10 MB)
Use --no-preprocess to send images as-is.

Environment variables:
  VISION_API_KEY   API key (falls back to OPENAI_API_KEY when unset)
  VISION_API_BASE  API base URL, e.g. https://api.openai.com/v1
  VISION_MODEL     Model name, e.g. gpt-4o-mini (the default)

If the environment variables are not set, the script reads them from
~/.codex/image-vision.env (KEY=BASE=MODEL= lines). Values in the
environment always take precedence.
"""

import argparse
import base64
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request

DEFAULT_BASE = "https://openrouter.ai/api/v1"
DEFAULT_MODEL = "qwen/qwen3-vl-32b-instruct"
DEFAULT_PROMPT = "Describe this image in detail."
CONFIG_PATH = os.path.expanduser("~/.codex/image-vision.env")

_IMAGE_MAGIC = (
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"GIF87a", "image/gif"),
    (b"GIF89a", "image/gif"),
    (b"BM", "image/bmp"),
    (b"II*\x00", "image/tiff"),
    (b"MM\x00*", "image/tiff"),
)


def detect_mime(path: str) -> str:
    with open(path, "rb") as f:
        head = f.read(16)
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    if head[4:8] == b"ftyp":
        brand = head[8:12]
        if brand in (b"heic", b"heix", b"hevc", b"hevx", b"mif1", b"msf1"):
            return "image/heic"
        if brand in (b"avif", b"avis"):
            return "image/avif"
    for signature, mime in _IMAGE_MAGIC:
        if head.startswith(signature):
            return mime
    raise ValueError(
        f"unsupported image format: {path} "
        "(supported: PNG/JPEG/GIF/WebP/BMP/TIFF/HEIC/HEIF/AVIF)"
    )


def _run_sips(args):
    if shutil.which("sips") is None:
        raise OSError("sips is not available on this system")
    try:
        proc = subprocess.run(["sips"] + args, capture_output=True, text=True, timeout=120)
    except subprocess.TimeoutExpired as exc:
        raise OSError(f"sips timed out") from exc
    if proc.returncode != 0:
        raise OSError(f"sips failed: {proc.stderr.strip() or proc.stdout.strip()}")
    return proc


def _sips_dimensions(path):
    proc = _run_sips(["-g", "pixelWidth", "-g", "pixelHeight", path])
    dims = {}
    for line in proc.stdout.splitlines():
        if ":" in line:
            key, _, value = line.partition(":")
            dims[key.strip()] = int(value.strip())
    if "pixelWidth" not in dims or "pixelHeight" not in dims:
        raise ValueError(f"cannot read dimensions of {path}")
    return dims["pixelWidth"], dims["pixelHeight"]


def _png_has_alpha(path) -> bool:
    with open(path, "rb") as f:
        head = f.read(26)
    if head[:8] != b"\x89PNG\r\n\x1a\n":
        return False
    color_type = head[25]
    return color_type in (4, 6)


def preprocess(path, max_edge=2048, max_bytes=10 * 1024 * 1024):
    """Convert/resize/recompress a local image before sending.

    Returns (final_path, note, tempdir). When tempdir is not None, final_path
    lives inside it and the caller must remove tempdir afterwards.
    """
    if shutil.which("sips") is None:
        return path, "sips not available, preprocessing skipped", None

    mime = detect_mime(path)
    current = path
    tempdir = None
    notes = []

    def convert(fmt, quality=None):
        nonlocal current, tempdir
        tempdir = tempdir or tempfile.mkdtemp(prefix="image-vision-")
        out = os.path.join(tempdir, "image." + ("jpg" if fmt == "jpeg" else fmt))
        args = ["-s", "format", fmt]
        if quality is not None:
            args += ["-s", "formatOptions", str(quality)]
        _run_sips(args + [current, "--out", out])
        current = out

    if mime in ("image/heic", "image/avif"):
        convert("jpeg", 85)
        notes.append(f"converted {mime} -> jpeg")
        mime = "image/jpeg"
    elif mime in ("image/tiff", "image/bmp"):
        convert("png")
        notes.append(f"converted {mime} -> png")
        mime = "image/png"

    if max_edge > 0:
        width, height = _sips_dimensions(current)
        if max(width, height) > max_edge:
            ext = "png" if mime == "image/png" else ("jpg" if mime == "image/jpeg" else mime.split("/")[-1])
            tempdir = tempdir or tempfile.mkdtemp(prefix="image-vision-")
            out = os.path.join(tempdir, f"resized.{ext}")
            _run_sips(["-Z", str(max_edge), current, "--out", out])
            current = out
            notes.append(f"resized {width}x{height} -> max edge {max_edge}")

    if os.path.getsize(current) > max_bytes:
        if mime == "image/png" and not _png_has_alpha(current):
            convert("jpeg", 85)
            notes.append("recompressed png -> jpeg")
        elif mime == "image/jpeg":
            convert("jpeg", 80)
            notes.append("recompressed jpeg")
        else:
            notes.append(f"still exceeds {max_bytes} bytes, format kept as-is")

    return current, "; ".join(notes), tempdir


def image_url(image: str) -> str:
    """Return an image_url value for a local path, http(s) URL, or data URL."""
    if image.startswith(("http://", "https://", "data:")):
        return image
    mime = detect_mime(image)
    with open(image, "rb") as f:
        encoded = base64.b64encode(f.read()).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def build_prompt(prompt: str, as_json: bool) -> str:
    if not as_json:
        return prompt
    return prompt + (
        "\n\nRespond with valid JSON only. Output the JSON directly, "
        "without markdown fences or extra text."
    )


def load_config() -> None:
    """Load VISION_* defaults from ~/.codex/image-vision.env if present."""
    if not os.path.exists(CONFIG_PATH):
        return
    with open(CONFIG_PATH, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key.startswith("VISION_") and key not in os.environ:
                os.environ[key] = value


def main() -> int:
    load_config()
    parser = argparse.ArgumentParser(
        description="Send images to an OpenAI-compatible vision model and print the answer."
    )
    parser.add_argument(
        "images",
        nargs="+",
        help="image file paths, http(s) URLs, or data URLs",
    )
    parser.add_argument(
        "--prompt",
        "-p",
        default=None,
        help="question for the vision model (default: describe the image)",
    )
    parser.add_argument("--system", default=None, help="optional system message")
    parser.add_argument(
        "--json",
        action="store_true",
        help="ask the model for a JSON-only answer",
    )
    parser.add_argument(
        "--max-tokens",
        type=int,
        default=1024,
        help="max output tokens (default: 1024)",
    )
    parser.add_argument(
        "--temperature",
        type=float,
        default=0.2,
        help="sampling temperature (default: 0.2)",
    )
    parser.add_argument(
        "--model",
        default=os.environ.get("VISION_MODEL", DEFAULT_MODEL),
        help=f"model name (default: {DEFAULT_MODEL} or $VISION_MODEL)",
    )
    parser.add_argument(
        "--base-url",
        default=os.environ.get("VISION_API_BASE", DEFAULT_BASE),
        help=f"API base URL (default: {DEFAULT_BASE} or $VISION_API_BASE)",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="print request metadata and token usage to stderr",
    )
    parser.add_argument(
        "--no-preprocess",
        action="store_true",
        help="send images as-is, skipping conversion/resize/compress",
    )
    parser.add_argument(
        "--max-edge",
        type=int,
        default=2048,
        help="resize when the long edge exceeds this many pixels (default: 2048)",
    )
    parser.add_argument(
        "--max-bytes",
        type=int,
        default=10 * 1024 * 1024,
        help="recompress when larger than this many bytes (default: 10485760)",
    )
    args = parser.parse_args()

    api_key = os.environ.get("VISION_API_KEY") or os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print(
            "Error: VISION_API_KEY is not set (no OPENAI_API_KEY fallback either).",
            file=sys.stderr,
        )
        return 2

    tempdirs = []
    try:
        content_parts = [
            {"type": "text", "text": build_prompt(args.prompt or DEFAULT_PROMPT, args.json)}
        ]
        for image in args.images:
            if not args.no_preprocess and not image.startswith(("http://", "https://", "data:")):
                final_path, note, tempdir = preprocess(image, args.max_edge, args.max_bytes)
                if tempdir:
                    tempdirs.append(tempdir)
                if note:
                    print(f"note: {note} ({image})", file=sys.stderr)
                url = image_url(final_path)
            else:
                url = image_url(image)
            content_parts.append({"type": "image_url", "image_url": {"url": url}})
    except (OSError, ValueError) as exc:
        for tempdir in tempdirs:
            shutil.rmtree(tempdir, ignore_errors=True)
        print(f"Error: {exc}", file=sys.stderr)
        return 2
    for tempdir in tempdirs:
        shutil.rmtree(tempdir, ignore_errors=True)

    messages = []
    if args.system:
        messages.append({"role": "system", "content": args.system})
    messages.append({"role": "user", "content": content_parts})

    payload = {
        "model": args.model,
        "messages": messages,
        "max_tokens": args.max_tokens,
        "temperature": args.temperature,
    }

    url = args.base_url.rstrip("/") + "/chat/completions"
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )

    if args.verbose:
        print(f"POST {url}", file=sys.stderr)
        print(
            f"model={args.model} images={len(args.images)} "
            f"max_tokens={args.max_tokens}",
            file=sys.stderr,
        )

    try:
        with urllib.request.urlopen(request, timeout=300) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        print(f"API error {exc.code}: {detail}", file=sys.stderr)
        return 1
    except urllib.error.URLError as exc:
        print(f"Network error: {exc.reason}", file=sys.stderr)
        return 1

    try:
        content = body["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        print(
            f"Unexpected API response: {json.dumps(body, ensure_ascii=False)[:2000]}",
            file=sys.stderr,
        )
        return 1

    if isinstance(content, list):
        text = "".join(part.get("text", "") for part in content if isinstance(part, dict))
    else:
        text = content or ""

    if args.verbose and isinstance(body.get("usage"), dict):
        print(f"usage={json.dumps(body['usage'])}", file=sys.stderr)

    print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
