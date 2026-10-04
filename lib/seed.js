'use strict';

const crypto = require('node:crypto');
const ceaSnapshot = require('./cea_snapshot.json');

const DEMO_END_DATE = '2026-10-02';
const SERIES = [
  { technology: 'Solar', base: 108, swing: 12, frequency: 15, phase: 2, noise: 6.2 },
  { technology: 'Wind', base: 136, swing: 28, frequency: 12, phase: -8, noise: 13.5 },
  { technology: 'Hydro', base: 268, swing: 15, frequency: 22, phase: 5, noise: 9.5 },
  { technology: 'Biomass', base: 26, swing: 2.8, frequency: 18, phase: 1, noise: 2.0 },
];

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function createDemoObservations() {
  const random = seededRandom(20261003);
  const end = new Date(`${DEMO_END_DATE}T00:00:00Z`);
  const observations = [];
  for (let i = 119; i >= 0; i -= 1) {
    const dateObject = new Date(end.getTime() - i * 24 * 60 * 60 * 1000);
    const date = dateObject.toISOString().slice(0, 10);
    const index = 119 - i;
    for (const series of SERIES) {
      const wave = Math.sin((index + series.phase) / series.frequency * 2 * Math.PI) * series.swing;
      const secondary = Math.cos((index + series.phase) / (series.frequency * 0.62) * 2 * Math.PI) * series.swing * 0.2;
      const noise = (random() + random() + random() - 1.5) * series.noise;
      let value = series.base + wave + secondary + noise;
      // A deliberate synthetic shock remains available as an isolated demo fixture.
      if (series.technology === 'Wind' && index === 96) value *= 0.1;
      value = Math.max(1, Math.round(value * 10) / 10);
      observations.push({
        observation_id: `demo-${date.replace(/-/g, '')}-${series.technology.toLowerCase()}`,
        source_id: 'src-demo',
        date,
        technology: series.technology,
        geography: 'National · illustrative',
        value,
        unit: 'GWh',
        quality_status: 'demo-synthetic',
        locator: { type: 'generated_demo_fixture', series: series.technology, period: date },
      });
    }
  }
  return observations;
}

function createDemoStore() {
  const demoObservations = createDemoObservations();
  const demoChecksum = crypto.createHash('sha256').update(JSON.stringify(demoObservations)).digest('hex');
  const now = new Date().toISOString();
  const official = ceaSnapshot.manifest;
  const officialObservations = ceaSnapshot.observations;
  return {
    schema_version: 1,
    active_source_id: official.dataset_id,
    dataset_version: official.dataset_version,
    observations_by_source: {
      [official.dataset_id]: officialObservations,
      'src-demo': demoObservations,
    },
    source_reports: [
      {
        source_id: official.dataset_id,
        dataset_version: official.dataset_version,
        source_type: 'official_dataset',
        title: official.title,
        file_name: null,
        source_url: official.source_url,
        report_date: official.coverage_end,
        snapshot_built_at: official.snapshot_built_at,
        created_at: official.snapshot_built_at,
        checksum: official.normalized_observations_sha256,
        checksum_type: 'sha256-normalized-observations',
        parser_version: 'cea-generation-row47-v1',
        status: 'validated_official_report_snapshot',
        record_count: official.observation_count,
        date_count: official.report_count,
        technology_count: official.technology_labels.length,
        technologies: official.technology_labels,
        unit: 'MU',
        unit_label: official.unit,
        start_date: official.coverage_start,
        end_date: official.coverage_end,
        components: official.components,
        reconciliation: official.reconciliation,
        description: 'Limited historical snapshot extracted from 90 CEA Daily Renewable Generation Report workbooks. Each daily value is linked to the All India row/cell and a SHA-256-registered workbook. RE-PREDICT is independent and not endorsed by CEA.',
      },
      {
        source_id: 'src-demo',
        source_type: 'synthetic_demo',
        title: 'Illustrative renewable generation fixture',
        file_name: null,
        source_url: null,
        report_date: DEMO_END_DATE,
        retrieved_at: null,
        created_at: now,
        checksum: demoChecksum,
        checksum_type: 'sha256-normalized-observations',
        parser_version: 'demo-fixture-v1',
        status: 'demo_only',
        record_count: demoObservations.length,
        date_count: 120,
        technology_count: 4,
        technologies: ['Solar', 'Wind', 'Hydro', 'Biomass'],
        unit: 'GWh',
        start_date: demoObservations[0].date,
        end_date: DEMO_END_DATE,
        description: 'Deterministic synthetic examples, including one intentionally planted wind signal; never CEA values.',
      },
      {
        source_id: 'cea-reference',
        source_type: 'official_reference',
        title: 'CEA Renewable Generation Reports portal',
        file_name: null,
        source_url: 'https://gen-re.cea.gov.in/reports',
        report_date: null,
        retrieved_at: null,
        created_at: now,
        checksum: null,
        parser_version: null,
        status: 'official_source_catalogue',
        record_count: 0,
        date_count: 0,
        technology_count: 0,
        unit: null,
        start_date: null,
        end_date: null,
        description: 'Official publisher portal. The active snapshot contains only the date-bounded archived reports listed in the CEA data bundle.',
      },
    ],
    scenarios: [],
    reviews: {},
    audit_events: [
      {
        event_id: `evt-${Date.now().toString(36)}`,
        type: 'workspace_initialized',
        title: 'CEA report snapshot loaded',
        detail: `${official.report_count} official daily workbooks loaded; ${official.reconciliation.reports_reconciled}/${official.report_count} source totals reconcile. Synthetic fixture is available as a separate demo dataset.`,
        object_ref: official.dataset_id,
        created_at: now,
      },
    ],
  };
}

module.exports = { createDemoStore, createDemoObservations, DEMO_END_DATE };
