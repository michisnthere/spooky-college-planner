// Follow-up item 4: the missing-attributes dialog, the lookup null fix, and manual entry.
// Loads the real frontend/index.html into jsdom. Run with: node --test tests/missing-info.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { JSDOM } = require('jsdom');

const FRONTEND = path.join(__dirname, '..', 'frontend');
const html = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
const dom = new JSDOM(html, { pretendToBeVisual: true });
globalThis.document = dom.window.document;
const load = (rel) => import(pathToFileURL(path.join(FRONTEND, 'js', 'ui', rel)).href);
const $ = (id) => document.getElementById(id);
const flush = () => new Promise((r) => setTimeout(r, 0));
const dialogOpen = () => $('missing-info-dialog').hasAttribute('open');
const inputs = () => Array.from(document.querySelectorAll('#missing-info-fields input'));
const press = (id) => $(id).dispatchEvent(new dom.window.Event('click', { bubbles: true }));
const submitDialog = () =>
  $('missing-info-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
const typeIn = (key, value) => { document.querySelector(`#missing-info-fields [data-key="${key}"]`).value = value; };

const FULL = { id: 1, name: 'Full U', city: 'Boston', state: 'Massachusetts', acceptanceRate: '12.50', scorecardId: 1 };
const NO_RATE = { id: 2, name: 'No Rate U', city: 'Boston', state: 'Massachusetts', acceptanceRate: null, scorecardId: 2 };
const NOTHING = { id: 3, name: 'Bare U', city: null, state: null, acceptanceRate: null, scorecardId: 3 };

async function setup() {
  const form = await load('form.js');
  form.initForm({ lookup: async () => [] });
  form.resetForm();
  return form;
}

test('getMissingAttributes lists every missing attribute, treating null, blank, NaN and "NaN" as missing', async () => {
  const { getMissingAttributes } = await load('missing-info.js');
  assert.deepEqual(getMissingAttributes(NOTHING).map((a) => a.key), ['location', 'state', 'acceptanceRate']);
  assert.deepEqual(getMissingAttributes({ ...FULL, acceptanceRate: 'NaN' }).map((a) => a.key), ['acceptanceRate']);
  assert.deepEqual(getMissingAttributes({ ...FULL, acceptanceRate: NaN, city: '  ' }).map((a) => a.key), ['location', 'acceptanceRate']);
  assert.deepEqual(getMissingAttributes({ ...FULL, acceptanceRate: 0 }), [], 'a rate of 0 is a real value');
  assert.deepEqual(getMissingAttributes(null).map((a) => a.key), ['location', 'state', 'acceptanceRate']);
});
test('no dialog appears when nothing is missing', async () => {
  const form = await setup();
  const result = await form.completeMissingInfo(FULL);
  assert.equal(result, null);
  assert.equal(dialogOpen(), false);
});
test('a college missing only the rate opens a dialog with one input, and Continue copies the value into the form', async () => {
  const form = await setup();
  form.autoFillForm(NO_RATE);
  const pending = form.completeMissingInfo(NO_RATE);
  assert.equal(dialogOpen(), true);
  assert.deepEqual(inputs().map((i) => i.dataset.key), ['acceptanceRate']);
  assert.match($('missing-info-summary').textContent, /acceptance rate/);
  typeIn('acceptanceRate', '42.5');
  submitDialog();
  assert.deepEqual(await pending, { acceptanceRate: 42.5 });
  assert.equal($('college-acceptance-rate').value, '42.5');
  assert.equal($('college-location').value, 'Boston', 'values from the lookup stay');
  assert.equal(dialogOpen(), false);
});
test('a college missing everything lists all attributes and an input for each', async () => {
  const form = await setup();
  const pending = form.completeMissingInfo(NOTHING);
  assert.deepEqual(inputs().map((i) => i.dataset.key), ['location', 'state', 'acceptanceRate']);
  const summary = $('missing-info-summary').textContent;
  for (const word of ['location', 'state', 'acceptance rate']) assert.match(summary, new RegExp(word));
  typeIn('location', 'Springfield');
  typeIn('state', 'ma');
  typeIn('acceptanceRate', '7');
  submitDialog();
  await pending;
  assert.equal($('college-location').value, 'Springfield');
  assert.equal($('college-state').value, 'Massachusetts', 'a code is converted to the full name');
  assert.equal($('college-acceptance-rate').value, '7');
});
test('an acceptance rate outside 0-100 or not a number keeps the dialog open with a message', async () => {
  const form = await setup();
  const pending = form.completeMissingInfo(NO_RATE);
  for (const bad of ['150', '-1', 'abc', '100.1']) {
    typeIn('acceptanceRate', bad);
    submitDialog();
    assert.equal(dialogOpen(), true, `${bad} keeps the dialog open`);
    assert.match($('missing-info-message').textContent, /0 to 100/);
    assert.equal(inputs()[0].getAttribute('aria-invalid'), 'true');
  }
  typeIn('acceptanceRate', '0');
  submitDialog();
  assert.deepEqual(await pending, { acceptanceRate: 0 }, '0 and 100 are valid edges');
  assert.equal($('college-acceptance-rate').value, '0');
});
test('an invalid state is rejected, a valid name or code is accepted', async () => {
  const { validateMissingValue } = await load('missing-info.js');
  assert.match(validateMissingValue('state', 'Narnia').error, /state or territory/);
  assert.match(validateMissingValue('state', 'ZZ').error, /state or territory/);
  assert.equal(validateMissingValue('state', 'puerto rico').value, 'Puerto Rico');
  assert.equal(validateMissingValue('state', 'DC').value, 'District of Columbia');
  assert.deepEqual(validateMissingValue('state', '   '), { value: null, error: null });
  assert.match(validateMissingValue('location', 'x'.repeat(256)).error, /255/);
});
test('Skip closes the dialog and leaves the form as it was, so manual entry still works', async () => {
  const form = await setup();
  form.autoFillForm(NO_RATE);
  const pending = form.completeMissingInfo(NO_RATE);
  typeIn('acceptanceRate', '33');
  press('missing-info-skip');
  assert.equal(await pending, null);
  assert.equal(dialogOpen(), false);
  assert.equal($('college-acceptance-rate').value, '', 'the typed value was not copied');
  $('college-acceptance-rate').value = '55';
  assert.equal(form.getFormData().acceptanceRate, 55, 'manual entry still reads normally');
});
test('Escape (cancel) counts as Skip, and blank inputs on Continue copy nothing', async () => {
  const form = await setup();
  let pending = form.completeMissingInfo(NOTHING);
  $('missing-info-dialog').dispatchEvent(new dom.window.Event('cancel'));
  assert.equal(await pending, null);
  pending = form.completeMissingInfo(NOTHING);
  submitDialog();
  assert.deepEqual(await pending, {});
  assert.equal($('college-state').value, '');
});
test('choosing a suggestion with missing data opens the dialog, and a complete one does not', async () => {
  const form = await setup();
  form.initForm({ lookup: async (q) => (q === 'bare' ? [NOTHING] : [FULL]) });
  await form.handleSearch('bare');
  $('college-suggestions').querySelector('li').dispatchEvent(new dom.window.Event('click'));
  await flush();
  assert.equal(dialogOpen(), true);
  press('missing-info-skip');
  await flush();
  form.resetForm();
  await form.handleSearch('full');
  $('college-suggestions').querySelector('li').dispatchEvent(new dom.window.Event('click'));
  await flush();
  assert.equal(dialogOpen(), false);
  assert.equal($('college-state').value, 'Massachusetts');
});
test('lookup formatCollege returns null, never "NaN", for missing rate, city and state', () => {
  const { formatCollege } = require('../backend/controllers/lookupController');
  const none = formatCollege({ id: 9, 'school.name': 'Bare U' });
  assert.deepEqual([none.acceptanceRate, none.city, none.state], [null, null, null]);
  assert.equal(formatCollege({ id: 9, 'latest.admissions.admission_rate': null }).acceptanceRate, null);
  assert.equal(formatCollege({ id: 9, 'latest.admissions.admission_rate': 0.0359 }).acceptanceRate, '3.59');
  assert.equal(formatCollege({ id: 9, 'latest.admissions.admission_rate': 0 }).acceptanceRate, '0.00');
  assert.equal(formatCollege({ id: 9, 'latest.admissions.admission_rate': 'oops' }).acceptanceRate, null);
});
