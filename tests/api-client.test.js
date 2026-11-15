// Task 17 checks: fetch wrapper (methods, timeout, envelope handling, error mapping).
// Uses real local HTTP servers, so timeouts, refused connections, and bad bodies go through the
// real network stack. Run with: node --test tests/api-client.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const clientUrl = pathToFileURL(path.join(__dirname, '..', 'frontend', 'js', 'api', 'client.js')).href;
const client = () => import(clientUrl);

// Starts a real HTTP server. `handler(req, body)` returns {status, type, body} and may be async.
// Every request is recorded so tests can check the method, URL, headers, and body.
async function startServer(handler) {
  const seen = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', async () => {
      let parsed;
      try {
        parsed = raw ? JSON.parse(raw) : undefined;
      } catch {
        parsed = raw;
      }
      seen.push({ method: req.method, url: req.url, headers: req.headers, body: parsed });
      const out = await handler(req, parsed);
      res.writeHead(out.status ?? 200, { 'Content-Type': out.type ?? 'application/json' });
      res.end(out.type === 'text/plain' || out.type === 'text/html' ? out.body : JSON.stringify(out.body));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    seen,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  };
}

const ENVELOPE_OK = (data) => ({ success: true, data, message: 'ok' });

test('successful GET resolves with the data field and sends the query string', async () => {
  const { createApiClient } = await client();
  const colleges = [{ id: 'c1', name: 'Harvard University', state: 'MA' }];
  const server = await startServer(() => ({ body: ENVELOPE_OK(colleges) }));
  try {
    const api = createApiClient({ baseUrl: server.baseUrl });
    const data = await api.get('/api/colleges?studentId=test');
    assert.deepEqual(data, colleges);
    assert.equal(server.seen[0].method, 'GET');
    assert.equal(server.seen[0].url, '/api/colleges?studentId=test');
    assert.equal(server.seen[0].headers.accept, 'application/json');
  } finally {
    await server.close();
  }
});

test('POST, PATCH, and DELETE use the right method and send JSON bodies when given', async () => {
  const { createApiClient } = await client();
  const server = await startServer((req) => ({ body: ENVELOPE_OK({ method: req.method }) }));
  try {
    const api = createApiClient({ baseUrl: server.baseUrl });
    await api.post('/api/colleges', { name: 'Yale' });
    await api.patch('/api/colleges/c1', { state: 'CT' });
    await api.delete('/api/colleges/c1');

    const [post, patch, del] = server.seen;
    assert.equal(post.method, 'POST');
    assert.deepEqual(post.body, { name: 'Yale' });
    assert.equal(post.headers['content-type'], 'application/json');
    assert.equal(patch.method, 'PATCH');
    assert.deepEqual(patch.body, { state: 'CT' });
    assert.equal(del.method, 'DELETE');
    assert.equal(del.body, undefined, 'DELETE sends no body');
    assert.equal(del.headers['content-type'], undefined, 'no Content-Type without a body');
  } finally {
    await server.close();
  }
});

test('error envelope with a code throws ApiError carrying the code, message, and status', async () => {
  const { createApiClient, ApiError } = await client();
  const server = await startServer(() => ({
    status: 404,
    body: { success: false, error: 'College not found', code: 'NOT_FOUND' },
  }));
  try {
    const api = createApiClient({ baseUrl: server.baseUrl });
    await assert.rejects(api.get('/api/colleges/missing'), (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.code, 'NOT_FOUND');
      assert.equal(error.message, 'College not found');
      assert.equal(error.status, 404);
      return true;
    });
  } finally {
    await server.close();
  }
});

test('a 200 response with success:false is still treated as an error', async () => {
  const { createApiClient } = await client();
  const server = await startServer(() => ({
    body: { success: false, error: 'Invalid status', code: 'UPDATE_STATUS_ERROR' },
  }));
  try {
    const api = createApiClient({ baseUrl: server.baseUrl });
    await assert.rejects(api.patch('/api/applications/c1/status', { status: 'bogus' }), (error) => {
      assert.equal(error.code, 'UPDATE_STATUS_ERROR');
      assert.equal(error.status, 200);
      return true;
    });
  } finally {
    await server.close();
  }
});

test('non-JSON success response (HTML page) throws INVALID_RESPONSE', async () => {
  const { createApiClient, ERROR_CODES } = await client();
  const server = await startServer(() => ({ type: 'text/html', body: '<html>index</html>' }));
  try {
    const api = createApiClient({ baseUrl: server.baseUrl });
    await assert.rejects(api.get('/api/colleges?studentId=test'), (error) => {
      assert.equal(error.code, ERROR_CODES.INVALID_RESPONSE);
      assert.equal(error.status, 200);
      return true;
    });
  } finally {
    await server.close();
  }
});

test('non-JSON error response (plain text 502) falls back to an HTTP_<status> code', async () => {
  const { createApiClient } = await client();
  const server = await startServer(() => ({ status: 502, type: 'text/plain', body: 'Bad Gateway' }));
  try {
    const api = createApiClient({ baseUrl: server.baseUrl });
    await assert.rejects(api.get('/api/lookup/college?name=Yale'), (error) => {
      assert.equal(error.code, 'HTTP_502');
      assert.equal(error.status, 502);
      return true;
    });
  } finally {
    await server.close();
  }
});

test('JSON without a success field is rejected as INVALID_RESPONSE', async () => {
  const { createApiClient, ERROR_CODES } = await client();
  const server = await startServer(() => ({ body: { data: [1, 2, 3] } }));
  try {
    const api = createApiClient({ baseUrl: server.baseUrl });
    await assert.rejects(api.get('/api/colleges?studentId=test'), (error) => {
      assert.equal(error.code, ERROR_CODES.INVALID_RESPONSE);
      return true;
    });
  } finally {
    await server.close();
  }
});

test('a server that never answers rejects with TIMEOUT after the configured limit', async () => {
  const { createApiClient, ERROR_CODES } = await client();
  // Holds the request open and never responds.
  const server = await startServer(() => new Promise(() => {}));
  try {
    const api = createApiClient({ baseUrl: server.baseUrl, timeoutMs: 150 });
    const started = Date.now();
    await assert.rejects(api.get('/api/colleges?studentId=test'), (error) => {
      assert.equal(error.code, ERROR_CODES.TIMEOUT);
      assert.equal(error.status, null);
      assert.match(error.message, /150 ms/);
      return true;
    });
    assert.ok(Date.now() - started < 2000, 'the request stops near the timeout, not at the server');
  } finally {
    await server.close();
  }
});

test('a refused connection (nothing listening) rejects with NETWORK_ERROR', async () => {
  const { createApiClient, ERROR_CODES } = await client();
  // Start and stop a server to get a port that nothing is listening on.
  const probe = await startServer(() => ({ body: ENVELOPE_OK(null) }));
  const deadUrl = probe.baseUrl;
  await probe.close();

  const api = createApiClient({ baseUrl: deadUrl });
  await assert.rejects(api.get('/api/colleges?studentId=test'), (error) => {
    assert.equal(error.code, ERROR_CODES.NETWORK_ERROR);
    assert.match(error.message, /Could not reach the server/);
    return true;
  });
});

test('defaults: 5000 ms timeout and a relative (same-origin) base URL', async () => {
  const { DEFAULT_TIMEOUT_MS, DEFAULT_BASE_URL, getBaseUrl } = await client();
  assert.equal(DEFAULT_TIMEOUT_MS, 5000);
  assert.equal(DEFAULT_BASE_URL, '');
  delete globalThis.SPOOKY_API_BASE_URL;
  assert.equal(getBaseUrl(), '');
});

test('SPOOKY_API_BASE_URL overrides the base URL and trailing slashes are removed', async () => {
  const { getBaseUrl } = await client();
  globalThis.SPOOKY_API_BASE_URL = 'https://planner.example.com//';
  try {
    assert.equal(getBaseUrl(), 'https://planner.example.com');
  } finally {
    delete globalThis.SPOOKY_API_BASE_URL;
  }
});

test('a path without a leading slash throws a TypeError before any request is made', async () => {
  const { createApiClient } = await client();
  const api = createApiClient({ baseUrl: 'http://127.0.0.1:9' });
  await assert.rejects(api.get('api/colleges'), TypeError);
});

test('an invalid timeout is rejected when the client is created', async () => {
  const { createApiClient } = await client();
  assert.throws(() => createApiClient({ timeoutMs: 0 }), RangeError);
  assert.throws(() => createApiClient({ timeoutMs: Number.NaN }), RangeError);
});

test('lookupCollege sends the name, encoded, and returns the match array', async () => {
  const { lookupCollege } = await client();
  const matches = [{ id: 'h1', name: 'Harvard University', state: 'MA', city: 'Cambridge', acceptanceRate: '3.59' }];
  const server = await startServer(() => ({ body: ENVELOPE_OK(matches) }));
  const saved = globalThis.SPOOKY_API_BASE_URL;
  try {
    globalThis.SPOOKY_API_BASE_URL = server.baseUrl;
    const result = await lookupCollege('Harvard University');
    assert.deepEqual(result, matches);
    assert.equal(server.seen[0].url, '/api/lookup/college?name=Harvard%20University');
  } finally {
    if (saved === undefined) delete globalThis.SPOOKY_API_BASE_URL;
    else globalThis.SPOOKY_API_BASE_URL = saved;
    await server.close();
  }
});

test('updateApplicationStatus sends PATCH with the status body to the applications route', async () => {
  const { updateApplicationStatus } = await client();
  const server = await startServer((req, body) => ({ body: ENVELOPE_OK({ status: body.status }) }));
  const saved = globalThis.SPOOKY_API_BASE_URL;
  try {
    globalThis.SPOOKY_API_BASE_URL = server.baseUrl;
    const data = await updateApplicationStatus('c 1', 'submitted');
    assert.deepEqual(data, { status: 'submitted' });
    assert.equal(server.seen[0].method, 'PATCH');
    assert.equal(server.seen[0].url, '/api/applications/c%201/status');
  } finally {
    if (saved === undefined) delete globalThis.SPOOKY_API_BASE_URL;
    else globalThis.SPOOKY_API_BASE_URL = saved;
    await server.close();
  }
});
