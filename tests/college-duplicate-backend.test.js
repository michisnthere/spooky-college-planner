// Task 19 backend checks: duplicate college rule and persistence, using the real Express
// server and the database from .env. Starts backend/server.js on PORT 3917 and removes every
// row it creates. Run with: node --test tests/college-duplicate-backend.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const ROOT = path.join(__dirname, '..');
const PORT = 3917;
const BASE = `http://127.0.0.1:${PORT}`;

// Set in test.before: colleges.student_id references students(id), so each test student is a real row.
let STUDENT = null;
let OTHER_STUDENT = null;
let child = null;
let serverLog = '';
const createdIds = [];
const createdStudentIds = [];

async function api(method, route, body) {
  const response = await fetch(`${BASE}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  return { status: response.status, payload };
}

async function waitForServer() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early:\n${serverLog}`);
    }
    try {
      const { status } = await api('GET', '/api/health');
      if (status === 200) return;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`server did not start:\n${serverLog}`);
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

  STUDENT = (await createStudent()).id;
  OTHER_STUDENT = (await createStudent()).id;
});

test.after(async () => {
  for (const id of createdIds) {
    await api('DELETE', `/api/colleges/${id}`).catch(() => {});
  }
  if (child && child.exitCode === null) child.kill();
  // Remove the test students directly. The app has no student delete route.
  const { query, pool } = require(path.join(ROOT, 'backend', 'db', 'connection'));
  for (const id of createdStudentIds) {
    await query('DELETE FROM students WHERE id = $1', [id]).catch(() => {});
  }
  await pool.end();
});

async function createStudent() {
  const { status, payload } = await api('POST', '/api/students', {});
  assert.equal(status, 201, 'the student route creates a student');
  createdStudentIds.push(payload.data.id);
  return payload.data;
}

test('adding the same college twice for one student returns 409 and stores a single row', async () => {
  const first = await api('POST', '/api/colleges', { studentId: STUDENT, name: 'Task19 Test University', state: 'MA' });
  assert.equal(first.status, 201);
  createdIds.push(first.payload.data.id);

  const again = await api('POST', '/api/colleges', { studentId: STUDENT, name: '  task19 TEST university ' });
  assert.equal(again.status, 409);
  assert.equal(again.payload.code, 'DUPLICATE_COLLEGE');
  assert.equal(again.payload.success, false);

  const list = await api('GET', `/api/colleges?studentId=${encodeURIComponent(STUDENT)}`);
  assert.equal(list.payload.data.length, 1, 'only the first college is stored');
});

test('a saved college is returned by a later GET, which is what a page refresh does', async () => {
  const saved = await api('POST', '/api/colleges', {
    studentId: STUDENT,
    name: 'Task19 Persist College',
    state: 'CT',
    location: 'New Haven',
    acceptanceRate: 4.6,
    scorecardId: '130794',
  });
  assert.equal(saved.status, 201);
  createdIds.push(saved.payload.data.id);

  const reloaded = await api('GET', `/api/colleges?studentId=${encodeURIComponent(STUDENT)}`);
  const row = reloaded.payload.data.find((college) => college.id === saved.payload.data.id);
  assert.ok(row, 'the saved college comes back on reload');
  assert.equal(row.name, 'Task19 Persist College');
  assert.equal(row.state, 'Connecticut');
});

test('the duplicate rule is per student: another student may save the same name', async () => {
  const mine = await api('POST', '/api/colleges', { studentId: STUDENT, name: 'Task19 Shared Name' });
  createdIds.push(mine.payload.data.id);

  const theirs = await api('POST', '/api/colleges', { studentId: OTHER_STUDENT, name: 'Task19 Shared Name' });
  assert.equal(theirs.status, 201);
  createdIds.push(theirs.payload.data.id);

  const list = await api('GET', `/api/colleges?studentId=${encodeURIComponent(OTHER_STUDENT)}`);
  assert.equal(list.payload.data.length, 1);
});

test('a blank name is rejected with 400 and nothing is stored', async () => {
  const response = await api('POST', '/api/colleges', { studentId: STUDENT, name: '   ' });
  assert.equal(response.status, 400);
  assert.equal(response.payload.code, 'ADD_ERROR');
});

test('a missing studentId is rejected with 400 and MISSING_STUDENT_ID', async () => {
  const response = await api('POST', '/api/colleges', { name: 'Task19 No Student' });
  assert.equal(response.status, 400);
  assert.equal(response.payload.code, 'MISSING_STUDENT_ID');
});
