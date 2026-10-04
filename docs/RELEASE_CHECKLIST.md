# Hackathon demo release gate

## Before the presentation

- [ ] Run `npm test` and `npm run check` from the project root.
- [ ] Start a clean workspace and verify `GET /api/health` returns `status: ok` and `src-cea-90d` is active.
- [ ] Confirm the source window reads 3 July–30 September 2026 and the data is described as a historical snapshot, not live.
- [ ] Confirm the CEA snapshot has 270 records, three source series, and 90/90 report-total reconciliation.
- [ ] From Explore, click an evidence link and verify exact report date, worksheet/cell, published total, per-file SHA-256, original CEA URL, and packaged workbook download.
- [ ] Open Sources & Audit → manifest; verify all 90 rows are present and each original XLSX can download.
- [ ] Check forecast cutoff, ordered validation window, persistence baseline, and interval caveat.
- [ ] Check anomalies are called signals, not causes. If needed, switch to the clearly separate synthetic fixture to demonstrate its planted event.
- [ ] Verify scenario formula, user-entered capacity note, sensitivity range, and saved run.
- [ ] Verify the carbon conversion (including 1 MU = 1,000 MWh) is explicit; the emission factor remains illustrative.
- [ ] Verify the analyst cites source/date and limits causal claims.
- [ ] Test sample CSV import, one invalid CSV rejection, raw download, source switching, and synthetic-demo restore.
- [ ] Export an evidence bundle to keep as a fallback.
- [ ] Rehearse the five-minute script and keep the browser tab loaded.

## P0 demo acceptance checks

| Check | Expected |
|---|---|
| Service health | API returns HTTP 200 and `status: ok`. |
| CEA snapshot | Default data is a bounded, published-data snapshot and is never described as live or as CEA analysis. |
| Source archive | All 90 workbook artifacts exist, each manifest SHA-256 matches the workbook, and extraction dates/layout are valid. |
| Total reconciliation | All 90 `Wind + Solar + Other RES` sums match the report's All India daily total within 0.02 MU. |
| Synthetic fixture | Selectable separately; its values and planted alert remain labelled synthetic, never CEA. |
| CSV validation | Invalid dates, negative values, duplicate keys, and mixed units reject the entire import. |
| Provenance | CEA rows resolve to report ID, source URL, workbook checksum, sheet/row/cell, total check, and archived XLSX. CSV rows retain upload checksum and locator. |
| Forecast | Requires 21 observations; compares seasonal-naive with persistence on ordered holdout periods; no future-performance claim. |
| Anomaly | Shows robust score, trailing expected baseline, review status, and “signal-not-cause” caveat. |
| Scenario | Server output equals `G × (C₁/C₀) × A`; stores assumptions and version. |
| Analyst | Supported answer cites the active source/data version; unsupported cause question stays limited. |
| Export | CSV and JSON evidence bundle download with provenance metadata. |

## Known prototype limitations

The packaged CEA series is a fixed historical snapshot; automated source refresh, independent measurement audit, authentication, external LLM, weather feed, live model retraining, production database, role-based access, cloud deployment, operational alerting, security review, and production service-level objective are not implemented. Forecasts, anomaly outputs, capacity assumptions, and carbon proxies are prototype calculations, not operational determinations. The local server is for demo use only.
