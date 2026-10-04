# Supplied project brief and CEA source archive

The two PDFs supplied with the RE-PREDICT request were used as product/workflow and guardrail references:

- `RE-PREDICT_Master_Document.pdf`
- `RE_PREDICT_Zinnovatio_4_Report.pdf`

They describe a proposed system and are not datasets; no values were extracted from them into the dashboard.

## CEA daily generation snapshot

`cea_reports/` contains the 90 original daily CEA Excel reports from **3 July through 30 September 2026**. The normalized active snapshot is `../lib/cea_snapshot.json`; it extracts All India row 47 of the `Generation` worksheet for Wind, Solar and Other RES. Column E (published total) is used to cross-check the three components and is not counted as a separate technology. Each component manifest includes the direct CEA URL, local workbook path, workbook SHA-256, report date, row/cell mapping, and reconciliation result.

Official report portal: <https://gen-re.cea.gov.in/reports>. The packaged data is historical, bounded, and not live. RE-PREDICT is independent and not endorsed by CEA. To rebuild the normalized snapshot, see `../scripts/build_cea_snapshot.py` and `../README.md`.
