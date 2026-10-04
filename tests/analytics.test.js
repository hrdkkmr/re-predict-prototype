'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDemoObservations } = require('../lib/seed');
const { calculateScenario, detectAnomalies, forecast, safeAnalystAnswer } = require('../lib/analytics');

function makeSeries(count = 40, technology = 'Solar') {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10);
    return { observation_id: `row-${index}`, source_id: 'test-source', date, technology, geography: 'Test', value: 100 + (index % 7) * 2 + Math.sin(index / 4), unit: 'GWh', quality_status: 'validated' };
  });
}

test('seasonal-naive forecast is time ordered, versioned, and reports persistence comparison', () => {
  const rows = makeSeries(56);
  const result = forecast(rows, { technology: 'Solar', horizon: 7 });
  assert.equal(result.status, 'ready');
  assert.equal(result.forecast_points.length, 7);
  assert.equal(result.forecast_points[0].value, Math.round(rows[49].value * 1000) / 1000);
  assert.equal(result.forecast_points[6].value, Math.round(rows[55].value * 1000) / 1000);
  assert.ok(result.metrics.validation_count > 0);
  assert.ok(Number.isFinite(result.metrics.mae));
  assert.ok(Number.isFinite(result.metrics.persistence_mae));
  assert.equal(result.model_card.model_version, 'seasonal-naive-v1');
  assert.match(result.model_card.leakage_control, /before its target period/);
});

test('forecast refuses a snapshot with too little history', () => {
  const result = forecast(makeSeries(12), { technology: 'Solar' });
  assert.equal(result.status, 'insufficient_history');
  assert.equal(result.forecast_points.length, 0);
});

test('demo fixture plants one labelled wind deviation for review', () => {
  const events = detectAnomalies(createDemoObservations(), { sourceId: 'src-demo' });
  assert.ok(events.length >= 1);
  assert.equal(events[0].technology, 'Wind');
  assert.equal(events[0].date, '2026-09-09');
  assert.ok(Math.abs(events[0].robust_score) >= 3.5);
  assert.match(events[0].interpretation, /does not establish a physical cause/);
});

test('scenario applies capacity ratio and availability exactly', () => {
  const result = calculateScenario({
    technology: 'Solar', base_generation: 100, unit: 'GWh', base_capacity_mw: 10000,
    scenario_capacity_mw: 12000, availability_factor: 0.9,
  });
  assert.equal(result.results.base.generation, 108);
  assert.equal(result.results.low.generation, 96);
  assert.equal(result.results.high.generation, 120);
  assert.equal(result.formula_version, 'capacity-scale-v1');
  assert.match(result.label, /not a forecast/);
});

test('scenario rejects impossible inputs', () => {
  assert.throws(() => calculateScenario({ base_generation: -1, base_capacity_mw: 0, scenario_capacity_mw: 10, availability_factor: 1.1 }), /non-negative|greater than zero|between 0 and 1/);
});

test('analyst returns a cited snapshot answer and limits causal claims', () => {
  const rows = makeSeries(30);
  const source = { source_id: 'test-source', source_type: 'user_upload', title: 'reviewed.csv', record_count: rows.length, checksum: 'abc123' };
  const latest = safeAnalystAnswer({ question: 'What is the latest solar generation?', observations: rows, technology: 'Solar', source, datasetVersion: 'dv-test' });
  assert.equal(latest.status, 'answered');
  assert.match(latest.answer, /not CEA|uploaded source/);
  assert.equal(latest.citations[0].dataset_version, 'dv-test');
  const why = safeAnalystAnswer({ question: 'Why did solar generation fall?', observations: rows, technology: 'Solar', source, datasetVersion: 'dv-test' });
  assert.equal(why.status, 'limited');
  assert.match(why.answer, /cannot infer|does not establish/);
});

test('analyst does not substitute a different date for an exact-date question', () => {
  const rows = makeSeries(30, 'Solar');
  const source = { source_id: 'test-source', source_type: 'user_upload', title: 'series.csv' };
  const result = safeAnalystAnswer({ question: 'Solar generation on 2026-01-02', observations: rows, technology: 'all', source, datasetVersion: 'dv-test' });
  assert.equal(result.status, 'answered');
  assert.match(result.answer, /2026-01-02/);
  assert.equal(result.evidence[0].date, '2026-01-02');
  const missing = safeAnalystAnswer({ question: 'Solar generation on 2025-12-01', observations: rows, technology: 'all', source, datasetVersion: 'dv-test' });
  assert.equal(missing.status, 'limited');
  assert.match(missing.answer, /will not substitute a different period/);
});

test('analyst answers a recent-trend question with an explicit two-window comparison', () => {
  const rows = makeSeries(35, 'Wind');
  const source = { source_id: 'test-source', source_type: 'user_upload', title: 'series.csv' };
  const result = safeAnalystAnswer({ question: 'How has wind generation trended?', observations: rows, technology: 'all', source, datasetVersion: 'dv-test' });
  assert.equal(result.status, 'answered');
  assert.match(result.answer, /latest 7 observed periods/);
  assert.match(result.answer, /descriptive comparison, not a causal explanation/);
  assert.equal(result.evidence[0].type, 'trend_comparison');
});

test('analyst recognizes a forecast request before the word generation', () => {
  const rows = makeSeries(50, 'Wind');
  const source = { source_id: 'test-source', source_type: 'user_upload', title: 'series.csv' };
  const result = safeAnalystAnswer({ question: 'Forecast wind generation', observations: rows, technology: 'all', source, datasetVersion: 'dv-test' });
  assert.equal(result.status, 'answered');
  assert.match(result.answer, /baseline outlook/);
  assert.equal(result.evidence[0].type, 'model_run');
});
