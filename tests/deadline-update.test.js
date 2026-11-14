// Task 20 checks: a deadline changed in the college modal is saved, read back, and moves the zombie
// on the deadlines page. The position survives a page reload.
// Uses the real index.html and deadlines.html, the real app.js, modal.js, deadline-tracker.js, and
// client.js. A local HTTP server stands in for the backend and keeps deadline records in memory.
// The reload check runs app.js in a separate Node process, so no module state carries over.
// Run with: node --test tests/deadline-update.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { JSDOM } = require('jsdom');

const execFileAsync = promisify(execFile);
const FRONTEND = path.join(__dirname, '..', 'frontend');
const STORAGE_KEY = 'spooky-planner.studentId';
const TOTAL_DAYS = 120;

const readPage = (file) => fs.readFileSync(path.join(FRONTEND, file), 'utf8');
const moduleUrl = (...parts) => pathToFileURL(path.join(FRONTEND, 'js', ...parts)).href;
const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

// Local-date helpers, so day counts do not depend on the machine's time zone.
const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function addDays(n) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return isoOf(d);
}

// Expected zombie position, written out here so the test does not reuse the code under test (design 4.4).
const expectedPercent = (days) => ((TOTAL_DAYS - days) / TOTAL_DAYS) * 100;

// Compares the numeric value of a translateX percentage. jsdom rounds serialized percentages to 6 significant
// digits, so an exact string match would fail on values like 83.33333333333334%.
function assertLeft(actual, days, message) {
  const want = expectedPercent(days);
  assert.ok(
    Math.abs(parseFloat(actual) - want) < 0.001,
    `${message}: expected ${want}%, got ${actual}`,
  );
}

// ---------- Local HTTP stand-in for the backend ----------

const stub = {
  server: null,
  baseUrl: '',
  colleges: [],
  applications: new Map(), // collegeId -> { id, college_id, deadline_date, status }
  patches: [],
  posts: [],
  failPatch: false,
  reset() {
    this.colleges = [];
    this.applications = new Map();
    this.patches = [];
    this.posts = [];
    this.failPatch = false;
  },
};

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

// Returns the same JSON shape the backend sends for deadline reads. pg returns DATE columns as
// timestamps at midnight, so the date is sent as an ISO timestamp.
function deadlinePayload(app) {
  return {
    applicationId: app.id,
    collegeId: app.college_id,
    deadlineDate: `${app.deadline_date}T00:00:00.000Z`,
    status: app.status,
  };
}

function handle(req, res, raw) {
  const url = new URL(req.url, 'http://127.0.0.1');
  const body = raw ? JSON.parse(raw) : {};
  const { pathname } = url;

  if (req.method === 'POST' && pathname === '/api/students') {
    return send(res, 201, { success: true, data: { id: `s-${Date.now()}-${Math.random()}` } });
  }

  if (req.method === 'GET' && pathname === '/api/colleges') {
    const rows = stub.colleges.filter((c) => c.student_id === url.searchParams.get('studentId'));
    return send(res, 200, { success: true, data: rows });
  }

  const deadlineMatch = /^\/api\/deadlines\/([^/]+)$/.exec(pathname);
  if (deadlineMatch) {
    const collegeId = decodeURIComponent(deadlineMatch[1]);
    const app = stub.applications.get(collegeId);

    if (req.method === 'GET') {
      if (!app) {
        return send(res, 404, { success: false, error: 'Application not found for this college', code: 'FETCH_ERROR' });
      }
      return send(res, 200, { success: true, data: deadlinePayload(app) });
    }

    if (req.method === 'PATCH') {
      stub.patches.push({ collegeId, body });
      if (stub.failPatch) {
        return send(res, 400, { success: false, error: 'Failed to update deadline: database unavailable', code: 'UPDATE_ERROR' });
      }
      if (!app) {
        return send(res, 400, { success: false, error: 'Failed to update deadline: Application not found for this college', code: 'UPDATE_ERROR' });
      }
      // Same rule as backend/controllers/deadlineController.js: the date must not be before today.
      if (body.deadlineDate < addDays(0)) {
        return send(res, 400, { success: false, error: 'Deadline date must be in the future', code: 'UPDATE_ERROR' });
      }
      app.deadline_date = body.deadlineDate;
      return send(res, 200, { success: true, data: deadlinePayload(app), message: 'Deadline updated successfully' });
    }
  }

  if (req.method === 'POST' && pathname === '/api/applications') {
    stub.posts.push(body);
    const app = { id: `a${stub.posts.length}`, college_id: body.collegeId, deadline_date: body.deadlineDate, status: 'pending' };
    stub.applications.set(String(body.collegeId), app);
    return send(res, 201, { success: true, data: app, message: 'Application created successfully' });
  }

  return send(res, 404, { success: false, error: 'Route not found', code: 'NOT_FOUND' });
}

// ---------- Pages, modules, and helpers ----------

// jsdom does not implement <dialog> open and close. This shim covers what the modal uses.
function shimDialog(win) {
  const proto = win.HTMLElement.prototype;
  if (!('open' in (win.HTMLDialogElement?.prototype || {}))) {
    Object.defineProperty(proto, 'open', {
      configurable: true,
      get() { return this.tagName === 'DIALOG' && this.hasAttribute('open'); },
      set(value) { if (value) this.setAttribute('open', ''); else this.removeAttribute('open'); },
    });
  }
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function showModal() { this.setAttribute('open', ''); };
  }
  if (typeof proto.close !== 'function') {
    proto.close = function close() {
      if (!this.hasAttribute('open')) return;
      this.removeAttribute('open');
      this.dispatchEvent(new win.Event('close'));
    };
  }
}

let indexDom;
let deadlinesDom;
let app;

const idoc = () => indexDom.window.document;
const ddoc = () => deadlinesDom.window.document;

// Runs fn with the given page as the global document, then restores the index page.
async function onPage(dom, fn) {
  globalThis.document = dom.window.document;
  try {
    return await fn();
  } finally {
    globalThis.document = idoc();
  }
}

async function waitFor(predicate, label) {
  for (let i = 0; i < 400; i += 1) {
    if (predicate()) return;
    await wait(5);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

// Loads the saved colleges into the graveyard and starts the deadline lanes on the deadlines page.
async function loadBothPages() {
  await app.loadSavedColleges();
  await onPage(deadlinesDom, () => app.startDeadlinePage());
}

// Creates one college for this browser's student, with an application when a deadline is given.
async function seedCollege({ id = 'c1', name = 'Harvard University', deadline } = {}) {
  const { getStudentId } = await import(moduleUrl('api', 'student.js'));
  const studentId = await getStudentId();
  stub.colleges.push({ id, student_id: studentId, name, state: 'MA', location: 'Cambridge', acceptance_rate: 3.59 });
  if (deadline !== undefined) {
    stub.applications.set(id, { id: `a-${id}`, college_id: id, deadline_date: deadline, status: 'pending' });
  }
  return studentId;
}

function openModalFor(id) {
  idoc().querySelector(`[data-college-id="${id}"] .college-tombstone__stone`).click();
}

const dateInput = () => idoc().getElementById('detail-deadline-input');
const modalMessage = () => idoc().getElementById('detail-status-message').textContent;
const modalDays = () => idoc().getElementById('detail-days-remaining').textContent;
const lane = (id) => ddoc().querySelector(`.deadline-lane[data-college-id="${id}"]`);
// The rail carries the position as transform: translateX(N%). Returns "N%".
const zombieLeft = (id) => /translateX\(([^)]+)\)/.exec(lane(id).querySelector('.zombie').parentElement.style.transform)?.[1] ?? null;
const laneDays = (id) => lane(id).querySelector('.deadline-lane__days').textContent;

// Enters a date in the modal and waits for the change to finish (success or failure).
async function changeInModal(value) {
  const input = dateInput();
  input.value = value;
  input.dispatchEvent(new indexDom.window.Event('change'));
  await waitFor(() => !input.disabled && modalMessage() !== '', 'the deadline change to finish');
}

// ---------- Setup ----------

test.before(async () => {
  stub.server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => handle(req, res, raw));
  });
  await new Promise((resolve) => stub.server.listen(0, '127.0.0.1', resolve));
  stub.baseUrl = `http://127.0.0.1:${stub.server.address().port}`;
  globalThis.SPOOKY_API_BASE_URL = stub.baseUrl;

  indexDom = new JSDOM(readPage('index.html'), { url: 'http://localhost/', pretendToBeVisual: true });
  deadlinesDom = new JSDOM(readPage('deadlines.html'), { url: 'http://localhost/', pretendToBeVisual: true });
  shimDialog(indexDom.window);
  shimDialog(deadlinesDom.window);

  // One browser profile: localStorage is shared by both pages.
  globalThis.localStorage = indexDom.window.localStorage;
  globalThis.document = idoc();

  app = await import(moduleUrl('app.js'));
  app.initApp();
});

test.after(() => {
  stub.server.close();
});

// ---------- Tests ----------

test('changing the deadline in the modal saves it with updateDeadline, reads it back, and updates the modal', async () => {
  stub.reset();
  await seedCollege({ deadline: addDays(15) });
  await loadBothPages();

  openModalFor('c1');
  assert.equal(dateInput().disabled, false, 'the deadline input is editable in the modal');
  assert.equal(dateInput().value, addDays(15));

  await changeInModal(addDays(30));

  assert.equal(stub.patches.length, 1, 'one PATCH was sent');
  assert.equal(stub.patches[0].collegeId, 'c1');
  assert.deepEqual(stub.patches[0].body, { deadlineDate: addDays(30) });
  assert.equal(modalMessage(), 'Deadline saved.');
  assert.equal(modalDays(), '30 days', 'days remaining comes from the fresh read');
  assert.equal(idoc().getElementById('detail-deadline').textContent, addDays(30));
});

test('the zombie on the deadlines page moves to the new position after a deadline change', async () => {
  stub.reset();
  await seedCollege({ deadline: addDays(15) });
  await loadBothPages();

  assertLeft(zombieLeft('c1'), 15, 'starts at the 15-day position');
  assert.equal(laneDays('c1'), '15 days remaining');

  openModalFor('c1');
  await changeInModal(addDays(30));

  assertLeft(zombieLeft('c1'), 30, 'moves to the 30-day position');
  assert.equal(laneDays('c1'), '30 days remaining');
});

test('the zombie position is restored after a reload, read from the stored deadline', async () => {
  stub.reset();
  const studentId = await seedCollege({ deadline: addDays(15) });
  await loadBothPages();
  openModalFor('c1');
  await changeInModal(addDays(45));

  // A new Node process has no module state, so this is a real page reload with the same browser storage.
  const script = [
    "const { JSDOM } = require(" + JSON.stringify(require.resolve('jsdom')) + ");",
    "const fs = require('fs');",
    "(async () => {",
    "  const dom = new JSDOM(fs.readFileSync(" + JSON.stringify(path.join(FRONTEND, 'deadlines.html')) + ", 'utf8'), { url: 'http://localhost/', pretendToBeVisual: true });",
    "  globalThis.document = dom.window.document;",
    "  globalThis.localStorage = dom.window.localStorage;",
    "  globalThis.localStorage.setItem(" + JSON.stringify(STORAGE_KEY) + ", process.env.STUDENT_ID);",
    "  globalThis.SPOOKY_API_BASE_URL = process.env.API_BASE;",
    "  await import(" + JSON.stringify(moduleUrl('app.js')) + ");",
    "  for (let i = 0; i < 400 && !document.querySelector('.deadline-lane'); i += 1) {",
    "    await new Promise((r) => setTimeout(r, 10));",
    "  }",
    "  const lanes = Array.from(document.querySelectorAll('.deadline-lane')).map((l) => ({",
    "    id: l.dataset.collegeId,",
    "    left: l.querySelector('.zombie') ? (/translateX\\(([^)]+)\\)/.exec(l.querySelector('.zombie').parentElement.style.transform) || [])[1] || null : null,",
    "    label: l.querySelector('.deadline-lane__days').textContent,",
    "  }));",
    "  process.stdout.write(JSON.stringify(lanes));",
    "  process.exit(0);",
    "})().catch((e) => { console.error(e); process.exit(1); });",
  ].join('\n');

  const { stdout } = await execFileAsync(process.execPath, ['-e', script], {
    env: { ...process.env, STUDENT_ID: studentId, API_BASE: stub.baseUrl },
    timeout: 20000,
  });
  const lanes = JSON.parse(stdout);

  assert.equal(lanes.length, 1, 'one lane after reload');
  assert.equal(lanes[0].id, 'c1');
  assertLeft(lanes[0].left, 45, 'zombie is at the stored 45-day position');
  assert.equal(lanes[0].label, '45 days remaining');
});

test('a past date is rejected before any request, and the zombie and the date input keep their previous values', async () => {
  stub.reset();
  await seedCollege({ deadline: addDays(15) });
  await loadBothPages();
  openModalFor('c1');

  await changeInModal(addDays(-1));

  assert.equal(stub.patches.length, 0, 'no PATCH was sent for a past date');
  assert.equal(dateInput().value, addDays(15), 'input is reset to the saved date');
  assert.equal(modalMessage(), 'Could not update deadline: The deadline must be today or later.');
  assertLeft(zombieLeft('c1'), 15, 'zombie stays at the saved position');
});

test('a cleared deadline is rejected because the backend cannot remove a deadline', async () => {
  stub.reset();
  await seedCollege({ deadline: addDays(15) });
  await loadBothPages();
  openModalFor('c1');

  await changeInModal('');

  assert.equal(stub.patches.length, 0, 'no PATCH was sent for a cleared date');
  assert.equal(dateInput().value, addDays(15), 'input shows the saved date again');
  assert.match(modalMessage(), /cannot be cleared yet/);
  assertLeft(zombieLeft('c1'), 15, 'zombie stays at the saved position');
});

test('a deadline of today sets the zombie to the sunflower and shows 0 days', async () => {
  stub.reset();
  await seedCollege({ deadline: addDays(15) });
  await loadBothPages();
  openModalFor('c1');

  await changeInModal(addDays(0));

  assert.equal(zombieLeft('c1'), '100%', 'zombie reaches the end of the lane');
  assert.equal(laneDays('c1'), '0 days remaining');
  assert.equal(modalDays(), '0 days');
  const end = lane('c1').querySelector('.lane-marker--end');
  assert.ok(end, 'the sunflower is replaced by the end tombstone');
  assert.equal(end.textContent, 'deadline has passed');
});

test('a failed save keeps the previous zombie position and shows the server error', async () => {
  stub.reset();
  await seedCollege({ deadline: addDays(15) });
  await loadBothPages();
  openModalFor('c1');
  stub.failPatch = true;

  try {
    await changeInModal(addDays(40));
  } finally {
    stub.failPatch = false;
  }

  assert.equal(stub.patches.length, 1, 'the save was attempted');
  assert.equal(stub.applications.get('c1').deadline_date, addDays(15), 'server still has the old date');
  assert.equal(dateInput().value, addDays(15), 'input is reset to the saved date');
  assert.match(modalMessage(), /Could not update deadline: Failed to update deadline: database unavailable/);
  assertLeft(zombieLeft('c1'), 15, 'zombie did not move');
  assert.equal(laneDays('c1'), '15 days remaining');
});

test('a college with no application gets one created with the new date, and the zombie moves from the start', async () => {
  stub.reset();
  await seedCollege({ deadline: undefined });
  await loadBothPages();

  assert.equal(zombieLeft('c1'), '0%', 'no deadline leaves the zombie at the start of the lane');
  assert.equal(laneDays('c1'), 'No deadline set');

  openModalFor('c1');
  await changeInModal(addDays(20));

  assert.equal(stub.patches.length, 0, 'no PATCH, because there is no application to update');
  assert.equal(stub.posts.length, 1, 'an application was created');
  assert.equal(stub.posts[0].collegeId, 'c1');
  assert.equal(stub.posts[0].deadlineDate, addDays(20));
  assertLeft(zombieLeft('c1'), 20, 'zombie moved to the 20-day position');
  assert.equal(laneDays('c1'), '20 days remaining');
});
