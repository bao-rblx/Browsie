"""BR-01..BR-08 — deterministic tests, no real LLM (proposal §2.2.2)."""
import pytest

from app.domain import (
    AllowlistEntry,
    DetectionHistory,
    DetectionRequest,
    Label,
    Rule,
    RuleCategory,
    RuleSet,
    SensitivityLevel,
    SensitivityProfile,
    SourceType,
    Verdict,
)
from app.domain.cache import VerdictCache
from app.domain.default_rules import default_ruleset
from app.domain.engine import DetectionEngine, LLMResult


class FakeLLM:
    def __init__(self, label=Label.SPAM, confidence=0.9, rationale="fake", fail=False):
        self.label, self.confidence, self.rationale, self.fail = label, confidence, rationale, fail
        self.calls = 0
        self.last_image = None

    def _result(self):
        self.calls += 1
        if self.fail:
            raise TimeoutError("backend down")
        return LLMResult(self.label, self.confidence, self.rationale, "fake-1")

    def analyze_text(self, text, rule_score, lang="vi"):
        self.last_lang = lang
        return self._result()

    def analyze_image(self, image_bytes, mime_type, ocr_text, lang="vi"):
        self.last_lang = lang
        self.last_image = (image_bytes, ocr_text)
        return self._result()


class Clock:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t


def make_engine(llm=None, clock=None, ruleset=None):
    llm = llm or FakeLLM()
    cache = VerdictCache(clock=clock or Clock())
    return DetectionEngine(ruleset or default_ruleset(), llm, cache), llm


MED = SensitivityProfile.for_level("MEDIUM")
SPAMMY = "Kiếm tiền online tại nhà, nhấn vào đây ngay! Zalo: 0901 234 567"
BENIGN = "The city council approved the new public library budget on Tuesday."
GAMBLING = "Kèo bóng 88 — Thắng lớn mỗi ngày"


# BR-01 — image path always calls the LLM
def test_br01_image_always_calls_llm():
    engine, llm = make_engine(FakeLLM(Label.BENIGN, 0.95))
    req = DetectionRequest(SourceType.IMAGE, raw_content="img", ocr_text="", user_initiated=True)
    v = engine.analyze(req, SensitivityProfile.for_level("LOW"), image_bytes=b"\x89PNG")
    assert v.llm_called is True
    assert llm.calls == 1


# BR-02 — sensitivity thresholds
@pytest.mark.parametrize("level,threshold", [("LOW", 0.70), ("MEDIUM", 0.50), ("HIGH", 0.30)])
def test_br02_thresholds(level, threshold):
    assert SensitivityProfile.for_level(level).rule_threshold == threshold


@pytest.mark.parametrize("level,expect_llm", [("LOW", False), ("MEDIUM", True), ("HIGH", True)])
def test_br02_gate_by_level(level, expect_llm):
    rs = RuleSet("t", "t", "1", [Rule("r", r"suspicious", 0.55, RuleCategory.SPAM)])
    engine, llm = make_engine(ruleset=rs)
    v = engine.analyze(DetectionRequest(SourceType.TEXT, "very suspicious text"), SensitivityProfile.for_level(level))
    assert v.llm_called is expect_llm
    if not expect_llm:
        assert v.label == Label.BENIGN


def test_br02_benign_text_no_llm():
    engine, llm = make_engine()
    v = engine.analyze(DetectionRequest(SourceType.TEXT, BENIGN), MED)
    assert v.label == Label.BENIGN and llm.calls == 0


# BR-03 — allowlist precedence
def test_br03_allowlist_skips_everything():
    engine, llm = make_engine()
    req = DetectionRequest(SourceType.TEXT, SPAMMY + " " + GAMBLING, url="https://news.example.com/a")
    v = engine.analyze(req, MED, allowlist=[AllowlistEntry("example.com")])
    assert v.label == Label.BENIGN
    assert llm.calls == 0 and v.rule_score == 0.0


def test_br03_invalid_domain_rejected():
    with pytest.raises(ValueError):
        AllowlistEntry("not a domain")


# BR-04 — low LLM confidence downgrades to UNKNOWN, keeps rationale
def test_br04_low_confidence_downgrade():
    engine, _ = make_engine(FakeLLM(Label.SPAM, 0.3, "weak signal"))
    v = engine.analyze(DetectionRequest(SourceType.TEXT, SPAMMY), MED)
    assert v.label == Label.UNKNOWN
    assert v.rationale == "weak signal"


def test_br04_high_confidence_kept():
    engine, _ = make_engine(FakeLLM(Label.SPAM, 0.9))
    v = engine.analyze(DetectionRequest(SourceType.TEXT, SPAMMY), MED)
    assert v.label == Label.SPAM


# BR-05 — gambling override
def test_br05_gambling_ocr_overrides_benign_llm():
    engine, llm = make_engine(FakeLLM(Label.BENIGN, 0.99))
    req = DetectionRequest(SourceType.IMAGE, "img", ocr_text=GAMBLING, user_initiated=True)
    v = engine.analyze(req, MED, image_bytes=b"x")
    assert v.label == Label.GAMBLING_AD and v.is_positive()
    assert llm.calls == 1  # BR-01 still respected


def test_br05_gambling_text_flags_without_llm():
    engine, llm = make_engine(FakeLLM(Label.BENIGN, 0.99))
    v = engine.analyze(DetectionRequest(SourceType.TEXT, GAMBLING), SensitivityProfile.for_level("LOW"))
    assert v.label == Label.GAMBLING_AD and llm.calls == 0


# BR-06 — caching within TTL
def test_br06_cache_hit_within_ttl():
    clock = Clock()
    engine, llm = make_engine(clock=clock)
    req = DetectionRequest(SourceType.TEXT, SPAMMY)
    engine.analyze(req, MED)
    clock.t = 9 * 60
    v = engine.analyze(DetectionRequest(SourceType.TEXT, SPAMMY), MED)
    assert v.cache_hit is True and llm.calls == 1


def test_br06_cache_expires_text_10min_image_30min():
    clock = Clock()
    engine, llm = make_engine(clock=clock)
    engine.analyze(DetectionRequest(SourceType.TEXT, SPAMMY), MED)
    clock.t = 10 * 60 + 1
    v = engine.analyze(DetectionRequest(SourceType.TEXT, SPAMMY), MED)
    assert v.cache_hit is False and llm.calls == 2

    img = lambda: DetectionRequest(SourceType.IMAGE, "img", ocr_text="hello")
    engine.analyze(img(), MED, image_bytes=b"x")
    clock.t += 29 * 60
    assert engine.analyze(img(), MED, image_bytes=b"x").cache_hit is True
    clock.t += 2 * 60
    assert engine.analyze(img(), MED, image_bytes=b"x").cache_hit is False


# BR-07 — empty OCR still analyses the image
def test_br07_empty_ocr_still_sent():
    engine, llm = make_engine(FakeLLM(Label.BENIGN, 0.9))
    engine.analyze(DetectionRequest(SourceType.IMAGE, "img", ocr_text=""), MED, image_bytes=b"img-bytes")
    assert llm.calls == 1
    assert llm.last_image == (b"img-bytes", "")


# BR-08 — backend failure → UNKNOWN, never BENIGN, not cached
def test_br08_failure_is_unknown_not_benign():
    engine, llm = make_engine(FakeLLM(fail=True))
    v = engine.analyze(DetectionRequest(SourceType.TEXT, SPAMMY), MED)
    assert v.label == Label.UNKNOWN and v.confidence == 0.0
    assert "không khả dụng" in v.rationale.lower()  # Vietnamese is the default language
    engine.analyze(DetectionRequest(SourceType.TEXT, SPAMMY), MED)
    assert llm.calls == 2  # failure was not cached


def test_br08_image_failure_unknown():
    engine, _ = make_engine(FakeLLM(fail=True))
    v = engine.analyze(DetectionRequest(SourceType.IMAGE, "img", ocr_text=""), MED, image_bytes=b"x")
    assert v.label == Label.UNKNOWN


# Language: rationales follow the requested language; cache is per language
def test_rationale_language_vi_default_and_en():
    engine, _ = make_engine()
    vi = engine.analyze(DetectionRequest(SourceType.TEXT, BENIGN), MED)
    en = engine.analyze(DetectionRequest(SourceType.TEXT, BENIGN), MED, lang="en")
    assert vi.rationale == "Không tìm thấy dấu hiệu đáng ngờ"
    assert en.rationale == "No suspicious patterns found"
    assert en.cache_hit is False  # different language → different cache entry


def test_lang_forwarded_to_llm_and_unknown_lang_falls_back_to_vi():
    engine, llm = make_engine()
    engine.analyze(DetectionRequest(SourceType.TEXT, SPAMMY), MED, lang="en")
    assert llm.last_lang == "en"
    engine.analyze(DetectionRequest(SourceType.IMAGE, "img"), MED, image_bytes=b"x", lang="fr")
    assert llm.last_lang == "vi"


# Domain helpers
def test_ruleset_score_bounded_and_monotonic():
    rs = default_ruleset()
    assert rs.score("") == 0.0
    assert 0.0 < rs.score("click here") <= rs.score("click here, you have won a prize") <= 1.0


def test_history_max_size():
    h = DetectionHistory(max_size=3)
    for i in range(5):
        h.add(DetectionRequest(SourceType.TEXT, str(i)), Verdict(Label.BENIGN, 1, "ok"))
    assert len(h.to_json()) == 3 and h.to_json()[0]["sourceType"] == "TEXT"
    h.clear()
    assert h.to_json() == []


def test_verdict_is_positive():
    assert Verdict(Label.SPAM, 0.9, "").is_positive()
    assert not Verdict(Label.UNKNOWN, 0.9, "").is_positive()
    assert not Verdict(Label.BENIGN, 0.9, "").is_positive()


# Language of rule-produced rationales (VI default, EN on request)
def test_rationale_language_vi_default_and_en():
    engine, _ = make_engine()
    vi = engine.analyze(DetectionRequest(SourceType.TEXT, GAMBLING), MED)
    en = engine.analyze(DetectionRequest(SourceType.TEXT, GAMBLING), MED, lang="en")
    assert "cờ bạc" in vi.rationale
    assert "Gambling" in en.rationale and en.cache_hit is False  # cache is per language


def test_unknown_lang_falls_back_to_vi():
    engine, _ = make_engine(FakeLLM(fail=True))
    v = engine.analyze(DetectionRequest(SourceType.TEXT, SPAMMY), MED, lang="fr")
    assert v.label == Label.UNKNOWN and "không khả dụng" in v.rationale
