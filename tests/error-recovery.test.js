// Task 23 frontend checks: validation errors, network errors, API timeouts, and retry.
// Uses the real index.html, form.js, app.js, and the real fetch client. A local HTTP server
// stands in for the backend, so failures can be forced: an unreachable server, a request that
// never answers, and a duplicate rule that matches the real backend.
// Run with: node --test tests/error-recovery.test.js  (the timeout cases take about 10 seconds)
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { randomUUID } = require('node:crypto');
const { JSDOM } = require('jsdom');

const FRONTEND = path.join(__dirname, '..', 'frontend');
const html = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
const toUrl = (...parts) => pathToFileURL(path.join(FRONTEND, ...parts)).href;

const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true });
const win = dom.window;
globalThis.document = win.document;
Object.defineProperty(globalThis, 'localStorage', { value: win.localStorage, configurable: true, writable: true });

const $ = (id) => document.getElementById(id);
const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const graveyard = () => $('college-tombstones');
const message = () => $('add-college-message').textContent;
const lookupMessage = () => $('college-lookup-message').textContent;
const cardFor = (id) => graveyard().querySelector(`[data-college-id="${id}"]`);

// ---------- Local HTTP stand-in for the backend ----------

const stub = {
  colleges: [],
  saveMode: 'ok', // 'ok' | 'hang' (never answers) | 'hang-after-save' (saves, then never answers)
  lookupMode: 'ok', // 'ok' | 'error'
  saveRequests: 0,
  nextId: 1,
  pending: [],
  server: null,
  baseUrl: '',
  reset() {
    this.colleges = [];
    this.saveMode = 'ok';
    this.lookupMode = 'ok';
    this.saveRequests = 0;
    this.nextId = 1;
  },
};

const sameName = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function handle(req, res, raw) {
  const url = new URL(req.url, 'http://127.0.0.1');
  const body = raw ? JSON.parse(raw) : {};

  if (req.method === 'POST' && url.pathname === '/api/students') {
    return send(res, 201, { success: true, data: { id: randomUUID() }, message: 'Student created successfully' });
  }

  if (req.method === 'POST' && url.pathname === '/api/colleges') {
    stub.saveRequests += 1;
    if (stub.saveMode === 'hang') {
      stub.pending.push(res);
      return undefined;
    }
    // Same rule as the real backend: one name per student, ignoring case and outer spaces.
    const duplicate = stub.colleges.some((row) => row.student_id === body.studentId && sameName(row.name, body.name));
    if (duplicate) {
      return send(res, 409, {
        success: false,
        error: 'This college is already in your graveyard.',
        code: 'DUPLICATE_COLLEGE',
      });
    }
    const row = {
      id: `c${stub.nextId++}`,
      student_id: body.studentId,
      name: body.name.trim(),
      state: body.state,
      location: body.location,
      acceptance_rate: body.acceptanceRate,
    };
    stub.colleges.push(row);
    if (stub.saveMode === 'hang-after-save') {
      stub.pending.push(res);
      return undefined;
    }
    return send(res, 201, { success: true, data: row, message: 'College added successfully' });
  }

  if (req.method === 'GET' && url.pathname === '/api/colleges') {
    const rows = stub.colleges.filter((row) => row.student_id === url.searchParams.get('studentId'));
    return send(res, 200, { success: true, data: rows, count: rows.length });
  }

  if (req.method === 'GET' && url.pathname === '/api/lookup/college') {
    if (stub.lookupMode === 'error') {
      return send(res, 400, { success: false, error: 'College Scorecard API error: socket hang up', code: 'LOOKUP_ERROR' });
    }
    return send(res, 200, {
      success: true,
      data: [{ id: 166027, name: 'Harvard University', city: 'Cambridge', state: 'MA', acceptanceRate: '3.59', scorecardId: 166027 }],
      count: 1,
    });
  }

  return send(res, 404, { success: false, error: 'Route not found', code: 'NOT_FOUND' });
}

// Returns the base URL of a port with nothing listening on it.
async function unreachableBaseUrl() {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return `http://127.0.0.1:${port}`;
}

test.before(async () => {
  stub.server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => handle(req, res, raw));
  });
  await new Promise((resolve) => stub.server.listen(0, '127.0.0.1', resolve));
  const { port } = stub.server.address();
  stub.baseUrl = `http://127.0.0.1:${port}`;
  globalThis.SPOOKY_API_BASE_URL = stub.baseUrl;
});

test.after(() => {
  for (const res of stub.pending) res.destroy();
  stub.server.closeAllConnections?.();
  stub.server.close();
});

// ---------- Helpers ----------

async function setup() {
  stub.reset();
  graveyard().replaceChildren();
  const { initApp } = await import(toUrl('js', 'app.js'));
  initApp();
  const { resetForm } = await import(toUrl('js', 'ui', 'form.js'));
  resetForm();
  // Create the student once, so later saves do not depend on the student call.
  const { getStudentId } = await import(toUrl('js', 'api', 'student.js'));
  await getStudentId();
}

function fill({ name = '', location = '', state = '', rate = '', deadline = '' } = {}) {
  $('college-search').value = name;
  $('college-location').value = location;
  $('college-state').value = state;
  $('college-acceptance-rate').value = rate;
  $('college-deadline').value = deadline;
}

function readFields() {
  return {
    name: $('college-search').value,
    location: $('college-location').value,
    state: $('college-state').value,
    rate: $('college-acceptance-rate').value,
    deadline: $('college-deadline').value,
  };
}

// Dispatches submit and waits until the save has finished (the submit button is enabled again).
async function submitForm() {
  $('add-college-form').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  for (let i = 0; i < 1000 && $('add-college-submit').disabled; i += 1) {
    await wait(10);
  }
  await wait(0);
}

const HARVARD = { name: 'Harvard University', location: 'Cambridge', state: 'MA', rate: '3.59' };
const pastDate = () => {
  const d = new Date();
  d.setDate(d.getDate() - 3);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// ---------- Validation errors ----------

test('a deadline in the past is rejected before any request, and every typed field is kept', async () => {
  await setup();
  const { MESSAGES } = await import(toUrl('js', 'ui', 'form.js'));
  const typed = { ...HARVARD, deadline: pastDate() };
  fill(typed);
  const before = stub.saveRequests;

  await submitForm();

  assert.equal(message(), MESSAGES.DATE_PAST, 'the message says the deadline must be today or later');
  assert.equal(stub.saveRequests, before, 'no college request was sent');
  assert.deepEqual(readFields(), typed, 'the form still holds every value the user typed');
  assert.equal(graveyard().children.length, 0, 'no tombstone was added');
});

test('a missing name and an out-of-range rate are each reported, and the other fields are kept', async () => {
  await setup();
  const { MESSAGES } = await import(toUrl('js', 'ui', 'form.js'));

  fill({ ...HARVARD, name: '   ' });
  await submitForm();
  assert.equal(message(), MESSAGES.NAME_REQUIRED);
  assert.equal($('college-location').value, 'Cambridge', 'location is kept');

  fill({ ...HARVARD, rate: '250' });
  await submitForm();
  assert.equal(message(), MESSAGES.RATE_RANGE);
  assert.equal($('college-acceptance-rate').value, '250', 'the rate the user typed is kept so they can fix it');
  assert.equal(stub.saveRequests, 0, 'neither invalid form reached the server');
});

// ---------- Network errors and retry ----------

test('a network error shows a readable reason, keeps the data, and a retry saves the college', async () => {
  await setup();
  const { MESSAGES } = await import(toUrl('js', 'ui', 'form.js'));
  const typed = { ...HARVARD, deadline: '' };
  fill(typed);

  globalThis.SPOOKY_API_BASE_URL = await unreachableBaseUrl();
  try {
    await submitForm();
  } finally {
    globalThis.SPOOKY_API_BASE_URL = stub.baseUrl;
  }

  assert.match(message(), /Could not add college: Could not reach the server/, 'the reason is readable');
  assert.match(message(), /still here/, 'the user is told the details are kept');
  assert.deepEqual(readFields(), typed, 'the form keeps every value after the network error');
  assert.equal($('add-college-submit').disabled, false, 'the submit button is usable again');
  assert.equal(graveyard().children.length, 0, 'no tombstone for a save that did not happen');

  await submitForm();
  assert.equal(message(), MESSAGES.ADDED, 'the retry reports success');
  assert.equal(stub.colleges.length, 1, 'exactly one college was saved');
  assert.ok(cardFor('c1'), 'the saved college has a tombstone');
  assert.equal($('college-search').value, '', 'the form resets after the successful retry');
});

test('a lookup that fails shows the lookup error, and typing again retries the search', async () => {
  await setup();
  const { SEARCH_DEBOUNCE_MS } = await import(toUrl('js', 'ui', 'form.js'));
  stub.lookupMode = 'error';

  $('college-search').value = 'Harv';
  $('college-search').dispatchEvent(new win.Event('input', { bubbles: true }));
  await wait(SEARCH_DEBOUNCE_MS + 150);

  assert.match(lookupMessage(), /Could not search colleges right now/, 'the user sees the lookup error');
  assert.equal($('college-search-spinner').hidden, true, 'the spinner stops');
  assert.equal($('college-suggestions').hidden, true, 'no suggestions are shown');

  stub.lookupMode = 'ok';
  $('college-search').value = 'Harvard';
  $('college-search').dispatchEvent(new win.Event('input', { bubbles: true }));
  await wait(SEARCH_DEBOUNCE_MS + 150);

  assert.equal($('college-suggestions').hidden, false, 'the retried search shows suggestions');
  assert.match($('college-suggestions').textContent, /Harvard University/);
});

// ---------- API timeouts ----------

test('a request that never answers times out after 5 seconds, keeps the data, and a retry saves it', { timeout: 20000 }, async () => {
  await setup();
  const { MESSAGES } = await import(toUrl('js', 'ui', 'form.js'));
  const typed = { ...HARVARD, deadline: '' };
  fill(typed);
  stub.saveMode = 'hang';

  const started = Date.now();
  await submitForm();
  const elapsed = Date.now() - started;

  assert.match(message(), /Could not add college: The request timed out after 5000 ms/, 'the timeout is explained');
  assert.ok(elapsed >= 4900 && elapsed < 9000, `the wait stops near the 5 s limit (took ${elapsed} ms)`);
  assert.deepEqual(readFields(), typed, 'the form keeps every value after the timeout');
  assert.equal($('add-college-submit').disabled, false, 'the submit button is usable again');
  assert.equal(graveyard().children.length, 0);

  stub.saveMode = 'ok';
  await submitForm();
  assert.equal(message(), MESSAGES.ADDED, 'the retry reports success');
  assert.ok(cardFor('c1'), 'the retried college has a tombstone');
});

test('a timed-out save that was stored on the server: the retry reports the duplicate and shows the card', { timeout: 20000 }, async () => {
  await setup();
  const { MESSAGES } = await import(toUrl('js', 'ui', 'form.js'));
  fill({ ...HARVARD, deadline: '' });
  // The server stores the college, then the response never arrives, as on a slow network.
  stub.saveMode = 'hang-after-save';

  await submitForm();
  assert.match(message(), /timed out/);
  assert.equal(stub.colleges.length, 1, 'the server did store the college');
  assert.equal(graveyard().children.length, 0, 'the page does not know about it yet');

  stub.saveMode = 'ok';
  await submitForm();

  assert.match(message(), /already in your graveyard/, 'the duplicate is explained');
  assert.match(message(), /Change the name to add a different college/, 'the user is told what to do');
  assert.notEqual(message(), MESSAGES.ADDED);
  assert.equal($('college-search').value, 'Harvard University', 'the data is kept so the user can change the name');
  assert.ok(cardFor('c1'), 'the stored college now appears in the graveyard');
  assert.equal(graveyard().querySelectorAll('[data-college-id]').length, 1, 'no duplicate card was added');
});
