'use strict';

function csvError(message, issues = []) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = 'CSV_VALIDATION_ERROR';
  error.issues = issues;
  return error;
}

/** Parse RFC-4180-style CSV (including quoted commas, escaped quotes and CRLF). */
function parseCsvRows(input) {
  if (typeof input !== 'string' || !input.trim()) {
    throw csvError('The uploaded file is empty.');
  }
  const text = input.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      if (field.length) {
        throw csvError(`Unexpected quote at character ${i + 1}.`);
      }
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      if (row.some((cell) => String(cell).trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (quoted) throw csvError('The CSV contains an unclosed quoted field.');
  row.push(field);
  if (row.some((cell) => String(cell).trim() !== '')) rows.push(row);
  return rows;
}

function normalizeHeader(header) {
  return String(header || '')
    .trim()
    .toLowerCase()
    .replace(/[()]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function canonicalUnit(unit) {
  const clean = String(unit || '').trim();
  const key = clean.toLowerCase().replace(/\s+/g, '');
  const known = {
    gwh: 'GWh',
    'gigawatt-hour': 'GWh',
    'gigawatt-hours': 'GWh',
    mwh: 'MWh',
    'megawatt-hour': 'MWh',
    'megawatt-hours': 'MWh',
    kwh: 'kWh',
    mw: 'MW',
    gw: 'GW',
    mu: 'MU',
    units: 'units',
  };
  return known[key] || clean;
}

function parseDateOnly(value, lineNumber) {
  const clean = String(value || '').trim();
  const match = clean.match(/^(\d{4}-\d{2}-\d{2})(?:[Tt ][0-9:.+Zz-]+)?$/);
  if (!match) {
    throw new Error(`row ${lineNumber}: date must use YYYY-MM-DD (an ISO timestamp is also accepted)`);
  }
  const date = match[1];
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new Error(`row ${lineNumber}: “${date}” is not a valid calendar date`);
  }
  return date;
}

function parseNumber(value, lineNumber) {
  const clean = String(value || '').trim().replace(/,/g, '');
  if (!clean || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(clean)) {
    throw new Error(`row ${lineNumber}: generation value must be a number`);
  }
  const number = Number(clean);
  if (!Number.isFinite(number)) throw new Error(`row ${lineNumber}: generation value is not finite`);
  if (number < 0) throw new Error(`row ${lineNumber}: generation values cannot be negative`);
  return number;
}

function parseObservationsCsv(input) {
  const rows = parseCsvRows(input);
  if (rows.length < 2) throw csvError('The CSV needs a header row and at least one observation.');
  if (rows.length > 100001) throw csvError('The CSV is too large: maximum 100,000 observation rows.');

  const headers = rows[0].map(normalizeHeader);
  const findColumn = (names) => headers.findIndex((header) => names.includes(header));
  const dateIndex = findColumn(['date', 'period', 'period_start', 'report_date', 'timestamp', 'datetime']);
  const technologyIndex = findColumn(['technology', 'source', 'source_type', 'renewable_source', 'technology_source', 'type']);
  const genericValueIndex = findColumn(['value', 'generation', 'generation_value', 'observed_value', 'amount', 'output']);
  const gwhIndex = findColumn(['generation_gwh', 'value_gwh', 'gwh']);
  const mwhIndex = findColumn(['generation_mwh', 'value_mwh', 'mwh']);
  const valueIndex = genericValueIndex >= 0 ? genericValueIndex : (gwhIndex >= 0 ? gwhIndex : mwhIndex);
  const unitIndex = findColumn(['unit', 'units', 'measure_unit']);
  const geographyIndex = findColumn(['geography', 'region', 'state', 'area', 'location']);

  const missing = [];
  if (dateIndex < 0) missing.push('date');
  if (technologyIndex < 0) missing.push('technology');
  if (valueIndex < 0) missing.push('value / generation');
  if (unitIndex < 0 && gwhIndex < 0 && mwhIndex < 0) missing.push('unit (required unless the value header names GWh or MWh)');
  if (missing.length) {
    throw csvError(`Required columns not found: ${missing.join(', ')}.`, [
      `Recognized headers: ${headers.filter(Boolean).join(', ') || 'none'}`,
    ]);
  }

  const inferredUnit = gwhIndex >= 0 && valueIndex === gwhIndex ? 'GWh' : (mwhIndex >= 0 && valueIndex === mwhIndex ? 'MWh' : '');
  const records = [];
  const issues = [];
  const keys = new Set();
  const unitSet = new Set();
  const knownColumns = new Set([dateIndex, technologyIndex, valueIndex, unitIndex, geographyIndex].filter((index) => index >= 0));
  const unmappedHeaders = headers.filter((_, index) => !knownColumns.has(index) && headers[index]);

  for (let r = 1; r < rows.length; r += 1) {
    const cells = rows[r];
    const lineNumber = r + 1;
    try {
      const date = parseDateOnly(cells[dateIndex], lineNumber);
      const technology = String(cells[technologyIndex] || '').trim().replace(/\s+/g, ' ');
      if (!technology) throw new Error(`row ${lineNumber}: technology/source cannot be blank`);
      if (technology.length > 80) throw new Error(`row ${lineNumber}: technology/source is longer than 80 characters`);
      const value = parseNumber(cells[valueIndex], lineNumber);
      const rawUnit = unitIndex >= 0 ? cells[unitIndex] : inferredUnit;
      const unit = canonicalUnit(rawUnit);
      if (!unit) throw new Error(`row ${lineNumber}: unit cannot be blank`);
      if (unit.length > 24) throw new Error(`row ${lineNumber}: unit is longer than 24 characters`);
      const geography = geographyIndex >= 0 && String(cells[geographyIndex] || '').trim()
        ? String(cells[geographyIndex]).trim().replace(/\s+/g, ' ')
        : 'Not specified';
      if (geography.length > 100) throw new Error(`row ${lineNumber}: geography is longer than 100 characters`);
      const duplicateKey = `${date}|${technology.toLowerCase()}|${geography.toLowerCase()}`;
      if (keys.has(duplicateKey)) throw new Error(`row ${lineNumber}: duplicate date + technology + geography key`);
      keys.add(duplicateKey);
      unitSet.add(unit.toLowerCase());
      records.push({
        date,
        technology,
        value,
        unit,
        geography,
        locator: { type: 'csv_row', row: lineNumber },
        quality_status: 'validated',
      });
    } catch (error) {
      issues.push(error.message);
      if (issues.length >= 20) break;
    }
  }

  if (issues.length) {
    throw csvError(`Import stopped: ${issues.length} validation issue${issues.length === 1 ? '' : 's'} found. Nothing was activated.`, issues);
  }
  if (unitSet.size > 1) {
    throw csvError('Mixed units found. One CSV must use a single compatible generation unit; convert values before upload.',
      [...unitSet].map((unit) => `Found unit: ${unit}`));
  }
  if (!records.length) throw csvError('No usable observation rows were found.');

  const dates = records.map((record) => record.date).sort();
  const technologies = [...new Set(records.map((record) => record.technology))].sort((a, b) => a.localeCompare(b));
  return {
    records,
    summary: {
      record_count: records.length,
      date_count: new Set(dates).size,
      technology_count: technologies.length,
      technologies,
      unit: records[0].unit,
      start_date: dates[0],
      end_date: dates[dates.length - 1],
      unmapped_headers: unmappedHeaders,
      parser_version: 'csv-v1.0',
      checks: {
        required_fields: 'passed',
        date_values: 'passed',
        non_negative_values: 'passed',
        duplicate_keys: 'passed',
        unit_consistency: 'passed',
      },
    },
  };
}

module.exports = { parseCsvRows, parseObservationsCsv, normalizeHeader, canonicalUnit };
