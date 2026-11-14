// Task 18 checks: search-as-you-type lookup (300 ms debounce, suggestions, auto-fill,
// not-found and network-failure states). Uses the real frontend/index.html in jsdom,
// the real form.js, and the real client.js. The "backend" is a local HTTP server that
// returns the same envelope as backend/routes/lookup.js.
// Run with: node --test tests/college-lookup.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { JSDOM } = require('jsdom');

const FRONTEND = path.join(__dirname, '..', 'frontend');
const html = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
const formUrl = pathToFileURL(path.join(FRONTEND, 'js', 'ui', 'form.js')).href;

const dom = new JSDOM(html, { pretendToBeVisual: true });
globalThis.document = dom.window.document;

const load = () => import(formUrl);
const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const type = (value) => {
  $('college-search').value = value;
  $('college-search').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
};
const suggestionTexts = () =>
  Array.from(document.querySelectorAll('#college-suggestions li')).map((li) => li.textContent);

// Starts a local server that answers /api/lookup/college with the backend envelope.
// `results` is the array returned for every query. Each request URL is recorded.
async function startLookupServer(results) {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push(req.url);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: results, count: results.length, query: req.url }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    requests,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  };
}

// Points the real client at `baseUrl` for the duration of `fn`.
async function withBaseUrl(baseUrl, fn) {
  const saved = globalThis.SPOOKY_API_BASE_URL;
  globalThis.SPOOKY_API_BASE_URL = baseUrl;
  try {
    return await fn();
  } finally {
    if (saved === undefined) delete globalThis.SPOOKY_API_BASE_URL;
    else globalThis.SPOOKY_API_BASE_URL = saved;
  }
}

// Shape returned by lookupController.js: acceptanceRate is a string with two decimals.
const HARVARD = {
  id: 166027,
  name: 'Harvard University',
  city: 'Cambridge',
  state: 'Massachusetts',
  acceptanceRate: '3.59',
  scorecardId: 166027,
};

test('rapid typing collapses into one lookup for the final value', async () => {
  const { initForm, resetForm } = await load();
  const { lookupCollege } = await import(pathToFileURL(path.join(FRONTEND, 'js', 'api', 'client.js')).href);
  const server = await startLookupServer([HARVARD]);
  try {
    await withBaseUrl(server.baseUrl, async () => {
      initForm({ lookup: lookupCollege });
      resetForm();
      for (const partial of ['Ha', 'Har', 'Harv', 'Harva', 'Harvar', 'Harvard']) type(partial);
      await wait(400);
      assert.deepEqual(server.requests, ['/api/lookup/college?name=Harvard']);
    });
  } finally {
    await server.close();
  }
});

test('"Harvard" shows suggestions after the 300 ms debounce, not before', async () => {
  const { initForm, resetForm, SEARCH_DEBOUNCE_MS } = await load();
  assert.equal(SEARCH_DEBOUNCE_MS, 300);
  const calls = [];
  initForm({
    lookup: async (query) => {
      calls.push(query);
      return [HARVARD];
    },
  });
  resetForm();
  type('Harvard');

  await wait(150);
  assert.equal(calls.length, 0, 'no lookup before the debounce ends');
  assert.equal($('college-suggestions').hidden, true);

  await wait(400);
  assert.deepEqual(calls, ['Harvard']);
  assert.deepEqual(suggestionTexts(), ['Harvard University, Massachusetts']);
});

test('clearing the field cancels a pending lookup and makes no request', async () => {
  const { initForm, resetForm } = await load();
  let calls = 0;
  initForm({
    lookup: async () => {
      calls += 1;
      return [HARVARD];
    },
  });
  resetForm();
  type('Harv');
  type('');
  await wait(400);
  assert.equal(calls, 0, 'lookup never ran for the abandoned input');
  assert.equal($('college-suggestions').hidden, true);
  assert.equal($('college-lookup-message').textContent, '');

  type('   ');
  await wait(400);
  assert.equal(calls, 0, 'whitespace-only input is also treated as empty');
});

test('an invalid name shows "College not found." and no suggestions (real client, empty result)', async () => {
  const { initForm, resetForm } = await load();
  const { lookupCollege } = await import(pathToFileURL(path.join(FRONTEND, 'js', 'api', 'client.js')).href);
  const server = await startLookupServer([]);
  try {
    await withBaseUrl(server.baseUrl, async () => {
      initForm({ lookup: lookupCollege });
      resetForm();
      type('Hogwarts School of Witchcraft');
      await wait(400);
      assert.equal(server.requests.length, 1);
      assert.match($('college-lookup-message').textContent, /^College not found\./);
      assert.equal($('college-suggestions').hidden, true);
      assert.equal($('college-search-spinner').hidden, true, 'spinner stops after the response');
    });
  } finally {
    await server.close();
  }
});

test('a network failure shows the lookup error, stops the spinner, and keeps manual entry working', async () => {
  const { initForm, resetForm } = await load();
  const { lookupCollege } = await import(pathToFileURL(path.join(FRONTEND, 'js', 'api', 'client.js')).href);
  // Start and stop a server so the port has nothing listening on it.
  const probe = await startLookupServer([]);
  const deadUrl = probe.baseUrl;
  await probe.close();

  await withBaseUrl(deadUrl, async () => {
    initForm({ lookup: lookupCollege });
    resetForm();
    type('Harvard');
    await wait(400);
    assert.match($('college-lookup-message').textContent, /^Could not search colleges right now\./);
    assert.equal($('college-search-spinner').hidden, true);
    assert.equal($('college-suggestions').hidden, true);

    $('college-location').value = 'Cambridge, MA';
    assert.equal($('college-location').value, 'Cambridge, MA', 'user can still enter the details by hand');
  });
});

test('selecting a suggestion from the real lookup fills location, state, and acceptance rate', async () => {
  const { initForm, resetForm, getFormData } = await load();
  const { lookupCollege } = await import(pathToFileURL(path.join(FRONTEND, 'js', 'api', 'client.js')).href);
  const server = await startLookupServer([HARVARD]);
  try {
    await withBaseUrl(server.baseUrl, async () => {
      initForm({ lookup: lookupCollege });
      resetForm();
      type('Harvard');
      await wait(400);
      $('college-suggestions').querySelector('li').click();

      assert.equal($('college-search').value, 'Harvard University');
      assert.equal($('college-location').value, 'Cambridge');
      assert.equal($('college-state').value, 'Massachusetts');
      assert.equal($('college-acceptance-rate').value, '3.59');
      assert.equal(getFormData().scorecardId, 166027);
      assert.equal($('college-suggestions').hidden, true, 'list closes after a pick');
    });
  } finally {
    await server.close();
  }
});

test('the spinner shows while the debounced lookup is in flight', async () => {
  const { initForm, resetForm } = await load();
  let release;
  initForm({ lookup: () => new Promise((resolve) => { release = resolve; }) });
  resetForm();
  type('Harvard');
  assert.equal($('college-search-spinner').hidden, true, 'no spinner during the debounce wait');
  await wait(400);
  assert.equal($('college-search-spinner').hidden, false, 'spinner shows once the lookup starts');
  release([HARVARD]);
  await wait(0);
  assert.equal($('college-search-spinner').hidden, true);
});
