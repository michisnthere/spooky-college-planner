// Task 34: security headers, rate limits, trust proxy, lockfile and engines, production startup.
// Servers are started on their own ports. Most use an unreachable database so no rows are created.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const BAD_DB = 'postgres://nobody:none@127.0.0.1:1/none';
const children = [];

function start(port, env = {}) {
  const child = spawn(process.execPath, [path.join(ROOT, 'backend', 'server.js')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), NODE_ENV: 'development', DATABASE_URL: BAD_DB, RATE_LIMIT_MAX: undefined, RATE_LIMIT_LOOKUP_MAX: undefined, RATE_LIMIT_STUDENTS_MAX: undefined, ...env },
    stdio: 'ignore',
  });
  children.push(child);
  return child;
}
async function waitUp(port, host = '127.0.0.1') {
  const limit = Date.now() + 15000;
  for (;;) {
    try { if ((await fetch(`http://${host}:${port}/api/health`)).status === 200) return; } catch { /* not up yet */ }
    if (Date.now() > limit) throw new Error(`server on ${port} did not start`);
    await new Promise((r) => setTimeout(r, 200));
  }
}
const get = (port, route, headers) => fetch(`http://127.0.0.1:${port}${route}`, { headers });
test.after(() => { for (const c of children) c.kill(); });

test('security headers are present on pages and API responses, and X-Powered-By is gone', async () => {
  start(3941);
  await waitUp(3941);
  for (const route of ['/', '/api/health', '/deadlines.html']) {
    const res = await get(3941, route);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff', route);
    assert.equal(res.headers.get('x-powered-by'), null, route);
    assert.ok(res.headers.get('content-security-policy'), `${route} has no CSP`);
    assert.ok(res.headers.get('x-frame-options') || /frame-ancestors/.test(res.headers.get('content-security-policy')), route);
  }
});

test('CSP allows only own scripts and styles, and upgrade-insecure-requests is off outside production', async () => {
  const csp = (await get(3941, '/')).headers.get('content-security-policy');
  assert.match(csp, /script-src 'self'(;|$)/);
  assert.equal(/script-src[^;]*unsafe-inline/.test(csp), false);
  assert.match(csp, /style-src 'self' 'unsafe-inline'/);
  assert.match(csp, /object-src 'none'/);
  assert.equal(csp.includes('upgrade-insecure-requests'), false);
});

test('a burst of lookup requests returns 429 in the RATE_LIMITED envelope', async () => {
  start(3942, { RATE_LIMIT_LOOKUP_MAX: '3' });
  await waitUp(3942);
  const statuses = [];
  let last;
  for (let i = 0; i < 5; i += 1) {
    last = await get(3942, '/api/lookup/college');
    statuses.push(last.status);
  }
  assert.deepEqual(statuses.slice(0, 3).filter((s) => s === 429), [], 'limited too early');
  assert.deepEqual(statuses.slice(3), [429, 429]);
  assert.match(last.headers.get('content-type'), /application\/json/);
  const body = await last.json();
  assert.equal(body.success, false);
  assert.equal(body.code, 'RATE_LIMITED');
  assert.equal(typeof body.error, 'string');
  // The lookup limit does not block other routes.
  assert.notEqual((await get(3942, '/api/colleges?student_id=x')).status, 429);
});

test('the health endpoint is never rate limited, other API routes are', async () => {
  start(3943, { RATE_LIMIT_MAX: '4' });
  await waitUp(3943);
  for (let i = 0; i < 30; i += 1) assert.equal((await get(3943, '/api/health')).status, 200);
  const codes = [];
  for (let i = 0; i < 6; i += 1) codes.push((await get(3943, '/api/colleges?student_id=x')).status);
  assert.equal(codes.filter((s) => s === 429).length >= 2, true, JSON.stringify(codes));
  assert.equal((await get(3943, '/api/health')).status, 200);
  // Static files are not under /api and are not limited.
  assert.equal((await get(3943, '/')).status, 200);
});

test('POST /api/students has its own tighter limit', async () => {
  start(3944, { RATE_LIMIT_STUDENTS_MAX: '2' });
  await waitUp(3944);
  const post = () => fetch('http://127.0.0.1:3944/api/students', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const first = await post();
  const second = await post();
  assert.notEqual(first.status, 429);
  assert.notEqual(second.status, 429);
  const third = await post();
  assert.equal(third.status, 429);
  assert.equal((await third.json()).code, 'RATE_LIMITED');
  // GET on the same path is not part of the students limiter.
  assert.notEqual((await get(3944, '/api/students')).status, 429);
});

test('development ignores X-Forwarded-For, so one client cannot dodge a limit by spoofing it', async () => {
  start(3945, { RATE_LIMIT_MAX: '2' });
  await waitUp(3945);
  const codes = [];
  for (let i = 0; i < 4; i += 1) codes.push((await get(3945, '/api/colleges?student_id=x', { 'X-Forwarded-For': `10.0.0.${i + 1}` })).status);
  assert.deepEqual(codes.map((s) => s === 429), [false, false, true, true]);
});

test('production trusts one proxy hop, so each forwarded client IP gets its own bucket', async () => {
  // Production exits when the database is down, so this one uses the real .env database.
  start(3946, { NODE_ENV: 'production', DATABASE_URL: undefined, RATE_LIMIT_MAX: '2' });
  await waitUp(3946);
  const hit = (ip) => get(3946, '/api/colleges?student_id=00000000-0000-4000-8000-000000000000', { 'X-Forwarded-For': ip });
  assert.notEqual((await hit('203.0.113.1')).status, 429);
  assert.notEqual((await hit('203.0.113.1')).status, 429);
  assert.equal((await hit('203.0.113.1')).status, 429);
  assert.notEqual((await hit('203.0.113.2')).status, 429, 'second client was limited by the first');
  const csp = (await get(3946, '/')).headers.get('content-security-policy');
  assert.match(csp, /upgrade-insecure-requests/);
});

test('NODE_ENV=production exits non-zero when the database connection fails', async () => {
  const child = start(3947, { NODE_ENV: 'production' });
  const code = await new Promise((resolve) => {
    child.on('exit', (c) => resolve(c));
    setTimeout(() => resolve('still running'), 12000);
  });
  assert.equal(code, 1);
});

test('development keeps running when the database connection fails', async () => {
  start(3948);
  await waitUp(3948);
  await new Promise((r) => setTimeout(r, 1500));
  assert.equal((await get(3948, '/api/health')).status, 200);
});

test('the server accepts connections on a non-loopback address (binds 0.0.0.0)', async (t) => {
  const external = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal);
  if (!external) return t.skip('no non-loopback IPv4 address on this machine');
  start(3949);
  await waitUp(3949, external.address);
});

test('package.json pins Node and lists helmet and express-rate-limit; the lockfile is tracked and in sync', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.match(pkg.engines.node, /^\d+(\.x|\.\d+\.\d+)$/);
  assert.ok(pkg.dependencies.helmet);
  assert.ok(pkg.dependencies['express-rate-limit']);
  assert.equal(pkg.scripts.start, 'node backend/server.js');
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
  for (const name of Object.keys(pkg.dependencies)) assert.ok(lock.packages[`node_modules/${name}`], `${name} missing from lockfile`);
  const ignored = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8').split(/\r?\n/).map((l) => l.trim());
  assert.equal(ignored.includes('package-lock.json'), false);
  const check = spawnSync('git', ['check-ignore', '-q', 'package-lock.json'], { cwd: ROOT });
  if (check.status !== null && !check.error) assert.equal(check.status, 1, 'git still ignores package-lock.json');
});
