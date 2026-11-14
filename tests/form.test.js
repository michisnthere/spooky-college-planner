// Task 16 checks: add-college form (search, suggestions, auto-fill, validation, reset).
// Loads the real frontend/index.html markup into jsdom. Run with: node --test tests/form.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { JSDOM } = require('jsdom');

const FRONTEND = path.join(__dirname, '..', 'frontend');
const html = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
const formUrl = pathToFileURL(path.join(FRONTEND, 'js', 'ui', 'form.js')).href;

const dom = new JSDOM(html, { pretendToBeVisual: true });
globalThis.document = dom.window.document;

const form = () => import(formUrl);
const $ = (id) => document.getElementById(id);
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const typeInto = (id, value) => {
  $(id).value = value;
  $(id).dispatchEvent(new dom.window.Event('input', { bubbles: true }));
};
const submit = () =>
  $('add-college-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
const suggestionTexts = () => Array.from(document.querySelectorAll('#college-suggestions li')).map((li) => li.textContent);

const HARVARD = {
  id: 'h1',
  name: 'Harvard University',
  city: 'Cambridge',
  state: 'Massachusetts',
  acceptanceRate: 3.59,
  scorecardId: 166027,
};

test('typing two or more characters calls the lookup after the debounce and shows suggestions', async () => {
  const { initForm, resetForm, SEARCH_DEBOUNCE_MS } = await form();
  const queries = [];
  initForm({
    lookup: async (query) => {
      queries.push(query);
      return [HARVARD];
    },
  });
  resetForm();
  typeInto('college-search', 'Har');
  await new Promise((resolve) => setTimeout(resolve, SEARCH_DEBOUNCE_MS + 50));
  assert.deepEqual(queries, ['Har']);
  assert.equal($('college-suggestions').hidden, false, 'suggestion list is visible');
  assert.deepEqual(suggestionTexts(), ['Harvard University, Massachusetts']);
});

test('queries shorter than two characters never call the lookup', async () => {
  const { initForm, resetForm } = await form();
  let calls = 0;
  initForm({
    lookup: async () => {
      calls += 1;
      return [HARVARD];
    },
  });
  resetForm();
  typeInto('college-search', 'H');
  await flush();
  typeInto('college-search', '   ');
  await flush();
  assert.equal(calls, 0);
  assert.equal($('college-suggestions').hidden, true);
});

test('empty name is rejected and nothing is saved', async () => {
  const { initForm, resetForm, validateFormData, MESSAGES } = await form();
  let saved = 0;
  initForm({ lookup: async () => [], onSubmit: async () => { saved += 1; } });
  resetForm();
  submit();
  await flush();
  assert.equal(saved, 0);
  assert.equal($('add-college-message').textContent, MESSAGES.NAME_REQUIRED);
  assert.equal(validateFormData({ name: '' }), MESSAGES.NAME_REQUIRED, 'empty name fails validation');
});

test('lookup failure shows an error, clears the spinner, and keeps manual entry working', async () => {
  const { initForm, resetForm, handleSearch, getFormData, MESSAGES } = await form();
  initForm({
    lookup: async () => {
      throw new Error('network down');
    },
  });
  resetForm();
  await handleSearch('Harvard');
  assert.equal($('college-lookup-message').textContent, MESSAGES.LOOKUP_FAILED);
  assert.equal($('college-search-spinner').hidden, true, 'spinner is hidden after the failure');
  $('college-location').value = 'Cambridge, MA';
  $('college-search').value = 'Harvard';
  assert.equal(getFormData().location, 'Cambridge, MA', 'user can still type the details by hand');
});

test('a fake college shows the not-found error and no suggestions', async () => {
  const { initForm, resetForm, handleSearch, MESSAGES } = await form();
  initForm({ lookup: async () => [] });
  resetForm();
  const results = await handleSearch('Hogwarts School of Witchcraft');
  assert.deepEqual(results, []);
  assert.equal($('college-lookup-message').textContent, MESSAGES.NOT_FOUND);
  assert.equal($('college-suggestions').hidden, true);
});

test('the default lookup (no callback) reports not-found instead of crashing', async () => {
  const { initForm, resetForm, handleSearch, MESSAGES } = await form();
  initForm();
  resetForm();
  await handleSearch('Harvard');
  assert.equal($('college-lookup-message').textContent, MESSAGES.NOT_FOUND);
});

test('selecting a suggestion auto-fills location, state, and acceptance rate', async () => {
  const { initForm, resetForm, handleSearch, getFormData } = await form();
  initForm({ lookup: async () => [HARVARD] });
  resetForm();
  await handleSearch('Harv');
  $('college-suggestions').querySelector('li').click();
  assert.equal($('college-search').value, 'Harvard University');
  assert.equal($('college-location').value, 'Cambridge');
  assert.equal($('college-state').value, 'Massachusetts');
  assert.equal($('college-acceptance-rate').value, '3.59');
  assert.equal(getFormData().scorecardId, 166027, 'selected college ID is kept for saving');
  assert.equal($('college-suggestions').hidden, true, 'list closes after selection');
});

test('Enter key selects the first suggestion', async () => {
  const { initForm, resetForm, handleSearch } = await form();
  initForm({ lookup: async () => [HARVARD, { name: 'Other U', state: 'CA' }] });
  resetForm();
  await handleSearch('Ha');
  $('college-search').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  assert.equal($('college-search').value, 'Harvard University');
  assert.equal($('college-state').value, 'Massachusetts');
});

test('no deadline is valid: it saves as null and the form resets after success', async () => {
  const { initForm, resetForm, handleSearch, getFormData, MESSAGES } = await form();
  let saved = null;
  initForm({
    lookup: async () => [HARVARD],
    onSubmit: async (data) => { saved = data; },
  });
  resetForm();
  await handleSearch('Harv');
  $('college-suggestions').querySelector('li').click();
  submit();
  await flush();
  assert.ok(saved, 'save was called');
  assert.equal(saved.name, 'Harvard University');
  assert.equal(saved.deadlineDate, null, 'blank deadline is stored as null');
  assert.equal($('add-college-message').textContent, MESSAGES.ADDED);
  assert.equal($('college-search').value, '', 'name cleared after submit');
  assert.equal($('college-location').value, '', 'location cleared after submit');
  assert.equal(getFormData().scorecardId, null, 'selected college forgotten after submit');
});

test('a failed save keeps the entered data so the user can retry', async () => {
  const { initForm, resetForm } = await form();
  initForm({
    lookup: async () => [],
    onSubmit: async () => {
      throw new Error('database unavailable');
    },
  });
  resetForm();
  typeInto('college-search', 'Tiny College');
  submit();
  await flush();
  assert.match($('add-college-message').textContent, /database unavailable/);
  assert.equal($('college-search').value, 'Tiny College', 'name is kept after a failed save');
  assert.equal($('add-college-submit').disabled, false, 'submit is usable again');
});

test('deadline picker value is read; past dates and out-of-range rates are rejected', async () => {
  const { getFormData, validateFormData, MESSAGES } = await form();
  $('college-deadline').value = '2099-01-15';
  assert.equal(getFormData().deadlineDate, '2099-01-15');

  const today = new Date(2026, 2, 10);
  const base = { name: 'X', location: null, state: null, acceptanceRate: null, deadlineDate: null, scorecardId: null };
  assert.equal(validateFormData({ ...base, deadlineDate: '2026-03-09' }, today), MESSAGES.DATE_PAST, 'yesterday is rejected');
  assert.equal(validateFormData({ ...base, deadlineDate: '2026-03-10' }, today), null, 'today is accepted');
  assert.equal(validateFormData({ ...base, deadlineDate: '2026-02-31' }, today), MESSAGES.DATE_INVALID, 'impossible date rejected');
  assert.equal(validateFormData({ ...base, acceptanceRate: 150 }, today), MESSAGES.RATE_RANGE);
  assert.equal(validateFormData({ ...base, acceptanceRate: NaN }, today), MESSAGES.RATE_RANGE);
  assert.equal(validateFormData({ ...base, acceptanceRate: 0 }, today), null, 'zero rate is valid');
});

test('an older lookup that finishes late cannot overwrite newer suggestions', async () => {
  const { initForm, resetForm, handleSearch } = await form();
  const pending = {};
  initForm({
    lookup: (query) => new Promise((resolve) => { pending[query] = resolve; }),
  });
  resetForm();
  const first = handleSearch('Ha');
  const second = handleSearch('Harv');
  pending.Harv([HARVARD]);
  await second;
  pending.Ha([{ name: 'Stale College', state: 'XX' }]);
  await first;
  assert.deepEqual(suggestionTexts(), ['Harvard University, Massachusetts']);
});

test('spinner is visible while a lookup is pending', async () => {
  const { initForm, resetForm, handleSearch } = await form();
  let release;
  initForm({ lookup: () => new Promise((resolve) => { release = resolve; }) });
  resetForm();
  const search = handleSearch('Harvard');
  assert.equal($('college-search-spinner').hidden, false, 'spinner shows during the request');
  release([]);
  await search;
  assert.equal($('college-search-spinner').hidden, true, 'spinner hides after the response');
});
