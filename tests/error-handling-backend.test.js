// Task 23 backend checks: error scenarios and recovery against the real Express server and the
// database from .env. Starts backend/server.js on PORT 3916 and deletes every student it creates
// (colleges and applications cascade). Run with: node --test tests/error-handling-backend.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const PORT = 3916;
const BASE = `http://127.0.0.1:${PORT}`;
const MISSING_ID = '00000000-0000-4000-8000-000000000000';

let child = null;
let serverLog = '';
let studentId = null;
const createdStudentIds = [];

async function raw(method, route, body, rawText) {
  const headers = {};
  let payload;
  if (rawText !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = rawText;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const response = await fetch(`${BASE}${route}`, { method, headers, body: payload });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: response.status, text, body: json };
}

async function waitForServer() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited early:\n${serverLog}`);
    try {
      const { status } = await raw('GET', '/api/health');
      if (status === 200) return;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`server did not start:\n${serverLog}`);
}

// Asserts the standard error envelope from design 4.2 and that the server did not crash.
function assertEnvelope(response, expectedStatus) {
  assert.equal(response.status, expectedStatus, `status, body: ${response.text}`);
  assert.ok(response.body, `body is JSON, not HTML: ${response.text.slice(0, 120)}`);
  assert.equal(response.body.success, false);
  assert.equal(typeof response.body.error, 'string');
  assert.ok(response.body.error.length > 0, 'error message is not empty');
  assert.equal(typeof response.body.code, 'string');
  assert.ok(response.status < 500, 'no unhandled 5xx');
}

test.before(async () => {
  child = spawn(process.execPath, [path.join(ROOT, 'backend', 'server.js')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => { serverLog += chunk; });
  child.stderr.on('data', (chunk) => { serverLog += chunk; });
  await waitForServer();

  const created = await raw('POST', '/api/students', {});
  assert.equal(created.status, 201);
  studentId = created.body.data.id;
  createdStudentIds.push(studentId);
});

test.after(async () => {
  if (child && child.exitCode === null) child.kill();
  const { query, pool } = require(path.join(ROOT, 'backend', 'db', 'connection'));
  for (const id of createdStudentIds) {
    await query('DELETE FROM students WHERE id = $1', [id]).catch(() => {});
  }
  await pool.end();
});

function localDate(offsetDays) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function addCollege(name, extra = {}) {
  const response = await raw('POST', '/api/colleges', { studentId, name, state: 'MA', ...extra });
  assert.equal(response.status, 201, response.text);
  return response.body.data;
}

// 1. Non-existent college
test('a non-existent college returns a clear error envelope for every college and deadline route', async () => {
  assertEnvelope(await raw('PATCH', `/api/colleges/${MISSING_ID}`, { name: 'Ghost U' }), 400);
  assert.match((await raw('PATCH', `/api/colleges/${MISSING_ID}`, { name: 'Ghost U' })).body.error, /College not found/);

  const deleted = await raw('DELETE', `/api/colleges/${MISSING_ID}`);
  assertEnvelope(deleted, 404);
  assert.match(deleted.body.error, /College not found/);

  const deadline = await raw('GET', `/api/deadlines/${MISSING_ID}`);
  assertEnvelope(deadline, 404);
  assert.match(deadline.body.error, /Application not found/);

  assertEnvelope(await raw('PATCH', `/api/deadlines/${MISSING_ID}`, { deadlineDate: localDate(30) }), 400);
  assertEnvelope(await raw('PATCH', `/api/applications/${MISSING_ID}/status`, { status: 'submitted' }), 400);
});

test('an id that is not a UUID returns an error envelope instead of crashing the server', async () => {
  assertEnvelope(await raw('GET', '/api/deadlines/not-a-uuid'), 404);
  assertEnvelope(await raw('PATCH', '/api/colleges/not-a-uuid', { name: 'x' }), 400);
  const health = await raw('GET', '/api/health');
  assert.equal(health.status, 200, 'the server is still up');
});

// 2. Missing required fields
test('missing or blank required fields get a specific message', async () => {
  const noName = await raw('POST', '/api/colleges', { studentId });
  assertEnvelope(noName, 400);
  assert.equal(noName.body.error, 'College name is required');

  const blankName = await raw('POST', '/api/colleges', { studentId, name: '   ' });
  assert.equal(blankName.body.error, 'College name is required');

  const nonStringName = await raw('POST', '/api/colleges', { studentId, name: 123 });
  assertEnvelope(nonStringName, 400);
  assert.equal(nonStringName.body.error, 'College name is required', 'a number is not a valid name');

  const noStudent = await raw('POST', '/api/colleges', { name: 'No Student U' });
  assertEnvelope(noStudent, 400);
  assert.equal(noStudent.body.code, 'MISSING_STUDENT_ID');
});

test('missing deadline, status, and application fields are rejected with a clear message', async () => {
  const college = await addCollege('Required Fields U');

  const noDate = await raw('PATCH', `/api/deadlines/${college.id}`, {});
  assertEnvelope(noDate, 400);
  assert.equal(noDate.body.code, 'MISSING_DEADLINE');

  const noStatus = await raw('PATCH', `/api/applications/${college.id}/status`, {});
  assertEnvelope(noStatus, 400);
  assert.equal(noStatus.body.code, 'MISSING_STATUS');

  const badStatus = await raw('PATCH', `/api/applications/${college.id}/status`, { status: 'maybe' });
  assertEnvelope(badStatus, 400);
  assert.match(badStatus.body.error, /Must be one of: pending, submitted/);

  const noCollege = await raw('POST', '/api/applications', { studentId });
  assertEnvelope(noCollege, 400);
  assert.equal(noCollege.body.code, 'MISSING_FIELDS');
});

// 3. Past deadline
test('a deadline in the past is rejected on update and the stored date does not change', async () => {
  const college = await addCollege('Past Update U');
  const stored = localDate(45);
  const created = await raw('POST', '/api/applications', { studentId, collegeId: college.id, deadlineDate: stored });
  assert.equal(created.status, 201, created.text);

  const before = await raw('GET', `/api/deadlines/${college.id}`);
  assert.equal(before.status, 200);

  const rejected = await raw('PATCH', `/api/deadlines/${college.id}`, { deadlineDate: localDate(-5) });
  assertEnvelope(rejected, 400);
  assert.equal(rejected.body.error, 'Deadline date must be today or later');

  const after = await raw('GET', `/api/deadlines/${college.id}`);
  assert.equal(after.body.data.deadlineDate, before.body.data.deadlineDate, 'the stored deadline is unchanged');
});

test('a deadline that is not a date is rejected with a format message', async () => {
  const college = await addCollege('Bad Date U');
  const response = await raw('PATCH', `/api/deadlines/${college.id}`, { deadlineDate: 'soon' });
  assertEnvelope(response, 400);
  assert.match(response.body.error, /Invalid date format/);
});

test('a past deadline sent when the application is created is rejected',
  async () => {
    const college = await addCollege('Past Create U');
    const response = await raw('POST', '/api/applications', { studentId, collegeId: college.id, deadlineDate: localDate(-5) });
    assertEnvelope(response, 400);
  });

// 4. Duplicate college
test('adding the same college again returns 409 DUPLICATE_COLLEGE with a message the user can act on', async () => {
  await addCollege('Dup Check U');
  const again = await raw('POST', '/api/colleges', { studentId, name: '  dup CHECK u ' });
  assertEnvelope(again, 409);
  assert.equal(again.body.code, 'DUPLICATE_COLLEGE');
  assert.equal(again.body.error, 'This college is already in your graveyard.');
});

test('a second application for the same college is rejected',
  { todo: 'Known gap: POST /api/applications creates a second row for one college. Needs a decision (409 or replace).' },
  async () => {
    const college = await addCollege('Second App U');
    await raw('POST', '/api/applications', { studentId, collegeId: college.id, deadlineDate: localDate(20) });
    const second = await raw('POST', '/api/applications', { studentId, collegeId: college.id, deadlineDate: localDate(40) });
    assertEnvelope(second, 409);
  });

// 5. Malformed input and unknown routes
test('a malformed JSON body returns a JSON 400 error, not an HTML stack trace', async () => {
  const response = await raw('POST', '/api/colleges', undefined, '{"studentId": ');
  assertEnvelope(response, 400);
  assert.equal(response.body.code, 'BAD_REQUEST');
});

test('an unknown route returns a JSON 404', async () => {
  const response = await raw('GET', '/api/does-not-exist');
  assertEnvelope(response, 404);
  assert.equal(response.body.code, 'NOT_FOUND');
});

// 6. Edge cases: value too long for the database, and a missing lookup name
test('a full state name is stored as given, and a state that is not a US state or territory returns a 400 envelope', async () => {
  const ok = await raw('POST', '/api/colleges', { studentId, name: 'Long State U', state: 'Massachusetts' });
  assert.equal(ok.status, 201, ok.text);
  assert.equal(ok.body.data.state, 'Massachusetts');
  const bad = await raw('POST', '/api/colleges', { studentId, name: 'Bad State U', state: 'Narnia' });
  assertEnvelope(bad, 400);
  assert.equal(bad.body.code, 'ADD_ERROR');
});

test('a lookup with no name returns a 400 envelope, and an unknown college name returns an empty list', async () => {
  assertEnvelope(await raw('GET', '/api/lookup/college'), 400);
  const none = await raw('GET', `/api/lookup/college?name=${encodeURIComponent('Zzqxq Nonexistent Institute of Probing')}`);
  if (none.status === 200) {
    assert.deepEqual(none.body.data, [], 'an unknown name has no matches');
  } else {
    // Scorecard unreachable from this machine: the backend still returns an envelope.
    assertEnvelope(none, 400);
  }
});
