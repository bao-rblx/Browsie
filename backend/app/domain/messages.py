"""User-facing rationale strings produced by the rule/policy layer (VI default, EN)."""
from __future__ import annotations

LANGS = ("vi", "en")
DEFAULT_LANG = "vi"

MESSAGES = {
    "vi": {
        "allowlisted": "Tên miền {host} nằm trong danh sách tin cậy của bạn",
        "no_suspicious": "Không tìm thấy dấu hiệu đáng ngờ",
        "gambling_text": "Phát hiện từ khóa cờ bạc trong văn bản trang",
        "gambling_image": "Phát hiện từ khóa cờ bạc trong chữ trên ảnh",
        "gambling_image_llm": "Phát hiện từ khóa cờ bạc trong chữ trên ảnh (AI nhận định: {llm})",
        "unavailable": "Dịch vụ không khả dụng — nhấn để thử lại",
    },
    "en": {
        "allowlisted": "Domain {host} is on your allowlist",
        "no_suspicious": "No suspicious patterns found",
        "gambling_text": "Gambling keywords detected in page text",
        "gambling_image": "Gambling keywords detected in image text",
        "gambling_image_llm": "Gambling keywords detected in image text (LLM said: {llm})",
        "unavailable": "Service unavailable — tap to retry",
    },
}


def resolve_lang(lang: str | None) -> str:
    return lang if lang in LANGS else DEFAULT_LANG


def msg(lang: str | None, key: str, **kw) -> str:
    return MESSAGES[resolve_lang(lang)][key].format(**kw)
