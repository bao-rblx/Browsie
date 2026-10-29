# Browsie — Multimodal AI Browser Extension for Text & Image Spam Detection

Chrome (MV3) extension + FastAPI backend that flags spam, fake news and image-embedded gambling ads
using a rule pre-filter, client-side OCR (Tesseract.js) and Google Gemini.

```
extension/   Chrome extension (content script, service worker, offscreen OCR, popup, options, consent)
backend/     FastAPI + SQLite: rule engine (BR-01..BR-08), Gemini proxy, logs, config
eval/        Evaluation dataset + script (Rule-only vs LLM-only vs Hybrid)
```

## Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env          # then set GEMINI_API_KEY (leave empty to use the offline mock)
uvicorn app.main:app --reload --port 8000
pytest                          # 31 tests: BR-01..BR-08 + API
```

Endpoints: `GET /health`, `GET /config`, `POST /analyze-text`, `POST /analyze-image`.
The Gemini key lives only in `backend/.env` — never commit it, never put it in the extension.
Set `BROWSIE_API_TOKEN` to require an `X-Browsie-Token` header (enter the same token in the extension options).

## Extension

```bash
cd extension
npm install      # also vendors Tesseract.js into extension/vendor (MV3 forbids remote code)
npm test         # 8 tests: client rule engine + policy, JS/Python rule parity
```

Load it: `chrome://extensions` → Developer mode → Load unpacked → select `extension/`.
Accept the consent page, then browse. Right-click any image → "Analyze with AI Filter".
Backend URL defaults to `http://localhost:8000` (change in Options).

## Evaluation

```bash
cd backend
.venv\Scripts\python ..\eval\run_eval.py --sensitivity MEDIUM --json ..\eval\report.json
```

Reads every `eval/dataset/*.jsonl` (one JSON per line:
`{"id","source":"TEXT|IMAGE","text","ocrText","imagePath","label","lang"}`), prints per-class P/R/F1,
macro averages, FPR and latency p50/p95 per path, and stores rows in `evaluation_results`.
`seed.jsonl` has 16 samples; the proposal target is ≥120 (30 per class, EN:VI ≈ 50:50).
With the mock LLM the scores are trivially perfect — run with a real `GEMINI_API_KEY` for the report.

## Team workflow

See [WAVES.md](WAVES.md) for how the work is split into releases across the three members.
