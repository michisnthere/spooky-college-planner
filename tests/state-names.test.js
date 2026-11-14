// Follow-up item 5: full state names. Backend normalisation, the Scorecard code mapping, the live
// column width, and the frontend form and detail view. Starts its own server on port 3922.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { JSDOM } = require('jsdom');
const { createBackend } = require('./support/backend');
const { STATE_NAMES, normalizeState } = require('../backend/utils/states');
const { formatCollege } = require('../backend/controllers/lookupController');

const FRONTEND = path.join(__dirname, '..', 'frontend');
const api = createBackend(3922);
let studentId;

test.before(async () => { await api.start(); studentId = await api.newStudent(); });
test.after(async () => { await api.stop(); });

test('the table has all 50 states, DC, and the Scorecard territories', () => {
  const codes = Object.keys(STATE_NAMES);
  for (const c of ['PR', 'GU', 'VI', 'AS', 'MP', 'DC']) assert.ok(codes.includes(c), c);
  assert.equal(codes.filter((c) => !['DC', 'PR', 'GU', 'VI', 'AS', 'MP', 'FM', 'MH', 'PW'].includes(c)).length, 50);
  assert.equal(STATE_NAMES.MA, 'Massachusetts');
  assert.equal(new Set(Object.values(STATE_NAMES)).size, codes.length, 'no duplicate names');
});
test('the frontend state table matches the backend one', async () => {
  const front = await import(pathToFileURL(path.join(FRONTEND, 'js', 'ui', 'states.js')).href);
  assert.deepEqual({ ...front.STATE_NAMES }, { ...STATE_NAMES });
  assert.equal(front.normalizeState('vi'), 'U.S. Virgin Islands');
});
test('normalizeState handles codes, names, case, spacing, blanks and junk', () => {
  assert.equal(normalizeState('MA'), 'Massachusetts');
  assert.equal(normalizeState(' ma '), 'Massachusetts');
  assert.equal(normalizeState('NEW   york'), 'New York');
  assert.equal(normalizeState('guam'), 'Guam');
  for (const bad of ['', '  ', null, undefined, 'XX', 'Narnia', 'M', 'Mass', 42]) assert.equal(normalizeState(bad), null, String(bad));
});
test('lookup maps every Scorecard state code to a full name and keeps unknown codes as sent', () => {
  for (const [code, name] of Object.entries(STATE_NAMES)) {
    assert.equal(formatCollege({ id: 1, 'school.state': code }).state, name, code);
  }
  assert.equal(formatCollege({ id: 1, 'school.state': 'ZZ' }).state, 'ZZ');
  assert.equal(formatCollege({ id: 1, 'school.state': '' }).state, null);
});
test('POST college stores a code as the full name, and keeps a full name as given', async () => {
  const a = await api.raw('POST', '/api/colleges', { studentId, name: 'Item5 Code U', state: 'ma' });
  assert.equal(a.body.data.state, 'Massachusetts');
  const b = await api.raw('POST', '/api/colleges', { studentId, name: 'Item5 Name U', state: 'North Carolina' });
  assert.equal(b.body.data.state, 'North Carolina');
  const c = await api.raw('POST', '/api/colleges', { studentId, name: 'Item5 Territory U', state: 'U.S. Virgin Islands' });
  assert.equal(c.body.data.state, 'U.S. Virgin Islands');
  const list = await api.raw('GET', `/api/colleges?studentId=${studentId}`);
  assert.deepEqual(list.body.data.map((x) => x.state).sort(), ['Massachusetts', 'North Carolina', 'U.S. Virgin Islands']);
});
test('POST college accepts a blank or missing state, and rejects an invalid one with a 400 envelope', async () => {
  for (const [name, state] of [['Item5 Blank U', ''], ['Item5 Missing U', undefined], ['Item5 Null U', null]]) {
    const r = await api.raw('POST', '/api/colleges', { studentId, name, state });
    assert.equal(r.status, 201, `${name}: ${r.text}`);
    assert.equal(r.body.data.state, null);
  }
  for (const state of ['Narnia', 'XX', 'M', 'x'.repeat(60)]) {
    const r = await api.raw('POST', '/api/colleges', { studentId, name: `Item5 Bad ${state.length}`, state });
    assert.equal(r.status, 400, r.text);
    assert.equal(r.body.success, false);
    assert.equal(r.body.code, 'ADD_ERROR');
    assert.match(r.body.error, /US state or territory/);
  }
});
test('PATCH college normalises the state and rejects an invalid one', async () => {
  const made = await api.raw('POST', '/api/colleges', { studentId, name: 'Item5 Patch U', state: 'Ohio' });
  const id = made.body.data.id;
  const ok = await api.raw('PATCH', `/api/colleges/${id}`, { state: 'tx' });
  assert.equal(ok.body.data.state, 'Texas');
  const bad = await api.raw('PATCH', `/api/colleges/${id}`, { state: 'Atlantis' });
  assert.equal(bad.status, 400);
  const same = await api.raw('PATCH', `/api/colleges/${id}`, { location: 'Austin' });
  assert.equal(same.body.data.state, 'Texas', 'a PATCH without a state keeps the stored one');
});
test('the live column is VARCHAR(50), schema.sql says the same, and no row still holds a 2-letter code', async () => {
  const db = require('../backend/db/connection');
  const col = await db.query("SELECT character_maximum_length AS n FROM information_schema.columns WHERE table_name = 'colleges' AND column_name = 'state'");
  assert.equal(col.rows[0].n, 50);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'backend', 'db', 'schema.sql'), 'utf8'), /state VARCHAR\(50\)/);
  const left = await db.query("SELECT COUNT(*)::int AS n FROM colleges WHERE state IS NOT NULL AND LENGTH(TRIM(state)) = 2");
  assert.equal(left.rows[0].n, 0);
});
test('frontend: the form converts a code to the full name and rejects an invalid state before saving', async () => {
  const dom = new JSDOM(fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8'), { pretendToBeVisual: true });
  globalThis.document = dom.window.document;
  const form = await import(pathToFileURL(path.join(FRONTEND, 'js', 'ui', 'form.js')).href);
  form.initForm({});
  const $ = (id) => document.getElementById(id);
  $('college-search').value = 'X U';
  $('college-state').value = 'ca';
  assert.equal(form.getFormData().state, 'California');
  assert.equal(form.validateFormData(form.getFormData()), null);
  $('college-state').value = 'Narnia';
  assert.equal(form.validateFormData(form.getFormData()), form.MESSAGES.STATE_INVALID);
  $('college-state').value = '';
  assert.equal(form.getFormData().state, null);
  assert.equal(form.validateFormData(form.getFormData()), null, 'blank state is allowed');
});
test('frontend: the detail view shows the full name, even for an old two-letter value', async () => {
  const dom = new JSDOM(fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8'), { pretendToBeVisual: true });
  globalThis.document = dom.window.document;
  const proto = dom.window.HTMLDialogElement.prototype;
  proto.showModal = proto.showModal || function () { this.setAttribute('open', ''); };
  proto.close = proto.close || function () { this.removeAttribute('open'); };
  const modal = await import(pathToFileURL(path.join(FRONTEND, 'js', 'ui', 'modal.js')).href + '?item5');
  modal.initDetailModal({});
  modal.openDetailModal({ id: 'a', name: 'Old U', state: 'MA' });
  assert.equal(document.getElementById('detail-state').textContent, 'Massachusetts');
  modal.openDetailModal({ id: 'b', name: 'New U', state: 'Oregon' });
  assert.equal(document.getElementById('detail-state').textContent, 'Oregon');
  modal.openDetailModal({ id: 'c', name: 'None U', state: null });
  assert.equal(document.getElementById('detail-state').textContent, 'Not available');
});
