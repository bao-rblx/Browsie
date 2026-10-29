"""Domain model (proposal §2.2.2): 7 classes + enumerations.

Pure Python, no I/O — everything here is unit-testable without an LLM.
"""
from __future__ import annotations

import hashlib
import re
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class SourceType(str, Enum):
    TEXT = "TEXT"
    IMAGE = "IMAGE"


class Label(str, Enum):
    BENIGN = "BENIGN"
    SPAM = "SPAM"
    FAKE_NEWS = "FAKE_NEWS"
    GAMBLING_AD = "GAMBLING_AD"
    UNKNOWN = "UNKNOWN"


class RuleCategory(str, Enum):
    SPAM = "SPAM"
    FAKE_NEWS = "FAKE_NEWS"
    GAMBLING = "GAMBLING"


class SensitivityLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


CATEGORY_TO_LABEL = {
    RuleCategory.SPAM: Label.SPAM,
    RuleCategory.FAKE_NEWS: Label.FAKE_NEWS,
    RuleCategory.GAMBLING: Label.GAMBLING_AD,
}


@dataclass
class DetectionRequest:
    source_type: SourceType
    raw_content: str = ""          # page text, or image dataURL/URL for IMAGE
    ocr_text: str = ""
    url: str = ""
    id: str = field(default_factory=lambda: uuid.uuid4().hex)
    timestamp: float = field(default_factory=time.time)
    user_initiated: bool = False   # True when triggered from the context menu

    def hash(self) -> str:
        """Content hash used as the cache key (BR-06). URL is not included so the
        same content on different pages shares a verdict."""
        h = hashlib.sha256()
        h.update(self.source_type.value.encode())
        h.update(b"\x00")
        h.update(self.raw_content.encode("utf-8", "ignore"))
        h.update(b"\x00")
        h.update(self.ocr_text.encode("utf-8", "ignore"))
        return h.hexdigest()

    @property
    def domain(self) -> str:
        m = re.match(r"^[a-z][a-z0-9+.-]*://([^/:?#]+)", self.url.strip().lower())
        return m.group(1) if m else ""


@dataclass
class Verdict:
    label: Label
    confidence: float
    rationale: str
    model_version: str = "rules"
    created_at: float = field(default_factory=time.time)
    cache_hit: bool = False
    llm_called: bool = False
    rule_score: float = 0.0

    def __post_init__(self) -> None:
        self.confidence = max(0.0, min(1.0, float(self.confidence)))

    def is_positive(self) -> bool:
        return self.label not in (Label.BENIGN, Label.UNKNOWN)

    def to_dict(self) -> dict:
        return {
            "label": self.label.value,
            "confidence": round(self.confidence, 4),
            "rationale": self.rationale,
            "modelVersion": self.model_version,
            "createdAt": self.created_at,
            "cacheHit": self.cache_hit,
            "llmCalled": self.llm_called,
            "ruleScore": round(self.rule_score, 4),
        }

    @classmethod
    def unavailable(cls) -> "Verdict":
        """BR-08: never a false BENIGN when the backend/LLM fails."""
        return cls(Label.UNKNOWN, 0.0, "Service unavailable — tap to retry", model_version="fallback")


@dataclass
class Rule:
    id: str
    pattern: str
    weight: float
    category: RuleCategory
    enabled: bool = True
    _compiled: Optional[re.Pattern] = field(default=None, init=False, repr=False, compare=False)

    def __post_init__(self) -> None:
        if not 0.0 <= self.weight <= 1.0:
            raise ValueError(f"Rule {self.id}: weight must be in [0,1]")
        self._compiled = re.compile(self.pattern, re.IGNORECASE | re.UNICODE)

    def matches(self, text: str) -> bool:
        return self.enabled and bool(text) and self._compiled.search(text) is not None


@dataclass
class RuleSet:
    id: str
    name: str
    version: str
    rules: list[Rule] = field(default_factory=list)

    def matching(self, text: str) -> list[Rule]:
        return [r for r in self.rules if r.matches(text)]

    def score(self, text: str) -> float:
        """Combine matched weights as independent evidence: 1 - Π(1 - w).
        Monotonic, bounded to [0,1], and a single weight-1.0 hit yields 1.0."""
        remaining = 1.0
        for r in self.matching(text):
            remaining *= 1.0 - r.weight
        return 1.0 - remaining

    def dominant_category(self, text: str) -> Optional[RuleCategory]:
        totals: dict[RuleCategory, float] = {}
        for r in self.matching(text):
            totals[r.category] = totals.get(r.category, 0.0) + r.weight
        return max(totals, key=totals.get) if totals else None

    def has_hard_gambling_hit(self, text: str) -> bool:
        """BR-05: a gambling rule with weight == 1.0 matched."""
        return any(r.category == RuleCategory.GAMBLING and r.weight >= 1.0 for r in self.matching(text))


_DOMAIN_RE = re.compile(r"^(?=.{1,253}$)(\*\.)?([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")


@dataclass
class AllowlistEntry:
    domain: str
    added_at: float = field(default_factory=time.time)
    reason: str = ""

    def __post_init__(self) -> None:
        self.domain = self.domain.strip().lower()
        if not self.is_valid_domain(self.domain):
            raise ValueError(f"Invalid domain: {self.domain!r}")

    @staticmethod
    def is_valid_domain(domain: str) -> bool:
        return bool(_DOMAIN_RE.match(domain.strip().lower()))

    def covers(self, host: str) -> bool:
        """Exact host or any subdomain ('example.com' covers 'news.example.com')."""
        host = host.lower()
        base = self.domain[2:] if self.domain.startswith("*.") else self.domain
        return host == base or host.endswith("." + base)


@dataclass
class DetectionHistory:
    entries: list[dict] = field(default_factory=list)
    max_size: int = 100

    def add(self, request: DetectionRequest, verdict: Verdict) -> None:
        self.entries.insert(0, {
            "id": request.id,
            "timestamp": request.timestamp,
            "sourceType": request.source_type.value,
            "url": request.url,
            **verdict.to_dict(),
        })
        del self.entries[self.max_size:]

    def clear(self) -> None:
        self.entries.clear()

    def to_json(self) -> list[dict]:
        return list(self.entries)


@dataclass(frozen=True)
class SensitivityProfile:
    level: SensitivityLevel
    rule_threshold: float
    llm_threshold: float
    ocr_enabled: bool = True

    @classmethod
    def for_level(cls, level: SensitivityLevel | str) -> "SensitivityProfile":
        level = SensitivityLevel(level)
        return _PROFILES[level]


# BR-02 thresholds. llm_threshold = minimum Gemini confidence to keep a label (BR-04).
_PROFILES = {
    SensitivityLevel.LOW: SensitivityProfile(SensitivityLevel.LOW, 0.70, 0.80),
    SensitivityLevel.MEDIUM: SensitivityProfile(SensitivityLevel.MEDIUM, 0.50, 0.60),
    SensitivityLevel.HIGH: SensitivityProfile(SensitivityLevel.HIGH, 0.30, 0.40),
}
