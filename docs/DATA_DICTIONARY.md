# Data dictionary and trust labels

## Active CEA observation snapshot

The default source (`src-cea-90d`) is a fixed archive of 90 Central Electricity Authority (CEA) Daily Renewable Generation Report workbooks covering **2026-07-03 through 2026-09-30**. It contains 270 daily values for **All India**: Wind, Solar, and CEA's combined **Other RES** category. The extraction reads `Generation` sheet, row 47, cells **B47–D47**. Cell **E47** (published All India total) is used for reconciliation, not added as a fourth technology; this prevents double counting. Values use the source label **MU net** and are stored as `unit: "MU"`.

The 90 original XLSX files are in `references/cea_reports/`. Every workbook's SHA-256, direct source URL, report date, sheet, row, source cells, published total, and reconciliation outcome are listed in `lib/cea_snapshot.json`. `normalized_observations_sha256` is the SHA-256 of the canonical normalized observation array; it is not a hash of the original workbook archive. The snapshot manifest records the exact build time; per-workbook `snapshot_built_at` reflects manifest generation, not a separately captured HTTP retrieval timestamp. This is a date-bounded historical archive, not a live CEA feed. The prototype is independent and not endorsed by CEA.

The included builder (`scripts/build_cea_snapshot.py`) requires `openpyxl` only when refreshing the normalized JSON; the application itself has no third-party runtime dependencies. It fails closed on missing/mismatched report dates, unexpected sheet/row structure, non-numeric cells, or source-total differences above 0.02 MU.

## Observation fields

| Field | Type | Meaning |
|---|---|---|
| `observation_id` | string | Stable ID within the packaged local snapshot. |
| `source_id` | string | Source-register ID that owns the observation. |
| `date` | `YYYY-MM-DD` | CEA report date or CSV period. CSV timestamps retain only their date; frequency is not guessed. |
| `technology` | string | CEA: `Wind`, `Solar`, or `Other RES`; uploads retain their source/technology label; fixture uses illustrative labels. |
| `geography` | string | CEA: `All India`; imported geography is retained; missing input becomes `Not specified`. |
| `value` | number | Non-negative reported/entered generation value. No silent unit conversion is applied to observations. |
| `unit` | string | CEA: `MU` (source table says MU net); uploads are normalized to one unit per file; synthetic fixture: GWh. |
| `quality_status` | string | `verified_report_extraction` for the archived CEA row/cell mapping; `validated` for CSV schema validation; `demo-synthetic` for generated fixture rows. “Verified” here means the local extraction/structure checks passed, not independent audit of CEA's measurement system. |
| `source_report_id` | string | CEA report component ID for the date; resolves to one XLSX component manifest entry. |
| `locator` | object | CEA worksheet/cell/row/report date; CSV row number; or synthetic fixture locator. |

## Source register

| `source_type` | Meaning |
|---|---|
| `official_dataset` | A bounded, parsed snapshot of CEA-published reports. Raw workbooks and source links are included, per-file SHA-256 is recorded, and report totals are checked. Not live and not a CEA product. |
| `synthetic_demo` | Deterministic generated fixture; not a report and not a representation of actual generation. Includes one intentionally planted signal for UI walkthroughs. |
| `user_upload` | A locally imported CSV. Original-file hash and parser metadata are recorded, but the input is not independently certified. |
| `official_reference` | Official publisher portal link, registered for navigation. It has no observations itself. |

Official portal: <https://gen-re.cea.gov.in/reports>.

## Derived outputs

| Output | Definition | Boundary |
|---|---|---|
| Latest/average trend | Aggregation of compatible active observations by date; “All technologies” sums Wind + Solar + Other RES in the CEA snapshot. The published total column is not separately added. | Component sum is checked against the published CEA total for each archived date. Other RES remains aggregated as CEA reports it. |
| Forecast | Seasonal-naive lag-7 estimate; rolling-origin one-step evaluation against persistence. | Snapshot-specific baseline only; no external weather/capacity features or production accuracy claim. Not official CEA output. |
| Anomaly | Robust deviation score against up to 28 prior observations, with median/MAD fallback logic. | Review signal only; not root-cause detection or a CEA alert. |
| Capacity scenario | `G_s = G × (C₁ / C₀) × A`. | Conditional calculation under user-entered capacity and availability assumptions; not a forecast. |
| Carbon proxy | `E = G_MWh × EF_tCO₂e/MWh`; 1 MU = 1 GWh = 1,000 MWh is used as an exact unit conversion where applicable. | The factor is user-entered/illustrative; not verified emissions reduction or a carbon credit. |
| AI Analyst response | Rule-based intent routing and deterministic calculations over active prototype evidence. | Not a remote LLM, general chatbot, or web search. Unsupported questions receive a limitation. |

## Claim types used in the interface

- **Observed:** value present in the active snapshot; CEA source values are distinguishable from uploaded or synthetic rows.
- **Derived:** deterministic aggregation or model evaluation from a versioned snapshot.
- **Predicted / forecast:** model estimate for future periods, visibly separated from observations.
- **Simulated:** hypothetical result under explicit user assumptions.
- **Estimated:** methodology- and factor-dependent proxy, with caveats.
- **Synthetic demo:** generated solely to exercise UI and logic; never attribute to CEA.
