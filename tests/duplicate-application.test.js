// Task 32 checks: one application per college.
// Backend checks run against the real Express server and the database from .env (port 3917) and
// delete the student they create. One check starts a second server with an unreachable database to
// see how a database error on a deadline read is reported. Frontend checks run the real app.js and
// client.js against a local stand-in for fetch.
// Run with: node --test tests/duplicate-application.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const PORT = 3917;
const BAD_DB_PORT = 3918;
const BASE = `http://127.0.0.1:${PORT}`;

const children = [];
let studentId = null;

async function call(base, method, route, body) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: response.status, body: json, text };
}

async function startServer(port, env = {}) {
  const child = spawn(process.execPath, [path.join(ROOT, 'backend', 'server.js')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), ...env },
    stdio: 'ignore',
  });
  children.push(child);
  const stop = Date.now() + 15000;
  while (Date.now() < stop) {
    try {
      if ((await call(`http://127.0.0.1:${port}`, 'GET', '/api/health')).status === 200) return;
    } catch { /* not listening yet */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`server on ${port} did not start`);
}

function futureDate(days) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function newCollege(name) {
  const response = await call(BASE, 'POST', '/api/colleges', { studentId, name, state: 'MA' });
  assert.equal(response.status, 201, response.text);
  return response.body.data;
}

const { query, pool } = require(path.join(ROOT, 'backend', 'db', 'connection'));
const countRows = async (collegeId) =>
  (await query('SELECT COUNT(*)::int AS n FROM applications WHERE college_id = $1', [collegeId])).rows[0].n;

test.before(async () => {
  await startServer(PORT);
  const created = await call(BASE, 'POST', '/api/students', {});
  assert.equal(created.status, 201);
  studentId = created.body.data.id;
});

test.after(async () => {
  for (const child of children) if (child.exitCode === null) child.kill();
  if (studentId) await query('DELETE FROM students WHERE id = $1', [studentId]).catch(() => {});
  await pool.end();
});

test('a second POST for the same college returns 409 and the table holds one row', async () => {
  const college = await newCollege('Dup App One U');
  const first = await call(BASE, 'POST', '/api/applications', { studentId, collegeId: college.id, deadlineDate: futureDate(30) });
  assert.equal(first.status, 201, first.text);
  const second = await call(BASE, 'POST', '/api/applications', { studentId, collegeId: college.id });
  assert.equal(second.status, 409);
  assert.deepEqual(
    { success: second.body.success, code: second.body.code, hasMessage: typeof second.body.error === 'string' && second.body.error.length > 0 },
    { success: false, code: 'DUPLICATE_APPLICATION', hasMessage: true },
  );
  assert.equal(await countRows(college.id), 1);
});

test('concurrent POSTs for one college create exactly one row', async () => {
  const college = await newCollege('Dup App Race U');
  const results = await Promise.all(Array.from({ length: 6 }, () =>
    call(BASE, 'POST', '/api/applications', { studentId, collegeId: college.id, deadlineDate: futureDate(10) })));
  const statuses = results.map((r) => r.status).sort();
  assert.deepEqual(statuses, [201, 409, 409, 409, 409, 409]);
  assert.equal(await countRows(college.id), 1);
});

test('the database itself rejects a second row with unique violation 23505', async () => {
  const college = await newCollege('Dup App Index U');
  await query('INSERT INTO applications (student_id, college_id) VALUES ($1, $2)', [studentId, college.id]);
  await assert.rejects(
    query('INSERT INTO applications (student_id, college_id) VALUES ($1, $2)', [studentId, college.id]),
    (error) => error.code === '23505',
  );
  assert.equal(await countRows(college.id), 1);
});

test('a different college still gets its own application', async () => {
  const a = await newCollege('Dup App Two A U');
  const b = await newCollege('Dup App Two B U');
  const ra = await call(BASE, 'POST', '/api/applications', { studentId, collegeId: a.id, deadlineDate: futureDate(5) });
  const rb = await call(BASE, 'POST', '/api/applications', { studentId, collegeId: b.id, deadlineDate: futureDate(6) });
  assert.equal(ra.status, 201);
  assert.equal(rb.status, 201);
});

test('an application without a deadline still counts as existing', async () => {
  const college = await newCollege('Dup App NoDate U');
  assert.equal((await call(BASE, 'POST', '/api/applications', { studentId, collegeId: college.id })).status, 201);
  assert.equal((await call(BASE, 'POST', '/api/applications', { studentId, collegeId: college.id, deadlineDate: futureDate(9) })).status, 409);
});

test('a database error on a deadline read returns 500, and a missing application still returns 404', async () => {
  const missing = await call(BASE, 'GET', '/api/deadlines/00000000-0000-4000-8000-000000000000');
  assert.equal(missing.status, 404);
  assert.equal((await call(BASE, 'GET', '/api/deadlines/not-a-uuid')).status, 404);

  await startServer(BAD_DB_PORT, { DATABASE_URL: 'postgres://nobody:none@127.0.0.1:1/none' });
  const broken = await call(`http://127.0.0.1:${BAD_DB_PORT}`, 'GET', '/api/deadlines/00000000-0000-4000-8000-000000000000');
  assert.equal(broken.status, 500, broken.text);
  assert.equal(broken.body.code, 'INTERNAL_ERROR');
  assert.equal(broken.body.error, 'Internal server error', 'no database detail is leaked');
});

// ---------- Frontend ----------

async function loadApp(handler) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  Object.defineProperty(globalThis, 'localStorage', { value: dom.window.localStorage, configurable: true });
  dom.window.localStorage.setItem('spooky-planner.studentId', 'student-1');
  globalThis.SPOOKY_API_BASE_URL = 'http://stub.test';
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const { pathname } = new URL(url);
    const method = init.method || 'GET';
    calls.push(`${method} ${pathname}`);
    const [status, payload] = handler(method, pathname);
    return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
  };
  const app = await import(pathToFileURL(path.join(ROOT, 'frontend', 'js', 'app.js')).href);
  return { app, calls };
}

const ok = (data) => [200, { success: true, data }];
const fail = (status, code) => [status, { success: false, error: 'x', code }];

test('frontend: a 409 on create updates the existing application instead of failing', async () => {
  const date = futureDate(20);
  let created = false;
  const { app, calls } = await loadApp((method, route) => {
    if (method === 'GET' && route === '/api/deadlines/c1') {
      return created ? ok({ deadlineDate: `${date}T00:00:00.000Z`, status: 'pending' }) : fail(404, 'FETCH_ERROR');
    }
    if (method === 'POST' && route === '/api/applications') { created = true; return fail(409, 'DUPLICATE_APPLICATION'); }
    if (method === 'PATCH' && route === '/api/deadlines/c1') return ok({});
    return fail(500, 'UNEXPECTED');
  });
  const saved = await app.changeDeadline({ id: 'c1' }, date);
  assert.equal(saved, date);
  assert.deepEqual(calls.filter((c) => c !== 'GET /api/deadlines/c1'), ['POST /api/applications', 'PATCH /api/deadlines/c1']);
});

test('frontend: a database error (500) on the deadline read does not create an application', async () => {
  const { app, calls } = await loadApp((method, route) => {
    if (method === 'GET' && route === '/api/deadlines/c2') return fail(500, 'INTERNAL_ERROR');
    return fail(500, 'UNEXPECTED');
  });
  await assert.rejects(app.changeDeadline({ id: 'c2' }, futureDate(15)), (error) => error.status === 500);
  assert.ok(!calls.some((c) => c.startsWith('POST')), `no POST was sent: ${calls.join(', ')}`);
});
