// Task 33: Express serves the frontend, the API base URL is relative, CORS allows same origin.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
const PORT = 3931;
const BASE = `http://127.0.0.1:${PORT}`;
let child;

// Sends a raw request line so the path reaches the server unchanged (fetch normalises "..").
function rawGet(requestPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(PORT, '127.0.0.1');
    let data = '';
    socket.on('data', (c) => { data += c; });
    socket.on('end', () => resolve({ status: Number(/^HTTP\/1\.1 (\d+)/.exec(data)[1]), text: data }));
    socket.on('error', reject);
    const extra = Object.entries(headers).map(([k, v]) => `${k}: ${v}\r\n`).join('');
    socket.write(`GET ${requestPath} HTTP/1.1\r\nHost: 127.0.0.1:${PORT}\r\n${extra}Connection: close\r\n\r\n`);
  });
}

test.before(async () => {
  child = spawn(process.execPath, [path.join(ROOT, 'backend', 'server.js')], {
    cwd: ROOT,
    // CORS_ORIGIN is blanked on purpose: same-origin must work without it.
    env: { ...process.env, PORT: String(PORT), CORS_ORIGIN: '' },
    stdio: 'ignore',
  });
  const limit = Date.now() + 15000;
  for (;;) {
    try { if ((await fetch(`${BASE}/api/health`)).status === 200) return; } catch { /* not up yet */ }
    if (Date.now() > limit) throw new Error('server did not start');
    await new Promise((r) => setTimeout(r, 250));
  }
});
test.after(() => { if (child) child.kill(); });

test('GET / serves the frontend index.html', async () => {
  const res = await fetch(`${BASE}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.match(await res.text(), /<script type="module" src="js\/app\.js">/);
});

test('GET /deadlines.html, the CSS and the JS modules are served', async () => {
  for (const [url, type] of [['/deadlines.html', /html/], ['/css/style.css', /css/], ['/js/app.js', /javascript/], ['/js/api/client.js', /javascript/]]) {
    const res = await fetch(`${BASE}${url}`);
    assert.equal(res.status, 200, url);
    assert.match(res.headers.get('content-type'), type, url);
  }
});

test('unknown /api path returns the JSON 404 envelope, not index.html', async () => {
  for (const url of ['/api/nope', '/api/colleges/x/y/z', '/api']) {
    const res = await fetch(`${BASE}${url}`);
    assert.equal(res.status, 404, url);
    assert.match(res.headers.get('content-type'), /application\/json/, url);
    assert.deepEqual(await res.json(), { success: false, error: 'Route not found', code: 'NOT_FOUND' }, url);
  }
});

test('unknown non-API file returns 404 JSON, not the index page', async () => {
  const res = await fetch(`${BASE}/no-such-page.html`);
  assert.equal(res.status, 404);
  assert.equal((await res.json()).code, 'NOT_FOUND');
});

test('path traversal cannot read files outside frontend/', async () => {
  for (const p of ['/../backend/server.js', '/%2e%2e/backend/server.js', '/..%2fbackend%2fserver.js', '/js/../../.env', '/%2e%2e/.env']) {
    const res = await rawGet(p);
    assert.notEqual(res.status, 200, p);
    assert.equal(/require\('express'\)|DATABASE_URL/.test(res.text), false, `${p} leaked file content`);
  }
});

test('dotfiles inside frontend/ are not served', async () => {
  const res = await fetch(`${BASE}/.env`);
  assert.equal(res.status, 404);
});

test('/api/health still answers JSON and API routes win over static files', async () => {
  const res = await fetch(`${BASE}/api/health`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).status, 'Server is running');
});

test('CORS: same origin and unlisted origins', async () => {
  const same = await fetch(`${BASE}/api/health`, { headers: { Origin: BASE } });
  assert.equal(same.status, 200);
  assert.equal(same.headers.get('access-control-allow-origin'), BASE);
  const other = await fetch(`${BASE}/api/health`, { headers: { Origin: 'https://evil.example' } });
  assert.equal(other.headers.get('access-control-allow-origin'), null);
});

test('CORS: an origin listed in CORS_ORIGIN is still allowed', () => {
  const cors = require('../backend/middleware/cors');
  const saved = process.env.CORS_ORIGIN;
  process.env.CORS_ORIGIN = 'http://localhost:5500, https://app.example.com';
  try {
    const run = (origin) => new Promise((resolve) => {
      const headers = {};
      const res = { setHeader: (k, v) => { headers[k.toLowerCase()] = v; }, getHeader: (k) => headers[k.toLowerCase()], end: () => resolve(headers), statusCode: 200 };
      cors({ method: 'GET', headers: { origin, host: 'planner.onrender.com' } }, res, () => resolve(headers));
    });
    return Promise.all([run('https://app.example.com'), run('http://localhost:5500'), run('https://other.example'), run('https://planner.onrender.com')]).then(([a, b, c, d]) => {
      assert.equal(a['access-control-allow-origin'], 'https://app.example.com');
      assert.equal(b['access-control-allow-origin'], 'http://localhost:5500');
      assert.equal(c['access-control-allow-origin'], undefined);
      // Host planner.onrender.com with an https Origin of the same host is same origin.
      assert.equal(d['access-control-allow-origin'], 'https://planner.onrender.com');
    }).finally(() => { process.env.CORS_ORIGIN = saved; });
  } catch (e) { process.env.CORS_ORIGIN = saved; throw e; }
});

test('api client uses a relative base URL by default and still honours SPOOKY_API_BASE_URL', async () => {
  const client = await import(pathToFileURL(path.join(ROOT, 'frontend', 'js', 'api', 'client.js')).href);
  delete globalThis.SPOOKY_API_BASE_URL;
  assert.equal(client.DEFAULT_BASE_URL, '');
  assert.equal(client.getBaseUrl(), '');
  globalThis.SPOOKY_API_BASE_URL = '   ';
  assert.equal(client.getBaseUrl(), '');
  globalThis.SPOOKY_API_BASE_URL = 'https://api.example.com/';
  assert.equal(client.getBaseUrl(), 'https://api.example.com');
  delete globalThis.SPOOKY_API_BASE_URL;
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => { seen.push(url); return new Response(JSON.stringify({ success: true, data: {} }), { status: 200 }); };
  try {
    await client.createApiClient().get('/api/health');
  } finally { globalThis.fetch = realFetch; }
  assert.deepEqual(seen, ['/api/health']);
});
