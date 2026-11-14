// tests/e2e-flow.test.js
// Task 22: API-level end-to-end flow against the live backend and PostgreSQL.
// Runs only when E2E_LIVE=1, so `npm test` stays offline. Start the backend first (PORT=3000).
// Creates one anonymous student for the run. Deleting that student cascades to its colleges and applications.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const LIVE = process.env.E2E_LIVE === '1';
const BASE = (process.env.E2E_API_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const SKIP = LIVE ? false : 'Set E2E_LIVE=1 to run against the live backend';

// Local calendar date "YYYY-MM-DD", offset from today.
function localDate(offsetDays) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function api(method, urlPath, body) {
  const response = await fetch(`${BASE}${urlPath}`, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json().catch(() => null);
  return { status: response.status, body: json };
}

let pool;
let studentId;
const ids = {};

before(async () => {
  if (!LIVE) return;
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const created = await api('POST', '/api/students', {});
  assert.equal(created.status, 201, `student create failed: ${JSON.stringify(created.body)}`);
  studentId = created.body.data.id;

  const seed = [
    { key: 'soon', name: 'E2E Soon University', state: 'MA', location: 'Boston, MA', days: 1 },
    { key: 'mid', name: 'E2E Mid College', state: 'OH', location: 'Columbus, OH', days: 60 },
    { key: 'far', name: 'E2E Far Institute', state: 'CA', location: 'Pasadena, CA', days: 400 },
  ];
  for (const item of seed) {
    const college = await api('POST', '/api/colleges', {
      studentId, name: item.name, state: item.state, location: item.location, acceptanceRate: 42.5,
    });
    assert.equal(college.status, 201, `college create failed: ${JSON.stringify(college.body)}`);
    ids[item.key] = college.body.data.id;
    const app = await api('POST', '/api/applications', {
      studentId, collegeId: ids[item.key], deadlineDate: localDate(item.days),
    });
    assert.ok(app.body?.success, `application create failed: ${JSON.stringify(app.body)}`);
  }
});

after(async () => {
  if (!LIVE || !pool) return;
  await pool.query('DELETE FROM students WHERE id = $1', [studentId]);
  const left = await pool.query(
    'SELECT (SELECT COUNT(*)::int FROM colleges WHERE student_id = $1) AS colleges, (SELECT COUNT(*)::int FROM students WHERE id = $1) AS students',
    [studentId],
  );
  assert.deepEqual(left.rows[0], { colleges: 0, students: 0 }, 'test rows were not cleaned up');
  await pool.end();
});

test('adds three colleges and lists all three with their own deadlines', { skip: SKIP }, async () => {
  const list = await api('GET', `/api/colleges?studentId=${studentId}`);
  assert.equal(list.status, 200);
  assert.equal(list.body.data.length, 3);
  const names = list.body.data.map((c) => c.name).sort();
  assert.deepEqual(names, ['E2E Far Institute', 'E2E Mid College', 'E2E Soon University']);

  const soon = await api('GET', `/api/deadlines/${ids.soon}`);
  const mid = await api('GET', `/api/deadlines/${ids.mid}`);
  const far = await api('GET', `/api/deadlines/${ids.far}`);
  assert.equal(soon.body.data.daysRemaining, 1);
  assert.equal(mid.body.data.daysRemaining, 60);
  assert.equal(far.body.data.daysRemaining, 400);
});

test('a deadline of today gives 0 days and the zombie at the end of the lane', { skip: SKIP }, async () => {
  const updated = await api('PATCH', `/api/deadlines/${ids.mid}`, { deadlineDate: localDate(0) });
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  const info = await api('GET', `/api/deadlines/${ids.mid}`);
  assert.equal(info.body.data.daysRemaining, 0);
  assert.equal(info.body.data.zombieProgress, 100);
});

test('a very soon deadline (1 day) gives 1 day and zombie progress 99', { skip: SKIP }, async () => {
  const info = await api('GET', `/api/deadlines/${ids.soon}`);
  assert.equal(info.body.data.daysRemaining, 1);
  assert.equal(info.body.data.zombieProgress, 99);
});

test('a far future deadline (400 days) clamps the zombie progress to 0', { skip: SKIP }, async () => {
  const info = await api('GET', `/api/deadlines/${ids.far}`);
  assert.equal(info.body.data.daysRemaining, 400);
  assert.equal(info.body.data.zombieProgress, 0);
});

test('a submitted status persists across repeated reads and sets submitted_at', { skip: SKIP }, async () => {
  const set = await api('PATCH', `/api/applications/${ids.soon}/status`, { status: 'submitted' });
  assert.equal(set.status, 200, JSON.stringify(set.body));

  for (let read = 0; read < 2; read += 1) {
    const deadline = await api('GET', `/api/deadlines/${ids.soon}`);
    assert.equal(deadline.body.data.status, 'submitted');
  }
  const application = await api('GET', `/api/applications/${ids.soon}`);
  assert.equal(application.body.data.status, 'submitted');
  assert.ok(application.body.data.submitted_at ?? application.body.data.submittedAt, 'submitted_at must be set');
});

test('a deadline in the past is rejected and the stored date does not change', { skip: SKIP }, async () => {
  const stored = await api('GET', `/api/deadlines/${ids.far}`);
  const rejected = await api('PATCH', `/api/deadlines/${ids.far}`, { deadlineDate: localDate(-5) });
  assert.equal(rejected.body?.success, false);
  assert.ok(rejected.status >= 400, `expected an error status, got ${rejected.status}`);
  const reread = await api('GET', `/api/deadlines/${ids.far}`);
  assert.equal(reread.body.data.deadlineDate, stored.body.data.deadlineDate);
});

test('adding a duplicate college (different case and spaces) returns 409 DUPLICATE_COLLEGE', { skip: SKIP }, async () => {
  const dup = await api('POST', '/api/colleges', {
    studentId, name: '  e2e soon university ', state: 'MA',
  });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.success, false);
  assert.equal(dup.body.code, 'DUPLICATE_COLLEGE');
});

test('an empty lookup name and an unknown college ID return error envelopes', { skip: SKIP }, async () => {
  const emptyLookup = await api('GET', '/api/lookup/college?name=');
  assert.ok(emptyLookup.status >= 400, `expected 4xx for empty name, got ${emptyLookup.status}`);
  assert.equal(emptyLookup.body.success, false);
  assert.equal(typeof emptyLookup.body.code, 'string');

  const unknown = await api('GET', '/api/deadlines/00000000-0000-0000-0000-000000000000');
  assert.equal(unknown.body.success, false);
  assert.equal(typeof unknown.body.error, 'string');
});
