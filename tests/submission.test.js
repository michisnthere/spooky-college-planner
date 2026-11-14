// Task 21 checks: marking an application as submitted.
// Uses the real index.html and deadlines.html, the real app.js, modal.js, graveyard.js, tombstone.js,
// deadline-tracker.js, and client.js. A local HTTP server stands in for the backend and keeps
// application status in memory. The reload check runs in a separate Node process (tests/support).
// Run with: node --test tests/submission.test.js
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
const RUNNER = path.join(__dirname, 'support', 'graveyard-snapshot.js');
const STORAGE_KEY = 'spooky-planner.studentId';
const STUDENT_ID = 'stu-task21';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

const readPage = (file) => fs.readFileSync(path.join(FRONTEND, file), 'utf8');
const moduleUrl = (...parts) => pathToFileURL(path.join(FRONTEND, 'js', ...parts)).href;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate, label, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await wait(10);
  }
  throw new Error(`Timed out after ${timeoutMs} ms waiting for ${label}`);
}

// ---------- Local HTTP stand-in for the backend ----------

const stub = {
  server: null,
  baseUrl: '',
  colleges: [],
  applications: new Map(), // collegeId -> { college_id, deadline_date, status, submitted_at }
  statusPatches: [],
  failStatus: false,
  reset() {
    this.colleges = [];
    this.applications = new Map();
    this.statusPatches = [];
    this.failStatus = false;
  },
};

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function deadlinePayload(app) {
  return {
    collegeId: app.college_id,
    deadlineDate: `${app.deadline_date}T00:00:00.000Z`,
    status: app.status,
  };
}

const VALID_STATUSES = ['pending', 'submitted', 'accepted', 'rejected', 'waitlisted'];

// Mirrors backend/routes/applications.js and backend/routes/deadlines.js for the calls Task 21 makes.
function handle(req, res, raw) {
  const url = new URL(req.url, 'http://127.0.0.1');
  const body = raw ? JSON.parse(raw) : {};
  const { pathname } = url;

  if (req.method === 'GET' && pathname === '/api/colleges') {
    const rows = stub.colleges.filter((c) => c.student_id === url.searchParams.get('studentId'));
    return send(res, 200, { success: true, data: rows });
  }

  const deadlineMatch = /^\/api\/deadlines\/([^/]+)$/.exec(pathname);
  if (req.method === 'GET' && deadlineMatch) {
    const app = stub.applications.get(decodeURIComponent(deadlineMatch[1]));
    if (!app) {
      return send(res, 404, { success: false, error: 'Application not found for this college', code: 'FETCH_ERROR' });
    }
    return send(res, 200, { success: true, data: deadlinePayload(app) });
  }

  const statusMatch = /^\/api\/applications\/([^/]+)\/status$/.exec(pathname);
  if (req.method === 'PATCH' && statusMatch) {
    const collegeId = decodeURIComponent(statusMatch[1]);
    stub.statusPatches.push({ collegeId, body });
    if (stub.failStatus) {
      return send(res, 400, { success: false, error: 'Failed to update application status: database unavailable', code: 'UPDATE_STATUS_ERROR' });
    }
    const app = stub.applications.get(collegeId);
    if (!app) {
      return send(res, 400, { success: false, error: 'Failed to update application status: Application not found for this college', code: 'UPDATE_STATUS_ERROR' });
    }
    if (!VALID_STATUSES.includes(body.status)) {
      return send(res, 400, { success: false, error: 'Invalid status', code: 'UPDATE_STATUS_ERROR' });
    }
    app.status = body.status;
    if (body.status === 'submitted') app.submitted_at = new Date().toISOString();
    return send(res, 200, { success: true, data: { ...app }, message: `Application status updated to ${body.status}` });
  }

  if (req.method === 'POST' && pathname === '/api/students') {
    return send(res, 201, { success: true, data: { id: STUDENT_ID } });
  }

  return send(res, 404, { success: false, error: 'Route not found', code: 'NOT_FOUND' });
}

// ---------- Pages and modules ----------

let indexDom;
let deadlinesDom;
let app;
let modal;
let tombstone;
let zombieLog; // Zombies added to the graveyard since the last reset.

const idoc = () => indexDom.window.document;
const ddoc = () => deadlinesDom.window.document;
const card = (id) => idoc().querySelector(`#college-tombstones [data-college-id="${id}"]`);
const stoneOf = (id) => card(id).querySelector('.college-tombstone__stone');
const submitButton = () => idoc().querySelector('#college-detail-dialog [data-status="submitted"]');
const dialogIsOpen = () => idoc().getElementById('college-detail-dialog').hasAttribute('open');
const modalMessage = () => idoc().getElementById('detail-status-message').textContent;

function shimDialog(win) {
  const proto = win.HTMLElement.prototype;
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

// Runs fn with the deadlines page as the global document, then restores the index page.
async function onDeadlinesPage(fn) {
  globalThis.document = ddoc();
  try {
    return await fn();
  } finally {
    globalThis.document = idoc();
  }
}

// Seeds one college for the test student, with its application row (status pending unless given).
function seed({ id, name = `College ${id}`, status, deadline }) {
  stub.colleges.push({ id, student_id: STUDENT_ID, name, state: 'MA', location: 'Somewhere', acceptance_rate: 4.2 });
  stub.applications.set(String(id), {
    id: `app-${id}`,
    college_id: String(id),
    deadline_date: deadline ?? '2099-01-15',
    status: status ?? 'pending',
    submitted_at: null,
  });
}

// Clears the stub and the graveyard, then renders the seeded colleges as a page load would.
async function loadGraveyard(colleges) {
  stub.reset();
  zombieLog = [];
  colleges.forEach(seed);
  await app.loadSavedColleges();
  modal.closeDetailModal();
}

function openModalFor(id) {
  stoneOf(id).click();
  assert.ok(dialogIsOpen(), `the detail dialog should open for college ${id}`);
}

function withReducedMotion(matches, fn) {
  globalThis.matchMedia = (query) => ({
    matches: query === REDUCED_MOTION_QUERY ? matches : false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  });
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      delete globalThis.matchMedia;
    });
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

  indexDom.window.localStorage.setItem(STORAGE_KEY, STUDENT_ID);
  globalThis.localStorage = indexDom.window.localStorage;
  globalThis.document = idoc();

  // Record every zombie added to the graveyard, and whether the defeat classes were present when it was added.
  const observer = new indexDom.window.MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1 || !node.classList.contains('zombie')) continue;
        zombieLog.push({
          defeated: node.classList.contains('zombie--defeated'),
          dirtBurst: node.querySelector('.dirt-burst') !== null,
        });
      }
    }
  });
  observer.observe(idoc().getElementById('college-tombstones'), { childList: true, subtree: true });

  modal = await import(moduleUrl('ui', 'modal.js'));
  tombstone = await import(moduleUrl('ui', 'tombstone.js'));
  app = await import(moduleUrl('app.js'));
  app.initApp();
});

test.after(() => {
  stub.server.close();
});

// ---------- Tests ----------

test('Submitted saves the status, plays the zombie defeat on the tombstone, then shows a checkmark', async () => {
  await loadGraveyard([{ id: 'c1' }, { id: 'c2' }]);
  openModalFor('c1');

  submitButton().click();
  await waitFor(() => stoneOf('c1').classList.contains('tombstone--submitted'), 'the checkmark on c1');

  assert.equal(stub.statusPatches.length, 1, 'one status request is sent');
  assert.deepEqual(stub.statusPatches[0], { collegeId: 'c1', body: { status: 'submitted' } });
  assert.equal(zombieLog.length, 1, 'one defeat zombie is added to the graveyard');
  assert.equal(zombieLog[0].defeated, true, 'the zombie already has the defeat class when added');
  assert.equal(zombieLog[0].dirtBurst, true, 'the dirt burst is part of the defeat');
  assert.equal(card('c1').querySelector('.zombie'), null, 'the zombie is removed after the defeat');
  assert.equal(stoneOf('c1').querySelector('.tombstone__check').textContent, '✓');
  assert.equal(stoneOf('c2').querySelector('.tombstone__check'), null, 'other colleges get no checkmark');
  assert.equal(dialogIsOpen(), false, 'the modal closes so the defeat is visible');
});

test('a failed status save changes nothing: no zombie, no checkmark, and the modal stays open with an error', async () => {
  await loadGraveyard([{ id: 'c1', status: 'pending' }]);
  openModalFor('c1');
  stub.failStatus = true;

  submitButton().click();
  await waitFor(() => modalMessage().startsWith('Could not update status'), 'the error message');
  await wait(100);

  assert.equal(zombieLog.length, 0, 'nothing animates after a failed save');
  assert.equal(stoneOf('c1').querySelector('.tombstone__check'), null, 'no checkmark');
  assert.equal(stoneOf('c1').classList.contains('tombstone--submitted'), false);
  assert.equal(dialogIsOpen(), true, 'the modal stays open so the user can retry');
  assert.equal(submitButton().getAttribute('aria-pressed'), 'false', 'Submitted is not highlighted');
  stub.failStatus = false;
  modal.closeDetailModal();
});

test('an already-submitted college shows its checkmark on load, and a second Submitted click sends nothing', async () => {
  await loadGraveyard([{ id: 'c1', status: 'submitted' }]);
  assert.ok(stoneOf('c1').querySelector('.tombstone__check'), 'checkmark is present right after load');

  openModalFor('c1');
  assert.equal(submitButton().getAttribute('aria-pressed'), 'true', 'modal shows Submitted');
  const patchesBefore = stub.statusPatches.length;

  submitButton().click();
  await wait(150);

  assert.equal(stub.statusPatches.length, patchesBefore, 'no request is sent for an unchanged status');
  assert.equal(zombieLog.length, 0, 'no defeat plays again');
  assert.ok(stoneOf('c1').querySelector('.tombstone__check'), 'checkmark is still there');
  modal.closeDetailModal();
});

test('with reduced motion on, the defeat is skipped but the checkmark and modal state still update', async () => {
  await withReducedMotion(true, async () => {
    await loadGraveyard([{ id: 'c1' }]);
    openModalFor('c1');

    submitButton().click();
    // The defeat waits 800 ms, so a 300 ms limit proves the wait was skipped.
    await waitFor(() => stoneOf('c1').classList.contains('tombstone--submitted'), 'the checkmark', 300);

    assert.equal(zombieLog.length, 0, 'no zombie is added under reduced motion');
    assert.equal(stub.statusPatches.length, 1, 'the status is still saved');
    assert.equal(dialogIsOpen(), false, 'the modal closes');

    openModalFor('c1');
    assert.equal(submitButton().getAttribute('aria-pressed'), 'true', 'reopened modal shows Submitted');
    modal.closeDetailModal();
  });
});

test('submitted status persists after a page reload', async () => {
  await loadGraveyard([{ id: 'c1' }, { id: 'c2', status: 'accepted' }]);
  openModalFor('c1');
  submitButton().click();
  await waitFor(() => stoneOf('c1').classList.contains('tombstone--submitted'), 'the checkmark on c1');

  // A separate process loads the page the way a refresh does and reads the status from the backend.
  const { stdout } = await execFileAsync(process.execPath, [RUNNER], {
    env: { ...process.env, STUDENT_ID, BASE_URL: stub.baseUrl, OPEN_ID: 'c1' },
    timeout: 20000,
  });
  const snapshot = JSON.parse(stdout.trim().split('\n').pop());

  const c1 = snapshot.cards.find((c) => c.id === 'c1');
  const c2 = snapshot.cards.find((c) => c.id === 'c2');
  assert.deepEqual(c1, { id: 'c1', submitted: true, checkmark: true }, 'c1 shows the checkmark after reload');
  assert.deepEqual(c2, { id: 'c2', submitted: false, checkmark: false }, 'c2 (accepted) shows no checkmark');
  assert.equal(snapshot.openedId, 'c1');
  assert.equal(snapshot.submittedPressed, true, 'modal opened after reload shows Submitted');
});

test('choosing another status after Submitted removes the checkmark and plays no animation', async () => {
  await loadGraveyard([{ id: 'c1', status: 'submitted' }]);
  openModalFor('c1');

  idoc().querySelector('#college-detail-dialog [data-status="pending"]').click();
  await waitFor(() => !stoneOf('c1').classList.contains('tombstone--submitted'), 'the checkmark to be removed', 500);

  assert.equal(stub.statusPatches.at(-1).body.status, 'pending');
  assert.equal(stoneOf('c1').querySelector('.tombstone__check'), null);
  assert.equal(zombieLog.length, 0, 'moving away from submitted does not animate');
  modal.closeDetailModal();
});

test('Mark as completed on the deadlines page skips the defeat when reduced motion is on', async () => {
  await withReducedMotion(true, async () => {
    await loadGraveyard([]);
    seed({ id: 'd1', name: 'Deadline College', status: 'pending', deadline: '2099-06-01' });

    await onDeadlinesPage(() => app.startDeadlinePage());
    await onDeadlinesPage(async () => {
      const lane = ddoc().querySelector('.deadline-lane[data-college-id="d1"]');
      lane.querySelector('.deadline-lane__complete').click();
      await waitFor(() => lane.querySelector('.lane-marker--completed'), 'the completion tombstone', 300);
      assert.equal(lane.querySelector('.zombie'), null, 'the zombie is replaced at once');
      assert.equal(lane.querySelector('.deadline-lane__complete').textContent, 'Completed');
    });
    assert.equal(stub.statusPatches.at(-1).body.status, 'submitted');
  });
});

test('setTombstoneSubmitted adds one checkmark, ignores repeated calls, and clears it on request', async () => {
  globalThis.document = idoc();
  const college = { id: 'x1', name: 'Test College', status: 'submitted' };
  const { createTombstoneCard, setTombstoneSubmitted } = tombstone;

  const cardEl = createTombstoneCard({ ...college, status: null });
  assert.equal(cardEl.querySelector('.tombstone__check'), null, 'no checkmark for a pending college');

  setTombstoneSubmitted(cardEl, true);
  setTombstoneSubmitted(cardEl, true);
  assert.equal(cardEl.querySelectorAll('.tombstone__check').length, 1, 'repeated calls leave one checkmark');
  assert.ok(cardEl.querySelector('.college-tombstone__stone').classList.contains('tombstone--submitted'));

  setTombstoneSubmitted(cardEl, false);
  assert.equal(cardEl.querySelector('.tombstone__check'), null);
  assert.equal(cardEl.querySelector('.college-tombstone__stone').textContent, 'Test College', 'the name is kept');
});
