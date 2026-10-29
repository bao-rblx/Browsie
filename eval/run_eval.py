"""Evaluation harness (SO5, proposal §3.3).

Runs the dataset through three configurations — RULE_ONLY, LLM_ONLY, HYBRID — and reports
per-class precision/recall/F1, macro averages, false-positive rate, confusion matrix and
latency p50/p95. Every prediction is stored in SQLite `evaluation_results` for reproducibility.

Usage (from repo root, with the backend venv active):
    python eval/run_eval.py                       # uses eval/dataset/*.jsonl
    python eval/run_eval.py --dataset my.jsonl --sensitivity HIGH --configs HYBRID

Dataset format (JSON Lines): {"id", "label", "source": "TEXT"|"IMAGE", "text" | "ocrText",
                              optional "image": path relative to the dataset file, "lang"}
"""
from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent / "backend"))

from app import db  # noqa: E402
from app.domain.cache import VerdictCache  # noqa: E402
from app.domain.engine import DetectionEngine  # noqa: E402
from app.domain.models import DetectionRequest, Label, SensitivityProfile, SourceType  # noqa: E402
from app.llm import PROMPT_VERSION, build_llm  # noqa: E402

LABELS = [Label.BENIGN, Label.SPAM, Label.FAKE_NEWS, Label.GAMBLING_AD]
TARGETS = {"macro_precision": 0.85, "macro_recall": 0.80, "fpr": 0.10}


def load_dataset(paths: list[Path]) -> list[dict]:
    samples = []
    for p in paths:
        for n, line in enumerate(p.read_text(encoding="utf-8").splitlines(), 1):
            if not line.strip():
                continue
            s = json.loads(line)
            s["_base"] = p.parent
            if s["label"] not in Label.__members__:
                raise ValueError(f"{p}:{n} unknown label {s['label']}")
            samples.append(s)
    return samples


def image_bytes(s: dict) -> tuple[bytes | None, str]:
    if not s.get("image"):
        return None, "image/png"
    path = s["_base"] / s["image"]
    mime = "image/jpeg" if path.suffix.lower() in (".jpg", ".jpeg") else "image/png"
    return path.read_bytes(), mime


def predict(config: str, engine: DetectionEngine, s: dict, profile: SensitivityProfile) -> Label:
    src = SourceType(s.get("source", "TEXT"))
    text, ocr = s.get("text", ""), s.get("ocrText", "")
    img, mime = image_bytes(s) if src == SourceType.IMAGE else (None, "image/png")
    if config == "RULE_ONLY":
        return engine.rule_label(text if src == SourceType.TEXT else ocr)
    if config == "LLM_ONLY":
        try:
            r = (engine.llm.analyze_image(img, mime, ocr) if src == SourceType.IMAGE
                 else engine.llm.analyze_text(text, 0.0))
            return r.label
        except Exception:
            return Label.UNKNOWN
    raw = text if src == SourceType.TEXT else s["id"]
    req = DetectionRequest(src, raw, ocr_text=ocr, user_initiated=src == SourceType.IMAGE)
    return engine.analyze(req, profile, image_bytes=img, mime_type=mime).label


def metrics(rows: list[tuple[Label, Label]]) -> dict:
    out: dict = {"per_class": {}, "confusion": {}}
    for t in LABELS:
        out["confusion"][t.value] = {p.value: 0 for p in LABELS + [Label.UNKNOWN]}
    for true, pred in rows:
        out["confusion"][true.value][pred.value] += 1
    ps, rs = [], []
    for c in LABELS:
        tp = sum(1 for t, p in rows if t == c and p == c)
        fp = sum(1 for t, p in rows if t != c and p == c)
        fn = sum(1 for t, p in rows if t == c and p != c)
        prec = tp / (tp + fp) if tp + fp else 0.0
        rec = tp / (tp + fn) if tp + fn else 0.0
        f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
        out["per_class"][c.value] = {"precision": prec, "recall": rec, "f1": f1, "support": tp + fn}
        ps.append(prec)
        rs.append(rec)
    out["macro_precision"] = statistics.mean(ps)
    out["macro_recall"] = statistics.mean(rs)
    out["macro_f1"] = statistics.mean(v["f1"] for v in out["per_class"].values())
    benign = [p for t, p in rows if t == Label.BENIGN]
    out["fpr"] = sum(1 for p in benign if p not in (Label.BENIGN, Label.UNKNOWN)) / len(benign) if benign else 0.0
    return out


def pct(values: list[float], q: float) -> float:
    if not values:
        return 0.0
    v = sorted(values)
    return v[min(len(v) - 1, int(round(q * (len(v) - 1))))]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", nargs="*", type=Path, default=sorted((ROOT / "dataset").glob("*.jsonl")))
    ap.add_argument("--sensitivity", default="MEDIUM", choices=["LOW", "MEDIUM", "HIGH"])
    ap.add_argument("--configs", nargs="*", default=["RULE_ONLY", "LLM_ONLY", "HYBRID"])
    ap.add_argument("--json", type=Path, help="also write the full report to this file")
    args = ap.parse_args()

    samples = load_dataset(args.dataset)
    db.init_db()
    llm = build_llm()
    profile = SensitivityProfile.for_level(args.sensitivity)
    run_id = time.strftime("%Y%m%d-%H%M%S-") + uuid.uuid4().hex[:6]
    ruleset = db.load_ruleset()
    report = {"runId": run_id, "samples": len(samples), "model": getattr(llm, "model", "?"),
              "rulesetVersion": ruleset.version, "promptVersion": PROMPT_VERSION,
              "sensitivity": args.sensitivity, "configs": {}}

    print(f"Run {run_id}: {len(samples)} samples, model={report['model']}, sensitivity={args.sensitivity}\n")
    for config in args.configs:
        engine = DetectionEngine(ruleset, llm, VerdictCache())  # fresh cache per config
        rows, lat = [], {"TEXT": [], "IMAGE": []}
        with db.SessionLocal() as sess:
            for s in samples:
                t0 = time.perf_counter()
                pred = predict(config, engine, s, profile)
                ms = (time.perf_counter() - t0) * 1000
                true = Label(s["label"])
                rows.append((true, pred))
                lat[s.get("source", "TEXT")].append(ms)
                sess.add(db.EvaluationResult(
                    run_id=run_id, config=config, sample_id=s["id"], predicted_label=pred.value,
                    true_label=true.value, latency_ms=ms, ruleset_version=ruleset.version,
                    prompt_version=PROMPT_VERSION, model_version=report["model"]))
            sess.commit()
        m = metrics(rows)
        m["latency_ms"] = {k: {"p50": pct(v, 0.5), "p95": pct(v, 0.95)} for k, v in lat.items() if v}
        report["configs"][config] = m

        print(f"== {config} ==")
        for c, v in m["per_class"].items():
            print(f"  {c:<12} P={v['precision']:.2f} R={v['recall']:.2f} F1={v['f1']:.2f} n={v['support']}")
        ok = lambda k, cmp: "PASS" if cmp(m[k], TARGETS[k]) else "FAIL"  # noqa: E731
        print(f"  macro P={m['macro_precision']:.2f} [{ok('macro_precision', float.__ge__)}]  "
              f"R={m['macro_recall']:.2f} [{ok('macro_recall', float.__ge__)}]  "
              f"F1={m['macro_f1']:.2f}  FPR={m['fpr']:.2f} [{ok('fpr', float.__le__)}]")
        for k, v in m["latency_ms"].items():
            print(f"  latency {k}: p50={v['p50']:.1f} ms  p95={v['p95']:.1f} ms")
        print()

    if args.json:
        args.json.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
        print("Report written to", args.json)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
