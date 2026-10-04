'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 're-predict-api-'));
process.env.RE_PREDICT_DATA_DIR = testDataDir;
const { createServer } = require('../server');
const server = createServer();

const baseUrl = new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    resolve(`http://127.0.0.1:${address.port}`);
  });
});

test('CEA state, row-level provenance, and archived report download are served by the API', async (t) => {
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(testDataDir, { recursive: true, force: true });
  });
  const origin = await baseUrl;
  const stateResponse = await fetch(`${origin}/api/v1/state`);
  assert.equal(stateResponse.status, 200);
  const state = await stateResponse.json();
  assert.equal(state.active_source_id, 'src-cea-90d');
  assert.equal(state.active_observations.length, 270);
  assert.equal(state.active_source.components.length, 90);
  assert.equal(state.data_quality.checks.source_total_reconciliation, '90/90 daily totals reconcile');

  const observationId = 'cea-daily-2026-09-30-solar';
  const provenanceResponse = await fetch(`${origin}/api/v1/provenance/${observationId}`);
  assert.equal(provenanceResponse.status, 200);
  const provenance = await provenanceResponse.json();
  assert.equal(provenance.observation.value, 704.89);
  assert.equal(provenance.observation.locator.cell, 'C47');
  assert.equal(provenance.source_component.report_date, '2026-09-30');
  assert.equal(provenance.source_component.sheet, 'Generation');
  assert.equal(provenance.source_component.reconciliation_status, 'passed');

  const reportResponse = await fetch(`${origin}/api/v1/cea-reports/cea-daily-2026-09-30/raw`);
  assert.equal(reportResponse.status, 200);
  assert.match(reportResponse.headers.get('content-type'), /spreadsheetml\.sheet/);
  const workbook = Buffer.from(await reportResponse.arrayBuffer());
  const hash = crypto.createHash('sha256').update(workbook).digest('hex');
  assert.equal(hash, provenance.source_component.sha256);

  const portalOnly = await fetch(`${origin}/api/v1/cea-reports/not-a-registered-report/raw`);
  assert.equal(portalOnly.status, 404);
});
