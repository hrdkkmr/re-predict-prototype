'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const snapshot = require('../lib/cea_snapshot.json');
const { createDemoStore } = require('../lib/seed');
const { aggregateSeries } = require('../lib/analytics');

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

test('packaged CEA snapshot has 90 consecutive report dates and 270 component observations', () => {
  const { manifest, observations } = snapshot;
  assert.equal(manifest.dataset_id, 'src-cea-90d');
  assert.equal(manifest.report_count, 90);
  assert.equal(manifest.observation_count, 270);
  assert.equal(manifest.components.length, 90);
  assert.equal(observations.length, 270);
  assert.deepEqual(manifest.technology_labels, ['Wind', 'Solar', 'Other RES']);
  assert.equal(manifest.coverage_start, '2026-07-03');
  assert.equal(manifest.coverage_end, '2026-09-30');
  const dates = manifest.components.map((component) => component.report_date);
  assert.equal(new Set(dates).size, 90);
  for (let index = 1; index < dates.length; index += 1) {
    const difference = (Date.parse(`${dates[index]}T00:00:00Z`) - Date.parse(`${dates[index - 1]}T00:00:00Z`)) / 86400000;
    assert.equal(difference, 1, `report dates must be daily and ordered: ${dates[index - 1]} → ${dates[index]}`);
  }
  assert.equal(manifest.reconciliation.reports_reconciled, 90);
  assert.equal(manifest.reconciliation.status, 'passed');
  assert.equal(manifest.reconciliation.max_abs_difference_mu, 0);
});

test('each CEA source checksum matches its packaged XLSX and All India cell mapping', () => {
  for (const component of snapshot.manifest.components) {
    const workbookPath = path.resolve(__dirname, '..', component.local_path);
    assert.ok(fs.existsSync(workbookPath), `missing packaged workbook ${component.file_name}`);
    const bytes = fs.readFileSync(workbookPath);
    assert.equal(bytes.length, component.size_bytes, `${component.file_name} byte length`);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), component.sha256, `${component.file_name} SHA-256`);
    assert.equal(component.sheet, 'Generation');
    assert.equal(component.all_india_row, 47);
    assert.match(component.row_label, /All India/);
    assert.equal(component.reconciliation_status, 'passed');
  }
});

test('normalized snapshot checksum covers the canonical observation records', () => {
  const canonical = stableStringify(snapshot.observations);
  const hash = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
  assert.equal(hash, snapshot.manifest.normalized_observations_sha256);
});

test('default seed activates CEA data without mixing the separate synthetic fixture', () => {
  const store = createDemoStore();
  assert.equal(store.active_source_id, 'src-cea-90d');
  const cea = store.observations_by_source['src-cea-90d'];
  assert.equal(cea.length, 270);
  assert.deepEqual([...new Set(cea.map((row) => row.technology))].sort(), ['Other RES', 'Solar', 'Wind']);
  assert.ok(cea.every((row) => row.geography === 'All India' && row.unit === 'MU'));
  const latestTotal = aggregateSeries(cea.filter((row) => row.date === '2026-09-30')).find((row) => row.date === '2026-09-30');
  assert.equal(latestTotal.value, 859.97);
  assert.deepEqual(cea.filter((row) => row.date === '2026-09-30').map((row) => row.value), [121.1, 704.89, 33.98]);
  assert.equal(store.observations_by_source['src-demo'].length, 480);
  assert.notEqual(store.active_source_id, 'src-demo');
});
