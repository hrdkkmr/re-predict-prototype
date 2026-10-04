# RE-PREDICT · Renewable energy intelligence prototype

**Sense. Understand. Predict. Detect. Simulate. Explain.**

A source-first, dependency-free full-stack prototype built from the supplied RE-PREDICT product brief. It pairs a polished workflow with a deliberately conservative evidence boundary: published observations stay separate from derived forecasts, review signals, user assumptions, and illustrative carbon proxies.

> **Current data:** The default workspace contains a date-bounded snapshot of **90 official CEA Daily Renewable Generation Report workbooks** covering **3 July–30 September 2026**. The snapshot contains **270 extracted observations** (Wind, Solar, Other RES) for All India. The original XLSX reports, per-file SHA-256 hashes, source row/cell locators, and a reproducible extraction script are included. This is a historical snapshot, not a live CEA feed. RE-PREDICT is an independent prototype and is not endorsed by CEA.
>
> A separate deterministic **synthetic demo fixture** remains available in Sources & Audit; it includes one intentionally planted wind shock for testing the anomaly workflow. Synthetic records are never mixed into the CEA snapshot. User-uploaded CSVs are also kept separate and are not independently certified.

## What makes the demo stronger

- **90-report CEA provenance bundle:** each report is mapped to `Generation!B47–D47` (All India row 47); column E is used only to reconcile the published total. All **90/90 totals reconcile**, with a maximum absolute difference of 0.00 MU in this archived window.
- **Trace one number to its workbook:** click any observation’s evidence link to see the exact report date, worksheet, cell, original-published total, SHA-256, and download links to both the packaged workbook and CEA’s report.
- **Actual values, with units preserved:** the source reports daily generation in **MU net**. The latest bundled report (30 September 2026) shows Wind **121.10 MU**, Solar **704.89 MU**, Other RES **33.98 MU**, and published All India total **859.97 MU**. The three components sum exactly to the published total. `Other RES` remains CEA's combined category; the prototype does not disaggregate it. `1 MU = 1 GWh` is used only where the Carbon Lens needs an energy-unit conversion; its emissions factor remains explicitly illustrative.
- **Evidence-first workflow:** forecast metrics are calculated on the active historical snapshot, anomaly flags remain statistical signals, scenarios expose user-entered assumptions, and the local analyst refuses to infer causes from generation alone.

## Run locally

Requirements: Node.js 18 or newer. No `npm install`, cloud account, API key, database, or external service is required to run the app.

```bash
cd re-predict-prototype
npm start
```

Open **http://localhost:4173**. The app binds to `0.0.0.0` by default so it can also be shown through a development preview. Choose another port with `PORT=8080 npm start`.

The local Node server serves the UI and REST API, validates CSV imports, persists scenarios/review states/audit events to `data/store.json`, and stores uploaded raw CSV artifacts under `data/raw/`. Both runtime paths are ignored by Git. On a fresh run, the CEA report snapshot is the active dataset; the synthetic fixture is selectable from Sources & Audit.

Run checks:

```bash
npm run check
npm test
```

### Rebuild the normalized CEA snapshot

The app consumes the committed `lib/cea_snapshot.json`; source refresh is optional and does not affect runtime requirements. To regenerate from the archived workbooks:

```bash
python -m pip install -r scripts/requirements.txt
python scripts/build_cea_snapshot.py --start 2026-07-03 --end 2026-09-30
```

The builder validates report dates, worksheet and row labels, numeric values, and the CEA-published daily total before updating the normalized JSON. Its exact source-column mapping and verification logic are documented in `scripts/build_cea_snapshot.py`. The official publisher portal is <https://gen-re.cea.gov.in/reports>.

## Five-minute demo route

1. **Overview — Sense / Understand:** lead with the CEA banner: 90 report files, 270 values, bounded window, and 90/90 totals reconciled. The latest All India output is shown in MU, with Wind/Solar/Other RES visible as separate series.
2. **Explore — Understand:** show the daily pattern and source mix. Click a row’s **CEA report** evidence link to trace it to its workbook cell; download the exact archived XLSX and open the original CEA report page.
3. **Sources & Audit — Sense / Explain:** open the report manifest and show the per-workbook SHA-256, source total check, parser mapping, active dataset version, and the archive links. Emphasize that the snapshot stops at 30 September 2026 and is not live.
4. **Forecast Lab — Predict:** run the seasonal-naive lag-7 baseline. Read the cutoff, ordered holdout, persistence comparator, MAE/RMSE, and empirical interval. Metrics describe this 90-day snapshot only; they are not official CEA output or a promise of future accuracy.
5. **Anomaly Desk — Detect:** inspect any published-data deviation returned by the robust detector. If no suitable alert appears, switch to the **Synthetic demo fixture** in Sources & Audit to demonstrate the intentionally planted wind shock, clearly labelling it synthetic. In either case say “signal, not cause.”
6. **Scenario Studio — Simulate:** change capacity and availability, then show `Gₛ = G × (C₁ / C₀) × A` with low/base/high sensitivity cases. The capacity inputs are illustrative and unverified.
7. **Carbon Lens — Explain:** show the explicit MU-to-MWh conversion and illustrative factor. This is a methodology demo, not a verified avoided-emissions claim.
8. **AI Analyst — Explain:** ask “What is the latest solar generation?” then “Why did wind generation change?” Show the source/date citation and the safe causal limitation. The analyst is deterministic and local—not an external LLM.

## Safe judge language

- “An independent analytics prototype uses a packaged historical snapshot of CEA-published reports; it is not an official CEA product or live data connector.”
- “Each of the 90 source workbooks is packaged, SHA-256 registered, and mapped to a report row/cell. All 90 daily totals reconcile within the declared tolerance.”
- “The source numbers are published CEA values; RE-PREDICT forecasts, signals, scenarios, and carbon proxies are independent prototype calculations.”
- “Forecast scores are measured only on this small historical snapshot. They do not establish future operational accuracy.”
- “An anomaly is a deviation from a baseline, not evidence of a physical cause.”
- “A scenario is a conditional calculation, not a prediction.”
- “The carbon result uses an illustrative factor and is not a verified reduction, carbon credit, or official CEA metric.”
- “This is a hackathon-ready working prototype, not production software: it has no authentication, role model, managed database, availability guarantee, live data refresh, or operational validation.”

## CSV import contract

The sample file is `public/sample_generation.csv`. Minimum headers:

```csv
date,technology,value,unit,geography
2026-10-01,Solar,105.2,GWh,National (source label)
```

- `date` uses `YYYY-MM-DD`; ISO timestamps are accepted and reduced to their date.
- `technology` (also `source`, `source_type`, or `renewable_source`) and a non-negative numeric generation value are required.
- `unit` is required unless the numeric column is explicitly named `generation_gwh` / `value_gwh` or `generation_mwh` / `value_mwh`.
- One CSV must contain one compatible unit. Convert mixed units before upload; no silent conversion is performed.
- Duplicate `(date, technology, geography)` keys stop the whole import. Invalid rows are not partially activated.
- `geography` is optional; missing values are labeled `Not specified`, not guessed.
- Unknown columns remain unmapped and are reported in the source metadata. The original upload is retained locally; its SHA-256 is calculated server-side.
- Prototype upload limit: 4 MB and 100,000 records. CSV is treated as data—not as instructions.

## Product surface

- **Overview:** active source boundary, KPIs, source-wise trend, robust signals, latest observations.
- **Explore:** technology/date-window filters, trend plot, aggregation notes, row-level provenance, CSV export.
- **Forecast Lab:** seasonal-naive lag-7 baseline, persistence comparator, rolling-origin holdout MAE/RMSE, earlier-residual interval radius and observed holdout coverage. The minimum history gate is 21 points.
- **Anomaly Desk:** trailing median/MAD robust z-score, thresholded signals, human review state and audit event.
- **Scenario Studio:** explicit capacity-scaling equation; low/base/high availability sensitivity; versioned, saved inputs and outputs.
- **Carbon Lens:** transparent factor-based proxy; energy-unit conversions include MU = 1,000 MWh; default factor is illustrative. Not a carbon-accounting tool.
- **AI Analyst:** bounded rule-based queries over selected observations, forecasts, anomalies, scenarios, and source metadata; citations and safe limitations; no network LLM.
- **Sources & Audit:** CEA snapshot register and 90-report manifest, row/cell provenance, workbook SHA-256 and downloads, quality checks, source switching, CSV import, local activity log, and evidence exports.

## Architecture

```text
Browser (vanilla HTML/CSS/JS; inline SVG charts)
  └── same-origin REST API (Node.js built-ins; no third-party packages)
        ├── CEA snapshot loader + CSV parser/validation gate
        ├── deterministic analytics (forecast / robust anomalies / scenarios)
        ├── local JSON metadata store
        └── packaged CEA XLSX artifacts + raw-upload SHA-256 provenance
```

The JSON store and uploaded files are suitable for a hackathon laptop demo only. There is no authentication, role model, managed database, cloud object store, rate limiting, scheduled CEA refresh, weather feed, production monitoring, or high-availability guarantee. Do not expose this server publicly or upload confidential data.

## Project map

```text
public/                    Single-page app, styles, and illustrative sample CSV
lib/                       CSV contract, analytics, seed data, normalized CEA snapshot
server.js                  Same-origin API and static server
scripts/build_cea_snapshot.py  Reproducible XLSX-to-JSON source extraction
references/cea_reports/    90 archived daily CEA XLSX source artifacts
references/                Supplied PDFs and source metadata
tests/                     Node built-in test suite
data/                      Runtime store and raw uploads (not shipped as user data)
docs/                      API, data dictionary, demo script, release checklist
```

## REST API

See [`docs/API.md`](docs/API.md). Main endpoints include `/api/health`, `/api/v1/state`, `/api/v1/sources`, `/api/v1/observations`, `/api/v1/analytics/trends`, `/api/v1/forecasts/run`, `/api/v1/anomalies`, `/api/v1/import`, `/api/v1/scenarios`, `/api/v1/analyst/query`, `/api/v1/reviews`, `/api/v1/provenance/:id`, `/api/v1/sources/:id/raw`, and `/api/v1/cea-reports/:report_id/raw`.

## Reference brief

The product scope and workflow guardrails were derived from the supplied master document and Zinnovatio 4.0 report. Copies are in [`references/`](references/). They describe a proposed product; this prototype preserves the brief's Sense → Understand → Predict → Detect → Simulate → Explain flow, but does not imply CEA endorsement or claim unmeasured performance.
