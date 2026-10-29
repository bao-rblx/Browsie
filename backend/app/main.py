"""FastAPI backend (F-08): Gemini proxy, rule engine, logging, health & config.

Run:  uvicorn app.main:app --reload --port 8000
"""
from __future__ import annotations

import base64
import binascii
import hashlib
import logging
import threading
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import db
from .config import settings
from .domain.engine import DetectionEngine
from .domain.models import AllowlistEntry, DetectionRequest, SensitivityLevel, SensitivityProfile, SourceType
from .llm import PROMPT_VERSION, build_llm

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("browsie")

state: dict = {}


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init_db()
    state["engine"] = DetectionEngine(db.load_ruleset(), build_llm())
    yield


app = FastAPI(title="Browsie API", version="0.1.0", lifespan=lifespan)

# Extension origins look like chrome-extension://<32 chars>. Wildcards aren't valid in allow_origins,
# so match them with a regex; explicit origins from CORS_ORIGINS are allowed as-is.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in settings.cors_origins if "*" not in o],
    allow_origin_regex=r"^chrome-extension://[a-p]{32}$",
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-Browsie-Token"],
)


# ---------- security: shared token + per-client rate limit ----------

_hits: dict[str, deque] = defaultdict(deque)
_hits_lock = threading.Lock()


def guard(request: Request, x_browsie_token: str = Header(default="")) -> None:
    if settings.api_token and x_browsie_token != settings.api_token:
        raise HTTPException(401, "Invalid or missing X-Browsie-Token")
    key = request.client.host if request.client else "unknown"
    now = time.monotonic()
    with _hits_lock:
        q = _hits[key]
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= settings.rate_limit_per_min:
            raise HTTPException(429, "Rate limit exceeded")
        q.append(now)


# ---------- schemas ----------

class Common(BaseModel):
    url: str = Field(default="", max_length=2048)
    sensitivity: SensitivityLevel = SensitivityLevel.MEDIUM
    lang: Literal["vi", "en"] = "vi"   # language of the rationale returned to the user
    allowlist: list[str] = Field(default_factory=list, max_length=500)


class TextIn(Common):
    text: str = Field(min_length=1)


class ImageIn(Common):
    imageBase64: str = Field(default="", description="Raw base64 or a data: URL")
    mimeType: str = "image/png"
    ocrText: str = Field(default="", max_length=8000)


def _allowlist(domains: list[str]) -> list[AllowlistEntry]:
    out = []
    for d in domains:
        try:
            out.append(AllowlistEntry(d))
        except ValueError:
            pass  # silently ignore malformed entries from the client
    return out


def _decode_image(b64: str, mime: str) -> tuple[bytes | None, str]:
    if not b64:
        return None, mime
    if b64.startswith("data:"):
        header, _, b64 = b64.partition(",")
        mime = header[5:].split(";")[0] or mime
    if not mime.startswith("image/"):
        raise HTTPException(415, "Only image/* payloads are accepted")
    try:
        data = base64.b64decode(b64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(400, "imageBase64 is not valid base64")
    if len(data) > settings.max_image_bytes:
        raise HTTPException(413, "Image too large")
    return data, mime


def _log(req: DetectionRequest, verdict, latency_ms: float) -> None:
    try:
        with db.SessionLocal() as s:
            s.add(db.DetectionLog(
                source_type=req.source_type.value, label=verdict.label.value, confidence=verdict.confidence,
                url_hash=db.hash_domain(req.domain), llm_called=verdict.llm_called,
                cache_hit=verdict.cache_hit, latency_ms=latency_ms, model_version=verdict.model_version))
            s.commit()
    except Exception as exc:  # logging must never break detection
        log.warning("detection log failed: %s", exc)


# ---------- routes ----------

@app.get("/health")
def health():
    eng: DetectionEngine = state["engine"]
    db_status = db.check_db_health()
    is_healthy = db_status.get("status") == "connected"
    return {
        "status": "ok" if is_healthy else "degraded",
        "llm": getattr(eng.llm, "model", "unknown"),
        "rulesetVersion": eng.ruleset.version,
        "database": db_status,
    }


@app.get("/config")
def config():
    eng: DetectionEngine = state["engine"]
    return {
        "rulesetVersion": eng.ruleset.version,
        "promptVersion": PROMPT_VERSION,
        "maxTextChars": settings.max_text_chars,
        "maxImageBytes": settings.max_image_bytes,
        "sensitivity": {lvl.value: {"ruleThreshold": p.rule_threshold, "llmThreshold": p.llm_threshold}
                        for lvl in SensitivityLevel for p in [SensitivityProfile.for_level(lvl)]},
        # Rules are shipped to the extension so it can pre-filter locally (only flagged chunks are sent).
        "rules": [{"id": r.id, "pattern": r.pattern, "weight": r.weight, "category": r.category.value}
                  for r in eng.ruleset.rules if r.enabled],
    }


@app.post("/analyze-text", dependencies=[Depends(guard)])
def analyze_text(body: TextIn):
    t0 = time.perf_counter()
    req = DetectionRequest(SourceType.TEXT, body.text[: settings.max_text_chars], url=body.url)
    verdict = state["engine"].analyze(req, SensitivityProfile.for_level(body.sensitivity),
                                      _allowlist(body.allowlist), lang=body.lang)
    ms = (time.perf_counter() - t0) * 1000
    _log(req, verdict, ms)
    return {**verdict.to_dict(), "requestId": req.id, "latencyMs": round(ms, 1)}


@app.post("/analyze-image", dependencies=[Depends(guard)])
def analyze_image(body: ImageIn):
    t0 = time.perf_counter()
    image, mime = _decode_image(body.imageBase64, body.mimeType)
    if image is None and not body.ocrText.strip():
        raise HTTPException(400, "Provide imageBase64 and/or ocrText")
    # Hash the image bytes (not the base64 string) so data-URL vs raw base64 share a cache entry.
    digest = hashlib.sha256(image or b"").hexdigest()
    req = DetectionRequest(SourceType.IMAGE, digest, ocr_text=body.ocrText, url=body.url, user_initiated=True)
    verdict = state["engine"].analyze(req, SensitivityProfile.for_level(body.sensitivity),
                                      _allowlist(body.allowlist), image_bytes=image, mime_type=mime,
                                      lang=body.lang)
    ms = (time.perf_counter() - t0) * 1000
    _log(req, verdict, ms)
    return {**verdict.to_dict(), "requestId": req.id, "latencyMs": round(ms, 1)}
