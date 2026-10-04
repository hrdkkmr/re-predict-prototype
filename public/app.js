'use strict';

const COLORS = {
  Solar: '#d69c45',
  Wind: '#4b91d2',
  Hydro: '#39a893',
  Biomass: '#9474c4',
  'Other RES': '#9474c4',
  default: '#63829b',
  total: '#27495a',
};
const VIEW_META = {
  overview: ['OVERVIEW', 'Energy overview'],
  explore: ['EXPLORE', 'Understand the pattern'],
  forecast: ['FORECAST LAB', 'Forecast lab'],
  anomalies: ['ANOMALY DESK', 'Signals for review'],
  scenarios: ['SCENARIO STUDIO', 'Simulate an assumption'],
  carbon: ['CARBON LENS', 'Carbon methodology lens'],
  analyst: ['AI ANALYST', 'Ask the evidence'],
  sources: ['SOURCES & AUDIT', 'Source & lineage studio'],
};

const ui = {
  view: 'overview',
  state: null,
  anomalies: [],
  forecast: null,
  forecastHorizon: 7,
  scenarioResult: null,
  scenarioForm: null,
  chat: [],
  analystBusy: false,
  importBusy: false,
  carbonFactor: 0.7,
  carbonGeneration: null,
  carbonBasis: 'observed',
  apiOnline: false,
  chartWindow: 30,
};

const root = document.getElementById('appRoot');
const modalRoot = document.getElementById('modal-root');
const toastRoot = document.getElementById('toast-root');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}
function escapeXml(value) {
  return escapeHtml(value);
}
function formatNumber(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: digits === 0 ? 0 : Math.min(1, digits) }).format(number);
}
function formatCompact(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  if (Math.abs(number) >= 1000000) return `${formatNumber(number / 1000000, digits)}M`;
  if (Math.abs(number) >= 10000) return `${formatNumber(number / 1000, digits)}k`;
  return formatNumber(number, digits);
}
function formatDate(date, options = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!date) return '—';
  const parsed = new Date(`${String(date).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return String(date);
  return new Intl.DateTimeFormat('en-IN', options).format(parsed);
}
function formatAxisDate(value) {
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value).slice(5);
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(date);
}
function safeMean(values) {
  const nums = values.map(Number).filter(Number.isFinite);
  return nums.length ? nums.reduce((sum, value) => sum + value, 0) / nums.length : 0;
}
function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b)));
}
function currentState() { return ui.state || {}; }
function observations() { return Array.isArray(currentState().active_observations) ? currentState().active_observations : []; }
function activeSource() { return currentState().active_source || null; }
function selectedTechnology() { return document.getElementById('global-tech')?.value || 'all'; }
function selectedTechnologyLabel() {
  const selected = selectedTechnology();
  if (selected === 'all') return 'All technologies';
  return (currentState().data_quality?.technologies || []).find((name) => name.toLowerCase() === selected.toLowerCase()) || selected;
}
function selectedWindow() {
  const value = document.getElementById('global-window')?.value || '30';
  return value === 'all' ? Infinity : Math.max(1, Number(value) || 30);
}
function selectedWindowLabel() {
  const value = document.getElementById('global-window')?.value || '30';
  return value === 'all' ? 'all available observations' : `last ${value} observation periods`;
}
function technologyColor(name) {
  return COLORS[name] || COLORS[String(name || '').toLowerCase()] || COLORS.default;
}
function htmlIcon(name, cls = '') {
  const paths = {
    alert: '<path d="M12 3.3 21 19H3l9-15.7Z"/><path d="M12 9v4.6m0 2.8h.01"/>',
    trend: '<path d="M3.5 18.5 8.8 13l3.6 3.1 8-9"/><path d="M15.8 7.1h4.5v4.5"/>',
    bolt: '<path d="m13.4 2.8-8 10h6l-.8 8.4 8-10h-6l.8-8.4Z"/>',
    leaf: '<path d="M20.3 4.2C13.4 3.5 6.4 5.1 4.1 10c-1.9 4.1.8 8.2 4.7 8.2 5.2 0 9.7-6 11.5-14Z"/><path d="M5.4 19.5c2.5-4.2 6.1-7.3 10.2-9.5"/>',
    dataset: '<path d="M4 6.2c0-1.5 3.6-2.7 8-2.7s8 1.2 8 2.7-3.6 2.7-8 2.7-8-1.2-8-2.7Z"/><path d="M4 6.2v5.6c0 1.5 3.6 2.7 8 2.7s8-1.2 8-2.7V6.2M4 11.8v5.6c0 1.5 3.6 2.7 8 2.7s8-1.2 8-2.7v-5.6"/>',
    check: '<path d="m4.5 12.4 4.6 4.4L19.5 6.8"/>',
    clock: '<circle cx="12" cy="12" r="8.6"/><path d="M12 7v5l3.3 2"/>',
    file: '<path d="M6 3.5h8l4 4v13H6v-17Z"/><path d="M14 3.5v4.2h4m-9 4.2h6m-6 3.4h6"/>',
    sparkle: '<path d="m12 2.6 1.7 5.1 5.1 1.7-5.1 1.7-1.7 5.1-1.7-5.1-5.1-1.7 5.1-1.7L12 2.6Z"/><path d="m19 15.8.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9.9-2.4Z"/>',
    source: '<path d="M6 3.5h8l4 4v13H6v-17Z"/><path d="M14 3.5v4.2h4m-9 4.1h6m-6 3.5h6"/>',
    upload: '<path d="M10 14V3.7m0 0L6.5 7.2M10 3.7l3.5 3.5M4.2 12.2v3.2c0 .8.6 1.4 1.4 1.4h9c.8 0 1.4-.6 1.4-1.4v-3.2"/>',
    external: '<path d="M13 4h6v6m-.5-5.5L10 13"/><path d="M17 13v5.5H4.5V6H10"/>',
    export: '<path d="M12 3.5v10m0 0 4-4m-4 4-4-4M4.5 14v4.5h15V14"/>',
    shield: '<path d="M12 3 19 6v5.2c0 4.4-2.8 7.5-7 9.8-4.2-2.3-7-5.4-7-9.8V6l7-3Z"/><path d="m8.8 12.3 2.1 2.1 4.4-4.7"/>',
    eye: '<path d="M2.8 12s3.2-5.7 9.2-5.7 9.2 5.7 9.2 5.7-3.2 5.7-9.2 5.7S2.8 12 2.8 12Z"/><circle cx="12" cy="12" r="2.4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
  };
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.file}</svg>`;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
  });
  let data;
  try { data = await response.json(); } catch (_) { data = {}; }
  if (!response.ok) {
    const error = new Error(data.error || `Request failed (${response.status})`);
    error.status = response.status;
    error.issues = data.issues || [];
    throw error;
  }
  return data;
}

function toast(message, type = 'success', duration = 3600) {
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.textContent = message;
  toastRoot.appendChild(node);
  window.setTimeout(() => node.remove(), duration);
}

function updateApiStatus(online) {
  ui.apiOnline = Boolean(online);
  const indicator = document.getElementById('api-indicator');
  if (!indicator) return;
  indicator.classList.toggle('is-online', ui.apiOnline);
  indicator.classList.toggle('is-offline', !ui.apiOnline);
  indicator.title = ui.apiOnline ? 'Local prototype API connected' : 'Local prototype API unavailable';
}

function updateGlobalHeader() {
  const state = currentState();
  const meta = VIEW_META[ui.view] || VIEW_META.overview;
  const crumb = document.getElementById('breadcrumb-current');
  const title = document.getElementById('topbar-title');
  if (crumb) crumb.textContent = meta[0];
  if (title) title.textContent = meta[1];
  document.querySelectorAll('.nav-item[data-view]').forEach((item) => item.classList.toggle('is-active', item.dataset.view === ui.view));

  const techSelect = document.getElementById('global-tech');
  if (techSelect && state.data_quality) {
    const old = techSelect.value || 'all';
    const techs = state.data_quality.technologies || [];
    techSelect.innerHTML = `<option value="all">All technologies</option>${techs.map((name) => `<option value="${escapeHtml(name.toLowerCase())}">${escapeHtml(name)}</option>`).join('')}`;
    const actual = techs.find((name) => name.toLowerCase() === old);
    techSelect.value = actual ? actual.toLowerCase() : 'all';
  }

  const source = state.active_source;
  const pill = document.getElementById('dataset-pill');
  const pillText = document.getElementById('dataset-pill-text');
  if (pill && pillText) {
    pill.classList.toggle('is-upload', source?.source_type === 'user_upload');
    let label = 'DATA UNAVAILABLE';
    if (source?.source_type === 'official_dataset') label = 'CEA REPORT SNAPSHOT';
    else if (source?.source_type === 'synthetic_demo') label = 'SYNTHETIC DEMO';
    else if (source?.source_type === 'user_upload') label = 'USER DATA ACTIVE';
    pillText.textContent = label;
    pill.setAttribute('aria-label', source ? `Active dataset: ${label}. View sources and audit.` : 'View sources and audit');
  }
  const alertCounter = document.getElementById('nav-alert-count');
  if (alertCounter) {
    const active = (ui.anomalies || []).filter((event) => event.status === 'open' || event.status === 'monitoring').length;
    alertCounter.textContent = String(active);
    alertCounter.classList.toggle('has-alerts', active > 0);
  }
}

async function refreshState({ renderPage = true } = {}) {
  const data = await api('/api/v1/state');
  ui.state = data;
  updateGlobalHeader();
  if (renderPage) render();
  return data;
}

async function loadAnomalies() {
  try {
    const data = await api('/api/v1/anomalies?technology=all');
    ui.anomalies = data.items || [];
  } catch (error) {
    ui.anomalies = [];
    if (error.status !== 404) console.warn('Could not load anomaly signals:', error.message);
  }
  updateGlobalHeader();
}

async function loadForecast() {
  if (!ui.state) return;
  const data = await api('/api/v1/forecasts/run', {
    method: 'POST',
    body: JSON.stringify({ technology: selectedTechnology(), horizon: ui.forecastHorizon, window: selectedWindow() === Infinity ? 60 : selectedWindow() }),
  });
  ui.forecast = data;
}

function render() {
  if (!root || !ui.state) return;
  updateGlobalHeader();
  switch (ui.view) {
    case 'explore': root.innerHTML = renderExplore(); break;
    case 'forecast': root.innerHTML = renderForecast(); break;
    case 'anomalies': root.innerHTML = renderAnomalies(); break;
    case 'scenarios': root.innerHTML = renderScenarios(); break;
    case 'carbon': root.innerHTML = renderCarbon(); break;
    case 'analyst': root.innerHTML = renderAnalyst(); break;
    case 'sources': root.innerHTML = renderSources(); break;
    default: root.innerHTML = renderOverview(); break;
  }
  if (ui.view === 'scenarios' && ui.scenarioForm?.technology) {
    const scenarioTech = document.getElementById('scenario-tech');
    if (scenarioTech) scenarioTech.value = ui.scenarioForm.technology;
  }
  window.requestAnimationFrame(() => {
    drawCharts();
    updateCarbonEstimate();
  });
}

function goToView(view) {
  if (!VIEW_META[view]) return;
  ui.view = view;
  document.body.classList.remove('sidebar-open');
  render();
  if (view === 'forecast') {
    loadForecast().then(render).catch((error) => { ui.forecast = { status: 'error', message: error.message }; render(); });
  }
  if (view === 'anomalies') loadAnomalies().then(render);
}

function getFilteredRows({ useWindow = true, selected = selectedTechnology() } = {}) {
  let rows = observations().slice();
  if (selected && selected !== 'all') rows = rows.filter((row) => row.technology.toLowerCase() === selected.toLowerCase());
  if (useWindow) {
    const n = selectedWindow();
    if (n !== Infinity) {
      const dates = uniqueSorted(rows.map((row) => row.date));
      const keep = new Set(dates.slice(-n));
      rows = rows.filter((row) => keep.has(row.date));
    }
  }
  return rows;
}

function groupedByDate(rows) {
  const byDate = new Map();
  rows.forEach((row) => {
    const item = byDate.get(row.date) || { date: row.date, value: 0, unit: row.unit, count: 0 };
    item.value += Number(row.value) || 0;
    item.count += 1;
    byDate.set(row.date, item);
  });
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function buildChartLines(rows) {
  const selected = selectedTechnology();
  const allDates = uniqueSorted(rows.map((row) => row.date));
  const windowSize = selectedWindow();
  const keepDates = windowSize === Infinity ? allDates : allDates.slice(-windowSize);
  const dateSet = new Set(keepDates);
  rows = rows.filter((row) => dateSet.has(row.date));
  if (selected !== 'all') {
    const filtered = rows.filter((row) => row.technology.toLowerCase() === selected.toLowerCase());
    return [{ name: filtered[0]?.technology || selected, color: technologyColor(filtered[0]?.technology || selected), points: groupedByDate(filtered).map((point) => ({ x: point.date, y: point.value })) }].filter((line) => line.points.length);
  }
  const techs = uniqueSorted(rows.map((row) => row.technology));
  return techs.map((technology) => {
    const filtered = rows.filter((row) => row.technology === technology);
    return { name: technology, color: technologyColor(technology), points: groupedByDate(filtered).map((point) => ({ x: point.date, y: point.value })) };
  }).filter((line) => line.points.length);
}

function currentTotalSeries({ useWindow = true } = {}) {
  return groupedByDate(getFilteredRows({ useWindow, selected: selectedTechnology() }));
}

function averageRecentGeneration(technology = selectedTechnology(), count = 30) {
  const rows = observations().filter((row) => technology === 'all' || row.technology.toLowerCase() === String(technology).toLowerCase());
  const dates = uniqueSorted(rows.map((row) => row.date));
  const chosen = new Set(dates.slice(-Math.min(count, dates.length)));
  return groupedByDate(rows.filter((row) => chosen.has(row.date)));
}

function contextBanner() {
  const source = activeSource();
  const count = currentState().data_quality?.record_count || 0;
  if (source?.source_type === 'synthetic_demo') {
    return `<div class="demo-banner"><div class="demo-banner-icon">${htmlIcon('alert')}</div><div class="demo-banner-copy"><strong>Illustrative demo fixture · not official CEA data</strong><p>All visible values in this workspace are deterministic synthetic examples, including the deliberately planted wind signal. Import a reviewed source CSV to explore your own data.</p></div><a class="demo-banner-link" href="#sources" data-view="sources">Review data lineage →</a></div>`;
  }
  if (source?.source_type === 'user_upload') {
    return `<div class="demo-banner active-upload-banner"><div class="demo-banner-icon">${htmlIcon('shield')}</div><div class="demo-banner-copy"><strong>User-uploaded snapshot · validation passed</strong><p>${escapeHtml(source.file_name || source.title)} · ${formatNumber(count, 0)} records · SHA-256 registered. This prototype does not independently certify the uploaded source.</p></div><a class="demo-banner-link" href="#sources" data-view="sources">View provenance →</a></div>`;
  }
  if (source?.source_type === 'official_dataset') {
    const checks = source.reconciliation?.reports_reconciled || 0;
    const reports = source.reconciliation?.reports_total || source.date_count || 0;
    return `<div class="demo-banner active-upload-banner cea-banner"><div class="demo-banner-icon">${htmlIcon('shield')}</div><div class="demo-banner-copy"><strong>CEA published data · ${formatNumber(reports, 0)} daily reports · source-checked</strong><p>All India, ${escapeHtml(source.start_date)}–${escapeHtml(source.end_date)} · ${formatNumber(count, 0)} extracted observations · ${checks}/${reports} published daily totals reconcile. Historical snapshot, not live; RE-PREDICT is independent of CEA.</p></div><a class="demo-banner-link" href="#sources" data-view="sources">Trace any value →</a></div>`;
  }
  return '';
}

function pageHead(kicker, title, description, actions = '') {
  return `<div class="page-head"><div class="page-head-copy"><div class="eyebrow"><span class="eyebrow-dot"></span>${escapeHtml(kicker)}</div><h1 class="page-title">${escapeHtml(title)}</h1><p class="page-description">${escapeHtml(description)}</p></div>${actions ? `<div class="page-actions">${actions}</div>` : ''}</div>`;
}

function metricCard({ label, value, unit = '', foot = '', icon = 'trend', color = '', primary = false }) {
  return `<article class="metric-card ${primary ? 'primary-metric' : ''}"><div class="metric-top"><div class="metric-label">${escapeHtml(label)}</div><span class="metric-icon ${color}">${htmlIcon(icon)}</span></div><div class="metric-value">${escapeHtml(value)}${unit ? `<span class="metric-unit">${escapeHtml(unit)}</span>` : ''}</div><div class="metric-foot">${foot}</div>${primary ? '<span class="metric-card-orb" aria-hidden="true"></span>' : ''}</article>`;
}

function svgChartLegend(lines, extra = []) {
  return [...lines.map((line) => `<span class="legend-item"><i class="legend-swatch" style="background:${escapeHtml(line.color)}"></i>${escapeHtml(line.name)}</span>`), ...extra].join('');
}

function getLatestAndChange() {
  const series = currentTotalSeries({ useWindow: false });
  if (!series.length) return { latest: null, latestDate: null, change: null, unit: observations()[0]?.unit || '' };
  const latest = series[series.length - 1];
  const n = selectedWindow() === Infinity ? Math.min(30, Math.floor(series.length / 2)) : Math.max(1, Number(selectedWindow()));
  const current = series.slice(-n).map((row) => row.value);
  const previous = series.slice(-2 * n, -n).map((row) => row.value);
  const currentMean = safeMean(current);
  const previousMean = safeMean(previous);
  const change = previous.length && previousMean !== 0 ? ((currentMean - previousMean) / Math.abs(previousMean)) * 100 : null;
  return { latest: latest.value, latestDate: latest.date, change, unit: latest.unit };
}

function renderOverview() {
  const source = activeSource();
  const metrics = getLatestAndChange();
  const rows = getFilteredRows({ useWindow: true });
  const allRows = observations();
  const lineData = buildChartLines(allRows);
  const unit = metrics.unit || 'units';
  const techs = currentState().data_quality?.technologies || [];
  const latestDate = metrics.latestDate;
  const latestRows = allRows.filter((row) => row.date === latestDate && (selectedTechnology() === 'all' || row.technology.toLowerCase() === selectedTechnology()));
  const compositionTotal = latestRows.reduce((sum, row) => sum + Number(row.value || 0), 0);
  const composition = latestRows.slice().sort((a, b) => b.value - a.value);
  const alerts = ui.anomalies.filter((event) => selectedTechnology() === 'all' || event.technology.toLowerCase() === selectedTechnology()).slice(0, 3);
  const windowLabel = selectedWindowLabel();
  const changeText = metrics.change === null ? 'No prior comparison window' : `${metrics.change >= 0 ? '↑' : '↓'} ${Math.abs(metrics.change).toFixed(1)}% vs prior window`;
  const changeColor = metrics.change === null ? '' : metrics.change >= 0 ? 'color:#36866d' : 'color:#b56a51';
  const latestRowsTable = rows.slice().sort((a, b) => b.date.localeCompare(a.date) || a.technology.localeCompare(b.technology)).slice(0, 7);

  return `${pageHead('DECISION WORKSPACE / OVERVIEW', 'See the signal in renewable energy.', 'A source-aware view of what has been observed, how the pattern is moving, and what deserves a closer look.', `<button class="button button-soft" data-action="export-json">${htmlIcon('export')}Evidence bundle</button><button class="button button-primary" data-action="import">${htmlIcon('upload')}Load source data</button>`)}
    ${contextBanner()}
    <div class="metric-grid">
      ${metricCard({ label: 'Latest observed output', value: metrics.latest === null ? '—' : formatNumber(metrics.latest, 1), unit, foot: `<span class="neutral-dot"></span><span>${latestDate ? `Period ${formatDate(latestDate)}` : 'No active observations'}</span>`, icon: 'bolt', primary: true })}
      ${metricCard({ label: `Average · ${selectedWindow() === Infinity ? 'all' : selectedWindow()} points`, value: rows.length ? formatNumber(safeMean(currentTotalSeries().map((point) => point.value)), 1) : '—', unit, foot: `<span class="small-arrow" style="${changeColor}">${escapeHtml(changeText)}</span>`, icon: 'trend', color: 'blue' })}
      ${metricCard({ label: 'Validated observations', value: formatNumber(currentState().data_quality?.record_count || 0, 0), foot: `<span class="neutral-dot"></span><span>${formatNumber(currentState().data_quality?.date_count || 0, 0)} observed periods · no calendar inferred</span>`, icon: 'check', color: 'purple' })}
      ${metricCard({ label: 'Series in snapshot', value: formatNumber(techs.length, 0), foot: `<span class="neutral-dot"></span><span>${escapeHtml(source?.source_type === 'synthetic_demo' ? 'Illustrative fixture' : source?.source_type === 'user_upload' ? 'Uploaded CSV' : source?.source_type === 'official_dataset' ? 'CEA · All India daily reports' : 'No active source')}</span>`, icon: 'dataset', color: 'gold' })}
    </div>
    <div class="grid-two">
      <section class="panel panel-pad">
        <div class="panel-header"><div><span class="panel-overline">UNDERSTAND</span><h2 class="panel-title">Generation pulse</h2><p class="panel-subtitle">Source-wise observed values · ${escapeHtml(windowLabel)} · ${escapeHtml(unit)}</p></div><a class="panel-link" href="#explore" data-view="explore">Open exploration ↗</a></div>
        ${lineData.length ? `<div class="chart-wrap"><svg id="overview-trend" class="chart-svg" role="img" aria-label="Observed renewable generation trend"></svg></div><div class="chart-legend">${svgChartLegend(lineData)}</div>` : `<div class="chart-empty"><div class="chart-empty-inner">No observations are available for this series. Import a validated CSV to begin.</div></div>`}
      </section>
      <section class="panel panel-pad">
        <div class="panel-header"><div><span class="panel-overline">DETECT · REVIEW QUEUE</span><h2 class="panel-title">Signals to inspect</h2><p class="panel-subtitle">Statistical deviations · not causal diagnoses</p></div><a class="panel-link" href="#anomalies" data-view="anomalies">View desk ↗</a></div>
        ${alerts.length ? `<div class="signal-list">${alerts.map((event) => `<div class="signal-row"><span class="signal-mark">${htmlIcon('alert')}</span><div class="signal-row-copy"><strong>${escapeHtml(event.technology)} · ${formatDate(event.date, { day: 'numeric', month: 'short' })}</strong><small>${escapeHtml(event.signal)} · score ${formatNumber(event.robust_score, 1)}</small></div><span class="signal-pill ${event.severity === 'review' ? 'review' : ''}">${escapeHtml(event.status === 'open' ? event.severity : event.status)}</span></div>`).join('')}</div>` : `<div class="signal-empty"><div><strong>No active signals in this view</strong><p>That is not proof the data is error-free. Signals are generated from a trailing robust baseline.</p></div></div>`}
        <div class="note-strip" style="margin-top:11px">${htmlIcon('shield')}<span>Signals indicate deviation only. Root cause needs independently approved evidence.</span></div>
      </section>
    </div>
    <div class="grid-equal">
      <section class="panel panel-pad"><div class="panel-header"><div><span class="panel-overline">OBSERVED · PERIOD ${latestDate ? escapeHtml(formatDate(latestDate)) : ''}</span><h2 class="panel-title">Source mix</h2><p class="panel-subtitle">Values shown as reported in the active snapshot</p></div><span class="pill">${escapeHtml(unit)}</span></div>
        ${composition.length ? `<div class="composition">${composition.map((row) => `<div class="composition-row"><span class="composition-name"><i style="background:${technologyColor(row.technology)}"></i>${escapeHtml(row.technology)}</span><span class="composition-track"><span class="composition-fill" style="display:block;width:${compositionTotal ? Math.max(3, row.value / Math.max(...composition.map((item) => item.value)) * 100) : 0}%;background:${technologyColor(row.technology)}"></span></span><span class="composition-value">${formatNumber(row.value, 1)}</span></div>`).join('')}</div>` : `<div class="chart-empty">No source mix available yet.</div>`}
        <div class="note-strip" style="margin-top:14px">${htmlIcon('eye')}<span>Aggregations are calculated across compatible units and the geography labels in the selected file.</span></div>
      </section>
      <section class="panel panel-pad"><div class="panel-header"><div><span class="panel-overline">SOURCE-TRACEABLE</span><h2 class="panel-title">Recent observations</h2><p class="panel-subtitle">Newest available records in ${escapeHtml(windowLabel)}</p></div><a class="panel-link" href="#explore" data-view="explore">View all ↗</a></div>
        ${renderObservationTable(latestRowsTable, { compact: true })}
      </section>
    </div>
    <div class="loop-strip" aria-label="RE-PREDICT intelligence workflow">${[
      ['01', 'Sense', 'Preserve the source'], ['02', 'Understand', 'Explore the pattern'], ['03', 'Predict', 'Baseline first'], ['04', 'Detect', 'Signal, not cause'], ['05', 'Simulate', 'Expose assumptions'], ['06', 'Explain', 'Cite the evidence'],
    ].map(([number, title, sub]) => `<div class="loop-step"><span class="loop-num">${number}</span><span><strong>${title}</strong><small>${sub}</small></span></div>`).join('')}</div>`;
}

function renderObservationTable(rows, { compact = false } = {}) {
  if (!rows.length) return `<div class="chart-empty"><div class="chart-empty-inner">No observations in the selected window.</div></div>`;
  return `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Period</th><th>Technology</th><th>Geography</th><th class="numeric">Observed</th><th>Evidence</th></tr></thead><tbody>${rows.map((row) => {
    const evidenceLabel = row.source_report_id ? `CEA report · ${formatDate(row.date, { day: 'numeric', month: 'short' })}` : row.locator?.row ? `CSV row ${row.locator.row}` : row.quality_status === 'demo-synthetic' ? 'Demo fixture' : 'Open lineage';
    return `<tr><td>${formatDate(row.date, { day: 'numeric', month: 'short', year: compact ? undefined : 'numeric' })}</td><td><span class="composition-name"><i style="background:${technologyColor(row.technology)}"></i>${escapeHtml(row.technology)}</span></td><td>${escapeHtml(row.geography || 'Not specified')}</td><td class="numeric">${formatNumber(row.value, 2)} <span class="mini-meta">${escapeHtml(row.unit)}</span></td><td><button class="row-link" data-action="view-source" data-id="${escapeHtml(row.observation_id || '')}">${escapeHtml(evidenceLabel)} ↗</button></td></tr>`;
  }).join('')}</tbody></table></div>`;
}

function renderExplore() {
  const rows = getFilteredRows({ useWindow: true });
  const allRows = observations();
  const lineData = buildChartLines(allRows);
  const dateRows = groupedByDate(rows);
  const unit = rows[0]?.unit || 'units';
  const visibleRows = rows.slice().sort((a, b) => b.date.localeCompare(a.date) || a.technology.localeCompare(b.technology)).slice(0, 40);
  const meanValue = safeMean(dateRows.map((point) => point.value));
  const maxValue = dateRows.length ? Math.max(...dateRows.map((point) => point.value)) : 0;
  return `${pageHead('SENSE → UNDERSTAND', 'Understand the pattern.', 'Explore observed renewable generation without losing the context, units, or source record behind each value.', `<button class="button button-soft" data-action="export-csv">${htmlIcon('export')}Export CSV</button><button class="button button-soft" data-action="export-json">${htmlIcon('file')}Evidence bundle</button>`)}
    ${contextBanner()}
    <div class="view-toolbar"><div class="filter-row"><span class="filter-label">ACTIVE FILTERS</span><span class="pill blue">${escapeHtml(selectedTechnologyLabel())}</span><span class="pill">${escapeHtml(selectedWindowLabel())}</span><span class="pill green">${formatNumber(rows.length, 0)} records</span></div><div class="mini-meta">All totals use ${escapeHtml(unit)} · no unverified unit conversion</div></div>
    <div class="grid-two">
      <section class="panel panel-pad"><div class="panel-header"><div><span class="panel-overline">OBSERVED TIME SERIES</span><h2 class="panel-title">Source-wise generation</h2><p class="panel-subtitle">${escapeHtml(selectedWindowLabel())} · hover points for exact values and periods</p></div><span class="pill">${escapeHtml(unit)}</span></div>
        ${lineData.length ? `<div class="chart-wrap"><svg id="explore-chart" class="chart-svg" role="img" aria-label="Filtered observed generation time series"></svg></div><div class="chart-legend">${svgChartLegend(lineData)}</div>` : `<div class="chart-empty">No matching observations.</div>`}
      </section>
      <section class="panel panel-pad"><div class="panel-header"><div><span class="panel-overline">PERIOD SUMMARY</span><h2 class="panel-title">At a glance</h2><p class="panel-subtitle">Observed values only · ${escapeHtml(selectedWindowLabel())}</p></div></div>
        <div class="forecast-overview"><div class="forecast-stat"><span>Mean total</span><strong>${formatNumber(meanValue, 1)}</strong><small>${escapeHtml(unit)} / period</small></div><div class="forecast-stat"><span>Peak total</span><strong>${formatNumber(maxValue, 1)}</strong><small>${escapeHtml(unit)} / period</small></div><div class="forecast-stat"><span>Periods</span><strong>${formatNumber(dateRows.length, 0)}</strong><small>observed dates</small></div><div class="forecast-stat"><span>Rows</span><strong>${formatNumber(rows.length, 0)}</strong><small>validated records</small></div></div>
        <div class="note-strip warning" style="margin-top:14px">${htmlIcon('alert')}<span><strong>Aggregation note.</strong> The “All technologies” series sums records by date. Use it only where units and geography coverage are compatible.</span></div>
        <div class="panel-header" style="margin-top:17px"><div><span class="panel-overline">LATEST MIX</span><h2 class="panel-title">Contribution by technology</h2></div></div>
        ${renderCompositionBars(rows)}
      </section>
    </div>
    <section class="panel"><div class="panel-header panel-pad" style="margin-bottom:0"><div><span class="panel-overline">CURATED OBSERVATIONS</span><h2 class="panel-title">Data table</h2><p class="panel-subtitle">Rows retain their import locator and active source reference.</p></div><span class="pill">Showing ${formatNumber(visibleRows.length, 0)} of ${formatNumber(rows.length, 0)}</span></div>${renderObservationTable(visibleRows)}<div class="table-footer"><span>Source snapshot <strong>${escapeHtml(currentState().data_version || '—')}</strong></span><span>Unknown fields remain unmapped at ingestion.</span></div></section>`;
}

function renderCompositionBars(rows) {
  const date = uniqueSorted(rows.map((row) => row.date)).at(-1);
  const latest = rows.filter((row) => row.date === date);
  if (!latest.length) return `<div class="chart-empty">No source mix available.</div>`;
  const max = Math.max(...latest.map((row) => row.value), 1);
  return `<div class="composition">${latest.slice().sort((a, b) => b.value - a.value).map((row) => `<div class="composition-row"><span class="composition-name"><i style="background:${technologyColor(row.technology)}"></i>${escapeHtml(row.technology)}</span><span class="composition-track"><span class="composition-fill" style="display:block;width:${Math.max(2, row.value / max * 100)}%;background:${technologyColor(row.technology)}"></span></span><span class="composition-value">${formatNumber(row.value, 1)} ${escapeHtml(row.unit)}</span></div>`).join('')}</div>`;
}

function renderForecast() {
  const data = ui.forecast;
  const isReady = data?.status === 'ready';
  const selected = selectedTechnologyLabel();
  const horizonButtons = [7, 14, 30].map((value) => `<button type="button" class="${ui.forecastHorizon === value ? 'is-active' : ''}" data-action="set-horizon" data-value="${value}">${value} periods</button>`).join('');
  let metrics = '';
  if (isReady) {
    const m = data.metrics;
    metrics = `<div class="metric-grid" style="margin-top:13px">${metricCard({ label: 'Rolling holdout MAE', value: formatNumber(m.mae, 2), unit: data.unit, foot: `<span class="neutral-dot"></span><span>${formatNumber(m.validation_count, 0)} validation periods · measured here</span>`, icon: 'trend', color: 'blue' })}${metricCard({ label: 'Rolling holdout RMSE', value: formatNumber(m.rmse, 2), unit: data.unit, foot: `<span class="neutral-dot"></span><span>Same ordered holdout windows</span>`, icon: 'bolt', color: 'gold' })}${metricCard({ label: 'Persistence MAE', value: formatNumber(m.persistence_mae, 2), unit: data.unit, foot: `<span class="neutral-dot"></span><span>Simple last-value comparator</span>`, icon: 'clock', color: 'purple' })}${metricCard({ label: 'Empirical band coverage', value: `${formatNumber((m.interval_coverage || 0) * 100, 0)}%`, foot: `<span class="neutral-dot"></span><span>Observed on rolling holdout · not guaranteed</span>`, icon: 'shield' })}</div>`;
  }
  return `${pageHead('PREDICT · BASELINE FIRST', 'A forecast with its homework attached.', 'Start with a time-aware baseline. See the cutoff, validation window, comparator, and uncertainty band before reading the line as an outlook.', `<button class="button button-soft" data-action="run-forecast">${htmlIcon('trend')}Run evaluation</button>`)}
    ${contextBanner()}
    <div class="view-toolbar"><div class="filter-row"><span class="filter-label">MODEL</span><span class="pill green">SEASONAL-NAIVE · LAG 7</span><span class="pill blue">${escapeHtml(selected)}</span>${isReady ? `<span class="pill">Cutoff ${formatDate(data.model_card.data_cutoff)}</span>` : ''}</div><div class="segmented" aria-label="Forecast horizon">${horizonButtons}</div></div>
    ${isReady ? `<div class="grid-two"><section class="panel panel-pad"><div class="panel-header"><div><span class="panel-overline">OBSERVED + DERIVED</span><h2 class="panel-title">${escapeHtml(selected)} · ${formatNumber(ui.forecastHorizon, 0)}-period baseline</h2><p class="panel-subtitle">Dashed segment is a baseline estimate · shaded range uses earlier residuals</p></div><span class="pill amber">Not an operational forecast</span></div><div class="chart-wrap"><svg id="forecast-chart" class="chart-svg" role="img" aria-label="Observed history and baseline forecast with empirical interval"></svg></div><div class="chart-legend"><span class="legend-item"><i class="legend-swatch" style="background:#27495a"></i>Observed</span><span class="legend-item"><i class="legend-swatch dashed"></i>Seasonal-naive</span><span class="legend-item"><i class="legend-swatch" style="background:rgba(61,154,125,.27)"></i>Empirical band</span></div></section><section class="panel panel-pad"><div class="panel-header"><div><span class="panel-overline">NEXT PERIODS</span><h2 class="panel-title">Baseline outlook</h2><p class="panel-subtitle">Repeats the last 7 observations in order; no external covariates.</p></div></div><div class="forecast-overview">${data.forecast_points.slice(0, Math.min(4, ui.forecastHorizon)).map((point) => `<div class="forecast-stat"><span>${formatDate(point.date, { day: 'numeric', month: 'short' })}</span><strong>${formatNumber(point.value, 1)}</strong><small>${formatNumber(point.lower, 1)}–${formatNumber(point.upper, 1)} ${escapeHtml(data.unit)}</small></div>`).join('')}</div><div class="notice-card" style="margin-top:13px"><strong>${formatNumber(data.metrics.validation_count, 0)} ordered holdout periods · ${escapeHtml(formatDate(data.metrics.validation_start))} to ${escapeHtml(formatDate(data.metrics.validation_end))}</strong><p>MAE, RMSE and empirical interval coverage are measured on the active snapshot. They are not CEA results or guarantees about future error.</p></div></section></div>${metrics}<section class="panel panel-pad"><div class="panel-header"><div><span class="panel-overline">MODEL CARD</span><h2 class="panel-title">What produced this line?</h2></div><span class="pill green">${escapeHtml(data.model_card.model_version)}</span></div><div class="model-card"><div><div class="model-card-title"><span class="model-icon">${htmlIcon('trend')}</span>${escapeHtml(data.method)}</div><p>${escapeHtml(data.model_card.validation)} ${escapeHtml(data.model_card.leakage_control)}</p></div><div class="model-card-details"><div class="model-detail"><span>Target</span><strong>${escapeHtml(data.model_card.target)}</strong></div><div class="model-detail"><span>Training snapshot</span><strong>${formatNumber(data.observed_count, 0)} periods</strong></div><div class="model-detail"><span>Data cutoff</span><strong>${escapeHtml(data.model_card.data_cutoff)}</strong></div><div class="model-detail"><span>Interval</span><strong>Empirical · ${formatNumber(data.metrics.interval_radius, 2)} ${escapeHtml(data.unit)} radius</strong></div></div></div><div class="note-strip warning" style="margin-top:11px">${htmlIcon('alert')}<span>${escapeHtml(data.model_card.limitation)} ${escapeHtml(data.model_card.interval)}</span></div></section>`
      : `<section class="panel panel-pad"><div class="panel-header"><div><span class="panel-overline">BACKTEST STATUS</span><h2 class="panel-title">More history is needed for a credible evaluation.</h2><p class="panel-subtitle">${escapeHtml(data?.message || 'Calculating baseline…')}</p></div><span class="pill amber">No score claimed</span></div><div class="empty-state"><div class="empty-state-icon">${htmlIcon('trend')}</div><h3>${data?.status === 'error' ? 'Forecast request failed' : 'Baseline held until there is enough history'}</h3><p>Use at least 21 ordered observations for the 7-lag baseline and rolling holdout. If your report has a different frequency, each row is treated as one period.</p><button class="button button-soft" data-action="run-forecast">${htmlIcon('trend')}Try again</button></div></section>`}
    <div class="note-strip warning" style="margin-top:13px">${htmlIcon('shield')}<span><strong>Trust boundary.</strong> This prototype uses no weather, installed-capacity, dispatch, or external data. A forecast is a model estimate, never an official CEA figure.</span></div>`;
}

function renderAnomalies() {
  const events = ui.anomalies.filter((event) => selectedTechnology() === 'all' || event.technology.toLowerCase() === selectedTechnology());
  const openCount = events.filter((event) => event.status === 'open').length;
  const reviewCount = events.filter((event) => event.status === 'reviewed').length;
  const total = events.length;
  const activeSourceType = activeSource()?.source_type;
  const anomalyScope = activeSourceType === 'synthetic_demo'
    ? ' The synthetic fixture includes one deliberately planted shock for the walkthrough.'
    : activeSourceType === 'official_dataset'
      ? ' These are detector outputs over published observations, not CEA alerts or official interpretations.'
      : ' Uploaded-data signals are not source-certified.';
  return `${pageHead('DETECT · HUMAN REVIEW', 'A signal is not a cause.', 'Review observations that depart from their trailing robust baseline. Inspect the evidence, update the review state, and avoid unsupported causal explanations.', `<button class="button button-soft" data-action="refresh-anomalies">${htmlIcon('trend')}Re-check snapshot</button>`)}
    ${contextBanner()}
    <div class="metric-grid">${metricCard({ label: 'Signals in view', value: formatNumber(total, 0), foot: '<span class="neutral-dot"></span><span>Robust-score threshold ±3.5</span>', icon: 'alert', color: 'gold' })}${metricCard({ label: 'Open for review', value: formatNumber(openCount, 0), foot: '<span class="neutral-dot"></span><span>Needs a human look</span>', icon: 'eye', color: 'blue' })}${metricCard({ label: 'Reviewed', value: formatNumber(reviewCount, 0), foot: '<span class="neutral-dot"></span><span>Disposition recorded locally</span>', icon: 'check' })}${metricCard({ label: 'Detector', value: 'Robust z', foot: '<span class="neutral-dot"></span><span>Trailing median + MAD fallback</span>', icon: 'trend', color: 'purple' })}</div>
    <div class="note-strip warning" style="margin-bottom:14px">${htmlIcon('shield')}<span>Detected deviation ≠ cause. The system does not infer weather, outages, curtailment, policy, or equipment failure.${escapeHtml(anomalyScope)}</span></div>
    ${events.length ? `<div class="grid-equal">${events.map((event) => `<article class="signal-card"><div class="signal-card-top"><div class="signal-card-title"><span class="signal-icon">${htmlIcon('alert')}</span><span>${escapeHtml(event.technology)} deviation</span></div><span class="signal-pill ${event.severity === 'review' ? 'review' : ''}">${escapeHtml(event.severity)}</span></div><div class="signal-card-meta">${formatDate(event.date)} · ${escapeHtml(event.signal)}</div><div class="signal-values"><div class="signal-value"><span>Observed</span><strong>${formatNumber(event.observed, 2)} ${escapeHtml(event.unit)}</strong></div><div class="signal-value"><span>Expected</span><strong>${formatNumber(event.expected, 2)} ${escapeHtml(event.unit)}</strong></div><div class="signal-value"><span>Robust score</span><strong>${formatNumber(event.robust_score, 2)}</strong></div></div><div class="signal-footnote">Residual ${formatNumber(event.residual, 2)} ${escapeHtml(event.unit)} · score threshold ${formatNumber(event.threshold, 1)}. The baseline uses up to 28 prior observations.</div><div class="signal-card-actions"><span class="mini-meta">${escapeHtml(event.event_id)}</span><select class="inline-select" data-review-id="${escapeHtml(event.event_id)}" aria-label="Review status for ${escapeHtml(event.technology)} on ${escapeHtml(event.date)}"><option value="open" ${event.status === 'open' ? 'selected' : ''}>Open</option><option value="monitoring" ${event.status === 'monitoring' ? 'selected' : ''}>Monitoring</option><option value="reviewed" ${event.status === 'reviewed' ? 'selected' : ''}>Reviewed</option><option value="dismissed" ${event.status === 'dismissed' ? 'selected' : ''}>Dismissed</option></select></div></article>`).join('')}</div>` : `<section class="panel"><div class="empty-state"><div class="empty-state-icon">${htmlIcon('check')}</div><h3>No robust deviations crossed the threshold.</h3><p>This does not prove the series is error-free. The detector is a triage signal and may be limited by short or sparse history.</p><button class="button button-soft" data-action="refresh-anomalies">Run detector again</button></div></section>`}`;
}

function getScenarioDefaults() {
  const available = currentState().data_quality?.technologies || [];
  let technology = selectedTechnology();
  if (technology === 'all' || !available.some((name) => name.toLowerCase() === technology.toLowerCase())) {
    technology = available.find((name) => name.toLowerCase() === 'solar') || available[0] || 'Solar';
  } else {
    technology = available.find((name) => name.toLowerCase() === technology.toLowerCase()) || technology;
  }
  const series = averageRecentGeneration(technology, 30);
  const average = safeMean(series.map((point) => point.value));
  const unit = series.at(-1)?.unit || observations()[0]?.unit || 'GWh';
  return {
    technology,
    base_generation: average,
    base_capacity_mw: 10000,
    scenario_capacity_mw: 11500,
    availability_factor: 0.92,
    unit,
  };
}

function renderScenarioOutput(scenario) {
  if (!scenario) {
    return `<section class="panel scenario-result"><div class="panel-header"><div><span class="panel-overline">CONDITIONAL OUTPUT</span><h2 class="panel-title">Ready to test an assumption</h2><p class="panel-subtitle">Run a calculation to save a versioned scenario record.</p></div><span class="pill amber">Simulation only</span></div><div class="empty-state" style="padding:25px 10px"><div class="empty-state-icon">${htmlIcon('trend')}</div><h3>Nothing is being predicted here.</h3><p>Change the declared capacity and availability inputs, then run the scenario. The formula and assumptions stay visible.</p></div><div class="formula-box"><code>Gₛ = G × (C₁ / C₀) × A</code><small>Baseline generation × scenario / baseline capacity × availability factor. Utilization is assumed to scale proportionally.</small></div></section>`;
  }
  const base = scenario.results.base;
  const maximum = Math.max(scenario.results.high.generation, scenario.results.base.generation, scenario.base_generation, 1);
  return `<section class="panel scenario-result"><div class="panel-header"><div><span class="panel-overline">CONDITIONAL OUTPUT · ${escapeHtml(scenario.scenario_id)}</span><h2 class="panel-title">${escapeHtml(scenario.technology)} capacity scenario</h2><p class="panel-subtitle">Saved ${formatDate(scenario.created_at?.slice(0, 10))} · formula ${escapeHtml(scenario.formula_version)}</p></div><span class="pill amber">Simulation</span></div><div class="scenario-result-hero"><div><div class="scenario-result-label">Base case · scenario generation</div><div class="scenario-result-value">${formatNumber(base.generation, 2)}<small>${escapeHtml(scenario.unit)} / period</small></div><div class="scenario-delta">${base.delta >= 0 ? '+' : ''}${formatNumber(base.delta, 2)} ${escapeHtml(scenario.unit)} vs baseline</div></div><div class="metric-icon" style="width:36px;height:36px;border-radius:11px">${htmlIcon('trend')}</div></div><div class="scenario-results-grid"><div class="scenario-case"><span>Low case · A=${formatNumber(scenario.results.low.availability_factor, 2)}</span><strong>${formatNumber(scenario.results.low.generation, 2)} ${escapeHtml(scenario.unit)}</strong><small>${scenario.results.low.delta >= 0 ? '+' : ''}${formatNumber(scenario.results.low.delta, 2)} vs baseline</small></div><div class="scenario-case"><span>Selected · A=${formatNumber(scenario.results.base.availability_factor, 2)}</span><strong>${formatNumber(scenario.results.base.generation, 2)} ${escapeHtml(scenario.unit)}</strong><small>${scenario.results.base.delta >= 0 ? '+' : ''}${formatNumber(scenario.results.base.delta, 2)} vs baseline</small></div><div class="scenario-case"><span>High case · A=${formatNumber(scenario.results.high.availability_factor, 2)}</span><strong>${formatNumber(scenario.results.high.generation, 2)} ${escapeHtml(scenario.unit)}</strong><small>${scenario.results.high.delta >= 0 ? '+' : ''}${formatNumber(scenario.results.high.delta, 2)} vs baseline</small></div></div><div class="scenario-bars"><div class="scenario-bar-row"><span>Observed</span><span class="scenario-bar-track"><span class="scenario-bar-fill" style="display:block;width:${Math.max(2, scenario.base_generation / maximum * 100)}%;background:#9eb4bc"></span></span><strong>${formatNumber(scenario.base_generation, 2)}</strong></div><div class="scenario-bar-row"><span>Low</span><span class="scenario-bar-track"><span class="scenario-bar-fill" style="display:block;width:${Math.max(2, scenario.results.low.generation / maximum * 100)}%;background:#93cdb8"></span></span><strong>${formatNumber(scenario.results.low.generation, 2)}</strong></div><div class="scenario-bar-row"><span>Base</span><span class="scenario-bar-track"><span class="scenario-bar-fill" style="display:block;width:${Math.max(2, scenario.results.base.generation / maximum * 100)}%"></span></span><strong>${formatNumber(scenario.results.base.generation, 2)}</strong></div><div class="scenario-bar-row"><span>High</span><span class="scenario-bar-track"><span class="scenario-bar-fill" style="display:block;width:${Math.max(2, scenario.results.high.generation / maximum * 100)}%;background:#2e8f74"></span></span><strong>${formatNumber(scenario.results.high.generation, 2)}</strong></div></div><div class="formula-box"><code>${escapeHtml(scenario.formula)}</code><small>Inputs: G=${formatNumber(scenario.base_generation, 3)} ${escapeHtml(scenario.unit)}; C₀=${formatNumber(scenario.base_capacity_mw, 0)} MW; C₁=${formatNumber(scenario.scenario_capacity_mw, 0)} MW; A=${formatNumber(scenario.availability_factor, 2)}. Capacity and utilization are not source-verified.</small></div></section>`;
}

function renderScenarios() {
  const defaults = ui.scenarioForm || getScenarioDefaults();
  ui.scenarioForm = defaults;
  const existing = ui.scenarioResult || currentState().scenarios?.find((item) => item.source_id === currentState().active_source_id) || null;
  const techOptions = (currentState().data_quality?.technologies || []).map((name) => `<option value="${escapeHtml(name)}" ${name.toLowerCase() === String(defaults.technology).toLowerCase() ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('');
  const saved = (currentState().scenarios || []).filter((item) => item.source_id === currentState().active_source_id).slice(0, 5);
  return `${pageHead('SIMULATE · DECLARE EVERY INPUT', 'Test a what-if, not a what-will.', 'Explore capacity scaling under explicit assumptions. The output is a conditional calculation—not a forecast, dispatch recommendation, or source-verified capacity plan.', `<button class="button button-soft" data-action="export-json">${htmlIcon('export')}Export evidence</button>`)}
    ${contextBanner()}
    <div class="scenario-layout"><section class="panel form-panel"><div class="panel-header"><div><h2 class="form-section-title">Scenario assumptions</h2><p class="form-section-copy">Every field is editable. The prefilled capacity values are illustrative placeholders.</p></div><span class="pill amber">USER-ENTERED</span></div><form id="scenario-form"><div class="form-grid"><div class="form-field full"><label for="scenario-tech">Technology</label><select id="scenario-tech" name="technology">${techOptions || `<option>${escapeHtml(defaults.technology)}</option>`}</select><small class="field-help">The reference generation is the average of the most recent 30 periods for the selected technology.</small></div><div class="form-field"><label for="scenario-generation">Baseline generation · ${escapeHtml(defaults.unit)}</label><input id="scenario-generation" name="base_generation" type="number" step="any" min="0" value="${Number(defaults.base_generation).toFixed(3)}" required><small class="field-help">Observed average used as G.</small></div><div class="form-field"><label for="scenario-unit">Generation unit</label><input id="scenario-unit" name="unit" type="text" value="${escapeHtml(defaults.unit)}" maxlength="24" required><small class="field-help">Kept unchanged in the formula.</small></div><div class="form-field"><label for="base-capacity">Baseline capacity · MW</label><input id="base-capacity" name="base_capacity_mw" type="number" step="any" min="0.01" value="${Number(defaults.base_capacity_mw).toFixed(0)}" required><small class="field-help">C₀ · confirm from an approved source.</small></div><div class="form-field"><label for="scenario-capacity">Scenario capacity · MW</label><input id="scenario-capacity" name="scenario_capacity_mw" type="number" step="any" min="0" value="${Number(defaults.scenario_capacity_mw).toFixed(0)}" required><small class="field-help">C₁ · test a capacity change.</small></div><div class="form-field full"><label for="availability-factor">Availability assumption · A</label><div class="range-line"><input id="availability-factor" name="availability_factor" type="range" min="0" max="1" step="0.01" value="${Number(defaults.availability_factor).toFixed(2)}"><span class="range-value" id="availability-value">${Number(defaults.availability_factor).toFixed(2)}</span></div><small class="field-help">0 to 1. Low/high sensitivity cases vary this factor by up to 0.10.</small></div></div><div class="note-strip warning" style="margin-top:14px">${htmlIcon('alert')}<span>Capacity and utilization are not verified in this snapshot. A proportional scaling assumption can be wrong in the real system.</span></div><div class="form-footer"><span class="mini-meta">Formula version · capacity-scale-v1</span><button type="submit" class="button button-primary" id="run-scenario">${htmlIcon('trend')}Run &amp; save scenario</button></div></form></section>${renderScenarioOutput(existing)}</div>
    <section class="panel panel-pad" style="margin-top:14px"><div class="panel-header"><div><span class="panel-overline">AUDITABLE RUNS</span><h2 class="panel-title">Saved scenario history</h2><p class="panel-subtitle">Inputs and outputs persist in the local prototype store.</p></div><span class="pill">${formatNumber(saved.length, 0)} runs</span></div>${saved.length ? `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Created</th><th>Technology</th><th>Data version</th><th>Capacity ratio</th><th>Availability</th><th class="numeric">Base output</th></tr></thead><tbody>${saved.map((item) => `<tr><td>${formatDate(item.created_at?.slice(0, 10))}</td><td>${escapeHtml(item.technology)}</td><td>${escapeHtml(item.data_version)}</td><td>${formatNumber(item.capacity_ratio, 2)}×</td><td>${formatNumber(item.availability_factor, 2)}</td><td class="numeric">${formatNumber(item.results.base.generation, 2)} ${escapeHtml(item.unit)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="chart-empty">No saved runs yet. The first run will appear here.</div>`}</section>`;
}

function carbonUnitConversion(unit) {
  const unitKey = String(unit || '').toLowerCase().replace(/\s+/g, '');
  const conversions = { gwh: 1000, mu: 1000, 'mu.net': 1000, munet: 1000, mwh: 1, kwh: 0.001 };
  const toMwh = conversions[unitKey];
  if (toMwh === undefined) return null;
  return { toMwh, label: `${formatNumber(toMwh, Number.isInteger(toMwh) ? 0 : 3)} MWh/${unit}` };
}

function carbonEstimate(generation, factor, unit) {
  const conversion = carbonUnitConversion(unit);
  if (!conversion) return { available: false, message: `Carbon calculation supports MU, GWh, MWh, or kWh; this dataset uses “${unit}”.` };
  const value = Number(generation);
  const emissionsFactor = Number(factor);
  if (!Number.isFinite(value) || value < 0 || !Number.isFinite(emissionsFactor) || emissionsFactor < 0) return { available: false, message: 'Enter non-negative generation and a non-negative factor.' };
  return { available: true, value: value * conversion.toMwh * emissionsFactor, unitLabel: 'tCO₂e / period', conversion };
}

function renderCarbon() {
  const tech = selectedTechnology();
  const series = averageRecentGeneration(tech, 30);
  const savedScenarios = (currentState().scenarios || []).filter((item) => item.source_id === currentState().active_source_id);
  if (ui.carbonBasis !== 'observed' && !savedScenarios.some((item) => `scenario:${item.scenario_id}` === ui.carbonBasis)) ui.carbonBasis = 'observed';
  const selectedScenario = savedScenarios.find((item) => `scenario:${item.scenario_id}` === ui.carbonBasis);
  const unit = selectedScenario?.unit || series.at(-1)?.unit || observations()[0]?.unit || 'GWh';
  const suggestedGeneration = selectedScenario ? selectedScenario.results.base.generation : safeMean(series.map((point) => point.value));
  if (ui.carbonGenerationBasis !== ui.carbonBasis || ui.carbonGeneration === null || !Number.isFinite(Number(ui.carbonGeneration))) {
    ui.carbonGeneration = suggestedGeneration;
    ui.carbonGenerationBasis = ui.carbonBasis;
  }
  const factor = Number(ui.carbonFactor);
  const estimate = carbonEstimate(ui.carbonGeneration, factor, unit);
  const result = estimate.available ? formatNumber(estimate.value, 2) : '—';
  const conversion = carbonUnitConversion(unit);
  const summary = `Generation ${formatNumber(ui.carbonGeneration, 2)} ${unit} × ${conversion?.label || 'unit conversion unavailable'} × factor ${formatNumber(factor, 3)} tCO₂e/MWh`;
  const basisNoteBase = selectedScenario
    ? `Selected saved simulation ${selectedScenario.scenario_id}; its capacity/availability assumptions remain unverified.`
    : `Default: average of the most recent 30 periods for ${selectedTechnologyLabel()}. Observed or user-edited basis.`;
  const basisNote = String(unit).toLowerCase().startsWith('mu')
    ? `${basisNoteBase} Exact energy-unit conversion: 1 MU = 1 GWh = 1,000 MWh; the emissions factor remains illustrative.`
    : basisNoteBase;
  const scenarioOptions = savedScenarios.map((scenario) => `<option value="scenario:${escapeHtml(scenario.scenario_id)}" ${ui.carbonBasis === `scenario:${scenario.scenario_id}` ? 'selected' : ''}>Simulated · ${escapeHtml(scenario.technology)} · ${escapeHtml(scenario.scenario_id)}</option>`).join('');
  return `${pageHead('EXPLAIN · METHODOLOGY BEFORE IMPACT', 'Make the factor visible.', 'A transparent carbon-proxy calculator—only as defensible as its counterfactual, factor source, boundary, and generation basis.', `<button class="button button-soft" data-action="export-json">${htmlIcon('export')}Export evidence</button>`)}
    ${contextBanner()}
    <section class="carbon-hero"><div><div class="eyebrow"><span class="eyebrow-dot"></span>CARBON LENS · ESTIMATE-ONLY METHODOLOGY</div><h2>Show the equation. Show the caveat.</h2><p>Estimate avoided emissions only from a declared counterfactual factor. This is not a verified reduction, carbon credit, financial claim, or official CEA metric.</p></div><div class="carbon-orbit">${htmlIcon('leaf')}</div></section>
    <div class="carbon-layout"><section class="panel form-panel"><div class="panel-header"><div><h2 class="form-section-title">Calculation inputs</h2><p class="form-section-copy">Generation comes from an observed snapshot or a saved scenario; the factor is illustrative and must be replaced by an approved, applicable value.</p></div><span class="pill amber">PROXY ONLY</span></div><div class="form-grid"><div class="form-field full"><label for="carbon-generation">Generation · ${escapeHtml(unit)} per observation period</label><input id="carbon-generation" type="number" step="any" min="0" value="${Number(ui.carbonGeneration).toFixed(3)}"><small class="field-help" id="carbon-basis-note">${escapeHtml(basisNote)}</small></div><div class="form-field full"><label for="carbon-factor">Counterfactual emissions factor · tCO₂e / MWh</label><input id="carbon-factor" type="number" step="any" min="0" value="${Number(ui.carbonFactor).toFixed(3)}"><small class="field-help">0.70 is a made-up illustrative input for interaction testing, not a sourced or recommended grid factor.</small></div><div class="form-field full"><label for="carbon-basis">Generation basis</label><select id="carbon-basis"><option value="observed" ${ui.carbonBasis === 'observed' ? 'selected' : ''}>Observed active snapshot</option>${scenarioOptions || '<option value="none" disabled>No saved simulation yet</option>'}</select><small class="field-help">A simulated basis uses the saved base-case output; the scenario record remains linked and labelled hypothetical.</small></div></div><div class="form-footer"><span class="mini-meta" id="carbon-summary">${escapeHtml(summary)}</span><button type="button" class="button button-soft" data-action="reset-carbon">Use current observed average</button></div></section>
      <section class="carbon-output"><div class="carbon-output-label">Illustrative avoided-emissions proxy</div><div class="carbon-output-value" id="carbon-output-value">${result}<span>${estimate.available ? estimate.unitLabel : ''}</span></div><p id="carbon-output-note">${estimate.available ? `Estimate only. ${selectedScenario ? 'This uses simulated generation and inherits its assumptions. ' : ''}${String(unit).toLowerCase().startsWith('mu') ? '1 MU is converted to 1,000 MWh by definition. ' : ''}The calculation assumes the selected renewable generation displaces the declared counterfactual grid mix at the selected factor.` : escapeHtml(estimate.message)}</p><div class="carbon-equation"><span>Calculation</span><strong id="carbon-equation">E = G × (MWh per unit) × EF · ${escapeHtml(summary)}</strong></div></section></div>
    <div class="grid-equal" style="margin-top:14px"><section class="panel panel-pad"><span class="panel-overline">MUST DISCLOSE</span><h2 class="panel-title">What makes this an estimate?</h2><div class="guardrail-list" style="margin-top:12px"><div class="guardrail-item"><span class="guardrail-check">1</span><span><strong>Counterfactual</strong> Which generation is assumed to be displaced?</span></div><div class="guardrail-item"><span class="guardrail-check">2</span><span><strong>Factor provenance</strong> Publisher, geography, year, version, and uncertainty.</span></div><div class="guardrail-item"><span class="guardrail-check">3</span><span><strong>System boundary</strong> Attributional proxy versus consequential outcome; lifecycle treatment.</span></div><div class="guardrail-item"><span class="guardrail-check">4</span><span><strong>Generation basis</strong> Observed or simulated; unit, time period, and active data version.</span></div></div></section><section class="notice-card"><strong>Do not report this as a verified impact.</strong><p>Changing the illustrative factor changes the output linearly. No factor has been selected from an approved reference in this prototype. Do not use the result for credits, policy compliance, public impact claims, or investment decisions.</p></section></div>`;
}

function renderAnalyst() {
  const chat = ui.chat.map((item) => {
    const isUser = item.role === 'user';
    const citationChips = (item.result?.citations || []).map((citation) => `<span class="citation-chip">${htmlIcon('source')}${escapeHtml(citation.label)} · ${escapeHtml(citation.dataset_version || '')}</span>`).join('');
    const evidence = (item.result?.evidence || []).slice(0, 3).map((entry) => {
      const label = entry.type === 'observation' ? `${entry.technology} · ${entry.date} · ${formatNumber(entry.value, 2)} ${entry.unit}`
        : entry.type === 'anomaly_signal' ? `${entry.technology} signal · ${entry.date}`
          : entry.type === 'model_run' ? `${entry.model_version} · cutoff ${entry.cutoff}`
            : entry.type === 'scenario' ? `Scenario ${entry.id}`
              : entry.type === 'source_record' ? `Source ${entry.source_id}`
                : entry.type;
      return `<span class="citation-chip">${htmlIcon('eye')}${escapeHtml(label)}</span>`;
    }).join('');
    const status = item.result?.status === 'limited' || item.result?.status === 'refused' ? `<span class="pill amber" style="margin-left:6px">LIMITED</span>` : '';
    return `<div class="chat-msg ${isUser ? 'user' : 'assistant'}"><span class="chat-msg-label">${isUser ? 'You' : 'Grounded prototype analyst'}${status}</span>${escapeHtml(item.text)}${!isUser && (citationChips || evidence) ? `<div class="chat-evidence">${citationChips}${evidence}</div>` : ''}</div>`;
  }).join('');
  const suggestions = ['What is the latest solar generation?', 'Show the latest anomaly signal', 'How does the baseline forecast work?', 'What is the source of this data?'];
  return `${pageHead('EXPLAIN · GROUNDED ANSWERS ONLY', 'Ask the evidence.', 'A deterministic, local analyst prototype that answers from the active dataset and methods. It does not call an external LLM or the web; unsupported claims are limited or refused.', `<span class="pill green">LOCAL · NO EXTERNAL MODEL</span>`)}
    ${contextBanner()}
    <div class="analyst-layout"><section class="panel chat-panel"><div class="chat-header"><div class="analyst-avatar">${htmlIcon('sparkle')}</div><div class="chat-title"><strong>RE-PREDICT Energy Analyst</strong><small>Active snapshot · ${escapeHtml(currentState().data_version || '—')}</small></div><span class="chat-status pill green"><span class="pill-dot"></span>GROUNDED</span></div><div class="chat-messages" id="chat-messages">${ui.chat.length ? chat : `<div class="chat-welcome"><span class="chat-welcome-mark">✦</span><p>I can summarize the active observation snapshot, baseline forecast, anomaly signals, scenario assumptions, and source lineage. I will not invent a value or infer a physical cause. Try a suggested question.</p></div>`}${ui.analystBusy ? `<div class="chat-msg assistant"><span class="chat-msg-label">Grounded prototype analyst</span><span class="loading-inline">Checking approved evidence…</span></div>` : ''}</div><div class="chat-compose"><form id="analyst-form"><div class="chat-input-row"><input id="analyst-question" name="question" type="text" maxlength="500" placeholder="Ask about a value, trend, forecast, alert, or source…" autocomplete="off" required><button class="chat-send" type="submit" aria-label="Ask the analyst">${htmlIcon('trend')}</button></div></form><div class="chat-suggestions">${suggestions.map((question) => `<button type="button" class="chat-suggestion" data-query="${escapeHtml(question)}">${escapeHtml(question)}</button>`).join('')}</div></div></section><aside class="chat-sidebar"><section class="guardrail-card"><h3>What this analyst does</h3><div class="guardrail-list"><div class="guardrail-item"><span class="guardrail-check">✓</span><span><strong>Uses approved local evidence</strong>Observed rows, source metadata, prototype model outputs, and saved scenarios.</span></div><div class="guardrail-item"><span class="guardrail-check">✓</span><span><strong>Labels claim types</strong>Observed, derived, estimated, simulated, and demo values remain distinct.</span></div><div class="guardrail-item"><span class="guardrail-check">✓</span><span><strong>Records a local audit entry</strong>Query text is stored in the workspace audit log.</span></div></div></section><section class="guardrail-card"><h3>What it will not do</h3><div class="guardrail-list"><div class="guardrail-item"><span class="guardrail-check" style="color:#a35f4f;background:#fff0eb">!</span><span>Claim weather, outage, curtailment, or equipment causes from generation alone.</span></div><div class="guardrail-item"><span class="guardrail-check" style="color:#a35f4f;background:#fff0eb">!</span><span>Invent a value when the selected snapshot does not contain it.</span></div><div class="guardrail-item"><span class="guardrail-check" style="color:#a35f4f;background:#fff0eb">!</span><span>Present itself as an LLM, CEA product, or operational control tool.</span></div></div></section><div class="reference-note">${htmlIcon('shield')}<span><strong>Prototype boundary:</strong> rule-based intent routing and deterministic calculations; not a production natural-language model. <a href="#sources" data-view="sources">Inspect lineage</a>.</span></div></aside></div>`;
}

function sourceTypeLabel(report) {
  if (report.source_type === 'official_dataset') return 'Historical CEA dataset · parsed & checksummed';
  if (report.source_type === 'synthetic_demo') return 'Synthetic demo fixture';
  if (report.source_type === 'user_upload') return 'User-uploaded CSV';
  return 'Official CEA source portal';
}
function renderSourceCard(report, active) {
  const isCea = report.source_type === 'official_dataset';
  const isReference = report.source_type === 'official_reference';
  const iconType = report.source_type === 'synthetic_demo' ? 'amber' : isReference || isCea ? 'blue' : '';
  const unitText = report.unit_label || report.unit || '—';
  const hash = report.checksum || 'Not available (reference only)';
  const sourceUrl = report.source_url;
  const actions = isReference || isCea
    ? `<a class="button button-soft" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">Open CEA reports ${htmlIcon('external')}</a>${isCea ? `<button class="button button-soft" data-action="scroll-manifest">Inspect 90 source files</button>` : ''}`
    : `${!active ? `<button class="button button-soft" data-action="activate-source" data-id="${escapeHtml(report.source_id)}">Activate</button>` : '<span class="pill green"><span class="pill-dot"></span>ACTIVE</span>'}${report.raw_path ? `<button class="button button-soft" data-action="download-raw" data-id="${escapeHtml(report.source_id)}">Download raw CSV</button>` : ''}`;
  const statusPill = isCea ? 'CEA SNAPSHOT' : isReference ? 'OFFICIAL PORTAL' : report.source_type === 'user_upload' ? 'USER DATA' : 'DEMO ONLY';
  const hashLabel = report.checksum_type === 'sha256-normalized-observations' ? 'Normalized observations · SHA-256' : 'Original artifact · SHA-256';
  return `<article class="source-primary-card"><div class="source-primary-top"><div class="source-brandline"><span class="source-symbol ${iconType}">${htmlIcon(isReference ? 'external' : report.source_type === 'synthetic_demo' ? 'sparkle' : 'file')}</span><div><h3>${escapeHtml(report.title)}</h3><p>${escapeHtml(sourceTypeLabel(report))} · ${escapeHtml(report.status || '')}</p></div></div><span class="pill ${isCea || report.source_type === 'user_upload' ? 'green' : report.source_type === 'synthetic_demo' ? 'amber' : 'blue'}">${statusPill}</span></div><div class="source-meta-grid"><div class="source-meta-item"><span>Records</span><strong>${formatNumber(report.record_count || 0, 0)}</strong></div><div class="source-meta-item"><span>Observed periods</span><strong>${formatNumber(report.date_count || 0, 0)}</strong></div><div class="source-meta-item"><span>Unit</span><strong>${escapeHtml(unitText)}</strong></div><div class="source-meta-item"><span>Data window</span><strong>${report.start_date ? `${escapeHtml(report.start_date)} → ${escapeHtml(report.end_date)}` : 'Not ingested'}</strong></div><div class="source-meta-item"><span>Parser / method</span><strong>${escapeHtml(report.parser_version || '—')}</strong></div><div class="source-meta-item"><span>Publisher / capture</span><strong>${isCea ? 'Central Electricity Authority · India' : report.created_at ? new Date(report.created_at).toLocaleString() : 'Reference only'}</strong></div></div><div class="hash-line"><span>${hashLabel}</span><code title="${escapeHtml(hash)}">${escapeHtml(hash)}</code>${report.checksum ? `<button class="hash-copy" data-action="copy-hash" data-hash="${escapeHtml(report.checksum)}">Copy</button>` : ''}</div>${isCea ? `<div class="note-strip" style="margin-top:9px">${htmlIcon('shield')}<span>${formatNumber(report.components?.length || 0, 0)} original XLSX workbooks included · ${formatNumber(report.reconciliation?.reports_reconciled || 0, 0)}/${formatNumber(report.reconciliation?.reports_total || 0, 0)} CEA daily totals reconcile with reported totals.</span></div>` : ''}${report.unmapped_headers?.length ? `<div class="note-strip" style="margin-top:8px">${htmlIcon('eye')}<span>Unmapped columns preserved as metadata: ${report.unmapped_headers.map(escapeHtml).join(', ')}</span></div>` : ''}<div class="source-actions">${active && !isReference ? '<span class="pill green"><span class="pill-dot"></span>ACTIVE IN WORKSPACE</span>' : ''}${actions}</div></article>`;
}

function renderCeaManifest(report) {
  const components = report?.components || [];
  if (!components.length) return '';
  const passed = components.filter((component) => component.reconciliation_status === 'passed').length;
  const rows = components.map((component) => `<tr><td>${formatDate(component.report_date, { day: 'numeric', month: 'short', year: 'numeric' })}</td><td><a href="${escapeHtml(component.source_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(component.report_name)}.xlsx ↗</a></td><td>${escapeHtml(component.sheet)}!B47–D47</td><td class="numeric">${formatNumber(component.reported_total, 2)} MU</td><td><span class="pill green">${escapeHtml(component.reconciliation_status)}</span></td><td><code title="${escapeHtml(component.sha256)}">${escapeHtml(component.sha256.slice(0, 16))}…</code><button class="hash-copy" data-action="copy-hash" data-hash="${escapeHtml(component.sha256)}">Copy</button></td><td><a class="row-link" href="/api/v1/cea-reports/${encodeURIComponent(component.report_id)}/raw" download="${escapeHtml(component.file_name)}">Download workbook ↓</a></td></tr>`).join('');
  return `<details class="cea-manifest" id="cea-manifest"><summary><span><strong>Inspect the source chain</strong><small>${formatNumber(components.length, 0)} archived CEA workbooks · ${formatNumber(passed, 0)}/${formatNumber(components.length, 0)} total checks passed · SHA-256 per file</small></span><span class="manifest-summary-pill">Open report manifest</span></summary><div class="cea-manifest-body"><p>Each row is the exact report used for the extracted values. The date, worksheet, cell, original-published value and workbook SHA-256 are preserved; original XLSX artifacts are packaged and downloadable here.</p><div class="data-table-wrap manifest-scroll"><table class="data-table"><thead><tr><th>Report date</th><th>CEA workbook</th><th>Source cells</th><th class="numeric">Reported total</th><th>Reconciliation</th><th>Workbook SHA-256</th><th>Packaged original</th></tr></thead><tbody>${rows}</tbody></table></div></div></details>`;
}

function renderSources() {
  const source = activeSource();
  const reports = currentState().source_reports || [];
  const reference = reports.find((report) => report.source_type === 'official_reference');
  const officialSnapshot = reports.find((report) => report.source_type === 'official_dataset');
  const quality = currentState().data_quality || {};
  const reportRows = reports.slice().sort((a, b) => {
    const rank = (item) => item.source_type === 'official_reference' ? 3 : item.source_type === 'official_dataset' ? 1 : 2;
    if (a.source_id === currentState().active_source_id) return -1;
    if (b.source_id === currentState().active_source_id) return 1;
    return rank(a) - rank(b) || String(b.created_at || '').localeCompare(String(a.created_at || ''));
  });
  const checks = quality.checks || {};
  const checkItems = [
    ['Schema', checks.schema || 'not checked'],
    ['Date integrity', checks.date_integrity || 'not checked'],
    ['Duplicate keys', checks.duplicate_keys || 'not checked'],
    ['Unit consistency', checks.unit_consistency || 'not checked'],
  ];
  if (checks.source_total_reconciliation) checkItems.push(['CEA total check', checks.source_total_reconciliation]);
  if (checks.raw_artifact_checksums) checkItems.push(['Source artifacts', checks.raw_artifact_checksums]);
  const isCeaActive = source?.source_type === 'official_dataset';
  return `${pageHead('SENSE · SOURCE STUDIO', 'Know what the number came from.', 'Browse the official report snapshot, follow any observation to its exact workbook cell, and inspect the validation trail before interpreting a chart or model.', `<button class="button button-soft" data-action="export-csv">${htmlIcon('export')}Export active CSV</button><button class="button button-primary" data-action="import">${htmlIcon('upload')}Import source CSV</button>`)}
    ${contextBanner()}
    <div class="grid-two"><div>${source ? renderSourceCard(source, true) : `<section class="panel"><div class="empty-state"><h3>No active observation source</h3><p>Import a reviewed CSV or activate one of the source snapshots.</p><button class="button button-primary" data-action="import">Import CSV</button></div></section>`}${officialSnapshot ? renderCeaManifest(officialSnapshot) : ''}<div class="reference-note" style="margin-top:12px">${htmlIcon('external')}<span><strong>Source boundary:</strong> This is a date-bounded snapshot of CEA-published reports, not a live feed or CEA product. RE-PREDICT is an independent analysis prototype, not endorsed by CEA. The packaged report workbook, SHA-256, source row, and parsed cell are shown for each value. <a href="${escapeHtml(reference?.source_url || 'https://gen-re.cea.gov.in/reports')}" target="_blank" rel="noopener noreferrer">Open the official CEA report portal ↗</a></span></div></div>
      <aside class="lineage-card"><span class="panel-overline">PROVENANCE PATH</span><h2 class="panel-title">From report to insight</h2><p class="panel-subtitle">${isCeaActive ? 'A published workbook is preserved, parsed by exact cell, reconciled with the report total, then independently analyzed.' : 'Source records stay linked to their original file or fixture, with transformation and dataset-version notes.'}</p><div class="lineage-steps"><div class="lineage-step"><span class="lineage-num">1</span><div><strong>${isCeaActive ? 'CEA XLSX report' : 'Source artifact'}</strong><small>${escapeHtml(source?.file_name || source?.title || 'No active source')} · ${source?.checksum ? `${escapeHtml(source.checksum.slice(0, 14))}… snapshot hash` : 'checksum registered where available'}</small></div></div><div class="lineage-step"><span class="lineage-num">2</span><div><strong>Extraction &amp; normalization</strong><small>${escapeHtml(source?.parser_version || 'No parser run')} · ${isCeaActive ? 'Generation!B47–D47 · MU net' : 'explicit column mapping / fixture metadata'}</small></div></div><div class="lineage-step"><span class="lineage-num">3</span><div><strong>Validation gate</strong><small>${isCeaActive ? `${formatNumber(source.reconciliation?.reports_reconciled || 0, 0)}/${formatNumber(source.reconciliation?.reports_total || 0, 0)} published totals reconcile; per-file SHA-256` : 'Required fields, dates, non-negative values, duplicates, and units'}</small></div></div><div class="lineage-step"><span class="lineage-num">4</span><div><strong>Independent derived output</strong><small>Dataset ${escapeHtml(currentState().data_version || '—')} · observed / forecast / simulation labels preserved</small></div></div></div></aside></div>
    <section class="panel panel-pad" style="margin-bottom:14px"><div class="panel-header"><div><span class="panel-overline">DATA QUALITY · ACTIVE SNAPSHOT</span><h2 class="panel-title">Validation status</h2><p class="panel-subtitle">${isCeaActive ? '90-report archive coverage is complete within the declared snapshot window; no live completeness is inferred beyond it.' : 'Completeness is not scored because no expected reporting calendar is inferred.'}</p></div><span class="pill green">${formatNumber(quality.record_count || 0, 0)} accepted records</span></div><div class="quality-grid">${checkItems.map(([label, value]) => `<div class="quality-check"><span class="check-icon">✓</span><span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(value)}</small></span></div>`).join('')}</div><div class="note-strip" style="margin-top:11px">${htmlIcon('shield')}<span>${escapeHtml(quality.completeness_note || 'No expected reporting calendar is inferred.')}</span></div></section>
    <div class="grid-equal"><section class="panel panel-pad"><div class="panel-header"><div><span class="panel-overline">SOURCE REGISTER</span><h2 class="panel-title">Available snapshots</h2><p class="panel-subtitle">Switch datasets without deleting prior imports, source files, or audit entries.</p></div><span class="pill">${formatNumber(reports.length, 0)} sources</span></div><div class="source-list">${reportRows.map((report) => {
    const active = report.source_id === currentState().active_source_id;
    const referenceOnly = report.source_type === 'official_reference';
    return `<div class="source-list-row ${active ? 'is-active' : ''}"><span class="source-symbol ${report.source_type === 'synthetic_demo' ? 'amber' : report.source_type === 'official_reference' || report.source_type === 'official_dataset' ? 'blue' : ''}">${htmlIcon(referenceOnly ? 'external' : report.source_type === 'synthetic_demo' ? 'sparkle' : 'file')}</span><div class="source-list-copy"><strong>${escapeHtml(report.title)}</strong><small>${escapeHtml(sourceTypeLabel(report))} · ${formatNumber(report.record_count || 0, 0)} rows · ${report.source_id === 'src-demo' ? 'not official' : escapeHtml(report.source_id)}</small></div><div class="source-list-actions">${referenceOnly ? `<a class="button button-soft" href="${escapeHtml(report.source_url)}" target="_blank" rel="noopener noreferrer">Open source</a>` : active ? `<span class="pill green">ACTIVE</span>` : `<button class="button button-soft" data-action="activate-source" data-id="${escapeHtml(report.source_id)}">Activate</button>`}</div></div>`;
  }).join('')}</div><div class="form-footer"><button class="button button-danger" data-action="reset-demo">Restore synthetic demo</button><span class="mini-meta">The CEA snapshot remains available as a separate source.</span></div></section><section class="panel panel-pad"><div class="panel-header"><div><span class="panel-overline">APPEND-ONLY EVENT TRAIL</span><h2 class="panel-title">Recent audit activity</h2><p class="panel-subtitle">Local prototype actions · latest first.</p></div><span class="pill blue">${formatNumber((currentState().audit_events || []).length, 0)} events</span></div>${renderAuditList((currentState().audit_events || []).slice(0, 9))}</section></div>`;
}

function renderAuditList(events) {
  if (!events.length) return `<div class="chart-empty">No audit events recorded yet.</div>`;
  return `<div class="audit-list">${events.map((event) => `<div class="audit-item"><span class="audit-timeline-dot"></span><div class="audit-copy"><strong>${escapeHtml(event.title || event.type)}</strong><small>${escapeHtml(event.detail || event.object_ref || '')}</small></div><time class="audit-time">${event.created_at ? new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</time></div>`).join('')}</div>`;
}

function drawLineChart(svgId, lines, options = {}) {
  const svg = document.getElementById(svgId);
  if (!svg) return;
  const usable = (lines || []).filter((line) => Array.isArray(line.points) && line.points.length);
  if (!usable.length) {
    svg.outerHTML = `<div class="chart-empty"><div class="chart-empty-inner">No data is available for this chart.</div></div>`;
    return;
  }
  const W = 900; const H = 240; const margin = { left: 48, right: 15, top: 13, bottom: 30 };
  const allPoints = usable.flatMap((line) => line.points.map((point) => ({ ...point, numericDate: Date.parse(`${String(point.x).slice(0, 10)}T00:00:00Z`) })));
  const xValues = allPoints.map((point) => point.numericDate).filter(Number.isFinite);
  const yValues = allPoints.map((point) => Number(point.y)).filter(Number.isFinite);
  if (!yValues.length) return;
  const xMin = Math.min(...xValues); const xMax = Math.max(...xValues);
  let yMin = options.zeroBaseline ? 0 : Math.min(...yValues);
  let yMax = Math.max(...yValues);
  if (yMax === yMin) { yMax += Math.max(Math.abs(yMax) * .15, 1); yMin = options.zeroBaseline ? 0 : yMin - Math.max(Math.abs(yMin) * .15, 1); }
  if (!options.zeroBaseline) { const pad = (yMax - yMin) * .15; yMin = Math.max(0, yMin - pad); yMax += pad; }
  if (yMax <= yMin) yMax = yMin + 1;
  const innerW = W - margin.left - margin.right; const innerH = H - margin.top - margin.bottom;
  const x = (dateNumber) => margin.left + ((dateNumber - xMin) / (xMax - xMin || 1)) * innerW;
  const y = (value) => margin.top + (1 - (value - yMin) / (yMax - yMin)) * innerH;
  const ticks = Array.from({ length: 4 }, (_, index) => yMin + ((yMax - yMin) * index) / 3);
  let markup = `<defs><linearGradient id="${svgId}-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="${escapeXml(usable[0].color)}" stop-opacity=".17"/><stop offset="100%" stop-color="${escapeXml(usable[0].color)}" stop-opacity="0"/></linearGradient></defs>`;
  ticks.forEach((value) => {
    const yPos = y(value);
    markup += `<line class="grid-line" x1="${margin.left}" y1="${yPos}" x2="${W - margin.right}" y2="${yPos}"/><text x="${margin.left - 9}" y="${yPos + 3}" text-anchor="end">${escapeXml(formatCompact(value, 0))}</text>`;
  });
  markup += `<line class="axis-line" x1="${margin.left}" y1="${H - margin.bottom}" x2="${W - margin.right}" y2="${H - margin.bottom}"/>`;
  const dateList = uniqueSorted(allPoints.map((point) => String(point.x).slice(0, 10)));
  const tickIndices = [...new Set([0, Math.floor((dateList.length - 1) / 3), Math.floor(2 * (dateList.length - 1) / 3), dateList.length - 1])].filter((index) => index >= 0);
  tickIndices.forEach((index) => {
    const date = dateList[index]; const position = x(Date.parse(`${date}T00:00:00Z`));
    markup += `<line class="axis-line" x1="${position}" y1="${H - margin.bottom}" x2="${position}" y2="${H - margin.bottom + 4}"/><text x="${position}" y="${H - 8}" text-anchor="middle">${escapeXml(formatAxisDate(date))}</text>`;
  });
  usable.forEach((line, lineIndex) => {
    const points = line.points.map((point) => ({ xDate: String(point.x).slice(0, 10), dateNum: Date.parse(`${String(point.x).slice(0, 10)}T00:00:00Z`), value: Number(point.y) })).filter((point) => Number.isFinite(point.dateNum) && Number.isFinite(point.value));
    if (!points.length) return;
    const coordinates = points.map((point) => [x(point.dateNum), y(point.value)]);
    const path = coordinates.map(([px, py], index) => `${index ? 'L' : 'M'}${px.toFixed(2)},${py.toFixed(2)}`).join(' ');
    if (lineIndex === 0 && points.length > 2) {
      const area = `${path} L${coordinates.at(-1)[0].toFixed(2)},${(H - margin.bottom).toFixed(2)} L${coordinates[0][0].toFixed(2)},${(H - margin.bottom).toFixed(2)} Z`;
      markup += `<path d="${area}" fill="url(#${svgId}-fill)"/>`;
    }
    markup += `<path class="chart-line ${lineIndex === 0 ? 'primary-line' : ''}" d="${path}" stroke="${escapeXml(line.color)}"/>`;
    const every = Math.max(1, Math.ceil(points.length / 12));
    points.forEach((point, index) => {
      if (index % every !== 0 && index !== points.length - 1) return;
      markup += `<circle class="chart-point" cx="${coordinates[index][0]}" cy="${coordinates[index][1]}" r="2.6" fill="${escapeXml(line.color)}"><title>${escapeXml(line.name)} · ${escapeXml(point.xDate)} · ${escapeXml(formatNumber(point.value, 2))}</title></circle>`;
    });
  });
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = markup;
}

function drawForecastChart() {
  const svg = document.getElementById('forecast-chart');
  const data = ui.forecast;
  if (!svg || data?.status !== 'ready') return;
  const history = data.history || [];
  const future = (data.forecast_points || []).slice(0, ui.forecastHorizon);
  if (!history.length || !future.length) return;
  const W = 900; const H = 240; const margin = { left: 48, right: 15, top: 13, bottom: 30 };
  const points = [...history, ...future].map((point) => ({ date: point.date, time: Date.parse(`${point.date}T00:00:00Z`), value: Number(point.value), lower: Number(point.lower ?? point.value), upper: Number(point.upper ?? point.value) }));
  const minX = points[0].time; const maxX = points.at(-1).time;
  const allY = points.flatMap((point) => [point.value, point.lower, point.upper]).filter(Number.isFinite);
  let minY = Math.min(...allY); let maxY = Math.max(...allY);
  const pad = Math.max((maxY - minY) * .16, Math.abs(maxY) * .03, 1);
  minY = Math.max(0, minY - pad); maxY += pad;
  const innerW = W - margin.left - margin.right; const innerH = H - margin.top - margin.bottom;
  const x = (value) => margin.left + ((value - minX) / (maxX - minX || 1)) * innerW;
  const y = (value) => margin.top + (1 - (value - minY) / (maxY - minY)) * innerH;
  let markup = '';
  for (let i = 0; i < 4; i += 1) {
    const value = minY + ((maxY - minY) * i) / 3;
    const yPos = y(value);
    markup += `<line class="grid-line" x1="${margin.left}" y1="${yPos}" x2="${W - margin.right}" y2="${yPos}"/><text x="${margin.left - 9}" y="${yPos + 3}" text-anchor="end">${escapeXml(formatCompact(value, 0))}</text>`;
  }
  markup += `<line class="axis-line" x1="${margin.left}" y1="${H - margin.bottom}" x2="${W - margin.right}" y2="${H - margin.bottom}"/>`;
  const dateList = points.map((point) => point.date);
  const tickIndices = [...new Set([0, Math.floor((dateList.length - 1) / 3), Math.floor(2 * (dateList.length - 1) / 3), dateList.length - 1])];
  tickIndices.forEach((index) => {
    const position = x(points[index].time);
    markup += `<line class="axis-line" x1="${position}" y1="${H - margin.bottom}" x2="${position}" y2="${H - margin.bottom + 4}"/><text x="${position}" y="${H - 8}" text-anchor="middle">${escapeXml(formatAxisDate(points[index].date))}</text>`;
  });
  const firstFuture = future[0]; const lastActual = history.at(-1);
  const divider = x(Date.parse(`${lastActual.date}T00:00:00Z`));
  markup += `<line class="forecast-divider" x1="${divider}" y1="${margin.top}" x2="${divider}" y2="${H - margin.bottom}"/><text x="${Math.min(divider + 5, W - 82)}" y="${margin.top + 9}" fill="#80958e">FORECAST →</text>`;
  const upperPath = future.map((point) => `${x(Date.parse(`${point.date}T00:00:00Z`)).toFixed(2)},${y(Number(point.upper)).toFixed(2)}`);
  const lowerPath = future.slice().reverse().map((point) => `${x(Date.parse(`${point.date}T00:00:00Z`)).toFixed(2)},${y(Number(point.lower)).toFixed(2)}`);
  markup += `<polygon class="forecast-band" points="${upperPath.concat(lowerPath).join(' ')}" fill="#54b391"/>`;
  const actualPath = history.map((point, index) => `${index ? 'L' : 'M'}${x(Date.parse(`${point.date}T00:00:00Z`)).toFixed(2)},${y(Number(point.value)).toFixed(2)}`).join(' ');
  markup += `<path class="chart-line primary-line" d="${actualPath}" stroke="#27495a"/>`;
  const forecastPath = `${x(Date.parse(`${lastActual.date}T00:00:00Z`)).toFixed(2)},${y(Number(lastActual.value)).toFixed(2)} ` + future.map((point) => `${x(Date.parse(`${point.date}T00:00:00Z`)).toFixed(2)},${y(Number(point.value)).toFixed(2)}`).join(' ');
  markup += `<polyline class="forecast-line" points="${forecastPath}" stroke="#3d9a7d"/>`;
  history.forEach((point, index) => {
    const every = Math.max(1, Math.ceil(history.length / 11));
    if (index % every !== 0 && index !== history.length - 1) return;
    const xPos = x(Date.parse(`${point.date}T00:00:00Z`)); const yPos = y(Number(point.value));
    markup += `<circle class="chart-point" cx="${xPos}" cy="${yPos}" r="2.5" fill="#27495a"><title>Observed · ${escapeXml(point.date)} · ${escapeXml(formatNumber(point.value, 2))} ${escapeXml(data.unit)}</title></circle>`;
  });
  future.forEach((point) => {
    const xPos = x(Date.parse(`${point.date}T00:00:00Z`)); const yPos = y(Number(point.value));
    markup += `<circle class="chart-point" cx="${xPos}" cy="${yPos}" r="3.1" fill="#3d9a7d"><title>Seasonal-naive · ${escapeXml(point.date)} · ${escapeXml(formatNumber(point.value, 2))} ${escapeXml(data.unit)} · band ${escapeXml(formatNumber(point.lower, 2))}–${escapeXml(formatNumber(point.upper, 2))}</title></circle>`;
  });
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = markup;
}

function drawCharts() {
  const data = observations();
  const lines = buildChartLines(data);
  const windowLabel = selectedWindowLabel();
  drawLineChart('overview-trend', lines, { zeroBaseline: selectedTechnology() === 'all' });
  drawLineChart('explore-chart', lines, { zeroBaseline: selectedTechnology() === 'all' });
  drawForecastChart();
}

function updateCarbonEstimate() {
  const valueNode = document.getElementById('carbon-output-value');
  if (!valueNode) return;
  const generationInput = document.getElementById('carbon-generation');
  const factorInput = document.getElementById('carbon-factor');
  const basisInput = document.getElementById('carbon-basis');
  const basis = basisInput?.value || ui.carbonBasis || 'observed';
  const scenario = basis.startsWith('scenario:')
    ? (currentState().scenarios || []).find((item) => `scenario:${item.scenario_id}` === basis && item.source_id === currentState().active_source_id)
    : null;
  const generation = generationInput ? Number(generationInput.value) : Number(ui.carbonGeneration);
  const factor = factorInput ? Number(factorInput.value) : Number(ui.carbonFactor);
  const unit = scenario?.unit || observations()[0]?.unit || 'GWh';
  ui.carbonGeneration = generation;
  ui.carbonFactor = factor;
  ui.carbonBasis = basis;
  const estimate = carbonEstimate(generation, factor, unit);
  valueNode.innerHTML = estimate.available ? `${formatNumber(estimate.value, 2)}<span>${estimate.unitLabel}</span>` : `—<span></span>`;
  const conversion = carbonUnitConversion(unit);
  const conversionText = conversion?.label || 'unit conversion unavailable';
  const note = document.getElementById('carbon-output-note');
  if (note) note.textContent = estimate.available ? `Estimate only. ${scenario ? 'This uses simulated scenario output and inherits its user-entered assumptions. ' : ''}${String(unit).toLowerCase().startsWith('mu') ? '1 MU = 1 GWh = 1,000 MWh by exact unit definition. ' : ''}The calculation assumes the selected renewable generation displaces the declared counterfactual grid mix at the selected factor.` : estimate.message;
  const equation = document.getElementById('carbon-equation');
  if (equation) equation.textContent = `E = G × (MWh per unit) × EF · ${formatNumber(generation, 2)} ${unit} × ${conversionText} × ${formatNumber(factor, 3)} tCO₂e/MWh`;
  const summary = document.getElementById('carbon-summary');
  if (summary) summary.textContent = `Generation ${formatNumber(generation, 2)} ${unit} × ${conversionText} × factor ${formatNumber(factor, 3)} tCO₂e/MWh`;
  const basisNote = document.getElementById('carbon-basis-note');
  if (basisNote) basisNote.textContent = `${scenario ? `Saved simulation ${scenario.scenario_id}; capacity and availability assumptions are not source-verified.` : `Observed active snapshot for ${selectedTechnology() === 'all' ? 'all technologies' : selectedTechnology()}, or user-edited basis.`}${String(unit).toLowerCase().startsWith('mu') ? ' Exact unit conversion: 1 MU = 1 GWh = 1,000 MWh; the emissions factor is still illustrative.' : ''}`;
}

function renderImportModal() {
  modalRoot.innerHTML = `<div class="modal-backdrop" id="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="import-title"><div class="modal-head"><div><h2 id="import-title">Bring your source data into RE-PREDICT</h2><p>Upload a reviewed CSV. The original file is checksum-registered and stored locally before it becomes active.</p></div><button type="button" class="modal-close" data-action="close-modal" aria-label="Close">×</button></div><div class="modal-body"><div class="dropzone" id="dropzone"><span class="dropzone-icon">${htmlIcon('upload')}</span><strong>Drop a CSV here or choose a file</strong><p>One compatible generation unit per file · maximum 4 MB</p><button type="button" data-action="choose-file">Browse files</button><input id="csv-file" type="file" accept=".csv,text/csv" hidden></div><div class="file-meta" id="file-meta"><span>${htmlIcon('file')}</span><strong id="selected-file-name">No file</strong><span id="selected-file-size"></span></div><div class="csv-schema"><div class="csv-schema-title">Minimum CSV contract</div><code>date,technology,value,unit,geography</code><p>Date must use YYYY-MM-DD; generation values must be non-negative. If you use a generation_gwh or generation_mwh header, the unit may be inferred from that explicit header.</p><div style="margin-top:7px"><a class="panel-link" href="/sample_generation.csv" download>Download sample CSV ↘</a></div></div><div class="import-error" id="import-error"></div><div class="modal-footer"><button type="button" class="button button-ghost" data-action="close-modal">Cancel</button><button type="button" class="button button-primary" id="submit-import" data-action="submit-import" disabled>${htmlIcon('upload')}Validate &amp; activate</button></div></div></section></div>`;
}

function closeModal() { modalRoot.innerHTML = ''; }

async function openProvenanceModal(observationId) {
  if (!observationId) { goToView('sources'); return; }
  modalRoot.innerHTML = `<div class="modal-backdrop" id="modal-backdrop"><section class="modal provenance-modal" role="dialog" aria-modal="true" aria-labelledby="provenance-title"><div class="modal-head"><div><h2 id="provenance-title">Tracing this observation…</h2><p>Loading the saved source locator and artifact metadata.</p></div><button type="button" class="modal-close" data-action="close-modal" aria-label="Close">×</button></div><div class="modal-body"><span class="loading-inline">Fetching row-level lineage…</span></div></section></div>`;
  try {
    const result = await api(`/api/v1/provenance/${encodeURIComponent(observationId)}`);
    const row = result.observation;
    const source = result.source;
    const component = result.source_component;
    if (!row) throw new Error('The source observation is no longer available.');
    const sourceActions = component
      ? `<a class="button button-primary" href="/api/v1/cea-reports/${encodeURIComponent(component.report_id)}/raw" download="${escapeHtml(component.file_name)}">${htmlIcon('export')}Download archived XLSX</a><a class="button button-soft" href="${escapeHtml(component.source_url)}" target="_blank" rel="noopener noreferrer">Open CEA original ${htmlIcon('external')}</a>`
      : source?.raw_path
        ? `<a class="button button-primary" href="/api/v1/sources/${encodeURIComponent(source.source_id)}/raw" download>${htmlIcon('export')}Download original CSV</a>`
        : '';
    const locatorText = component
      ? `${escapeHtml(component.sheet)}!${escapeHtml(row.locator?.cell || '—')} · row ${formatNumber(component.all_india_row, 0)} · ${escapeHtml(component.row_label)}`
      : row.locator?.row ? `CSV row ${formatNumber(row.locator.row, 0)}` : escapeHtml(row.locator?.type || 'No row-level locator');
    modalRoot.innerHTML = `<div class="modal-backdrop" id="modal-backdrop"><section class="modal provenance-modal" role="dialog" aria-modal="true" aria-labelledby="provenance-title"><div class="modal-head"><div><h2 id="provenance-title">Observation provenance</h2><p>${escapeHtml(source?.title || row.source_id)} · dataset ${escapeHtml(result.data_version || '—')}</p></div><button type="button" class="modal-close" data-action="close-modal" aria-label="Close">×</button></div><div class="modal-body"><div class="provenance-value"><span>OBSERVED VALUE</span><strong>${formatNumber(row.value, 2)} <small>${escapeHtml(row.unit)}</small></strong><div>${escapeHtml(row.technology)} · ${escapeHtml(row.geography || 'Geography not specified')} · ${formatDate(row.date)}</div></div><div class="source-meta-grid provenance-grid"><div class="source-meta-item"><span>Artifact</span><strong>${escapeHtml(component?.file_name || source?.file_name || source?.title || 'Generated fixture')}</strong></div><div class="source-meta-item"><span>Worksheet / row</span><strong>${locatorText}</strong></div><div class="source-meta-item"><span>Original report date</span><strong>${formatDate(component?.report_date || row.date)}</strong></div><div class="source-meta-item"><span>Snapshot quality</span><strong>${escapeHtml(row.quality_status || 'not specified')}</strong></div><div class="source-meta-item"><span>Data version</span><strong>${escapeHtml(result.data_version || '—')}</strong></div><div class="source-meta-item"><span>Reconciliation</span><strong>${component ? `${escapeHtml(component.reconciliation_status)} · ${formatNumber(component.reported_total, 2)} MU reported total` : 'See source record'}</strong></div></div>${component ? `<div class="hash-line provenance-hash"><span>Workbook SHA-256</span><code title="${escapeHtml(component.sha256)}">${escapeHtml(component.sha256)}</code><button class="hash-copy" data-action="copy-hash" data-hash="${escapeHtml(component.sha256)}">Copy</button></div><div class="notice-card provenance-note"><strong>Exact source mapping</strong><p>The displayed observation was read from ${escapeHtml(component.sheet)}!${escapeHtml(row.locator?.cell || '—')} in the CEA All India row. The report's total is in E47; the published Wind + Solar + Other RES components reconcile exactly within the declared 0.02 MU tolerance. No cause or forecast is asserted by this provenance record.</p></div>` : `<div class="notice-card provenance-note"><strong>Source boundary</strong><p>${source?.source_type === 'synthetic_demo' ? 'This is generated synthetic demo data, not a CEA observation.' : 'This locator is based on the active uploaded file metadata. User-uploaded data is not independently certified.'}</p></div>`}<div class="source-actions">${sourceActions}<button class="button button-soft" data-action="close-modal">Close</button></div></div></section></div>`;
  } catch (error) {
    modalRoot.innerHTML = '';
    toast(`Could not load provenance: ${error.message}`, 'error');
  }
}

async function handleImport() {
  const input = document.getElementById('csv-file');
  const file = input?.files?.[0];
  const errorNode = document.getElementById('import-error');
  const button = document.getElementById('submit-import');
  if (!file) return;
  if (file.size > 4 * 1024 * 1024) {
    showImportError(new Error('CSV exceeds the 4 MB prototype upload limit.'));
    return;
  }
  ui.importBusy = true;
  button.disabled = true;
  button.innerHTML = '<span class="loading-inline">Validating locally…</span>';
  errorNode?.classList.remove('is-visible');
  try {
    const rawText = await file.text();
    const result = await api('/api/v1/import', { method: 'POST', body: JSON.stringify({ fileName: file.name, rawText }) });
    closeModal();
    ui.view = 'overview';
    ui.scenarioResult = null;
    ui.scenarioForm = null;
    ui.forecast = null;
    await refreshState({ renderPage: false });
    await loadAnomalies();
    render();
    toast(`${formatNumber(result.source.record_count, 0)} records validated from ${file.name}. Source hash saved.`, 'success');
  } catch (error) {
    showImportError(error);
  } finally {
    ui.importBusy = false;
    const submit = document.getElementById('submit-import');
    if (submit) {
      submit.disabled = !document.getElementById('csv-file')?.files?.[0];
      submit.innerHTML = `${htmlIcon('upload')}Validate &amp; activate`;
    }
  }
}

function showImportError(error) {
  const node = document.getElementById('import-error');
  if (!node) { toast(error.message, 'error'); return; }
  const issues = Array.isArray(error.issues) && error.issues.length ? `<ul>${error.issues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join('')}</ul>` : '';
  node.innerHTML = `<strong>Import stopped; nothing was activated.</strong><div>${escapeHtml(error.message)}</div>${issues}`;
  node.classList.add('is-visible');
}

function humanFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
function setSelectedFile(file) {
  const input = document.getElementById('csv-file');
  if (!file || !input) return;
  if (!file.name.toLowerCase().endsWith('.csv')) {
    showImportError(new Error('Please select a .csv file.'));
    return;
  }
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  document.getElementById('selected-file-name').textContent = file.name;
  document.getElementById('selected-file-size').textContent = humanFileSize(file.size);
  document.getElementById('file-meta').classList.add('is-visible');
  document.getElementById('submit-import').disabled = false;
  document.getElementById('import-error').classList.remove('is-visible');
}

function downloadBlob(content, fileName, contentType) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
async function exportCsv() {
  const rows = observations();
  const columns = ['date', 'technology', 'value', 'unit', 'geography', 'source_id', 'observation_id', 'quality_status'];
  const csv = [columns.join(','), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(','))].join('\r\n');
  downloadBlob(`\uFEFF${csv}`, `re-predict-${currentState().data_version || 'observations'}.csv`, 'text/csv;charset=utf-8');
  await logAction('data_export_csv', `Exported ${rows.length} active observations.`);
  toast('Active observations exported with provenance columns.', 'success');
}
async function exportEvidence() {
  const evidence = {
    product: currentState().app,
    generated_at: new Date().toISOString(),
    data_version: currentState().data_version,
    active_source: activeSource(),
    data_quality: currentState().data_quality,
    observations: observations(),
    latest_forecast: ui.forecast,
    anomaly_signals: ui.anomalies,
    saved_scenarios: currentState().scenarios,
    audit_events: currentState().audit_events,
    disclaimer: 'RE-PREDICT is an independent prototype, not a CEA product or live feed. The CEA observations are a date-bounded extraction from packaged published report workbooks; source-file hashes and row/cell locators are retained but do not constitute an independent audit of CEA measurements. Synthetic demo values are not CEA observations; user uploads are not independently certified. Forecasts, anomaly signals, carbon proxies and scenarios are prototype calculations, not official or operational determinations.',
  };
  downloadBlob(JSON.stringify(evidence, null, 2), `re-predict-evidence-${currentState().data_version || 'snapshot'}.json`, 'application/json');
  await logAction('evidence_bundle_export', 'Exported current evidence bundle.');
  toast('Evidence bundle downloaded.', 'success');
}
async function logAction(action, detail) {
  try { await api('/api/v1/audit', { method: 'POST', body: JSON.stringify({ action, detail, object_ref: currentState().active_source_id }) }); } catch (_) { /* exports should not fail if audit logging is offline */ }
}

async function activateSource(sourceId) {
  try {
    await api('/api/v1/activate', { method: 'POST', body: JSON.stringify({ source_id: sourceId }) });
    ui.view = 'sources';
    ui.scenarioForm = null;
    ui.scenarioResult = null;
    await refreshState({ renderPage: false });
    await loadAnomalies();
    render();
    toast('Active dataset changed. Source lineage is preserved.', 'success');
  } catch (error) { toast(error.message, 'error'); }
}

async function restoreDemo() {
  if (!window.confirm('Restore the synthetic demo as the active dataset? Previous uploads and scenario history are kept.')) return;
  try {
    await api('/api/v1/reset', { method: 'POST', body: JSON.stringify({}) });
    ui.view = 'overview'; ui.scenarioForm = null; ui.scenarioResult = null; ui.forecast = null;
    await refreshState({ renderPage: false });
    await loadAnomalies();
    render();
    toast('Synthetic demo restored. It is clearly labelled as non-CEA data.', 'success');
  } catch (error) { toast(error.message, 'error'); }
}

async function runScenario(event) {
  event.preventDefault();
  const form = event.target.closest('#scenario-form');
  if (!form) return;
  const payload = Object.fromEntries(['technology', 'base_generation', 'unit', 'base_capacity_mw', 'scenario_capacity_mw', 'availability_factor'].map((name) => [name, form.querySelector(`[name="${name}"]`)?.value ?? '']));
  for (const key of ['base_generation', 'base_capacity_mw', 'scenario_capacity_mw', 'availability_factor']) payload[key] = Number(payload[key]);
  const button = document.getElementById('run-scenario');
  button.disabled = true;
  button.innerHTML = '<span class="loading-inline">Calculating…</span>';
  try {
    const result = await api('/api/v1/scenarios', { method: 'POST', body: JSON.stringify(payload) });
    ui.scenarioResult = result;
    await refreshState({ renderPage: false });
    render();
    toast('Scenario saved with explicit assumptions and formula version.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    const currentButton = document.getElementById('run-scenario');
    if (currentButton) { currentButton.disabled = false; currentButton.innerHTML = `${htmlIcon('trend')}Run &amp; save scenario`; }
  }
}

async function askAnalyst(question) {
  const text = String(question || '').trim();
  if (!text || ui.analystBusy) return;
  ui.chat.push({ role: 'user', text });
  ui.analystBusy = true;
  render();
  try {
    const result = await api('/api/v1/analyst/query', { method: 'POST', body: JSON.stringify({ question: text, technology: selectedTechnology() }) });
    ui.chat.push({ role: 'assistant', text: result.answer, result });
    await refreshState({ renderPage: false });
  } catch (error) {
    ui.chat.push({ role: 'assistant', text: `I could not retrieve the active evidence: ${error.message}`, result: { status: 'limited', citations: [], evidence: [] } });
  } finally {
    ui.analystBusy = false;
    if (ui.view === 'analyst') {
      render();
      const messages = document.getElementById('chat-messages');
      if (messages) messages.scrollTop = messages.scrollHeight;
    }
  }
}

async function runForecastAgain() {
  ui.forecast = { status: 'loading', message: 'Running time-ordered baseline evaluation…' };
  render();
  try {
    await loadForecast();
    render();
    toast(ui.forecast.status === 'ready' ? 'Baseline and rolling holdout refreshed.' : ui.forecast.message, ui.forecast.status === 'ready' ? 'success' : 'error');
  } catch (error) {
    ui.forecast = { status: 'error', message: error.message };
    render();
    toast(error.message, 'error');
  }
}

async function updateReview(eventId, status) {
  try {
    await api('/api/v1/reviews', { method: 'POST', body: JSON.stringify({ event_id: eventId, status }) });
    await refreshState({ renderPage: false });
    await loadAnomalies();
    render();
    toast(`Signal status changed to ${status}.`, 'success');
  } catch (error) { toast(error.message, 'error'); }
}

async function downloadRaw(sourceId) {
  const source = (currentState().source_reports || []).find((report) => report.source_id === sourceId);
  if (!source) return;
  const anchor = document.createElement('a');
  anchor.href = `/api/v1/sources/${encodeURIComponent(sourceId)}/raw`;
  anchor.download = source.file_name || `${sourceId}.csv`;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
}

async function copyHash(hash) {
  try {
    await navigator.clipboard.writeText(hash);
    toast('SHA-256 copied to clipboard.', 'success');
  } catch (_) {
    toast(hash, 'success', 6000);
  }
}

function setViewFromElement(element) {
  const view = element?.dataset?.view;
  if (!view) return false;
  if (element.tagName === 'A') element.preventDefault?.();
  goToView(view);
  return true;
}

document.addEventListener('click', async (event) => {
  const viewButton = event.target.closest('[data-view]');
  if (viewButton) {
    event.preventDefault();
    setViewFromElement(viewButton);
    return;
  }
  const target = event.target.closest('[data-action]');
  if (!target) {
    if (document.body.classList.contains('sidebar-open') && !event.target.closest('#sidebar') && !event.target.closest('#mobile-menu')) document.body.classList.remove('sidebar-open');
    if (event.target.id === 'modal-backdrop') closeModal();
    return;
  }
  switch (target.dataset.action) {
    case 'import': renderImportModal(); break;
    case 'close-modal': closeModal(); break;
    case 'choose-file': document.getElementById('csv-file')?.click(); break;
    case 'submit-import': await handleImport(); break;
    case 'go-sources': goToView('sources'); break;
    case 'view-source': await openProvenanceModal(target.dataset.id); break;
    case 'scroll-manifest': {
      const manifest = document.getElementById('cea-manifest');
      if (manifest) { manifest.open = true; manifest.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      break;
    }
    case 'export-csv': await exportCsv(); break;
    case 'export-json': await exportEvidence(); break;
    case 'activate-source': await activateSource(target.dataset.id); break;
    case 'download-raw': await downloadRaw(target.dataset.id); break;
    case 'copy-hash': await copyHash(target.dataset.hash); break;
    case 'reset-demo': await restoreDemo(); break;
    case 'run-forecast': await runForecastAgain(); break;
    case 'refresh-anomalies': await loadAnomalies(); render(); toast('Robust deviation check refreshed.', 'success'); break;
    case 'set-horizon':
      ui.forecastHorizon = Number(target.dataset.value) || 7;
      await runForecastAgain();
      break;
    case 'reset-carbon':
      ui.carbonGeneration = null;
      ui.carbonBasis = 'observed';
      ui.carbonGenerationBasis = null;
      ui.carbonFactor = 0.7;
      goToView('carbon');
      break;
    case 'print': window.print(); break;
    default: break;
  }
});

document.addEventListener('change', async (event) => {
  const target = event.target;
  if (!target) return;
  if (target.id === 'global-tech' || target.id === 'global-window') {
    if (target.id === 'global-tech') { ui.scenarioForm = null; ui.scenarioResult = null; ui.carbonGeneration = null; ui.carbonBasis = 'observed'; ui.carbonGenerationBasis = null; }
    if (ui.view === 'forecast') {
      ui.forecast = null;
      render();
      try { await loadForecast(); render(); } catch (error) { ui.forecast = { status: 'error', message: error.message }; render(); }
    } else {
      render();
      if (ui.view === 'anomalies') await loadAnomalies().then(render);
    }
  }
  if (target.id === 'csv-file' && target.files?.[0]) setSelectedFile(target.files[0]);
  if (target.matches('[data-review-id]')) await updateReview(target.dataset.reviewId, target.value);
  if (target.id === 'carbon-factor' || target.id === 'carbon-generation') updateCarbonEstimate();
  if (target.id === 'carbon-basis') {
    ui.carbonBasis = target.value;
    ui.carbonGenerationBasis = ui.carbonBasis;
    const scenario = ui.carbonBasis.startsWith('scenario:')
      ? (currentState().scenarios || []).find((item) => `scenario:${item.scenario_id}` === ui.carbonBasis && item.source_id === currentState().active_source_id)
      : null;
    const series = averageRecentGeneration(selectedTechnology(), 30);
    ui.carbonGeneration = scenario ? scenario.results.base.generation : safeMean(series.map((point) => point.value));
    const generationInput = document.getElementById('carbon-generation');
    if (generationInput) generationInput.value = Number(ui.carbonGeneration).toFixed(3);
    updateCarbonEstimate();
  }
  if (target.id === 'scenario-tech') {
    const tech = target.value;
    const series = averageRecentGeneration(tech, 30);
    const input = document.getElementById('scenario-generation');
    const unitInput = document.getElementById('scenario-unit');
    if (input) input.value = safeMean(series.map((point) => point.value)).toFixed(3);
    if (unitInput && series.at(-1)?.unit) unitInput.value = series.at(-1).unit;
  }
});

document.addEventListener('input', (event) => {
  if (event.target.id === 'availability-factor') {
    const label = document.getElementById('availability-value');
    if (label) label.textContent = Number(event.target.value).toFixed(2);
  }
  if (event.target.id === 'carbon-factor' || event.target.id === 'carbon-generation') updateCarbonEstimate();
});

document.addEventListener('submit', async (event) => {
  const form = event.target;
  if (!form) return;
  if (form.id === 'scenario-form') await runScenario(event);
  if (form.id === 'analyst-form') {
    event.preventDefault();
    const input = document.getElementById('analyst-question');
    const question = input?.value || '';
    if (input) input.value = '';
    await askAnalyst(question);
  }
});

document.addEventListener('click', async (event) => {
  const queryButton = event.target.closest('[data-query]');
  if (queryButton) await askAnalyst(queryButton.dataset.query);
});

document.addEventListener('dragover', (event) => {
  if (event.target.closest('#dropzone')) { event.preventDefault(); document.getElementById('dropzone')?.classList.add('is-dragover'); }
});
document.addEventListener('dragleave', (event) => {
  if (event.target.closest('#dropzone')) document.getElementById('dropzone')?.classList.remove('is-dragover');
});
document.addEventListener('drop', (event) => {
  if (event.target.closest('#dropzone')) {
    event.preventDefault();
    document.getElementById('dropzone')?.classList.remove('is-dragover');
    const file = event.dataTransfer?.files?.[0];
    if (file) setSelectedFile(file);
  }
});

document.getElementById('mobile-menu')?.addEventListener('click', () => document.body.classList.toggle('sidebar-open'));

async function initialize() {
  try {
    await refreshState({ renderPage: false });
    updateApiStatus(true);
    await loadAnomalies();
    render();
  } catch (error) {
    updateApiStatus(false);
    if (root) root.innerHTML = `<section class="panel"><div class="empty-state"><div class="empty-state-icon">${htmlIcon('alert')}</div><h3>Could not connect to the local prototype service.</h3><p>${escapeHtml(error.message)} Start the app with <code>npm start</code> or <code>node server.js</code>, then reload this page.</p></div></section>`;
  }
}

initialize();
