"""
Flask proxy for LM Studio OpenAI-compatible API.
  pip install flask requests
  set LM_STUDIO_URL=http://10.212.228.25:1234/v1
  set LM_STUDIO_MODEL=qwen/qwen3.5-9b
  python app.py
  open http://127.0.0.1:5173
  Or omit set … and use lm_studio.json in this folder.
"""
import json
import math
import os
import re
import threading
from collections import defaultdict
from pathlib import Path

import requests
from flask import Flask, Response, jsonify, request, send_from_directory

ROOT_DIR = Path(__file__).resolve().parent
DIST_DIR = ROOT_DIR / "dist"

app = Flask(__name__, static_folder=None)


def _read_json_object(path: Path) -> dict:
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, OSError):
        return {}


def resolve_lm_studio_settings() -> tuple[str, str]:
    """
    lm_studio.json + lm_studio.local.json override LM_STUDIO_* environment variables
    so a stale shell `set LM_STUDIO_MODEL=...` cannot stick after you change defaults here.
    """
    default_url = "http://10.212.228.25:1234/v1"
    default_model = "qwen/qwen3.5-9b"
    cfg: dict = {}
    cfg.update(_read_json_object(ROOT_DIR / "lm_studio.json"))
    cfg.update(_read_json_object(ROOT_DIR / "lm_studio.local.json"))

    def pick(json_key: str, env_key: str, default: str) -> str:
        v = cfg.get(json_key)
        if v is not None and str(v).strip() != "":
            return str(v).strip()
        ev = os.environ.get(env_key, "").strip()
        if ev:
            return ev
        return default

    return pick("lm_studio_url", "LM_STUDIO_URL", default_url).rstrip("/"), pick(
        "lm_studio_model", "LM_STUDIO_MODEL", default_model
    )


LM_BASE, MODEL = resolve_lm_studio_settings()


def _load_env_file() -> None:
    env_path = ROOT_DIR / ".env"
    if not env_path.is_file():
        return
    for line in env_path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            os.environ[key] = value


_load_env_file()

GEMINI_KEY = (
    os.environ.get("GEMINI_API_KEY", "").strip()
    or os.environ.get("VITE_GEMINI_API_KEY", "").strip()
)
GEMINI_MODEL = (
    os.environ.get("VITE_GEMINI_MODEL", "").strip()
    or os.environ.get("GEMINI_MODEL", "").strip()
    or "gemini-3-flash-preview"
)

QWEN_LLM_KEY = (
    os.environ.get("QWEN_LLM_API_KEY", "").strip()
    or os.environ.get("VITE_QWEN_LLM_API_KEY", "").strip()
)
QWEN_LLM_MODEL = (
    os.environ.get("QWEN_LLM_MODEL", "").strip()
    or os.environ.get("VITE_QWEN_LLM_MODEL", "").strip()
    or "qwen3.7-plus"
)
QWEN_LLM_BASE = (
    os.environ.get("QWEN_LLM_BASE_URL", "").strip()
    or os.environ.get("VITE_QWEN_LLM_BASE_URL", "").strip()
    or "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
).rstrip("/")

ANTHROPIC_KEY = (
    os.environ.get("ANTHROPIC_API_KEY", "").strip()
    or os.environ.get("VITE_ANTHROPIC_API_KEY", "").strip()
)
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "").strip() or "claude-opus-4-8"
ANTHROPIC_VERSION = os.environ.get("ANTHROPIC_VERSION", "").strip() or "2023-06-01"
ANTHROPIC_BASE = (
    os.environ.get("ANTHROPIC_BASE_URL", "").strip() or "https://api.anthropic.com/v1"
).rstrip("/")

SYSTEM_PROMPT = """You analyze architectural floor plan images for a premium architectural SVG renderer.

Return exactly one valid JSON object. Extract enough normalized geometry to redraw the plan as vector SVG: room floor materials, wall runs, door swings/openings, labels, and visible furniture.

Rules:
- analysisVersion must be the string "1.0".
- All rooms, walls, doors, labels, and furniture use the same normalized 0-1 coordinate space: x across image width, y down image height, origin top-left of the bitmap (not the letterboxed HTML box).
- rooms: array of { id, name, type, flooring, polygon, labelPoint, dimensionsText?, areaSqFt? }.
- rooms[].flooring must be one of "wood", "tile", "stone", "carpet", or "plain". Use wood for living/dining/bedrooms/halls, tile for bathrooms, warm tile/plain for kitchens, and stone for balcony/patio/outdoor areas.
- rooms[].polygon must be a list of {x,y} points tracing the inner wall boundary. Prefer 4+ points, but include every visible corner for L-shaped rooms.
- rooms[].labelPoint must be {x,y} near the visual center of the room.
- walls: array of { id?, points:[{x,y},...], thickness } for outer shell and partition walls. Use 5+ points for major wall runs when possible.
- doors: array of { id?, type:"door", position:{x,y}, width, swing?, connects?, polygon? }. Include door swing/opening geometry when visible. Coordinates and width are normalized.
- furniture_catalog: optional array of { id, name, shape?, width_mm?, depth_mm?, height_mm?, image_2d_url?, model_3d_url? }.
- furniture: array of { id?, type, catalogId?, x, y, width?, height?, rotationDeg?, scale?, zIndex? } for all visible furniture and fixtures. x/y are centers and width/height are normalized.
- Optional windows may be { id?, position:{x,y}, width, height? }.

Reply with ONLY valid JSON, no markdown. Example shape:
{"analysisVersion":"1.0","rooms":[{"id":"kitchen","name":"Kitchen","type":"kitchen","flooring":"tile","labelPoint":{"x":0.38,"y":0.4},"dimensionsText":"12 ft x 18 ft","polygon":[{"x":0.1,"y":0.2},{"x":0.5,"y":0.2},{"x":0.5,"y":0.6},{"x":0.1,"y":0.6}]}],"walls":[{"id":"outer-wall-1","points":[{"x":0.12,"y":0.18},{"x":0.86,"y":0.18},{"x":0.86,"y":0.74},{"x":0.32,"y":0.74},{"x":0.32,"y":0.92},{"x":0.12,"y":0.92}],"thickness":0.008}],"doors":[{"id":"door-1","type":"door","position":{"x":0.5,"y":0.6},"width":0.04,"swing":"right"}],"furniture":[{"id":"bed-1","type":"bed","x":0.7,"y":0.45,"width":0.12,"height":0.18,"rotationDeg":0}],"furniture_catalog":[]}"""


def strip_fence(s: str) -> str:
    t = s.strip()
    if t.startswith("\ufeff"):
        t = t[1:]
    if t.startswith("```"):
        t = re.sub(r"^```(?:json)?\s*", "", t, flags=re.I)
        t = re.sub(r"\s*```$", "", t)
    t = re.sub(r"<think>[\s\S]*?</redacted_thinking>", "", t, flags=re.I)
    t = re.sub(r"<think[\s\S]*?</think>", "", t, flags=re.I)
    t = re.sub(r"<thinking>[\s\S]*?</thinking>", "", t, flags=re.I)
    return t.strip()


def _strip_trailing_commas(s: str) -> str:
    return re.sub(r",\s*([}\]])", r"\1", s)


def _extract_balanced_json(text: str) -> str | None:
    start = text.find("{")
    if start < 0:
        return None
    depth = 0
    in_str = False
    esc = False
    for i in range(start, len(text)):
        c = text[i]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
            continue
        if c == '"':
            in_str = True
            continue
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    return None


def _openai_content_to_text(content) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for part in content:
            if isinstance(part, dict) and part.get("text"):
                parts.append(str(part["text"]))
            elif isinstance(part, str):
                parts.append(part)
        return "".join(parts)
    if isinstance(content, dict) and content.get("text"):
        return str(content["text"])
    return ""


def _message_text_candidates(message: dict) -> list[str]:
    if not isinstance(message, dict):
        return []
    candidates: list[str] = []
    main = _openai_content_to_text(message.get("content"))
    if main.strip():
        candidates.append(main)
    reasoning = message.get("reasoning_content") or message.get("reasoning")
    if isinstance(reasoning, str) and reasoning.strip() and reasoning != main:
        candidates.append(reasoning)
    return candidates


def parse_model_json(text: str) -> dict:
    cleaned = strip_fence(text)
    brace = cleaned.find("{")
    if brace > 0:
        cleaned = cleaned[brace:]
    attempts = [cleaned]
    balanced = _extract_balanced_json(cleaned)
    if balanced and balanced != cleaned:
        attempts.append(balanced)
    last_err: json.JSONDecodeError | None = None
    for candidate in attempts:
        candidate = _strip_trailing_commas(candidate)
        try:
            return json.loads(candidate)
        except json.JSONDecodeError as err:
            last_err = err
    if last_err:
        raise last_err
    raise json.JSONDecodeError("No JSON object in model text", text, 0)


def parse_openai_message(
    message: dict, finish_reason: str | None = None, label: str = "model"
) -> dict:
    candidates = _message_text_candidates(message)
    if not candidates:
        raise RuntimeError(f"No message content from {label}")
    last_err: Exception | None = None
    for text in candidates:
        try:
            return parse_model_json(text)
        except (json.JSONDecodeError, ValueError) as err:
            last_err = err
    if finish_reason == "length":
        raise RuntimeError(
            f"{label} response was truncated (token limit). Try a smaller image or re-run."
        )
    if last_err:
        raise last_err
    raise RuntimeError(f"Could not parse JSON from {label}")


def _num(value, default=None):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _clamp(value, lo=0.0, hi=1.0, default=None):
    n = _num(value, default)
    if n is None:
        return None
    return max(lo, min(hi, n))


def _point(value):
    if not isinstance(value, dict):
        return None
    x = _clamp(value.get("x"))
    y = _clamp(value.get("y"))
    if x is None or y is None:
        return None
    return {"x": x, "y": y}


def _points(value, min_count=1):
    if not isinstance(value, list):
        return []
    pts = []
    for item in value:
        p = _point(item)
        if p is not None:
            pts.append(p)
    return pts if len(pts) >= min_count else []


def _copy_keys(src: dict, keys: list[str]) -> dict:
    return {k: src[k] for k in keys if k in src and src[k] is not None}


def _normalize_room(room: dict, idx: int) -> dict | None:
    if not isinstance(room, dict):
        return None
    polygon = _points(room.get("polygon"), min_count=3)
    if not polygon:
        return None
    out = _copy_keys(
        room,
        ["id", "name", "type", "flooring", "color", "dimensionsText", "dimensions", "areaSqFt"],
    )
    out.setdefault("id", f"room-{idx}")
    out.setdefault("name", str(out["id"]))
    out["polygon"] = polygon
    label_point = _point(room.get("labelPoint"))
    if label_point is not None:
        out["labelPoint"] = label_point
    return out


def _normalize_wall(wall: dict, idx: int) -> dict | None:
    if not isinstance(wall, dict):
        return None
    points = _points(wall.get("points"), min_count=2)
    if not points:
        return None
    out = _copy_keys(wall, ["id"])
    out.setdefault("id", f"wall-{idx}")
    out["points"] = points
    out["thickness"] = _clamp(wall.get("thickness"), lo=0.001, hi=0.05, default=0.008)
    return out


def _normalize_door(door: dict, idx: int) -> dict | None:
    if not isinstance(door, dict):
        return None
    out = _copy_keys(door, ["id", "type", "swing", "connects"])
    out.setdefault("id", f"door-{idx}")
    out.setdefault("type", "door")

    polygon = _points(door.get("polygon"), min_count=3)
    if polygon:
        out["polygon"] = polygon

    position = _point(door.get("position"))
    if position is not None:
        out["position"] = position
    else:
        x = _clamp(door.get("x"))
        y = _clamp(door.get("y"))
        if x is not None and y is not None:
            out["x"] = x
            out["y"] = y

    for key in ["width", "height", "radius"]:
        if key in door:
            value = _clamp(door.get(key), lo=0.001, hi=1.0)
            if value is not None:
                out[key] = value

    return out if ("polygon" in out or "position" in out or ("x" in out and "y" in out)) else None


def _door_anchor(door: dict) -> tuple[float, float] | None:
    position = door.get("position")
    if isinstance(position, dict) and "x" in position and "y" in position:
        return float(position["x"]), float(position["y"])
    if "x" in door and "y" in door:
        return float(door["x"]), float(door["y"])
    polygon = door.get("polygon")
    if isinstance(polygon, list) and polygon:
        xs = [p["x"] for p in polygon]
        ys = [p["y"] for p in polygon]
        return sum(xs) / len(xs), sum(ys) / len(ys)
    return None


def _dedupe_doors(doors: list[dict], threshold: float = 0.04) -> list[dict]:
    """Vision models sometimes annotate the same opening once per adjoining
    room, producing two near-identical door markers. Keep only the first."""
    kept: list[dict] = []
    kept_anchors: list[tuple[float, float]] = []
    for door in doors:
        anchor = _door_anchor(door)
        if anchor is None:
            kept.append(door)
            continue
        if any(math.hypot(anchor[0] - a[0], anchor[1] - a[1]) < threshold for a in kept_anchors):
            continue
        kept.append(door)
        kept_anchors.append(anchor)
    return kept


def _normalize_furniture(item: dict, idx: int) -> dict | None:
    if not isinstance(item, dict):
        return None
    x = _clamp(item.get("x"))
    y = _clamp(item.get("y"))
    if x is None or y is None:
        return None
    out = _copy_keys(item, ["id", "type", "catalogId", "shape", "imageUrl"])
    out.setdefault("id", f"f-{idx}")
    out["x"] = x
    out["y"] = y
    for key in ["width", "height", "depth", "scale"]:
        if key in item:
            value = _clamp(item.get(key), lo=0.001, hi=1.0)
            if value is not None:
                out[key] = value
    for key in ["rotationDeg", "rotation", "zIndex", "chairs"]:
        if key in item:
            value = _num(item.get(key))
            if value is not None:
                out[key] = value
    return out


def _normalize_window(window: dict, idx: int) -> dict | None:
    if not isinstance(window, dict):
        return None
    position = _point(window.get("position"))
    width = _clamp(window.get("width"), lo=0.001, hi=1.0)
    if position is None or width is None:
        return None
    out = _copy_keys(window, ["id"])
    out.setdefault("id", f"window-{idx}")
    out["position"] = position
    out["width"] = width
    height = _clamp(window.get("height"), lo=0.001, hi=1.0)
    if height is not None:
        out["height"] = height
    return out


def normalize_analysis(data: dict) -> dict:
    if not isinstance(data, dict):
        data = {}
    out = {
        "analysisVersion": str(data.get("analysisVersion") or "1.0"),
        "label": data.get("label") or "",
        "rooms": [],
        "walls": [],
        "doors": [],
        "furniture_catalog": data.get("furniture_catalog")
        if isinstance(data.get("furniture_catalog"), list)
        else [],
        "furniture": [],
    }
    if isinstance(data.get("calibration"), dict):
        out["calibration"] = data["calibration"]

    out["rooms"] = [
        room
        for room in (_normalize_room(room, i) for i, room in enumerate(data.get("rooms") or []))
        if room is not None
    ]
    out["walls"] = [
        wall
        for wall in (_normalize_wall(wall, i) for i, wall in enumerate(data.get("walls") or []))
        if wall is not None
    ]
    out["doors"] = _dedupe_doors(
        [
            door
            for door in (_normalize_door(door, i) for i, door in enumerate(data.get("doors") or []))
            if door is not None
        ]
    )
    out["furniture"] = [
        item
        for item in (
            _normalize_furniture(item, i) for i, item in enumerate(data.get("furniture") or [])
        )
        if item is not None
    ]
    windows = [
        window
        for window in (_normalize_window(window, i) for i, window in enumerate(data.get("windows") or []))
        if window is not None
    ]
    if windows:
        out["windows"] = windows
    return out


def parse_response(text: str) -> dict:
    return normalize_analysis(parse_model_json(text))


def analyze_via_gemini(b64: str, mime: str) -> dict:
    if not GEMINI_KEY:
        raise ValueError("GEMINI_API_KEY or VITE_GEMINI_API_KEY not set")
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{requests.utils.quote(GEMINI_MODEL, safe='')}:generateContent"
        f"?key={requests.utils.quote(GEMINI_KEY, safe='')}"
    )
    user_text = (
        "Extract rooms, flooring materials, walls, doors, windows, labels, dimensions, "
        "and furniture for a premium vector SVG redraw. Output JSON only."
    )
    body = {
        "contents": [
            {
                "parts": [
                    {"text": SYSTEM_PROMPT + "\n\n" + user_text},
                    {"inline_data": {"mime_type": mime, "data": b64}},
                ]
            }
        ],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 8192},
    }
    r = requests.post(url, json=body, timeout=(10, 3600))
    if not r.ok:
        raise RuntimeError(f"Gemini: {r.status_code} {r.text[:500]}")
    data = r.json()
    parts = (
        data.get("candidates", [{}])[0]
        .get("content", {})
        .get("parts", [])
    )
    text = "".join(p.get("text", "") for p in parts if isinstance(p, dict))
    if not text:
        raise RuntimeError("No text from Gemini")
    return parse_response(text)


def analyze_via_anthropic(b64: str, mime: str) -> dict:
    if not ANTHROPIC_KEY:
        raise ValueError("ANTHROPIC_API_KEY not set")
    # Anthropic accepts only these inline image media types.
    media_type = mime if mime in ("image/png", "image/jpeg", "image/gif", "image/webp") else "image/png"
    user_text = (
        "Extract rooms, flooring materials, walls, doors, windows, labels, dimensions, "
        "and furniture for a premium vector SVG redraw. Output JSON only."
    )
    body = {
        "model": ANTHROPIC_MODEL,
        "max_tokens": 16000,
        "system": SYSTEM_PROMPT,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {"type": "base64", "media_type": media_type, "data": b64},
                    },
                    {"type": "text", "text": user_text},
                ],
            },
        ],
    }
    r = requests.post(
        f"{ANTHROPIC_BASE}/messages",
        json=body,
        headers={
            "x-api-key": ANTHROPIC_KEY,
            "anthropic-version": ANTHROPIC_VERSION,
            "Content-Type": "application/json",
        },
        timeout=(10, 3600),
    )
    if not r.ok:
        raise RuntimeError(f"Anthropic ({ANTHROPIC_MODEL}): {r.status_code} {r.text[:500]}")
    data = r.json()
    if data.get("stop_reason") == "refusal":
        raise RuntimeError("Anthropic declined the request (safety refusal).")
    blocks = data.get("content") or []
    text = "".join(
        b.get("text", "") for b in blocks if isinstance(b, dict) and b.get("type") == "text"
    )
    if not text.strip():
        raise RuntimeError("No text content from Anthropic")
    return normalize_analysis(parse_model_json(text))


def analyze_via_qwen(b64: str, mime: str) -> dict:
    if not QWEN_LLM_KEY:
        raise ValueError("QWEN_LLM_API_KEY not set")
    url = f"{QWEN_LLM_BASE}/chat/completions"
    user_text = (
        "Extract rooms, flooring materials, walls, doors, windows, labels, dimensions, "
        "and furniture for a premium vector SVG redraw. Output JSON only."
    )
    body = {
        "model": QWEN_LLM_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": user_text},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{mime};base64,{b64}"},
                    },
                ],
            },
        ],
        "temperature": 0.2,
        "max_tokens": 65536,
        "response_format": {"type": "json_object"},
        # Kimi on Fireworks defaults to heavy chain-of-thought reasoning, which
        # made analyze take ~8 min. Disabling it cuts that to ~20s with intact
        # room/furniture extraction. Fireworks ignores unknown params gracefully.
        "reasoning_effort": "none",
    }
    r = requests.post(
        url,
        json=body,
        headers={"Authorization": f"Bearer {QWEN_LLM_KEY}", "Content-Type": "application/json"},
        timeout=(10, 3600),
    )
    if not r.ok:
        raise RuntimeError(f"Qwen ({QWEN_LLM_MODEL}): {r.status_code} {r.text[:500]}")
    data = r.json()
    choice = data["choices"][0]
    usage = data.get("usage") or {}
    label = f"Qwen (completion_tokens={usage.get('completion_tokens', '?')}, max_tokens={body['max_tokens']})"
    return normalize_analysis(
        parse_openai_message(
            choice.get("message") or {},
            finish_reason=choice.get("finish_reason"),
            label=label,
        )
    )


def lm_models_url() -> str:
    base = re.sub(r"/v1$", "", LM_BASE)
    return f"{base}/v1/models"


def serve_index(filename="index.html"):
    index_path = DIST_DIR / filename
    if not index_path.exists():
        return (
            "Built frontend not found. Run `npm install` and `npm run build`, then restart `python app.py`.",
            500,
        )

    html = index_path.read_text(encoding="utf-8")
    lines = ["  <script>"]
    lines.append("    window.__ANALYZE_API__ = window.location.origin;")
    lines.append(f"    window.__SERVER_LM_MODEL__ = {json.dumps(MODEL)};")
    lines.append(f"    window.__SERVER_LM_BASE__ = {json.dumps(LM_BASE)};")
    if GEMINI_KEY:
        lines.append(f"    window.__SERVER_GEMINI_MODEL__ = {json.dumps(GEMINI_MODEL)};")
    sb_url, sb_key = get_supabase_config()
    if sb_url and sb_key:
        lines.append(f"    window.__SUPABASE_URL__ = {json.dumps(sb_url)};")
        lines.append(f"    window.__SUPABASE_ANON_KEY__ = {json.dumps(sb_key)};")
    lines.append("  </script>")
    config_script = "\n".join(lines)
    html = html.replace("</head>", f"{config_script}\n</head>")
    return Response(html, mimetype="text/html")


@app.after_request
def cors(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    resp.headers["Access-Control-Allow-Methods"] = "GET, PUT, POST, OPTIONS"
    return resp


@app.route("/api/analyze", methods=["OPTIONS"])
def analyze_opts():
    return "", 204


@app.route("/api/health", methods=["GET"])
def health():
    if ANTHROPIC_KEY:
        return jsonify(
            {
                "ok": True,
                "provider": "anthropic",
                "model": ANTHROPIC_MODEL,
                "baseUrl": ANTHROPIC_BASE,
            }
        )
    if QWEN_LLM_KEY:
        return jsonify(
            {
                "ok": True,
                "provider": "qwen",
                "model": QWEN_LLM_MODEL,
                "baseUrl": QWEN_LLM_BASE,
            }
        )
    if GEMINI_KEY:
        return jsonify(
            {
                "ok": True,
                "provider": "gemini",
                "model": GEMINI_MODEL,
            }
        )
    try:
        r = requests.get(lm_models_url(), timeout=5)
        return jsonify(
            {
                "ok": r.ok,
                "provider": "lm_studio",
                "lmStudioUrl": LM_BASE,
                "model": MODEL,
                "status": r.status_code,
            }
        ), (200 if r.ok else 502)
    except requests.RequestException as e:
        return jsonify(
            {
                "ok": False,
                "provider": "lm_studio",
                "lmStudioUrl": LM_BASE,
                "model": MODEL,
                "error": f"LM Studio is not reachable: {e}",
            }
        ), 502


import base64
import hashlib
from io import BytesIO
from PIL import Image

def resize_image_b64(b64: str, max_size: int = 1024) -> str:
    try:
        img_data = base64.b64decode(b64)
        img = Image.open(BytesIO(img_data))
        if img.width <= max_size and img.height <= max_size:
            return b64
        img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
        out = BytesIO()
        img.save(out, format=img.format or "PNG")
        return base64.b64encode(out.getvalue()).decode("utf-8")
    except Exception:
        return b64

def _analyze_via_lm_studio(b64: str, mime: str) -> dict:
    url = f"{LM_BASE}/chat/completions"
    body = {
        "model": MODEL or "local-model",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "Extract rooms, flooring materials, walls, doors, windows, labels, dimensions, and furniture for a premium vector SVG redraw. Output JSON only.",
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{mime};base64,{b64}"},
                    },
                ],
            },
        ],
        "temperature": 0.2,
        "max_tokens": 8192,
    }
    r = requests.post(url, json=body, timeout=(10, 3600))
    if not r.ok:
        raise RuntimeError(f"LM Studio: {r.status_code} {r.text}")
    data = r.json()
    txt = data["choices"][0]["message"]["content"]
    return parse_response(txt)


@app.route("/api/analyze", methods=["POST"])
def analyze():
    payload = request.get_json(force=True, silent=True) or {}
    b64 = payload.get("imageBase64")
    if not b64:
        return jsonify({"error": "imageBase64 required"}), 400

    # Downscale the image to prevent context size errors in LM Studio
    b64 = resize_image_b64(b64, max_size=1024)
    mime = payload.get("mimeType") or "image/png"

    result: dict = {}

    def work():
        try:
            if ANTHROPIC_KEY:
                result["data"] = analyze_via_anthropic(b64, mime)
            elif QWEN_LLM_KEY:
                result["data"] = analyze_via_qwen(b64, mime)
            elif GEMINI_KEY:
                result["data"] = analyze_via_gemini(b64, mime)
            else:
                result["data"] = _analyze_via_lm_studio(b64, mime)
        except requests.RequestException as e:
            result["error"] = f"Provider not reachable: {e}"
        except Exception as e:
            result["error"] = str(e)

    # Slow providers (large max_tokens vision calls) can run past ~5 minutes,
    # but browsers abort requests that send no response headers for ~300s
    # ("Failed to fetch"). Stream keepalive whitespace while the provider
    # works — leading whitespace is a valid JSON prefix, and errors travel
    # in-body as {"error": ...}, which the frontend already handles.
    worker = threading.Thread(target=work)
    worker.start()

    def gen():
        while worker.is_alive():
            worker.join(10)
            if worker.is_alive():
                yield " "
        if "error" in result:
            yield json.dumps({"error": result["error"]})
        else:
            yield json.dumps(result.get("data") or {"error": "no result from provider"})

    return Response(gen(), mimetype="application/json")


def get_supabase_config():
    url = os.environ.get("VITE_SUPABASE_URL", "")
    key = os.environ.get("VITE_SUPABASE_ANON_KEY", "")
    if not url or not key:
        env_path = Path(__file__).parent / ".env"
        if env_path.is_file():
            content = env_path.read_text(encoding="utf-8")
            url_match = re.search(r"VITE_SUPABASE_URL\s*=\s*(.+)", content)
            key_match = re.search(r"VITE_SUPABASE_ANON_KEY\s*=\s*(.+)", content)
            if url_match:
                url = url_match.group(1).strip().strip("'\"")
            if key_match:
                key = key_match.group(1).strip().strip("'\"")
    return url, key


def point_in_polygon(x, y, polygon):
    # Transliteration of src/lib/geometry.js pointInPolygon — keep in lockstep.
    # Fixtures in fixtures/geometry-cases.json lock parity between the two.
    if not polygon or len(polygon) < 3:
        return False
    inside = False
    n = len(polygon)
    j = n - 1
    for i in range(n):
        xi = polygon[i].get("x", 0)
        yi = polygon[i].get("y", 0)
        xj = polygon[j].get("x", 0)
        yj = polygon[j].get("y", 0)
        j = i
        if abs(yj - yi) < 1e-12:
            continue
        if (yi > y) != (yj > y) and x < ((xj - xi) * (y - yi)) / (yj - yi) + xi:
            inside = not inside
    return inside


def _polygon_area_norm(polygon):
    # Transliteration of src/lib/geometry.js polygonArea — keep in lockstep.
    if not polygon or len(polygon) < 3:
        return 0.0
    area = 0.0
    n = len(polygon)
    for i in range(n):
        j = (i + 1) % n
        area += polygon[i].get("x", 0) * polygon[j].get("y", 0)
        area -= polygon[j].get("x", 0) * polygon[i].get("y", 0)
    return abs(area) * 0.5


def _room_area_sqm(room, calibration):
    poly = room.get("polygon") or []
    if not poly:
        return None
    norm_area = _polygon_area_norm(poly)
    if not calibration:
        return None
    mm_per_px = calibration.get("mmPerPixel")
    if mm_per_px is None and calibration.get("pointA") and calibration.get("pointB"):
        pa = calibration["pointA"]
        pb = calibration["pointB"]
        length_m = calibration.get("lengthM") or calibration.get("length_m")
        if length_m and pa and pb:
            dx = pb.get("x", 0) - pa.get("x", 0)
            dy = pb.get("y", 0) - pa.get("y", 0)
            dist = (dx * dx + dy * dy) ** 0.5
            if dist > 0:
                mm_per_px = (float(length_m) * 1000.0) / dist
    if not mm_per_px:
        return None
    plan_w = calibration.get("planWidthPx") or 1000
    plan_h = calibration.get("planHeightPx") or 1000
    sq_mm = norm_area * plan_w * plan_h * (float(mm_per_px) ** 2)
    return round(sq_mm / 1_000_000.0, 2)


def _layout_fingerprint(rooms, furniture_list):
    parts = []
    for room in sorted(rooms or [], key=lambda r: str(r.get("id") or "")):
        rt = str(room.get("type") or room.get("name") or room.get("id") or "")
        area = _room_area_sqm(room, None) or round(_polygon_area_norm(room.get("polygon") or []), 4)
        parts.append(f"{rt}:{area}")
    skus = sorted(
        {
            str(f.get("productCode") or f.get("catalog_id") or f.get("catalogId") or "")
            for f in (furniture_list or [])
            if f.get("productCode") or f.get("catalog_id") or f.get("catalogId")
        }
    )
    parts.extend(skus)
    raw = "|".join(parts)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def _furniture_row_from_payload(f, rooms_list, room_client_to_uuid):
    fx = float(f.get("x") or 0)
    fy = float(f.get("y") or 0)
    room_uuid = None
    room_client_id = f.get("roomId")
    if room_client_id and room_client_id in room_client_to_uuid:
        room_uuid = room_client_to_uuid[room_client_id]
    else:
        for r in rooms_list:
            if point_in_polygon(fx, fy, r.get("polygon", [])):
                room_uuid = room_client_to_uuid.get(r.get("id"))
                room_client_id = r.get("id")
                break

    overrides = {}
    if f.get("sofaColorOverride"):
        overrides["sofaColorOverride"] = f.get("sofaColorOverride")
    if f.get("sofaParams"):
        overrides["sofaParams"] = f.get("sofaParams")

    return {
        "room_id": room_uuid,
        "room_client_id": room_client_id,
        "client_id": f.get("id"),
        "catalog_id": f.get("catalogId"),
        "product_code": f.get("productCode") or f.get("catalogId"),
        "x": fx,
        "y": fy,
        "z": float(f.get("z") or 0),
        "rotation_deg": float(f.get("rotationDeg") or 0),
        "stage_source": f.get("stageSource"),
        "placement_source": f.get("placementSource"),
        "category": f.get("category"),
        "color_variant": f.get("colorVariant"),
        "vaastu_adjusted": bool(f.get("vaastuAdjusted")),
        "overrides": overrides if overrides else None,
    }


def _build_layout_snapshots(project_id, tenant_id, rooms_list, furniture_rows, meta, rfq, calibration):
    converted = None
    status = (meta or {}).get("status") or "draft"
    if status == "won":
        converted = True
    elif status == "lost":
        converted = False
    rfq_sent = (rfq or {}).get("status") == "sent" or status == "rfq_sent"
    vaastu = bool((meta or {}).get("vaastuEnabled"))

    snapshots = []
    for room in rooms_list:
        poly = room.get("polygon") or []
        if not poly:
            continue
        client_id = room.get("id")
        placed = []
        mix = {"auto": 0, "manual": 0, "replaced": 0}
        for f in furniture_rows:
            fx = float(f.get("x") or 0)
            fy = float(f.get("y") or 0)
            if f.get("room_client_id") == client_id or point_in_polygon(fx, fy, poly):
                code = f.get("product_code") or f.get("catalog_id")
                if code:
                    placed.append(str(code))
                src = f.get("placement_source") or f.get("stage_source") or "manual"
                if src == "auto_stage" or f.get("stage_source") == "auto":
                    mix["auto"] += 1
                elif src == "replaced":
                    mix["replaced"] += 1
                else:
                    mix["manual"] += 1

        xs = [p.get("x", 0) for p in poly]
        ys = [p.get("y", 0) for p in poly]
        w = max(xs) - min(xs) if xs else 0
        h = max(ys) - min(ys) if ys else 0
        aspect = round(w / h, 3) if h > 0 else None

        snapshots.append({
            "project_id": project_id,
            "tenant_id": tenant_id,
            "room_client_id": client_id,
            "room_type": room.get("type") or room.get("name"),
            "room_area_sqm": _room_area_sqm(room, calibration),
            "room_aspect_ratio": aspect,
            "sku_combo": sorted(set(placed)),
            "placement_mix": mix,
            "vaastu_enabled": vaastu,
            "rfq_sent": rfq_sent,
            "converted": converted,
        })
    return snapshots


def _assemble_furniture_client(f):
    overrides = f.get("overrides") or {}
    return {
        "id": f.get("client_id") or f.get("id"),
        "catalogId": f.get("catalog_id"),
        "productCode": f.get("product_code") or f.get("catalog_id"),
        "roomId": f.get("room_client_id"),
        "x": float(f.get("x") or 0),
        "y": float(f.get("y") or 0),
        "z": float(f.get("z") or 0),
        "rotationDeg": float(f.get("rotation_deg") or 0),
        "stageSource": f.get("stage_source"),
        "placementSource": f.get("placement_source"),
        "category": f.get("category"),
        "colorVariant": f.get("color_variant"),
        "vaastuAdjusted": f.get("vaastu_adjusted"),
        "sofaColorOverride": overrides.get("sofaColorOverride"),
        "sofaParams": overrides.get("sofaParams"),
    }


@app.route("/api/projects/<project_id>", methods=["GET"])
def get_project(project_id):
    sb_url, sb_key = get_supabase_config()
    if not sb_url or not sb_key:
        return jsonify({"error": "Supabase credentials not configured in environment or .env"}), 500

    headers = {
        "apikey": sb_key,
        "Authorization": f"Bearer {sb_key}",
        "Content-Type": "application/json"
    }

    try:
        # Fetch project
        proj_req = requests.get(f"{sb_url}/rest/v1/projects?id=eq.{project_id}", headers=headers)
        if not proj_req.ok:
            return jsonify({"error": f"Failed to fetch project: {proj_req.text}"}), proj_req.status_code
        proj_data = proj_req.json()
        if not proj_data:
            return jsonify({"error": "Project not found"}), 404
        project = proj_data[0]

        # Fetch rooms
        rooms_req = requests.get(f"{sb_url}/rest/v1/rooms?project_id=eq.{project_id}", headers=headers)
        rooms_data = rooms_req.json() if rooms_req.ok else []

        # Fetch structural elements
        struct_req = requests.get(f"{sb_url}/rest/v1/structural_elements?project_id=eq.{project_id}", headers=headers)
        struct_data = struct_req.json() if struct_req.ok else []

        # Fetch placed furniture
        furn_req = requests.get(f"{sb_url}/rest/v1/placed_furniture?project_id=eq.{project_id}", headers=headers)
        furn_data = furn_req.json() if furn_req.ok else []

        # Map back to client format
        rooms = []
        for r in rooms_data:
            rooms.append({
                "id": r.get("client_id") or r.get("id"),
                "name": r.get("name"),
                "type": r.get("type"),
                "flooring": r.get("flooring"),
                "polygon": r.get("polygon"),
                "labelPoint": r.get("label_point"),
                "dimensions": r.get("dimensions_text"),
                "area": r.get("area")
            })

        walls = []
        doors = []
        windows = []
        for s in struct_data:
            kind = s.get("kind")
            client_id = s.get("client_id") or s.get("id")
            if kind == "wall":
                walls.append({
                    "id": client_id,
                    "points": s.get("geometry"),
                    "thickness": s.get("thickness")
                })
            elif kind == "door":
                doors.append({
                    "id": client_id,
                    "polygon": s.get("geometry"),
                    "connects": s.get("connects")
                })
            elif kind == "window":
                windows.append({
                    "id": client_id,
                    "polygon": s.get("geometry")
                })

        furniture = []
        for f in furn_data:
            furniture.append(_assemble_furniture_client(f))

        meta = project.get("meta") or {}
        if not meta:
            meta = {
                "tenantId": project.get("tenant_id"),
                "showroomId": project.get("showroom_id"),
                "sessionId": project.get("session_id"),
                "source": project.get("source"),
                "vaastuEnabled": project.get("vaastu_enabled"),
                "planImageUrl": project.get("plan_image_url"),
                "status": project.get("status") or "draft",
            }
        rfq = project.get("rfq") or {"items": [], "status": "draft"}

        # Assemble viewer JSON
        assembled = {
            "analysisVersion": "2.0",
            "label": project.get("name"),
            "calibration": project.get("calibration"),
            "meta": meta,
            "rfq": rfq,
            "rooms": rooms,
            "walls": walls,
            "doors": doors,
            "windows": windows,
            "furniture": furniture,
        }
        return jsonify(assembled)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/projects/<project_id>", methods=["PUT"])
def save_project(project_id):
    sb_url, sb_key = get_supabase_config()
    if not sb_url or not sb_key:
        return jsonify({"error": "Supabase credentials not configured in environment or .env"}), 500

    payload = request.json or {}
    name = payload.get("label") or "Project"
    calibration = payload.get("calibration")
    meta = payload.get("meta") or {}
    rfq = payload.get("rfq") or {}
    events = payload.get("events") or []
    tenant_id = meta.get("tenantId") or meta.get("tenant_id")
    status = meta.get("status") or rfq.get("status") or "draft"
    if rfq.get("status") == "sent":
        status = "rfq_sent"

    headers = {
        "apikey": sb_key,
        "Authorization": f"Bearer {sb_key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }

    try:
        # Check if project exists
        proj_req = requests.get(f"{sb_url}/rest/v1/projects?id=eq.{project_id}", headers=headers)
        project_exists = proj_req.ok and len(proj_req.json()) > 0

        fingerprint = _layout_fingerprint(payload.get("rooms", []), payload.get("furniture", []))

        # Upsert project
        project_body = {
            "id": project_id,
            "name": name,
            "calibration": calibration,
            "tenant_id": tenant_id,
            "showroom_id": meta.get("showroomId") or meta.get("showroom_id"),
            "session_id": meta.get("sessionId") or meta.get("session_id"),
            "source": meta.get("source") or "showroom_ipad",
            "vaastu_enabled": bool(meta.get("vaastuEnabled")),
            "plan_image_url": meta.get("planImageUrl") or meta.get("plan_image_url"),
            "layout_fingerprint": fingerprint,
            "status": status,
            "meta": meta,
            "rfq": rfq,
            "updated_at": meta.get("savedAt"),
        }
        if project_exists:
            upsert_req = requests.patch(f"{sb_url}/rest/v1/projects?id=eq.{project_id}", json=project_body, headers=headers)
        else:
            upsert_req = requests.post(f"{sb_url}/rest/v1/projects", json=project_body, headers=headers)

        if not upsert_req.ok:
            return jsonify({"error": f"Failed to save project: {upsert_req.text}"}), upsert_req.status_code

        # Clear existing elements to replace them in a single transaction-like sequence
        requests.delete(f"{sb_url}/rest/v1/layout_snapshots?project_id=eq.{project_id}", headers=headers)
        requests.delete(f"{sb_url}/rest/v1/rooms?project_id=eq.{project_id}", headers=headers)
        requests.delete(f"{sb_url}/rest/v1/structural_elements?project_id=eq.{project_id}", headers=headers)
        requests.delete(f"{sb_url}/rest/v1/placed_furniture?project_id=eq.{project_id}", headers=headers)

        # Save rooms
        rooms_list = payload.get("rooms", [])
        room_client_to_uuid = {}
        if rooms_list:
            insert_rooms = []
            for r in rooms_list:
                insert_rooms.append({
                    "project_id": project_id,
                    "client_id": r.get("id"),
                    "name": r.get("name"),
                    "type": r.get("type"),
                    "flooring": r.get("flooring"),
                    "polygon": r.get("polygon"),
                    "label_point": r.get("labelPoint"),
                    "dimensions_text": r.get("dimensions"),
                    "area": r.get("area")
                })
            r_res = requests.post(f"{sb_url}/rest/v1/rooms", json=insert_rooms, headers=headers)
            if r_res.ok:
                for db_room in r_res.json():
                    client_id = db_room.get("client_id")
                    if client_id:
                        room_client_to_uuid[client_id] = db_room.get("id")

        # Save structural elements (walls, doors, windows)
        structs = []
        for w in payload.get("walls", []):
            structs.append({
                "project_id": project_id,
                "client_id": w.get("id"),
                "kind": "wall",
                "geometry": w.get("points"),
                "thickness": w.get("thickness")
            })
        for d in payload.get("doors", []):
            structs.append({
                "project_id": project_id,
                "client_id": d.get("id"),
                "kind": "door",
                "geometry": d.get("polygon"),
                "connects": d.get("connects")
            })
        for win in payload.get("windows", []):
            structs.append({
                "project_id": project_id,
                "client_id": win.get("id"),
                "kind": "window",
                "geometry": win.get("polygon")
            })
        if structs:
            requests.post(f"{sb_url}/rest/v1/structural_elements", json=structs, headers=headers)

        # Save furniture with moat fields
        furnitures = []
        for f in payload.get("furniture", []):
            row = _furniture_row_from_payload(f, rooms_list, room_client_to_uuid)
            row["project_id"] = project_id
            furnitures.append(row)
        if furnitures:
            requests.post(f"{sb_url}/rest/v1/placed_furniture", json=furnitures, headers=headers)

        # Append-only plan events
        event_rows = []
        for ev in events:
            if not isinstance(ev, dict):
                continue
            event_type = ev.get("eventType") or ev.get("event_type")
            if not event_type:
                continue
            event_rows.append({
                "project_id": project_id,
                "tenant_id": tenant_id,
                "event_type": event_type,
                "payload": ev.get("payload") or {},
            })
        if event_rows:
            requests.post(f"{sb_url}/rest/v1/plan_events", json=event_rows, headers=headers)

        # Layout snapshots (recommendation flywheel)
        snapshots = _build_layout_snapshots(
            project_id, tenant_id, rooms_list, furnitures, meta, rfq, calibration
        )
        if snapshots:
            requests.post(f"{sb_url}/rest/v1/layout_snapshots", json=snapshots, headers=headers)

        return jsonify({"success": True, "projectId": project_id, "layoutFingerprint": fingerprint})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/projects/dataset-export", methods=["GET"])
def dataset_export():
    sb_url, sb_key = get_supabase_config()
    if not sb_url or not sb_key:
        return jsonify({"error": "Supabase credentials not configured in environment or .env"}), 500

    headers = {
        "apikey": sb_key,
        "Authorization": f"Bearer {sb_key}",
        "Content-Type": "application/json"
    }

    try:
        snap_req = requests.get(
            f"{sb_url}/rest/v1/layout_snapshots?order=created_at.desc",
            headers=headers,
        )
        if snap_req.ok and snap_req.json():
            rows = []
            for snap in snap_req.json():
                rows.append({
                    "project_id": snap.get("project_id"),
                    "tenant_id": snap.get("tenant_id"),
                    "room_client_id": snap.get("room_client_id"),
                    "room_type": snap.get("room_type"),
                    "room_area_sqm": snap.get("room_area_sqm"),
                    "room_aspect_ratio": snap.get("room_aspect_ratio"),
                    "sku_combo": snap.get("sku_combo"),
                    "placement_mix": snap.get("placement_mix"),
                    "vaastu_enabled": snap.get("vaastu_enabled"),
                    "rfq_sent": snap.get("rfq_sent"),
                    "converted": snap.get("converted"),
                    "created_at": snap.get("created_at"),
                })
            return jsonify(rows)

        # Fallback: legacy export from relational tables
        proj_req = requests.get(f"{sb_url}/rest/v1/projects", headers=headers)
        if not proj_req.ok:
            return jsonify({"error": proj_req.text}), proj_req.status_code
        projects = proj_req.json()

        # Batch-fetch rooms and furniture for all projects (chunked to keep
        # the in.(...) query string under URL length limits).
        project_ids = [p.get("id") for p in projects if p.get("id")]
        rooms_by_project = defaultdict(list)
        furniture_by_project = defaultdict(list)
        for i in range(0, len(project_ids), 100):
            chunk = ",".join(str(pid) for pid in project_ids[i:i + 100])
            rooms_req = requests.get(
                f"{sb_url}/rest/v1/rooms?project_id=in.({chunk})", headers=headers
            )
            for room in (rooms_req.json() if rooms_req.ok else []):
                rooms_by_project[room.get("project_id")].append(room)
            furn_req = requests.get(
                f"{sb_url}/rest/v1/placed_furniture?project_id=in.({chunk})", headers=headers
            )
            for f in (furn_req.json() if furn_req.ok else []):
                furniture_by_project[f.get("project_id")].append(f)

        def _placement(f):
            return {
                "catalog_id": f.get("catalog_id"),
                "product_code": f.get("product_code"),
                "x": float(f.get("x") or 0),
                "y": float(f.get("y") or 0),
                "z": float(f.get("z") or 0),
                "rotation_deg": float(f.get("rotation_deg") or 0),
                "stage_source": f.get("stage_source"),
                "placement_source": f.get("placement_source"),
                "overrides": f.get("overrides")
            }

        export_rows = []
        for proj in projects:
            p_id = proj.get("id")
            tenant_id = proj.get("tenant_id")

            rooms = rooms_by_project.get(p_id, [])
            furniture = furniture_by_project.get(p_id, [])

            # Bucket furniture by its saved room tag; only untagged rows need
            # the point-in-polygon fallback (same pattern as _build_layout_snapshots).
            furniture_by_room_client = defaultdict(list)
            untagged = []
            for f in furniture:
                rcid = f.get("room_client_id")
                if rcid:
                    furniture_by_room_client[rcid].append(f)
                else:
                    untagged.append(f)

            for room in rooms:
                poly = room.get("polygon")
                if not poly:
                    continue

                placed_inside = [
                    _placement(f)
                    for f in furniture_by_room_client.get(room.get("client_id"), [])
                ]
                for f in untagged:
                    fx = float(f.get("x") or 0)
                    fy = float(f.get("y") or 0)
                    if point_in_polygon(fx, fy, poly):
                        placed_inside.append(_placement(f))

                export_rows.append({
                    "project_id": p_id,
                    "tenant_id": tenant_id,
                    "project_name": proj.get("name"),
                    "project_status": proj.get("status"),
                    "layout_fingerprint": proj.get("layout_fingerprint"),
                    "vaastu_enabled": proj.get("vaastu_enabled"),
                    "room_id": room.get("id"),
                    "room_name": room.get("name"),
                    "room_type": room.get("type"),
                    "room_polygon": poly,
                    "furniture_placements": placed_inside
                })

        return jsonify(export_rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/", methods=["GET"])
def index():
    return serve_index()


@app.route("/manufacturer", methods=["GET"])
def manufacturer():
    return serve_index("manufacturer.html")


@app.route("/gallery", methods=["GET"])
def gallery():
    return serve_index("gallery.html")


@app.route("/assets/<path:filename>", methods=["GET"])
def assets(filename):
    return send_from_directory(DIST_DIR / "assets", filename)


@app.route("/fixtures/<path:filename>", methods=["GET"])
def fixtures(filename):
    return send_from_directory(DIST_DIR / "fixtures", filename)


@app.route("/models/<path:filename>", methods=["GET"])
def models(filename):
    return send_from_directory(DIST_DIR / "models", filename)


@app.route("/draco/<path:filename>", methods=["GET"])
def draco(filename):
    return send_from_directory(DIST_DIR / "draco", filename)


@app.route("/<path:_path>", methods=["GET"])
def spa_fallback(_path):
    return serve_index()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5173"))
    print(f"Floor plan viewer http://127.0.0.1:{port}")
    if ANTHROPIC_KEY:
        print(f"Analyze API http://127.0.0.1:{port}/api/analyze -> Anthropic {ANTHROPIC_MODEL}")
    elif QWEN_LLM_KEY:
        print(f"Analyze API http://127.0.0.1:{port}/api/analyze -> Qwen {QWEN_LLM_MODEL}")
    elif GEMINI_KEY:
        print(f"Analyze API http://127.0.0.1:{port}/api/analyze -> Gemini {GEMINI_MODEL}")
    else:
        print(f"Analyze API http://127.0.0.1:{port}/api/analyze -> LM {LM_BASE}")
        print(f"LM Studio model: {MODEL} (edit lm_studio.json to change; overrides shell env)")
    app.run(host="127.0.0.1", port=port, debug=False)
