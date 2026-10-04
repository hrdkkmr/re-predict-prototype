# Prototype API

Base URL: same origin as the UI (default `http://localhost:4173`). Responses are JSON unless a raw artifact is requested. The server has no authentication; do not expose it or send confidential data.

## Health and workspace

### `GET /api/health`

Returns service status, version, active data version, and local server time.

### `GET /api/v1/state`

Returns the active source, active normalized observations, quality summary, source register (including the CEA report-component manifest), saved scenarios, review statuses, and recent audit events.

### `GET /api/v1/sources`

Returns source records and the active source ID. The default workspace registers three separate sources: the 90-report `official_dataset` snapshot, the synthetic demo fixture, and the official CEA portal link (`official_reference`). The reference-only catalog entry has no observations and cannot be activated.

### `POST /api/v1/activate`

```json
{ "source_id": "src-demo" }
```

Activates an already available observation snapshot. A reference-only catalog item cannot be activated as data.

### `POST /api/v1/reset`

Restores the synthetic demo fixture as the active dataset. Existing CEA snapshot, upload records, raw CSV files, audit events, and scenario history are not deleted.

## Observations and analytics

### `GET /api/v1/observations?technology=Solar&from=2026-09-01&to=2026-09-30`

Optional filters: `technology`, `from`, `to` (ISO date strings). `technology=all` returns all current-source records.

### `GET /api/v1/analytics/trends?technology=all&points=30`

Returns date labels and per-technology series, plus an all-source aggregate. In the CEA snapshot, this sum uses Wind + Solar + Other RES; the published total column is not separately added, preventing double counting. Aggregation is only meaningful when unit and geographic scope are compatible.

### `POST /api/v1/forecasts/run`

```json
{ "technology": "Solar", "horizon": 7, "window": 30 }
```

Uses a seasonal-naive lag-7 baseline and an ordered rolling-origin holdout against a persistence comparator. At least 21 observations are required. Output includes cutoff, method version, MAE, RMSE, persistence metrics, calibration-derived interval radius, observed holdout interval coverage, and explicit limitations. Metrics are snapshot-specific measurements, not claims of future performance or official CEA results.

### `GET /api/v1/anomalies?technology=all`

Uses a trailing robust baseline (median / MAD with documented fallbacks) and a robust-score threshold of 3.5. Each result is a signal only; no cause is inferred. A CEA-based anomaly is an independent prototype detector output, not a CEA alert.

## Ingestion and traceability

### `POST /api/v1/import`

JSON body:

```json
{
  "fileName": "reviewed-generation.csv",
  "rawText": "date,technology,value,unit,geography\n2026-10-01,Solar,105.2,GWh,National\n"
}
```

The server parses and validates the original CSV text, calculates SHA-256, saves the raw artifact under `data/raw/`, adds normalized observations, and activates the new snapshot only after the full file passes. The request must be under 6 MB JSON / 4 MB CSV. See [`../README.md`](../README.md#csv-import-contract) for the contract.

### `GET /api/v1/provenance/:id`

For a source ID, returns source metadata and a bounded sample of observations. For an observation ID, returns the observation, its source record, and (for the CEA bundle) its matching `source_component` with exact report date, workbook URL/name, SHA-256, worksheet, row, cells, and source-total reconciliation metadata.

### `GET /api/v1/cea-reports/:report_id/raw`

Downloads an original CEA daily XLSX workbook from the packaged `references/cea_reports/` archive. `report_id` is listed in the active source's `components` manifest (for example `cea-daily-2026-09-30`). The route only serves manifest-registered artifacts from that archive directory.

### `GET /api/v1/sources/:id/raw`

Downloads the original CSV artifact for an uploaded source. The CEA archive is downloaded through the report-ID route above. Synthetic demo/reference entries have no CSV raw artifact.

## Scenarios, review, and analyst

### `POST /api/v1/scenarios`

```json
{
  "technology": "Solar",
  "base_generation": 108.4,
  "unit": "MU",
  "base_capacity_mw": 10000,
  "scenario_capacity_mw": 11500,
  "availability_factor": 0.92
}
```

Validates the inputs, calculates `G_s = G × (C₁ / C₀) × A`, includes sensitivity cases, and persists the scenario with a formula version, source ID and data version. Result type is a simulation—not a forecast.

### `POST /api/v1/reviews`

```json
{ "event_id": "al-...", "status": "reviewed", "note": "Optional short note" }
```

Accepted statuses: `open`, `monitoring`, `reviewed`, `dismissed`. A local audit event is added.

### `POST /api/v1/analyst/query`

```json
{ "question": "What is the latest solar generation?", "technology": "Solar" }
```

A deterministic rule-based answer layer. It does not make a remote model call. It answers selected numeric questions only from the active snapshot/model/scenario evidence and returns citations or a limitation. Query text is written to the local audit trail.

### `POST /api/v1/audit`

Records a short prototype user action, such as evidence export. The event log is local to the demo workspace.

## Data model (summary)

`source_reports` retain report/upload metadata, source URL where known, parser version, status, date range, unit, checksum, and (for the CEA bundle) 90 component-workbook manifests. `observations_by_source` stores normalized records with observation ID, source ID, period, technology, geography, value, unit, quality status, and source locator. Derived outputs carry a data version and method/formula version. Runtime state is persisted in `data/store.json`; raw uploaded files are stored separately under `data/raw/`. The CEA source workbooks and normalized snapshot ship as read-only project artifacts.
