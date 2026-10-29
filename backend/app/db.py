"""SQLite persistence (proposal §3.1): rules, detection_logs, evaluation_results. No PII."""
from __future__ import annotations

import hashlib
import time

from sqlalchemy import Boolean, Float, Integer, String, Text, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from .config import settings
from .domain.default_rules import DEFAULT_RULES, RULESET_VERSION
from .domain.models import Rule, RuleCategory, RuleSet


class Base(DeclarativeBase):
    pass


class RuleRow(Base):
    __tablename__ = "rules"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    pattern: Mapped[str] = mapped_column(Text)
    weight: Mapped[float] = mapped_column(Float)
    category: Mapped[str] = mapped_column(String(16))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    version: Mapped[str] = mapped_column(String(32))


class DetectionLog(Base):
    __tablename__ = "detection_logs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[float] = mapped_column(Float, default=time.time)
    source_type: Mapped[str] = mapped_column(String(8))
    label: Mapped[str] = mapped_column(String(16))
    confidence: Mapped[float] = mapped_column(Float)
    url_hash: Mapped[str] = mapped_column(String(64))   # sha256 of the domain only — no full URL / PII
    llm_called: Mapped[bool] = mapped_column(Boolean)
    cache_hit: Mapped[bool] = mapped_column(Boolean)
    latency_ms: Mapped[float] = mapped_column(Float)
    model_version: Mapped[str] = mapped_column(String(64))


class EvaluationResult(Base):
    __tablename__ = "evaluation_results"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(String(64), index=True)
    config: Mapped[str] = mapped_column(String(16))     # RULE_ONLY / LLM_ONLY / HYBRID
    sample_id: Mapped[str] = mapped_column(String(64))
    predicted_label: Mapped[str] = mapped_column(String(16))
    true_label: Mapped[str] = mapped_column(String(16))
    latency_ms: Mapped[float] = mapped_column(Float)
    ruleset_version: Mapped[str] = mapped_column(String(32))
    prompt_version: Mapped[str] = mapped_column(String(32))
    model_version: Mapped[str] = mapped_column(String(64))
    timestamp: Mapped[float] = mapped_column(Float, default=time.time)


def make_engine(url: str | None = None):
    url = url or settings.database_url
    args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    return create_engine(url, connect_args=args)


engine = make_engine()
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def init_db(eng=None) -> None:
    """Create tables and seed default rules on first run."""
    eng = eng or engine
    Base.metadata.create_all(eng)
    with Session(eng) as s:
        if s.scalar(select(RuleRow.id).limit(1)) is None:
            s.add_all(RuleRow(id=r.id, pattern=r.pattern, weight=r.weight, category=r.category.value,
                              enabled=r.enabled, version=RULESET_VERSION) for r in DEFAULT_RULES)
            s.commit()


def load_ruleset(eng=None) -> RuleSet:
    eng = eng or engine
    with Session(eng) as s:
        rows = s.scalars(select(RuleRow)).all()
    rules = [Rule(r.id, r.pattern, r.weight, RuleCategory(r.category), r.enabled) for r in rows]
    version = rows[0].version if rows else RULESET_VERSION
    return RuleSet("db", "Browsie rules", version, rules)


def hash_domain(domain: str) -> str:
    return hashlib.sha256(domain.lower().encode()).hexdigest() if domain else ""
