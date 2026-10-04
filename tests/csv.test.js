'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseCsvRows, parseObservationsCsv } = require('../lib/csv');

const ROOT = path.join(__dirname, '..');

test('CSV parser handles BOM, CRLF, quoted commas, and escaped quotes', () => {
  const rows = parseCsvRows('\uFEFFname,note\r\nSolar,"North, East"\r\nWind,"said ""hello"""\r\n');
  assert.deepEqual(rows, [['name', 'note'], ['Solar', 'North, East'], ['Wind', 'said "hello"']]);
});

test('observation import normalizes aliases and retains row locators', () => {
  const result = parseObservationsCsv('date,source,generation_gwh,region\n2026-10-01,Solar,105.25,North\n2026-10-02,Wind,99.1,West\n');
  assert.equal(result.records.length, 2);
  assert.equal(result.records[0].technology, 'Solar');
  assert.equal(result.records[0].value, 105.25);
  assert.equal(result.records[0].unit, 'GWh');
  assert.deepEqual(result.records[0].locator, { type: 'csv_row', row: 2 });
  assert.equal(result.summary.technology_count, 2);
});

test('unit must be explicit unless included in the value header', () => {
  assert.throws(() => parseObservationsCsv('date,technology,value\n2026-10-01,Solar,12\n'), /unit/);
  const result = parseObservationsCsv('date,technology,generation_mwh\n2026-10-01,Solar,12000\n');
  assert.equal(result.records[0].unit, 'MWh');
});

test('invalid date, negative value, duplicate key, and mixed units stop full import', () => {
  assert.throws(() => parseObservationsCsv('date,technology,value,unit\n2026-02-30,Solar,10,GWh\n'), /validation issue/);
  assert.throws(() => parseObservationsCsv('date,technology,value,unit\n2026-10-01,Solar,-1,GWh\n'), (error) => error.issues?.some((issue) => issue.includes('negative')));
  assert.throws(() => parseObservationsCsv('date,technology,value,unit\n2026-10-01,Solar,1,GWh\n2026-10-01,Solar,2,GWh\n'), (error) => error.issues?.some((issue) => issue.includes('duplicate')));
  assert.throws(() => parseObservationsCsv('date,technology,value,unit\n2026-10-01,Solar,1,GWh\n2026-10-02,Solar,2,MWh\n'), /Mixed units/);
});

test('downloadable sample is a valid, explicitly illustrative fixture', () => {
  const sample = fs.readFileSync(path.join(ROOT, 'public', 'sample_generation.csv'), 'utf8');
  const parsed = parseObservationsCsv(sample);
  assert.equal(parsed.records.length, 96);
  assert.equal(parsed.summary.technology_count, 4);
  assert.match(parsed.records[0].geography, /Illustrative synthetic sample/);
});
