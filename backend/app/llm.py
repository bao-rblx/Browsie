"""LLM clients implementing domain.engine.LLMClient.

- GeminiClient: real Google Gemini (key from server env only).
- MockLLM: deterministic, offline — used when no key is set, and in tests/dev.
"""
from __future__ import annotations

import json
import logging
from typing import Optional

from .config import settings
from .domain.default_rules import default_ruleset
from .domain.engine import LLMResult
from .domain.models import CATEGORY_TO_LABEL, Label

log = logging.getLogger(__name__)

PROMPT_VERSION = "p2"  # p2: rationale written in the user's UI language

_LANG_NAME = {"vi": "Vietnamese", "en": "English"}


def _lang_line(lang: str) -> str:
    return f"\nWrite the rationale in {_LANG_NAME.get(lang, 'Vietnamese')}."


_SYSTEM = (
    "You are Browsie, a content-safety classifier for a browser extension. "
    "Classify the content into exactly one label: BENIGN, SPAM, FAKE_NEWS, GAMBLING_AD. "
    "SPAM = unsolicited ads, scams, get-rich-quick, phishing, low-quality AI slop. "
    "FAKE_NEWS = fabricated or unsourced sensational claims, health misinformation. "
    "GAMBLING_AD = promotion of betting, casinos, 'nhà cái', 'kèo', tài xỉu, nổ hũ (including text inside images). "
    "Content may be Vietnamese or English. Be conservative: ordinary news, opinion, and normal ads for "
    "legal products are BENIGN. Return JSON only: "
    '{"label": "...", "confidence": 0.0-1.0, "rationale": "one short sentence for the user"}.'
)

_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "label": {"type": "STRING", "enum": ["BENIGN", "SPAM", "FAKE_NEWS", "GAMBLING_AD"]},
        "confidence": {"type": "NUMBER"},
        "rationale": {"type": "STRING"},
    },
    "required": ["label", "confidence", "rationale"],
}


def _parse(raw: str, model: str) -> LLMResult:
    data = json.loads(raw)
    label = Label(str(data["label"]).upper())
    if label == Label.UNKNOWN:
        label = Label.BENIGN
    return LLMResult(label, float(data["confidence"]), str(data["rationale"])[:300], model)


class GeminiClient:
    def __init__(self, api_key: str, model: str, timeout_s: float) -> None:
        from google import genai
        from google.genai import types

        self._types = types
        self.model = model
        self._client = genai.Client(api_key=api_key,
                                    http_options=types.HttpOptions(timeout=int(timeout_s * 1000)))

    def _call(self, contents: list) -> LLMResult:
        cfg = self._types.GenerateContentConfig(
            system_instruction=_SYSTEM,
            response_mime_type="application/json",
            response_schema=_SCHEMA,
            temperature=0.0,
        )
        resp = self._client.models.generate_content(model=self.model, contents=contents, config=cfg)
        return _parse(resp.text, self.model)

    def analyze_text(self, text: str, rule_score: float, lang: str = "vi") -> LLMResult:
        prompt = (f"Rule pre-filter score: {rule_score:.2f} (0=clean, 1=very suspicious; a hint, not proof).\n"
                  f"Page text:\n<<<\n{text}\n>>>" + _lang_line(lang))
        return self._call([prompt])

    def analyze_image(self, image_bytes: Optional[bytes], mime_type: str, ocr_text: str,
                      lang: str = "vi") -> LLMResult:
        parts: list = []
        if image_bytes:
            parts.append(self._types.Part.from_bytes(data=image_bytes, mime_type=mime_type))
        ocr = ocr_text.strip() or "(none — OCR found no text; judge from the image itself)"
        parts.append(f"Classify this image. OCR text extracted from it:\n<<<\n{ocr}\n>>>" + _lang_line(lang))
        return self._call(parts)


class MockLLM:
    """Offline stand-in: classifies with the default rules so the full pipeline runs without a key."""

    model = "mock-1"

    def __init__(self) -> None:
        self._rules = default_ruleset()

    _CAT_NAME = {
        "vi": {"SPAM": "nội dung rác", "FAKE_NEWS": "tin giả", "GAMBLING": "cờ bạc"},
        "en": {"SPAM": "spam", "FAKE_NEWS": "fake news", "GAMBLING": "gambling"},
    }

    def _classify(self, text: str, lang: str = "vi") -> LLMResult:
        vi = lang != "en"
        cat = self._rules.dominant_category(text)
        if cat is None:
            why = "[mock] Không thấy nội dung đáng ngờ" if vi else "[mock] No suspicious content found"
            return LLMResult(Label.BENIGN, 0.8, why, self.model)
        score = self._rules.score(text)
        name = self._CAT_NAME["vi" if vi else "en"][cat.value]
        why = f"[mock] Khớp mẫu {name}" if vi else f"[mock] Matched {name} patterns"
        return LLMResult(CATEGORY_TO_LABEL[cat], max(0.65, score), why, self.model)

    def analyze_text(self, text: str, rule_score: float, lang: str = "vi") -> LLMResult:
        return self._classify(text, lang)

    def analyze_image(self, image_bytes: Optional[bytes], mime_type: str, ocr_text: str,
                      lang: str = "vi") -> LLMResult:
        return self._classify(ocr_text, lang)


def build_llm():
    if settings.llm_provider == "gemini":
        if not settings.gemini_api_key:
            raise RuntimeError("LLM_PROVIDER=gemini but GEMINI_API_KEY is not set")
        log.info("Using Gemini model %s", settings.gemini_model)
        return GeminiClient(settings.gemini_api_key, settings.gemini_model, settings.llm_timeout_s)
    log.warning("Using MockLLM (no GEMINI_API_KEY). Set it in backend/.env for real analysis.")
    return MockLLM()
