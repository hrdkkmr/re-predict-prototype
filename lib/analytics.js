'use strict';

const DAY_MS = 24 * 60 * 60 * 1000;
const TECHNOLOGY_COLORS = {
  solar: '#e9a64b',
  wind: '#4e9ce2',
  hydro: '#40b9a7',
  biomass: '#a889dd',
  'other res': '#a889dd',
};

function median(values) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function quantile(values, q) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const index = (sorted.length - 1) * Math.max(0, Math.min(1, q));
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function round(value, places = 3) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function technologyColor(label) {
  const key = String(label || '').toLowerCase();
  return TECHNOLOGY_COLORS[key] || '#63829b';
}

function sortedDates(observations) {
  return [...new Set(observations.map((row) => row.date))].sort((a, b) => a.localeCompare(b));
}

function aggregateSeries(observations, technology = 'all') {
  const selected = String(technology || 'all').toLowerCase();
  const filtered = observations.filter((row) => selected === 'all' || String(row.technology).toLowerCase() === selected);
  const byDate = new Map();
  for (const row of filtered) {
    const current = byDate.get(row.date) || { date: row.date, value: 0, unit: row.unit || '', records: 0 };
    current.value += Number(row.value) || 0;
    current.records += 1;
    byDate.set(row.date, current);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).map((row) => ({
    ...row,
    value: round(row.value, 6),
  }));
}

function groupSeriesByTechnology(observations, { days = 30, includeAll = false } = {}) {
  const dateList = sortedDates(observations);
  const windowDates = Number.isFinite(days) && days > 0 ? new Set(dateList.slice(-days)) : new Set(dateList);
  const filtered = observations.filter((row) => windowDates.has(row.date));
  const technologies = [...new Set(filtered.map((row) => row.technology))].sort((a, b) => a.localeCompare(b));
  const lines = technologies.map((technology) => ({
    name: technology,
    color: technologyColor(technology),
    points: aggregateSeries(filtered, technology).map((point) => ({ x: point.date, y: point.value })),
  }));
  if (includeAll) {
    lines.unshift({
      name: 'All sources',
      color: '#25384b',
      points: aggregateSeries(filtered, 'all').map((point) => ({ x: point.date, y: point.value })),
    });
  }
  return { dates: [...windowDates].sort((a, b) => a.localeCompare(b)), lines, technologies };
}

function averageStepDays(series) {
  if (series.length < 2) return 1;
  const steps = [];
  for (let i = 1; i < series.length; i += 1) {
    const difference = (Date.parse(`${series[i].date}T00:00:00Z`) - Date.parse(`${series[i - 1].date}T00:00:00Z`)) / DAY_MS;
    if (difference > 0 && Number.isFinite(difference)) steps.push(difference);
  }
  return Math.max(1, Math.min(365, Math.round(median(steps) || 1)));
}

function forecast(observations, { technology = 'all', horizon = 7, window = 30 } = {}) {
  const points = aggregateSeries(observations, technology);
  const safeHorizon = Math.max(1, Math.min(30, Math.floor(Number(horizon) || 7)));
  const label = technology === 'all' ? 'All sources' : technology;
  if (points.length < 21) {
    return {
      status: 'insufficient_history',
      message: `At least 21 observations are required for a demo walk-forward evaluation. ${points.length} available.`,
      technology: label,
      observed_count: points.length,
      forecast_points: [],
      history: points.slice(-Math.max(1, Number(window) || 30)),
      method: 'Seasonal-naive (lag 7)',
      metrics: null,
      model_card: {
        target: 'Generation by selected series and observation period',
        model_version: 'seasonal-naive-v1',
        validation: 'Rolling-origin, one-step evaluation; requires 21 observations.',
        limitation: 'Not available until there is enough validated history.',
      },
    };
  }

  const values = points.map((point) => point.value);
  const validationStartIndex = Math.max(14, points.length - 28);
  const calibrationErrors = [];
  for (let i = 7; i < validationStartIndex; i += 1) {
    calibrationErrors.push(Math.abs(values[i] - values[i - 7]));
  }
  const intervalRadius = Math.max(quantile(calibrationErrors, 0.9), 0);
  const validationErrors = [];
  const persistenceErrors = [];
  const intervalHits = [];
  for (let i = validationStartIndex; i < values.length; i += 1) {
    const seasonalPrediction = values[i - 7];
    const persistencePrediction = values[i - 1];
    validationErrors.push(values[i] - seasonalPrediction);
    persistenceErrors.push(values[i] - persistencePrediction);
    intervalHits.push(Math.abs(values[i] - seasonalPrediction) <= intervalRadius);
  }

  const mae = mean(validationErrors.map(Math.abs));
  const rmse = Math.sqrt(mean(validationErrors.map((error) => error ** 2)));
  const persistenceMae = mean(persistenceErrors.map(Math.abs));
  const persistenceRmse = Math.sqrt(mean(persistenceErrors.map((error) => error ** 2)));
  const lastDate = points[points.length - 1].date;
  const stepDays = averageStepDays(points);
  const forecastPoints = [];
  for (let h = 1; h <= safeHorizon; h += 1) {
    const seasonalIndex = values.length - 7 + ((h - 1) % 7);
    const value = values[Math.max(0, seasonalIndex)];
    const targetDate = new Date(Date.parse(`${lastDate}T00:00:00Z`) + stepDays * h * DAY_MS).toISOString().slice(0, 10);
    forecastPoints.push({
      date: targetDate,
      value: round(value, 3),
      lower: round(Math.max(0, value - intervalRadius), 3),
      upper: round(value + intervalRadius, 3),
      period: h,
    });
  }

  const validationCount = validationErrors.length;
  return {
    status: 'ready',
    technology: label,
    observed_count: points.length,
    horizon: safeHorizon,
    unit: points[points.length - 1].unit,
    method: 'Seasonal-naive · 7-observation lag',
    history: points.slice(-Math.max(14, Math.min(60, Number(window) || 30))),
    forecast_points: forecastPoints,
    metrics: {
      validation_count: validationCount,
      validation_start: points[validationStartIndex].date,
      validation_end: points[points.length - 1].date,
      mae: round(mae, 3),
      rmse: round(rmse, 3),
      persistence_mae: round(persistenceMae, 3),
      persistence_rmse: round(persistenceRmse, 3),
      interval_radius: round(intervalRadius, 3),
      interval_coverage: round(validationCount ? intervalHits.filter(Boolean).length / validationCount : 0, 3),
    },
    model_card: {
      target: `${label} generation per observation period (${points[0].unit})`,
      model_version: 'seasonal-naive-v1',
      data_cutoff: lastDate,
      data_points: points.length,
      validation: `Rolling-origin one-step holdout: ${validationCount} observations (${points[validationStartIndex].date} to ${lastDate}); seasonal-naive compared with persistence.`,
      interval: `Empirical absolute-error radius from earlier calibration residuals; observed holdout coverage is reported, not guaranteed. Radius ±${round(intervalRadius, 3)} ${points[0].unit}.`,
      limitation: 'Prototype backtest only. Results reflect the active snapshot and support no operational or future-accuracy claim.',
      leakage_control: 'Each validation prediction uses only observations dated before its target period.',
    },
  };
}

function detectAnomalies(observations, { sourceId = 'unknown', reviews = {}, technology = 'all', threshold = 3.5 } = {}) {
  const selected = String(technology || 'all').toLowerCase();
  const technologies = [...new Set(observations.map((row) => row.technology))];
  const targetTechnologies = selected === 'all' ? technologies : technologies.filter((value) => value.toLowerCase() === selected);
  const events = [];

  for (const name of targetTechnologies) {
    const series = aggregateSeries(observations, name);
    for (let i = 14; i < series.length; i += 1) {
      const history = series.slice(Math.max(0, i - 28), i).map((point) => point.value);
      const center = median(history);
      const deviations = history.map((value) => Math.abs(value - center));
      let scale = 1.4826 * median(deviations);
      if (scale < 1e-9) {
        const iqrScale = (quantile(history, 0.75) - quantile(history, 0.25)) / 1.349;
        scale = iqrScale > 1e-9 ? iqrScale : Math.sqrt(mean(history.map((value) => (value - center) ** 2)));
      }
      if (scale < 1e-9) scale = Math.max(Math.abs(center) * 0.01, 0.01);
      const observed = series[i].value;
      const signedScore = (observed - center) / scale;
      if (Math.abs(signedScore) < threshold) continue;

      const eventId = `al-${BufferSafeHash(`${sourceId}|${name}|${series[i].date}`).slice(0, 12)}`;
      const status = reviews[eventId]?.status || 'open';
      events.push({
        event_id: eventId,
        source_id: sourceId,
        date: series[i].date,
        technology: name,
        observed: round(observed, 3),
        expected: round(center, 3),
        residual: round(observed - center, 3),
        robust_score: round(signedScore, 2),
        threshold,
        unit: series[i].unit,
        severity: Math.abs(signedScore) >= 6 ? 'review' : 'watch',
        status,
        signal: observed < center ? 'Below the trailing robust baseline' : 'Above the trailing robust baseline',
        interpretation: 'A statistical deviation only. The available data does not establish a physical cause.',
      });
    }
  }
  return events.sort((a, b) => b.date.localeCompare(a.date) || Math.abs(b.robust_score) - Math.abs(a.robust_score));
}

function calculateScenario(input) {
  const generation = Number(input.base_generation);
  const baseCapacity = Number(input.base_capacity_mw);
  const scenarioCapacity = Number(input.scenario_capacity_mw);
  const availability = Number(input.availability_factor);
  const errors = [];
  if (!Number.isFinite(generation) || generation < 0) errors.push('Base generation must be a non-negative number.');
  if (!Number.isFinite(baseCapacity) || baseCapacity <= 0) errors.push('Baseline capacity must be greater than zero MW.');
  if (!Number.isFinite(scenarioCapacity) || scenarioCapacity < 0) errors.push('Scenario capacity must be zero or greater MW.');
  if (!Number.isFinite(availability) || availability < 0 || availability > 1) errors.push('Availability factor must be between 0 and 1.');
  if (errors.length) {
    const error = new Error(errors.join(' '));
    error.statusCode = 400;
    error.code = 'SCENARIO_VALIDATION_ERROR';
    error.issues = errors;
    throw error;
  }

  const capacityRatio = scenarioCapacity / baseCapacity;
  const outputAt = (factor) => generation * capacityRatio * factor;
  const lowerAvailability = Math.max(0, availability - 0.1);
  const upperAvailability = Math.min(1, availability + 0.1);
  const baseOutput = outputAt(availability);
  return {
    technology: String(input.technology || 'All sources'),
    base_generation: round(generation, 4),
    base_capacity_mw: round(baseCapacity, 4),
    scenario_capacity_mw: round(scenarioCapacity, 4),
    capacity_ratio: round(capacityRatio, 5),
    availability_factor: round(availability, 4),
    unit: String(input.unit || 'GWh'),
    formula_version: 'capacity-scale-v1',
    formula: 'G_s = G × (C₁ / C₀) × A',
    label: 'SIMULATION · conditional calculation, not a forecast',
    results: {
      baseline: { availability_factor: null, generation: round(generation, 3), delta: 0 },
      low: { availability_factor: round(lowerAvailability, 3), generation: round(outputAt(lowerAvailability), 3), delta: round(outputAt(lowerAvailability) - generation, 3) },
      base: { availability_factor: round(availability, 3), generation: round(baseOutput, 3), delta: round(baseOutput - generation, 3) },
      high: { availability_factor: round(upperAvailability, 3), generation: round(outputAt(upperAvailability), 3), delta: round(outputAt(upperAvailability) - generation, 3) },
    },
    assumptions: {
      capacity_source: 'User-entered illustrative input; not source-verified.',
      availability_sensitivity: 'Low/high cases vary the user-set availability factor by up to 0.10.',
      utilization: 'Baseline utilization is assumed to scale proportionally with capacity.',
    },
  };
}

function safeAnalystAnswer({ question, observations, technology = 'all', source, datasetVersion, forecastResult, anomalies = [], scenarios = [] }) {
  const text = String(question || '').trim();
  const lower = text.toLowerCase();
  const selectedTechnology = detectTechnology(lower, technology);
  const citation = source ? [{ source_id: source.source_id, label: source.title, kind: source.source_type, dataset_version: datasetVersion }] : [];
  const base = { mode: 'deterministic-grounded-prototype', citations: citation, dataset_version: datasetVersion };

  if (!text) return { ...base, status: 'refused', answer: 'Enter a question about the selected data to continue.', evidence: [] };
  if (/(why|cause|caused|reason|weather|outage|curtail|equipment|policy|dispatch)/i.test(lower)) {
    const event = anomalies.find((item) => selectedTechnology === 'all' || item.technology.toLowerCase() === selectedTechnology);
    const evidence = event ? [{ type: 'anomaly_signal', id: event.event_id, date: event.date, technology: event.technology, observed: event.observed, expected: event.expected, unit: event.unit }] : [];
    return {
      ...base,
      status: 'limited',
      answer: event
        ? `The selected dataset contains a ${event.signal.toLowerCase()} for ${event.technology} on ${event.date} (observed ${event.observed} ${event.unit}; trailing robust baseline ${event.expected} ${event.unit}). This signal does not establish why it happened. Weather, curtailment, outages and equipment causes are not inferred without independent evidence.`
        : 'This prototype cannot infer a physical or policy cause from generation history alone. It can show a statistical signal, but a causal explanation requires approved, independent evidence such as validated weather or operational records.',
      evidence,
      limitation: 'No causal diagnosis is made.',
    };
  }

  const filtered = observations.filter((row) => selectedTechnology === 'all' || row.technology.toLowerCase() === selectedTechnology);
  const series = aggregateSeries(filtered, 'all');
  const explicitDate = lower.match(/\b20\d{2}-\d{2}-\d{2}\b/)?.[0];
  if (explicitDate) {
    const matches = filtered.filter((row) => row.date === explicitDate);
    if (!matches.length) return { ...base, status: 'limited', answer: `No ${selectedTechnology === 'all' ? 'selected' : selectedTechnology} observation is available for ${explicitDate} in the active snapshot. I will not substitute a different period.`, evidence: [] };
    const evidence = matches.map((row) => ({ type: 'observation', date: row.date, technology: row.technology, value: round(row.value, 3), unit: row.unit, locator: row.locator, source_report_id: row.source_report_id }));
    return { ...base, status: 'answered', answer: `Observed values in the active snapshot for ${explicitDate}: ${matches.map((row) => `${row.technology} ${round(row.value, 3)} ${row.unit}`).join('; ')}.`, evidence };
  }
  if (/forecast|predict|next\s+(\d+\s+)?(day|period|week)|outlook/i.test(lower)) {
    const result = forecast(observations, { technology: selectedTechnology, horizon: 7 });
    if (result.status !== 'ready') return { ...base, status: 'limited', answer: result.message, evidence: [], limitation: 'Insufficient validated history for a backtest.' };
    const first = result.forecast_points[0];
    const last = result.forecast_points[result.forecast_points.length - 1];
    return {
      ...base,
      status: 'answered',
      answer: `The baseline outlook for ${result.technology} is ${first.value} ${result.unit} for ${first.date} through ${last.value} ${result.unit} for ${last.date}, using a 7-observation seasonal-naive baseline. The holdout MAE is ${result.metrics.mae} ${result.unit} over ${result.metrics.validation_count} rolling periods; this is a measured result on the active snapshot only, not a guarantee.`,
      evidence: [{ type: 'model_run', model_version: result.model_card.model_version, cutoff: result.model_card.data_cutoff, validation: result.model_card.validation, mae: result.metrics.mae, unit: result.unit }],
      limitation: result.model_card.limitation,
    };
  }
  if (/trend|increas|decreas|change(?:d)?\s+(?:in|to)\s+(?:generation|output|solar|wind|hydro|biomass)|compar|rose|fell|grew|how has/i.test(lower)) {
    const count = Math.min(7, Math.floor(series.length / 2));
    if (count < 1) return { ...base, status: 'limited', answer: 'There are not enough observations to compare two periods in the active snapshot.', evidence: [] };
    const recent = series.slice(-count);
    const previous = series.slice(-2 * count, -count);
    if (!previous.length) return { ...base, status: 'limited', answer: 'There are not enough observations to compare two periods in the active snapshot.', evidence: [] };
    const recentMean = recent.reduce((sum, point) => sum + point.value, 0) / recent.length;
    const previousMean = previous.reduce((sum, point) => sum + point.value, 0) / previous.length;
    const difference = recentMean - previousMean;
    const percent = previousMean === 0 ? null : difference / Math.abs(previousMean) * 100;
    const direction = difference > 0 ? 'higher' : difference < 0 ? 'lower' : 'unchanged';
    const percentageText = percent === null ? '' : ` (${Math.abs(percent).toFixed(1)}% ${difference >= 0 ? 'increase' : 'decrease'})`;
    return {
      ...base,
      status: 'answered',
      answer: `Across the latest ${recent.length} observed periods (${recent[0].date} to ${recent.at(-1).date}), mean ${selectedTechnology === 'all' ? 'all-source' : selectedTechnology} generation was ${round(recentMean, 3)} ${recent[0].unit}, ${direction}${percentageText} versus the preceding ${previous.length} periods (${round(previousMean, 3)} ${previous[0].unit} mean). This is a descriptive comparison, not a causal explanation.`,
      evidence: [{ type: 'trend_comparison', recent_start: recent[0].date, recent_end: recent.at(-1).date, recent_mean: round(recentMean, 3), previous_start: previous[0].date, previous_end: previous.at(-1).date, previous_mean: round(previousMean, 3), unit: recent[0].unit }],
    };
  }

  if (/\b(latest|most recent|current|last value|today)\b/i.test(lower) || /\b(generation|output)\b/i.test(lower)) {
    if (selectedTechnology === 'all') {
      const latestByTechnology = [...new Set(filtered.map((row) => row.technology))].map((name) => {
        const rows = filtered.filter((row) => row.technology === name).sort((a, b) => b.date.localeCompare(a.date));
        return rows.length ? { technology: name, date: rows[0].date, value: round(rows[0].value, 3), unit: rows[0].unit } : null;
      }).filter(Boolean).sort((a, b) => a.technology.localeCompare(b.technology));
      if (!latestByTechnology.length) return { ...base, status: 'refused', answer: 'No matching observations are available in this snapshot.', evidence: [] };
      const date = latestByTechnology.map((row) => row.date).sort().at(-1);
      const entries = latestByTechnology.filter((row) => row.date === date);
      const list = entries.map((row) => `${row.technology}: ${row.value} ${row.unit}`).join('; ');
      const sourceContext = source?.source_type === 'synthetic_demo'
        ? 'illustrative demo observations, not CEA values'
        : source?.source_type === 'official_dataset'
          ? 'published CEA report observations, independently analyzed by RE-PREDICT (not official CEA analysis)'
          : 'observations from the active user-uploaded snapshot';
      return { ...base, status: 'answered', answer: `Latest available source-wise values (period ${date}): ${list}. These are ${sourceContext}.`, evidence: entries.map((row) => ({ type: 'observation', ...row })) };
    }
    const latest = filtered.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!latest) return { ...base, status: 'refused', answer: `No observations for ${selectedTechnology} are available in this snapshot.`, evidence: [] };
    return {
      ...base,
      status: 'answered',
      answer: `The latest available ${latest.technology} observation is ${round(latest.value, 3)} ${latest.unit} for ${latest.date}. ${source?.source_type === 'synthetic_demo' ? 'This is a synthetic demo value, not a CEA observation.' : source?.source_type === 'official_dataset' ? `This is an extracted value from the published CEA daily report for ${latest.date}; RE-PREDICT analysis is independent and not a CEA product.` : 'See the cited uploaded source and row-level lineage.'}`,
      evidence: [{ type: 'observation', date: latest.date, technology: latest.technology, value: round(latest.value, 3), unit: latest.unit, locator: latest.locator, source_report_id: latest.source_report_id }],
    };
  }

  if (/anomal|alert|unusual|signal|deviation/i.test(lower)) {
    const matches = anomalies.filter((event) => selectedTechnology === 'all' || event.technology.toLowerCase() === selectedTechnology);
    if (!matches.length) return { ...base, status: 'answered', answer: `No anomaly signal above the configured robust-score threshold was detected for ${selectedTechnology === 'all' ? 'the selected dataset' : selectedTechnology}. This does not prove the series is error-free.`, evidence: [] };
    const event = matches[0];
    return {
      ...base,
      status: 'answered',
      answer: `${matches.length} signal${matches.length === 1 ? '' : 's'} are currently flagged. The most recent is ${event.technology} on ${event.date}: ${event.observed} ${event.unit} observed against a trailing robust baseline of ${event.expected} ${event.unit} (robust score ${event.robust_score}). It is a review signal, not a causal diagnosis.`,
      evidence: [{ type: 'anomaly_signal', id: event.event_id, date: event.date, technology: event.technology, observed: event.observed, expected: event.expected, robust_score: event.robust_score, unit: event.unit }],
      limitation: 'A deviation is not evidence of its cause.',
    };
  }

  if (/scenario|capacity|what if/i.test(lower)) {
    const scenario = scenarios[0];
    if (!scenario) return { ...base, status: 'limited', answer: 'No saved scenario is available yet. Open Scenario Studio, enter explicit capacity and availability assumptions, then run a simulation. The calculator uses G_s = G × (C₁ / C₀) × A.', evidence: [] };
    return {
      ...base,
      status: 'answered',
      answer: `The latest saved scenario is for ${scenario.technology}: ${scenario.results.base.generation} ${scenario.unit} under an availability assumption of ${scenario.availability_factor}. It is a conditional capacity-scaling simulation, not a forecast; baseline capacity and utilization assumptions are user-entered.`,
      evidence: [{ type: 'scenario', id: scenario.scenario_id, formula_version: scenario.formula_version, inputs: scenario.assumptions, output: scenario.results.base }],
      limitation: 'Scenario assumptions are not source-verified.',
    };
  }

  if (/source|data|provenance|where.*from|snapshot/i.test(lower)) {
    if (!source) return { ...base, status: 'refused', answer: 'No active source is available for the selected workspace.', evidence: [] };
    const state = source.source_type === 'synthetic_demo'
      ? 'The active dataset is a generated illustrative fixture; it is not an official CEA report and is not used to claim real-world generation.'
      : source.source_type === 'official_dataset'
        ? `The active data is a historical ${source.date_count}-report snapshot from CEA's All India daily renewable-generation reports (${source.start_date} to ${source.end_date}); Wind, Solar and Other RES were read from the Generation sheet, row 47, and each value retains its workbook/cell locator. ${source.reconciliation?.reports_reconciled}/${source.reconciliation?.reports_total} published daily totals reconcile. It is a bounded snapshot, not live data; RE-PREDICT is independent and not endorsed by CEA.`
        : `The active dataset is a user-uploaded CSV named “${source.file_name || source.title}”, validated locally and checksum-registered before activation.`;
    return { ...base, status: 'answered', answer: `${state} Source record ${source.source_id}; ${source.record_count || 0} normalized records; snapshot SHA-256 ${source.checksum || 'not available'}.`, evidence: [{ type: 'source_record', source_id: source.source_id, checksum: source.checksum, parser_version: source.parser_version, reports: source.date_count, reconciliation: source.reconciliation }] };
  }

  return {
    ...base,
    status: 'limited',
    answer: 'I can answer questions about the latest observation, recent trend, baseline forecast, anomaly signals, scenarios, and source provenance. I do not have general web access or an external language model in this prototype. Try one of the suggested questions below.',
    evidence: [],
    limitation: 'No supported evidence/query intent matched this question.',
  };
}

function detectTechnology(question, selected = 'all') {
  if (/\bother\s+res\b|\bother\s+renewable/i.test(question)) return 'other res';
  const matches = ['solar', 'wind', 'hydro', 'biomass', 'bagasse', 'geothermal'].find((name) => question.includes(name));
  if (!matches) return String(selected || 'all').toLowerCase();
  return matches;
}

function BufferSafeHash(value) {
  // FNV-1a is sufficient for a stable local event identifier (not a security checksum).
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0') + (value.length.toString(16).padStart(4, '0'));
}

module.exports = {
  median,
  mean,
  quantile,
  round,
  technologyColor,
  aggregateSeries,
  groupSeriesByTechnology,
  forecast,
  detectAnomalies,
  calculateScenario,
  safeAnalystAnswer,
  sortedDates,
};
