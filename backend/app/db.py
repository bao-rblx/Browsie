"""Database persistence with connection pooling: rules, detection_logs, evaluation_results. No PII."""
from __future__ import annotations

import hashlib
import time

from sqlalchemy import Boolean, Float, Integer, String, Text, create_engine, select, text
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker
from sqlalchemy.pool import QueuePool, StaticPool

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
    url_hash: Mapped[str] = mapped_column(String(64))   # sha256 of the domain only - no full URL / PII
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


def _build_engine():
    db_url = settings.database_url
    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql://", 1)

    if db_url.startswith("postgresql"):
        return create_engine(
            db_url,
            poolclass=QueuePool,
            pool_size=settings.db_pool_size,
            max_overflow=settings.db_max_overflow,
            pool_timeout=settings.db_pool_timeout,
            pool_recycle=settings.db_pool_recycle,
            pool_pre_ping=True,
            echo=False,
        )
    if ":memory:" in db_url:
        return create_engine(db_url, connect_args={"check_same_thread": False}, poolclass=StaticPool, echo=False)
    return create_engine(db_url, connect_args={"check_same_thread": False}, echo=False)


engine = _build_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def check_db_health() -> dict:
    """Verifies database connectivity using an active connection from the pool."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        pool = engine.pool
        return {
            "status": "connected",
            "dialect": engine.dialect.name,
            "pool_size": getattr(pool, "size", lambda: 1)(),
            "checked_in": getattr(pool, "checkedin", lambda: 0)(),
            "checked_out": getattr(pool, "checkedout", lambda: 0)(),
        }
    except Exception as exc:
        return {
            "status": "error",
            "dialect": engine.dialect.name,
            "error": str(exc),
        }


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as session:
        count = session.query(RuleRow).count()
        if count == 0:
            for r in DEFAULT_RULES:
                session.add(RuleRow(
                    id=r.id,
                    pattern=r.pattern,
                    weight=r.weight,
                    category=r.category.value,
                    enabled=r.enabled,
                    version=RULESET_VERSION,
                ))
            session.commit()


def load_ruleset() -> RuleSet:
    with SessionLocal() as session:
        rows = session.scalars(select(RuleRow).where(RuleRow.enabled.is_(True))).all()
        if not rows:
            return default_ruleset()
        rules = [Rule(id=row.id, pattern=row.pattern, weight=row.weight,
                      category=RuleCategory(row.category), enabled=row.enabled) for row in rows]
        return RuleSet(version=RULESET_VERSION, rules=rules)


def hash_domain(domain: str) -> str:
    return hashlib.sha256(domain.encode()).hexdigest() if domain else ""


def log_detection(source_type: str, label: str, confidence: float, domain: str,
                  llm_called: bool, cache_hit: bool, latency_ms: float, model_version: str) -> None:
    url_hash = hash_domain(domain)
    with SessionLocal() as session:
        session.add(DetectionLog(
            source_type=source_type,
            label=label,
            confidence=confidence,
            url_hash=url_hash,
            llm_called=llm_called,
            cache_hit=cache_hit,
            latency_ms=latency_ms,
            model_version=model_version,
        ))
        session.commit()
