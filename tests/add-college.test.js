// Task 19 checks: add-college submit -> API save -> tombstone with reveal, form reset,
// error handling with retry, and persistence after a refresh.
// Uses the real index.html, the real form.js and app.js wiring, and the real fetch client.
// A local HTTP server stands in for the backend so error responses can be forced.
// Run with: node --test tests/add-college.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { JSDOM } = require('jsdom');
const { randomUUID } = require('node:crypto');

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

// ---------- Local HTTP stand-in for the backend ----------

const stub = {
  mode: 'ok', // 'ok' | 'error' | 'duplicate'
  failApplications: false,
  colleges: [],
  posted: [],
  applicationsPosted: [],
  studentPosts: 0,
  failStudents: false,
  nextId: 1,
  server: null,
  baseUrl: '',
  reset(mode = 'ok') {
    this.mode = mode;
    this.failApplications = false;
    this.colleges = [];
    this.posted = [];
    this.applicationsPosted = [];
    this.studentPosts = 0;
    this.nextId = 1;
  },
};

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function handle(req, res, raw) {
  const url = new URL(req.url, 'http://127.0.0.1');
  const body = raw ? JSON.parse(raw) : {};

  if (req.method === 'POST' && url.pathname === '/api/students') {
    stub.studentPosts += 1;
    if (stub.failStudents) {
      return send(res, 500, { success: false, error: 'Database unavailable', code: 'CREATE_ERROR' });
    }
    const student = { id: randomUUID(), name: 'Student' };
    return send(res, 201, { success: true, data: student, message: 'Student created successfully' });
  }

  if (req.method === 'POST' && url.pathname === '/api/colleges') {
    stub.posted.push(body);
    if (stub.mode === 'error') {
      return send(res, 500, { success: false, error: 'Database unavailable', code: 'ADD_ERROR' });
    }
    if (stub.mode === 'duplicate') {
      return send(res, 409, {
        success: false,
        error: 'This college is already in your graveyard.',
        code: 'DUPLICATE_COLLEGE',
      });
    }
    const row = {
      id: `c${stub.nextId++}`,
      student_id: body.studentId,
      name: body.name,
      state: body.state,
      location: body.location,
      acceptance_rate: body.acceptanceRate,
      scorecard_id: body.scorecardId,
    };
    stub.colleges.push(row);
    return send(res, 201, { success: true, data: row, message: 'College added successfully' });
  }

  if (req.method === 'POST' && url.pathname === '/api/applications') {
    stub.applicationsPosted.push(body);
    if (stub.failApplications) {
      return send(res, 400, { success: false, error: 'Failed to create application', code: 'CREATE_ERROR' });
    }
    return send(res, 201, { success: true, data: { id: `a${stub.applicationsPosted.length}` } });
  }

  if (req.method === 'GET' && url.pathname === '/api/colleges') {
    const rows = stub.colleges.filter((row) => row.student_id === url.searchParams.get('studentId'));
    return send(res, 200, { success: true, data: rows, count: rows.length });
  }

  return send(res, 404, { success: false, error: 'Route not found', code: 'NOT_FOUND' });
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
  stub.server.close();
});

// ---------- Helpers ----------

async function setup(mode = 'ok') {
  stub.reset(mode);
  graveyard().replaceChildren();
  const { initApp } = await import(toUrl('js', 'app.js'));
  initApp();
  const { resetForm } = await import(toUrl('js', 'ui', 'form.js'));
  resetForm();
}

function fill({ name = '', location = '', state = '', rate = '', deadline = '' } = {}) {
  $('college-search').value = name;
  $('college-location').value = location;
  $('college-state').value = state;
  $('college-acceptance-rate').value = rate;
  $('college-deadline').value = deadline;
}

// Dispatches submit and waits until the save has finished (the submit button is enabled again).
async function submitForm() {
  $('add-college-form').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  for (let i = 0; i < 400 && $('add-college-submit').disabled; i += 1) {
    await wait(5);
  }
  await wait(0);
}

const cardFor = (id) => graveyard().querySelector(`[data-college-id="${id}"]`);
const message = () => $('add-college-message').textContent;
const HARVARD = { name: 'Harvard University', location: 'Cambridge', state: 'MA', rate: '3.59' };

// ---------- Tests ----------

test('an empty or whitespace name and an out-of-range rate are rejected before any request', async () => {
  await setup();
  const { MESSAGES } = await import(toUrl('js', 'ui', 'form.js'));

  fill({ name: '   ', location: 'Boston' });
  await submitForm();
  assert.equal(message(), MESSAGES.NAME_REQUIRED);

  fill({ name: 'Tufts University', rate: '150' });
  await submitForm();
  assert.equal(message(), MESSAGES.RATE_RANGE);

  assert.equal(stub.posted.length, 0, 'no college request was sent');
  assert.equal(graveyard().children.length, 0, 'no tombstone was added');
});

test('a successful save sends the form fields, adds a tombstone with the reveal class, and resets the form', async () => {
  await setup();
  const { MESSAGES } = await import(toUrl('js', 'ui', 'form.js'));
  const { STUDENT_ID_KEY } = await import(toUrl('js', 'api', 'student.js'));

  fill(HARVARD);
  await submitForm();

  const studentId = win.localStorage.getItem(STUDENT_ID_KEY);
  assert.ok(studentId, 'a student ID was saved to localStorage');
  assert.deepEqual(stub.posted[0], {
    studentId,
    name: 'Harvard University',
    state: 'Massachusetts',
    location: 'Cambridge',
    acceptanceRate: 3.59,
    scorecardId: null,
  });

  const card = cardFor('c1');
  assert.ok(card, 'tombstone card exists for the saved college');
  const stone = card.querySelector('.college-tombstone__stone');
  assert.equal(stone.textContent, 'Harvard University');
  assert.ok(stone.classList.contains('tombstone--reveal'), 'stone plays the card reveal animation');

  assert.equal($('college-search').value, '', 'name is cleared after success');
  assert.equal($('college-location').value, '', 'location is cleared after success');
  assert.equal($('college-acceptance-rate').value, '', 'rate is cleared after success');
  assert.equal(message(), MESSAGES.ADDED, 'success message is shown');
  assert.equal($('add-college-submit').disabled, false, 'submit is usable again');
});

test('a duplicate college from the server keeps the entered data and adds no tombstone', async () => {
  await setup('duplicate');
  fill(HARVARD);
  await submitForm();

  assert.match(message(), /already in your graveyard/);
  assert.equal($('college-search').value, 'Harvard University', 'name is kept for the user to change');
  assert.equal($('college-location').value, 'Cambridge', 'location is kept');
  assert.equal(graveyard().children.length, 0, 'no duplicate tombstone was added');
});

test('a server error shows the reason, keeps the form data, and a retry saves the college', async () => {
  await setup('error');
  fill(HARVARD);
  await submitForm();

  assert.match(message(), /Database unavailable/, 'server error text is shown');
  assert.match(message(), /still here/, 'user is told the details are kept');
  assert.equal($('college-search').value, 'Harvard University');
  assert.equal($('college-state').value, 'MA');
  assert.equal($('college-acceptance-rate').value, '3.59');
  assert.equal(graveyard().children.length, 0, 'no tombstone for a failed save');

  stub.mode = 'ok';
  await submitForm();
  assert.ok(cardFor('c1'), 'retry with the same data saves the college');
  assert.equal($('college-search').value, '', 'form resets after the successful retry');
});

test('a deadline is saved as an application for the new college', async () => {
  await setup();
  fill({ ...HARVARD, deadline: '2099-01-15' });
  await submitForm();

  assert.equal(stub.applicationsPosted.length, 1);
  assert.equal(stub.applicationsPosted[0].collegeId, 'c1');
  assert.equal(stub.applicationsPosted[0].deadlineDate, '2099-01-15');
  assert.ok(cardFor('c1'));
});

test('a failed deadline save still keeps the college and reports that the deadline was not saved', async () => {
  await setup();
  stub.failApplications = true;
  fill({ ...HARVARD, deadline: '2099-01-15' });
  await submitForm();

  const { DEADLINE_NOT_SAVED_MESSAGE } = await import(toUrl('js', 'app.js'));
  assert.ok(cardFor('c1'), 'the college stays in the graveyard');
  assert.equal(message(), DEADLINE_NOT_SAVED_MESSAGE);
  assert.equal($('college-search').value, '', 'form resets because the college was saved');
});

test('saved colleges reload after a refresh, without the reveal animation', async () => {
  await setup();
  fill(HARVARD);
  await submitForm();
  fill({ name: 'Yale University', state: 'CT', location: 'New Haven', rate: '4.6' });
  await submitForm();
  assert.equal(stub.colleges.length, 2);

  // Simulate a refresh: the page is empty, then loads from the server again.
  graveyard().replaceChildren();
  const { loadSavedColleges } = await import(toUrl('js', 'app.js'));
  const loaded = await loadSavedColleges();

  assert.equal(loaded.length, 2);
  assert.ok(cardFor('c1'), 'Harvard tombstone is back');
  assert.ok(cardFor('c2'), 'Yale tombstone is back');
  assert.equal(
    graveyard().querySelector('.tombstone--reveal'),
    null,
    'reloaded tombstones do not replay the reveal animation'
  );
});

test('colleges saved under another student ID do not appear in this graveyard', async () => {
  await setup();
  stub.colleges.push({ id: 'other-1', student_id: 'someone-else', name: 'Private College' });
  graveyard().replaceChildren();
  const { loadSavedColleges } = await import(toUrl('js', 'app.js'));
  await loadSavedColleges();
  assert.equal(graveyard().children.length, 0);
});

test('getStudentId creates the student once on the server, stores the ID, and reuses it', async () => {
  stub.reset();
  const { getStudentId, STUDENT_ID_KEY } = await import(toUrl('js', 'api', 'student.js'));

  const values = new Map();
  const storage = {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
  };
  const first = await getStudentId(storage);
  assert.match(first, /^[0-9a-f-]{36}$/, 'the ID is the UUID the server created');
  assert.equal(stub.studentPosts, 1, 'one student was created');
  assert.equal(values.get(STUDENT_ID_KEY), first, 'the ID is saved under the storage key');

  assert.equal(await getStudentId(storage), first, 'later calls return the same ID');
  assert.equal(stub.studentPosts, 1, 'no second student was created');
});

test('concurrent first calls share one student creation', async () => {
  stub.reset();
  const { getStudentId } = await import(toUrl('js', 'api', 'student.js'));
  const values = new Map();
  const storage = {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
  };
  const [a, b, c] = await Promise.all([getStudentId(storage), getStudentId(storage), getStudentId(storage)]);
  assert.equal(a, b);
  assert.equal(b, c);
  assert.equal(stub.studentPosts, 1, 'only one student record was created');
});

test('a failed student creation rejects and stores nothing, so no college is saved under a blank ID', async () => {
  stub.reset();
  stub.failStudents = true;
  const { getStudentId } = await import(toUrl('js', 'api', 'student.js'));
  const values = new Map();
  const storage = { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
  try {
    await assert.rejects(() => getStudentId(storage), /Database unavailable/);
    assert.equal(values.size, 0, 'nothing was stored');
  } finally {
    stub.failStudents = false;
  }
  const retry = await getStudentId(storage);
  assert.match(retry, /^[0-9a-f-]{36}$/, 'a later call retries and succeeds');
});

// Keep this last: it sets the module-level fallback ID, which later calls would reuse.
test('when storage is blocked, one ID is kept for the page load', async () => {
  stub.reset();
  const { getStudentId } = await import(toUrl('js', 'api', 'student.js'));
  const blocked = {
    getItem: () => { throw new Error('storage disabled'); },
    setItem: () => { throw new Error('storage disabled'); },
  };
  const first = await getStudentId(blocked);
  assert.match(first, /^[0-9a-f-]{36}$/);
  assert.equal(await getStudentId(blocked), first, 'the same ID is used for the rest of the page load');
  assert.equal(stub.studentPosts, 1);
});
