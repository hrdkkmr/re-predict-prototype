'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const { createDemoStore } = require('./lib/seed');
const { parseObservationsCsv } = require('./lib/csv');
const {
  aggregateSeries,
  groupSeriesByTechnology,
  forecast,
  detectAnomalies,
  calculateScenario,
  safeAnalystAnswer,
  sortedDates,
} = require('./lib/analytics');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = process.env.RE_PREDICT_DATA_DIR || path.join(ROOT, 'data');
const RAW_DIR = path.join(DATA_DIR, 'raw');
const STORE_PATH = path.join(DATA_DIR, 'store.json');
const MAX_JSON_BODY = 6 * 1024 * 1024;
const MAX_CSV_BYTES = 4 * 1024 * 1024;

fs.mkdirSync(RAW_DIR, { recursive: true });

function saveStore(store) {
  const temporary = `${STORE_PATH}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(temporary, STORE_PATH);
}

function loadStore() {
  if (!fs.existsSync(STORE_PATH)) {
    const store = createDemoStore();
    saveStore(store);
    return store;
  }
  try {
    const store = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    if (!store || store.schema_version !== 1 || !Array.isArray(store.source_reports)) throw new Error('unsupported store');
    const hasCeaSnapshot = store.source_reports.some((report) => report.source_type === 'official_dataset' && report.source_id === 'src-cea-90d');
    if (!hasCeaSnapshot) {
      const fresh = createDemoStore();
      store.observations_by_source ||= {};
      for (const [sourceId, rows] of Object.entries(fresh.observations_by_source)) {
        if (!store.observations_by_source[sourceId]) store.observations_by_source[sourceId] = rows;
      }
      for (const report of fresh.source_reports) {
        if (report.source_type === 'official_reference') {
          store.source_reports = store.source_reports.filter((existing) => existing.source_id !== report.source_id);
          store.source_reports.push(report);
        } else if (!store.source_reports.some((existing) => existing.source_id === report.source_id)) {
          store.source_reports.unshift(report);
        }
      }
      if (store.active_source_id === 'src-demo' && String(store.dataset_version || '').startsWith('dv-demo-')) {
        store.active_source_id = fresh.active_source_id;
        store.dataset_version = fresh.dataset_version;
      }
      store.audit_events ||= [];
      store.audit_events.unshift({
        event_id: `evt-${Date.now().toString(36)}`,
        type: 'cea_snapshot_added',
        title: 'Official CEA report snapshot added',
        detail: '90 checksummed CEA daily reports are now available in the source register; a prior user-selected dataset is otherwise preserved.',
        object_ref: 'src-cea-90d',
        created_at: new Date().toISOString(),
      });
      saveStore(store);
    }
    return store;
  } catch (error) {
    const backup = `${STORE_PATH}.corrupt-${Date.now()}`;
    try { fs.renameSync(STORE_PATH, backup); } catch (_) { /* best effort */ }
    const store = createDemoStore();
    store.audit_events.unshift({
      event_id: `evt-${Date.now().toString(36)}`,
      type: 'storage_recovered',
      title: 'Local store recovered',
      detail: 'A malformed local JSON store was moved aside; a fresh demo workspace was initialized.',
      object_ref: 'local-store',
      created_at: new Date().toISOString(),
    });
    saveStore(store);
    return store;
  }
}

let store = loadStore();

function activeRows() {
  return store.observations_by_source[store.active_source_id] || [];
}

function activeSource() {
  return store.source_reports.find((report) => report.source_id === store.active_source_id) || null;
}

function activeVersion() {
  return store.dataset_version || `dv-${store.active_source_id}`;
}

function appendAudit(type, title, detail, objectRef = null, metadata = {}) {
  store.audit_events.unshift({
    event_id: `evt-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`,
    type,
    title,
    detail,
    object_ref: objectRef,
    metadata,
    created_at: new Date().toISOString(),
  });
  store.audit_events = store.audit_events.slice(0, 250);
}

function buildDataQuality(rows, source) {
  const dates = sortedDates(rows);
  const units = [...new Set(rows.map((row) => row.unit))];
  const technologies = [...new Set(rows.map((row) => row.technology))];
  const statuses = [...new Set(rows.map((row) => row.quality_status))];
  return {
    record_count: rows.length,
    date_count: dates.length,
    technology_count: technologies.length,
    technologies: technologies.sort((a, b) => a.localeCompare(b)),
    units,
    start_date: dates[0] || null,
    end_date: dates[dates.length - 1] || null,
    quality_statuses: statuses,
    source_status: source?.status || 'not_available',
    checks: source?.source_type === 'synthetic_demo' ? {
      schema: 'fixture-generated',
      date_integrity: 'fixture-generated',
      duplicate_keys: 'fixture-generated',
      unit_consistency: 'fixture-generated',
    } : source?.source_type === 'official_dataset' ? {
      schema: 'CEA workbook layout validated',
      date_integrity: `${source.date_count}/${source.date_count} report dates verified`,
      duplicate_keys: '0 duplicate date/source keys',
      unit_consistency: 'MU net · consistent',
      source_total_reconciliation: `${source.reconciliation?.reports_reconciled || 0}/${source.reconciliation?.reports_total || 0} daily totals reconcile`,
      raw_artifact_checksums: `${source.components?.length || 0} SHA-256 checksums recorded`,
    } : {
      schema: 'passed_at_import',
      date_integrity: 'passed_at_import',
      duplicate_keys: 'passed_at_import',
      unit_consistency: units.length <= 1 ? 'passed_at_import' : 'review_required',
    },
    source_report_count: source?.components?.length || 0,
    completeness_note: source?.source_type === 'official_dataset'
      ? `Archived reports are complete within this bounded window (${source.start_date} to ${source.end_date}); no live status is inferred beyond the snapshot.`
      : 'No expected reporting calendar is inferred. Coverage is shown as observed record/date counts only.',
  };
}

function publicState() {
  const rows = activeRows();
  const source = activeSource();
  return {
    app: { name: 'RE-PREDICT', version: '0.2.0-prototype' },
    data_version: activeVersion(),
    active_source_id: store.active_source_id,
    active_source: source,
    active_observations: rows,
    data_quality: buildDataQuality(rows, source),
    source_reports: store.source_reports.slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))),
    scenarios: store.scenarios.slice(0, 50),
    reviews: store.reviews,
    audit_events: store.audit_events.slice(0, 80),
    server_time: new Date().toISOString(),
  };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(payload));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    let tooLarge = false;
    request.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_JSON_BODY) tooLarge = true;
      else chunks.push(chunk);
    });
    request.on('end', () => {
      if (tooLarge) {
        const error = new Error('Request body is too large.');
        error.statusCode = 413;
        return reject(error);
      }
      const body = Buffer.concat(chunks).toString('utf8');
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); } catch (_) {
        const error = new Error('Request body must be valid JSON.');
        error.statusCode = 400;
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function cleanFileName(fileName) {
  const base = path.basename(String(fileName || 'renewable-observations.csv'));
  return base.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 100) || 'renewable-observations.csv';
}

function filterObservations(rows, searchParams) {
  const technology = String(searchParams.get('technology') || 'all').toLowerCase();
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  return rows.filter((row) => {
    if (technology !== 'all' && row.technology.toLowerCase() !== technology) return false;
    if (from && row.date < from) return false;
    if (to && row.date > to) return false;
    return true;
  });
}

function mimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.csv': 'text/csv; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon',
  })[extension] || 'application/octet-stream';
}

function serveStatic(request, response, pathname) {
  const decoded = decodeURIComponent(pathname || '/');
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const filePath = path.resolve(PUBLIC_DIR, relative);
  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`) && filePath !== path.join(PUBLIC_DIR, 'index.html')) {
    response.writeHead(403);
    return response.end('Forbidden');
  }
  fs.stat(filePath, (statError, stat) => {
    if (statError || !stat.isFile()) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return response.end('Not found');
    }
    response.writeHead(200, {
      'Content-Type': mimeType(filePath),
      'Cache-Control': path.extname(filePath) === '.html' ? 'no-cache' : 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'SAMEORIGIN',
    });
    fs.createReadStream(filePath).pipe(response);
  });
}

async function handleApi(request, response, url) {
  const pathname = url.pathname;
  const method = request.method || 'GET';

  if (method === 'GET' && pathname === '/api/health') {
    return sendJson(response, 200, { status: 'ok', service: 're-predict-prototype', version: '0.2.0-prototype', storage: 'local-json', data_version: activeVersion(), time: new Date().toISOString() });
  }
  if (method === 'GET' && (pathname === '/api/v1/state' || pathname === '/api/state')) {
    return sendJson(response, 200, publicState());
  }
  if (method === 'GET' && pathname === '/api/v1/sources') {
    return sendJson(response, 200, { data_version: activeVersion(), active_source_id: store.active_source_id, items: publicState().source_reports });
  }
  if (method === 'GET' && pathname === '/api/v1/observations') {
    const items = filterObservations(activeRows(), url.searchParams);
    return sendJson(response, 200, { data_version: activeVersion(), source_id: store.active_source_id, count: items.length, items });
  }
  if (method === 'GET' && pathname === '/api/v1/analytics/trends') {
    const rows = filterObservations(activeRows(), url.searchParams);
    const points = Number(url.searchParams.get('points') || 0);
    const group = groupSeriesByTechnology(rows, { days: points > 0 ? points : Infinity, includeAll: true });
    return sendJson(response, 200, { data_version: activeVersion(), source_id: store.active_source_id, ...group });
  }
  if (method === 'POST' && pathname === '/api/v1/forecasts/run') {
    const body = await readJson(request);
    const result = forecast(activeRows(), {
      technology: String(body.technology || 'all'),
      horizon: body.horizon,
      window: body.window,
    });
    return sendJson(response, 200, { ...result, data_version: activeVersion(), source_id: store.active_source_id });
  }
  if (method === 'GET' && pathname === '/api/v1/anomalies') {
    const technology = url.searchParams.get('technology') || 'all';
    const events = detectAnomalies(activeRows(), { sourceId: store.active_source_id, reviews: store.reviews, technology });
    return sendJson(response, 200, { data_version: activeVersion(), source_id: store.active_source_id, threshold: 3.5, count: events.length, items: events });
  }
  if (method === 'POST' && pathname === '/api/v1/import') {
    const body = await readJson(request);
    const fileName = cleanFileName(body.fileName);
    const rawText = String(body.rawText || '');
    const rawBytes = Buffer.from(rawText, 'utf8');
    if (!rawText.trim()) {
      const error = new Error('Choose a CSV file before importing.');
      error.statusCode = 400;
      throw error;
    }
    if (rawBytes.length > MAX_CSV_BYTES) {
      const error = new Error('CSV exceeds the 4 MB prototype upload limit.');
      error.statusCode = 413;
      throw error;
    }
    const parsed = parseObservationsCsv(rawText);
    const checksum = crypto.createHash('sha256').update(rawBytes).digest('hex');
    const sourceId = `upload-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
    const createdAt = new Date().toISOString();
    const rawPath = path.join(RAW_DIR, `${sourceId}.csv`);
    fs.writeFileSync(rawPath, rawBytes, { flag: 'wx' });
    const observations = parsed.records.map((record, index) => ({
      observation_id: `${sourceId}-r${index + 1}`,
      source_id: sourceId,
      ...record,
    }));
    const report = {
      source_id: sourceId,
      source_type: 'user_upload',
      title: fileName.replace(/\.csv$/i, '').replace(/[_-]+/g, ' '),
      file_name: fileName,
      source_url: null,
      report_date: parsed.summary.end_date,
      retrieved_at: null,
      created_at: createdAt,
      checksum,
      raw_path: path.relative(DATA_DIR, rawPath).split(path.sep).join('/'),
      parser_version: parsed.summary.parser_version,
      status: 'validated_local_csv',
      record_count: parsed.summary.record_count,
      date_count: parsed.summary.date_count,
      technology_count: parsed.summary.technology_count,
      technologies: parsed.summary.technologies,
      unit: parsed.summary.unit,
      start_date: parsed.summary.start_date,
      end_date: parsed.summary.end_date,
      validation: parsed.summary.checks,
      unmapped_headers: parsed.summary.unmapped_headers,
      dataset_version: `dv-${sourceId}`,
      description: 'User-provided CSV. Values are only as authoritative as the uploaded source; RE-PREDICT does not certify them.',
    };
    store.source_reports.push(report);
    store.observations_by_source[sourceId] = observations;
    store.active_source_id = sourceId;
    store.dataset_version = report.dataset_version;
    appendAudit('ingestion_completed', 'CSV imported and validated', `${observations.length} rows accepted from ${fileName}; SHA-256 registered.`, sourceId, { checksum, parser_version: report.parser_version });
    saveStore(store);
    return sendJson(response, 201, { ok: true, source: report, data_version: activeVersion(), quality: buildDataQuality(observations, report) });
  }
  if (method === 'POST' && pathname === '/api/v1/activate') {
    const body = await readJson(request);
    const source = store.source_reports.find((item) => item.source_id === String(body.source_id || ''));
    if (!source || !store.observations_by_source[source.source_id]) {
      const error = new Error('That report is not an available observation dataset.');
      error.statusCode = 404;
      throw error;
    }
    store.active_source_id = source.source_id;
    store.dataset_version = source.dataset_version || (source.source_id === 'src-demo' ? 'dv-demo-2026-10-03-v1' : `dv-${source.source_id}`);
    appendAudit('dataset_activated', 'Dataset activated', `Active data changed to ${source.title}.`, source.source_id);
    saveStore(store);
    return sendJson(response, 200, publicState());
  }
  if (method === 'POST' && pathname === '/api/v1/reset') {
    if (!store.observations_by_source['src-demo']) {
      const fresh = createDemoStore();
      store.observations_by_source['src-demo'] = fresh.observations_by_source['src-demo'];
      const demoReport = fresh.source_reports.find((item) => item.source_id === 'src-demo');
      if (demoReport) store.source_reports.unshift(demoReport);
    }
    store.active_source_id = 'src-demo';
    store.dataset_version = 'dv-demo-2026-10-03-v1';
    appendAudit('demo_restored', 'Illustrative demo restored', 'Active dataset reset to the synthetic demo fixture; official CEA snapshot remains available in the source register.', 'src-demo');
    saveStore(store);
    return sendJson(response, 200, publicState());
  }
  if (method === 'POST' && pathname === '/api/v1/scenarios') {
    const body = await readJson(request);
    const calculation = calculateScenario(body);
    const scenario = {
      scenario_id: `scn-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`,
      source_id: store.active_source_id,
      data_version: activeVersion(),
      created_at: new Date().toISOString(),
      ...calculation,
    };
    store.scenarios.unshift(scenario);
    store.scenarios = store.scenarios.slice(0, 100);
    appendAudit('scenario_created', 'Capacity scenario saved', `${scenario.technology}: ${scenario.results.base.generation} ${scenario.unit} under explicit capacity and availability assumptions.`, scenario.scenario_id, { formula_version: scenario.formula_version });
    saveStore(store);
    return sendJson(response, 201, scenario);
  }
  if (method === 'POST' && pathname === '/api/v1/reviews') {
    const body = await readJson(request);
    const eventId = String(body.event_id || '');
    const status = String(body.status || '');
    if (!eventId || !['open', 'monitoring', 'reviewed', 'dismissed'].includes(status)) {
      const error = new Error('A valid anomaly event_id and status are required.');
      error.statusCode = 400;
      throw error;
    }
    const existing = detectAnomalies(activeRows(), { sourceId: store.active_source_id, reviews: store.reviews }).find((event) => event.event_id === eventId);
    if (!existing) {
      const error = new Error('Anomaly signal not found in the active dataset.');
      error.statusCode = 404;
      throw error;
    }
    store.reviews[eventId] = { status, note: String(body.note || '').slice(0, 300), updated_at: new Date().toISOString() };
    appendAudit('anomaly_review_updated', `Signal ${status}`, `${existing.technology} on ${existing.date}; status set to ${status}.`, eventId);
    saveStore(store);
    return sendJson(response, 200, { ok: true, review: store.reviews[eventId] });
  }
  if (method === 'POST' && pathname === '/api/v1/analyst/query') {
    const body = await readJson(request);
    const question = String(body.question || '').slice(0, 500);
    const technology = String(body.technology || 'all');
    const rows = activeRows();
    const source = activeSource();
    const anomalies = detectAnomalies(rows, { sourceId: store.active_source_id, reviews: store.reviews });
    const result = safeAnalystAnswer({
      question,
      observations: rows,
      technology,
      source,
      datasetVersion: activeVersion(),
      anomalies,
      scenarios: store.scenarios.filter((scenario) => scenario.source_id === store.active_source_id),
    });
    appendAudit('analyst_query', 'Grounded analyst query', `Query processed in ${result.mode}; status: ${result.status}.`, store.active_source_id, { question: question.slice(0, 160), status: result.status });
    saveStore(store);
    return sendJson(response, 200, result);
  }
  if (method === 'POST' && pathname === '/api/v1/audit') {
    const body = await readJson(request);
    const action = String(body.action || 'export').slice(0, 60);
    appendAudit('user_action', action, String(body.detail || '').slice(0, 240), String(body.object_ref || '').slice(0, 120));
    saveStore(store);
    return sendJson(response, 200, { ok: true });
  }
  const ceaRawMatch = pathname.match(/^\/api\/v1\/cea-reports\/([a-zA-Z0-9_-]+)\/raw$/);
  if (method === 'GET' && ceaRawMatch) {
    const officialSource = store.source_reports.find((item) => item.source_type === 'official_dataset');
    const component = officialSource?.components?.find((item) => item.report_id === ceaRawMatch[1]);
    if (!component?.local_path) return sendJson(response, 404, { error: 'Archived CEA workbook is not included in this snapshot.' });
    const rawPath = path.resolve(ROOT, component.local_path);
    const allowedRoot = path.resolve(ROOT, 'references', 'cea_reports');
    if (!rawPath.startsWith(`${allowedRoot}${path.sep}`) || !fs.existsSync(rawPath)) return sendJson(response, 404, { error: 'Archived report artifact not found.' });
    response.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${path.basename(rawPath)}"`,
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    });
    return fs.createReadStream(rawPath).pipe(response);
  }

  const rawMatch = pathname.match(/^\/api\/v1\/sources\/([a-zA-Z0-9_-]+)\/raw$/);
  if (method === 'GET' && rawMatch) {
    const source = store.source_reports.find((item) => item.source_id === rawMatch[1]);
    if (!source || !source.raw_path) return sendJson(response, 404, { error: 'Raw artifact is not available for this source.' });
    const rawPath = path.resolve(DATA_DIR, source.raw_path);
    if (!rawPath.startsWith(`${RAW_DIR}${path.sep}`) || !fs.existsSync(rawPath)) return sendJson(response, 404, { error: 'Raw artifact not found.' });
    response.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${cleanFileName(source.file_name)}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    return fs.createReadStream(rawPath).pipe(response);
  }
  const provenanceMatch = pathname.match(/^\/api\/v1\/provenance\/([a-zA-Z0-9_-]+)$/);
  if (method === 'GET' && provenanceMatch) {
    const id = provenanceMatch[1];
    const source = store.source_reports.find((item) => item.source_id === id);
    if (source) return sendJson(response, 200, { data_version: activeVersion(), source, observations: (store.observations_by_source[id] || []).slice(0, 100) });
    const observation = Object.values(store.observations_by_source).flat().find((row) => row.observation_id === id);
    if (!observation) return sendJson(response, 404, { error: 'Provenance reference not found.' });
    const observationSource = store.source_reports.find((item) => item.source_id === observation.source_id) || null;
    const sourceComponent = observationSource?.components?.find((item) => item.report_id === observation.source_report_id) || null;
    return sendJson(response, 200, { data_version: activeVersion(), observation, source: observationSource, source_component: sourceComponent });
  }

  return sendJson(response, 404, { error: 'API route not found.' });
}

function createServer() {
  return http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    try {
      if (requestUrl.pathname.startsWith('/api/')) {
        await handleApi(request, response, requestUrl);
      } else if (request.method === 'GET' || request.method === 'HEAD') {
        serveStatic(request, response, requestUrl.pathname);
      } else {
        sendJson(response, 405, { error: 'Method not allowed.' });
      }
    } catch (error) {
      const status = Number(error.statusCode) || 500;
      const payload = { error: status >= 500 ? 'The prototype encountered an internal error.' : error.message, code: error.code || 'REQUEST_ERROR' };
      if (Array.isArray(error.issues) && error.issues.length) payload.issues = error.issues;
      if (status >= 500) console.error('[RE-PREDICT]', error);
      if (!response.headersSent) sendJson(response, status, payload);
      else response.destroy();
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 4173);
  const host = process.env.HOST || '0.0.0.0';
  const server = createServer();
  server.listen(port, host, () => {
    console.log(`RE-PREDICT prototype listening on http://${host}:${port}`);
    console.log(`Active source: ${store.active_source_id} · data version: ${activeVersion()}`);
    console.log(`Local store: ${STORE_PATH}`);
  });
}

module.exports = { createServer, loadStore, publicState, handleApi, DATA_DIR };
