"""Runtime configuration from environment variables (.env supported).

The Gemini key is read ONLY here, server-side. It is never sent to the extension.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field

from dotenv import load_dotenv

load_dotenv()


def _csv(name: str, default: str) -> list[str]:
    return [s.strip() for s in os.getenv(name, default).split(",") if s.strip()]


@dataclass(frozen=True)
class Settings:
    gemini_api_key: str = field(default_factory=lambda: os.getenv("GEMINI_API_KEY", ""))
    gemini_model: str = field(default_factory=lambda: os.getenv("GEMINI_MODEL", "gemini-2.5-flash"))
    # "gemini" or "mock". Defaults to mock when no key is configured so the app still runs.
    llm_provider: str = field(default_factory=lambda: os.getenv(
        "LLM_PROVIDER", "gemini" if os.getenv("GEMINI_API_KEY") else "mock"))
    llm_timeout_s: float = field(default_factory=lambda: float(os.getenv("LLM_TIMEOUT_S", "8")))
    database_url: str = field(default_factory=lambda: os.getenv("DATABASE_URL", "sqlite:///./browsie.db"))
    # Shared token the extension sends as X-Browsie-Token. Empty = auth disabled (local dev only).
    api_token: str = field(default_factory=lambda: os.getenv("BROWSIE_API_TOKEN", ""))
    rate_limit_per_min: int = field(default_factory=lambda: int(os.getenv("RATE_LIMIT_PER_MIN", "60")))
    max_text_chars: int = field(default_factory=lambda: int(os.getenv("MAX_TEXT_CHARS", "8000")))
    max_image_bytes: int = field(default_factory=lambda: int(os.getenv("MAX_IMAGE_BYTES", str(5 * 1024 * 1024))))
    cors_origins: list[str] = field(default_factory=lambda: _csv("CORS_ORIGINS", "chrome-extension://*"))


settings = Settings()
