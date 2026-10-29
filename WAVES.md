# Delivery waves

Each wave matches a row of the work plan (proposal Table 1) and ends with a release tag.
Each person works on their own branch and opens a PR to `main`; another member reviews it.
Push in small commits over the week, not one dump at the end.

Owners: **Bảo** (lead / Gemini / rules), **Minh** (frontend), **Đức** (backend / OCR / testing).

---

## Wave 0 — Scaffold · tag `v0.0-resubmission` · Bảo

- `README.md`, `WAVES.md`, `.gitignore`, `backend/.env.example`
- Empty folder structure, revised proposal
- Everyone: clone, create venv, `npm install`, confirm it runs

## Wave 1 — Backend core · tag `v0.1-backend` · Đức + Bảo

| Who | Files | Done when |
|---|---|---|
| Bảo | `backend/app/domain/models.py`, `default_rules.py` | Domain classes + seed VI/EN rules |
| Bảo | `backend/app/domain/engine.py`, `cache.py` | BR-01..BR-08 implemented |
| Bảo | `backend/tests/test_business_rules.py` | `pytest` — 22 BR tests pass |
| Đức | `backend/app/config.py`, `db.py` | SQLite tables `rules`, `detection_logs`, `evaluation_results` |
| Đức | `backend/app/main.py`, `llm.py` (MockLLM only first) | `/health`, `/config`, `/analyze-text`, `/analyze-image` |
| Đức | `backend/tests/conftest.py`, `test_api.py`, `requirements.txt`, `pytest.ini` | All 31 tests pass |

Suggested order: Bảo pushes `models.py` first (day 1–2) — Đức's `db.py` imports it.

## Wave 2 — Extension · tag `v0.2-frontend` · Minh (Bảo reviews)

| Who | Files | Done when |
|---|---|---|
| Minh | `extension/manifest.json`, `scripts/icons.mjs`, `icons/` | Loads in Developer mode |
| Minh | `extension/lib/rules.js`, `policy.js`, `default-rules.js`, `storage.js`, `api.js` | `npm test` passes |
| Minh | `extension/content/content.js`, `content.css` | Text extraction, highlight, image blur overlay (F-01, F-05) |
| Minh | `extension/background.js` | Context menu, badge, calls backend (F-06) |
| Minh | `extension/popup/*`, `options/*`, `consent/*`, `shared/ui.css` | Settings, allowlist, history (F-07, UC3–UC5) |
| Đức | `extension/offscreen/*`, `scripts/vendor.mjs`, `package.json` | Tesseract.js OCR in Offscreen Document (F-03) |
| Đức | `extension/tests/policy.test.js` | JS/Python rule parity test |

Suggested order: `lib/` → `background.js` → `content/` → popup/options/consent. OCR can go in parallel.

## Wave 3 — End-to-end with Gemini · tag `v0.3-e2e` · Bảo (Đức supports)

- Bảo: `GeminiClient` in `backend/app/llm.py`, prompt tuning (`PROMPT_VERSION`), test with a real key
- Bảo: check BR-04/BR-05 with real Gemini outputs; adjust `llmThreshold` if needed
- Đức: set `BROWSIE_API_TOKEN`, check rate limit, CORS with the real extension ID, backend-down (BR-08)
- Minh: manual test of Appendix B scenarios 1–7 in the browser, fix UI bugs
- Done when: flagged text/image → Gemini → Verdict → highlight/blur works on real pages

## Wave 4 — Evaluation · tag `v0.4-eval` · Minh + Đức (Bảo analyses)

- Minh + Đức: grow `eval/dataset/` to ≥120 samples (30/class, ~50% VI), image samples in `eval/dataset/images/`
- Two members label independently; Bảo resolves disagreements; record agreement
- Đức: `eval/run_eval.py` with the real key at LOW/MEDIUM/HIGH; save `--json` reports
- Bảo: confusion matrix, ablation (Rule vs LLM vs Hybrid), tune rules/thresholds, write the eval chapter
- Done when: macro P ≥ 85%, R ≥ 80%, FPR ≤ 10%, latency within NFRs (or analysis of why not)

## Wave 5 — Polish & report · tag `v1.0` · everyone

- Minh: UI polish, screenshots, user guide, Chrome Web Store zip
- Đức: backend deployment notes, final test run, clean logs
- Bảo: final report, slides, demo script

---

### Git commands per member

```bash
git checkout main && git pull
git checkout -b wave1/backend-api          # one branch per task
# ...work, commit often...
git add backend/app/main.py backend/tests/test_api.py
git commit -m "Add analyze-text and analyze-image endpoints"
git push -u origin wave1/backend-api
gh pr create --base main                   # teammate reviews, then merge
```

After a wave's PRs are merged, the lead tags it: `git tag v0.1-backend && git push origin v0.1-backend`.
