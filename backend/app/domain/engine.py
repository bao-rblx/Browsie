"""DetectionEngine — the policy layer that implements BR-01..BR-08.

The LLM is injected behind a tiny protocol, so every business rule can be
tested with a fake LLM (see tests/test_business_rules.py).
"""
from __future__ import annotations

import copy
import logging
from dataclasses import dataclass
from typing import Iterable, Optional, Protocol

from .cache import VerdictCache
from .messages import msg, resolve_lang
from .models import (
    CATEGORY_TO_LABEL,
    AllowlistEntry,
    DetectionRequest,
    Label,
    RuleSet,
    SensitivityProfile,
    SourceType,
    Verdict,
)

log = logging.getLogger(__name__)


@dataclass
class LLMResult:
    label: Label
    confidence: float
    rationale: str
    model_version: str


class LLMClient(Protocol):
    """`lang` is the language the rationale should be written in ("vi" or "en")."""

    def analyze_text(self, text: str, rule_score: float, lang: str = "vi") -> LLMResult: ...

    def analyze_image(self, image_bytes: Optional[bytes], mime_type: str, ocr_text: str,
                      lang: str = "vi") -> LLMResult: ...


class DetectionEngine:
    def __init__(self, ruleset: RuleSet, llm: LLMClient, cache: Optional[VerdictCache] = None) -> None:
        self.ruleset = ruleset
        self.llm = llm
        # Explicit None check: an empty VerdictCache is falsy (it defines __len__).
        self.cache = cache if cache is not None else VerdictCache()

    def analyze(
        self,
        request: DetectionRequest,
        profile: SensitivityProfile,
        allowlist: Iterable[AllowlistEntry] = (),
        image_bytes: Optional[bytes] = None,
        mime_type: str = "image/png",
        lang: str = "vi",
    ) -> Verdict:
        lang = resolve_lang(lang)

        # BR-03 — allowlist precedence: nothing else runs.
        host = request.domain
        if host and any(entry.covers(host) for entry in allowlist):
            return Verdict(Label.BENIGN, 1.0, msg(lang, "allowlisted", host=host), model_version="allowlist")

        # BR-06 — cache.
        # Key includes sensitivity (a verdict gated at LOW must not be reused at HIGH)
        # and language (the rationale is written in the user's language).
        key = f"{profile.level.value}:{lang}:{request.hash()}"
        cached = self.cache.get(key)
        if cached is not None:
            hit = copy.copy(cached)
            hit.cache_hit = True
            hit.llm_called = False
            return hit

        scored_text = request.raw_content if request.source_type == SourceType.TEXT else request.ocr_text
        rule_score = self.ruleset.score(scored_text)
        hard_gambling = self.ruleset.has_hard_gambling_hit(scored_text)
        is_image = request.source_type == SourceType.IMAGE

        # BR-05 — gambling override on the text path: flag immediately, no LLM needed.
        if hard_gambling and not is_image:
            verdict = Verdict(Label.GAMBLING_AD, 1.0, msg(lang, "gambling_text"), rule_score=rule_score)
            self.cache.put(key, verdict, request.source_type)
            return verdict

        # BR-02 — rule gate (text only). BR-01 — image path is never gated.
        if not is_image and rule_score < profile.rule_threshold:
            verdict = Verdict(Label.BENIGN, 1.0 - rule_score, msg(lang, "no_suspicious"), rule_score=rule_score)
            self.cache.put(key, verdict, request.source_type)
            return verdict

        # LLM call. BR-07 — image with empty OCR still goes to the vision model.
        try:
            if is_image:
                result = self.llm.analyze_image(image_bytes, mime_type, request.ocr_text, lang=lang)
            else:
                result = self.llm.analyze_text(request.raw_content, rule_score, lang=lang)
        except Exception as exc:  # BR-08 — never a false BENIGN; don't cache failures.
            log.warning("LLM call failed: %s", exc)
            # BR-05 still holds for images even if the LLM is down.
            if hard_gambling:
                return Verdict(Label.GAMBLING_AD, 1.0, msg(lang, "gambling_image"),
                               model_version="rules", llm_called=True, rule_score=rule_score)
            return Verdict(Label.UNKNOWN, 0.0, msg(lang, "unavailable"), model_version="fallback",
                           llm_called=True, rule_score=rule_score)

        verdict = Verdict(result.label, result.confidence, result.rationale,
                          model_version=result.model_version, llm_called=True, rule_score=rule_score)

        # BR-04 — low-confidence downgrade (keep rationale).
        if verdict.label not in (Label.BENIGN, Label.UNKNOWN) and verdict.confidence < profile.llm_threshold:
            verdict.label = Label.UNKNOWN

        # BR-05 — gambling override on the image path (safety bias over the LLM).
        if hard_gambling and verdict.label != Label.GAMBLING_AD:
            verdict = Verdict(Label.GAMBLING_AD, 1.0, msg(lang, "gambling_image_llm", llm=result.rationale),
                              model_version=result.model_version, llm_called=True, rule_score=rule_score)

        self.cache.put(key, verdict, request.source_type)
        return verdict

    def rule_label(self, text: str) -> Label:
        """Rule-only label — used by the ablation in the evaluation script."""
        cat = self.ruleset.dominant_category(text)
        return CATEGORY_TO_LABEL[cat] if cat else Label.BENIGN
