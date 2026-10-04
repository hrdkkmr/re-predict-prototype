# RE-PREDICT · 5-minute judge walkthrough

## Opening (0:00–0:35)

“Renewable-generation reports tell us what happened. The planning question is what pattern is changing, what might happen next, and which assumptions change the result. RE-PREDICT is an independent analysis layer that keeps each observation connected to its source while making those questions easier to investigate. It does not replace CEA reporting.”

**Show:** Overview, the `CEA REPORT SNAPSHOT` pill, and the provenance banner.

**Say plainly:** “The default data is a fixed snapshot of 90 CEA-published daily workbooks for All India, 3 July through 30 September 2026. The original XLSX files and per-file SHA-256 are included, and all 90 component sums reconcile exactly to the CEA daily total. It is not a live connection. RE-PREDICT is not a CEA product or endorsed by CEA.”

## Sense + Understand (0:35–1:25)

“On 30 September 2026, the Generation sheet's All India row reports 121.10 MU wind, 704.89 MU solar, 33.98 MU Other RES and 859.97 MU total. We use the three component columns for analysis and reconcile them against the separate total column, rather than summing the total twice.”

**Show:** Overview KPI and source mix. Open Explore and click a row's **CEA report** evidence link. Show the report date, `Generation!B47`, SHA-256, source-reported total, and the links to download the exact packaged workbook or open the CEA original.

## Source proof (1:25–1:55)

“Trust is the feature. Each date traces to its actual workbook, row, and cell. A separate manifest lists all 90 daily reports and the SHA-256 for every file. The extraction builder validates the report date and row, then compares Wind + Solar + Other RES with the CEA total.”

**Show:** Sources & Audit → open **Inspect the source chain**. Point to 90 report rows and 90/90 reconciliation, then show that CEA's portal remains linked.

## Predict (1:55–2:40)

“We start with a seasonal-naive lag-7 baseline rather than assuming a complex model is better. The output shows the cutoff, ordered holdout, persistence comparator, errors, and empirical interval. These measurements describe this short archived window only.”

**Show:** Forecast Lab. Compare MAE with persistence MAE. State that the result is not official CEA output, a future-accuracy claim, or a production-calibrated forecast.

## Detect (2:40–3:20)

“The anomaly desk flags deviations against a trailing robust baseline. It identifies where a number departs—not why. A human records whether the signal should be monitored, reviewed, or dismissed.”

**Show:** Anomaly Desk on the CEA snapshot. If there is not a strong visible example, switch to **Illustrative renewable generation fixture** in Sources & Audit and explicitly point out its synthetic label and intentionally planted wind shock. Return to the CEA source afterwards if useful. Say “signal, not cause.”

## Simulate + explain (3:20–4:40)

“This scenario is a calculation under explicit inputs: generation, a baseline capacity, a new capacity, and availability. The formula and low/base/high sensitivity are visible. It is not a prediction.”

**Show:** Scenario Studio; adjust capacity and availability; read `G_s = G × (C₁ / C₀) × A`. Then open Carbon Lens to show that 1 MU is converted to 1,000 MWh by exact unit definition, while the counterfactual emissions factor remains an illustrative placeholder—not a verified impact claim.

**Ask the analyst:** “What is the latest solar generation?” then “Why did wind generation change?” Show the cited active data and the safe causal limitation. The analyst is deterministic and local, not an external LLM.

## Close (4:40–5:00)

“Our differentiator is the complete, clickable evidence loop: actual published source artifacts, exact cell-level lineage, reconciliation, baseline analytics, anomaly review, transparent simulation, and bounded explanation. Next steps for production would include an automated source refresh and monitoring, independent domain validation, stronger model evaluation, authentication, and deployment/security hardening.”

## Presenter guardrails

- Call the inputs “published CEA observations in a date-bounded snapshot”; do not call RE-PREDICT official CEA or imply endorsement.
- State the snapshot date range, 3 July–30 September 2026, and that it is not live.
- Do not call forecasts, robust-deviation signals, scenarios, or carbon-proxy outputs official CEA data.
- Do not state a backtest score as expected future accuracy.
- Do not describe an anomaly as an outage, curtailment, weather event, or equipment failure.
- Do not call a scenario a prediction or its capacity assumptions source-verified.
- Do not present the carbon proxy as a verified reduction or credit; its factor is illustrative.
- The synthetic fixture is separate and labeled; never attribute its values or planted shock to CEA.
