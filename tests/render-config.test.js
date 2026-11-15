// Task 35: Render config, SSL option for hosted databases, init.js on an empty database, .env.example, DEPLOY.md.
// The scratch database test creates a database with a unique name and always drops it. It never touches
// spooky_planner. No test prints the database password.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const tls = require('node:tls');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { Pool } = require('pg');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// Reads DATABASE_URL from the environment or the root .env, in memory only.
function realDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const match = /^\s*DATABASE_URL\s*=\s*(\S+)/m.exec(read('.env'));
  return match[1];
}
const withDatabase = (url, name) => { const u = new URL(url); u.pathname = `/${name}`; return u.toString(); };

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

// ---- SSL option parsing ----
test('parseSslOption: unset, empty and false mean no TLS', () => {
  const { parseSslOption } = require('../backend/db/connection');
  for (const v of [undefined, '', '  ', 'false', '0', 'no', 'off', 'garbage']) assert.equal(parseSslOption(v), false, String(v));
});

test('parseSslOption: true-like values use TLS without a certificate check, verify checks it', () => {
  const { parseSslOption } = require('../backend/db/connection');
  for (const v of ['true', 'TRUE', ' True ', '1', 'require', 'yes']) assert.deepEqual(parseSslOption(v), { rejectUnauthorized: false }, v);
  assert.deepEqual(parseSslOption('verify'), { rejectUnauthorized: true });
});

// ---- Server against a TLS-only database (a local TLS front for the real database) ----
function findOpenssl() {
  for (const cmd of ['openssl', 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe']) {
    const r = spawnSync(cmd, ['version']);
    if (!r.error && r.status === 0) return cmd;
  }
  return null;
}

// Speaks the Postgres SSLRequest handshake, then forwards decrypted bytes to the real database.
// A client that skips TLS is dropped, like a database that requires SSL.
function startTlsFront(target, cert, key) {
  const context = tls.createSecureContext({ cert, key });
  const server = net.createServer((client) => {
    client.once('readable', () => {
      const head = client.read(8);
      if (!head || head.readUInt32BE(4) !== 80877103) return client.destroy();
      client.write('S');
      const secure = new tls.TLSSocket(client, { isServer: true, secureContext: context });
      const upstream = net.connect(Number(target.port || 5432), target.hostname);
      secure.pipe(upstream).pipe(secure);
      const close = () => { secure.destroy(); upstream.destroy(); };
      secure.on('error', close); upstream.on('error', close); secure.on('close', close);
    });
    client.on('error', () => {});
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function runServer(port, env, waitMs) {
  const child = spawn(process.execPath, [path.join(ROOT, 'backend', 'server.js')], {
    cwd: ROOT, env: { ...process.env, PORT: String(port), NODE_ENV: 'production', ...env }, stdio: 'ignore',
  });
  try {
    const result = await new Promise((resolve) => {
      child.on('exit', (code) => resolve({ exited: code }));
      setTimeout(() => resolve({ running: true }), waitMs);
    });
    if (result.running) {
      const health = await fetch(`http://127.0.0.1:${port}/api/health`).then((r) => r.status).catch(() => null);
      return { ...result, health };
    }
    return result;
  } finally { child.kill(); }
}

test('production server starts against a TLS-only database with DATABASE_SSL=true, and exits without it', async (t) => {
  const openssl = findOpenssl();
  if (!openssl) return t.skip('openssl not available');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spooky-tls-'));
  const keyFile = path.join(dir, 'key.pem');
  const certFile = path.join(dir, 'cert.pem');
  const gen = spawnSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyFile, '-out', certFile, '-days', '1', '-subj', '/CN=localhost'], { stdio: 'pipe' });
  if (gen.status !== 0) return t.skip('openssl could not create a certificate');
  const real = new URL(realDatabaseUrl());
  const front = await startTlsFront(real, fs.readFileSync(certFile), fs.readFileSync(keyFile));
  try {
    const url = new URL(real.toString());
    url.hostname = '127.0.0.1';
    url.port = String(front.address().port);
    const frontUrl = url.toString();

    const withSsl = await runServer(3961, { DATABASE_URL: frontUrl, DATABASE_SSL: 'true' }, 4000);
    assert.deepEqual(withSsl, { running: true, health: 200 }, 'DATABASE_SSL=true should connect through TLS');

    const without = await runServer(3962, { DATABASE_URL: frontUrl, DATABASE_SSL: 'false' }, 8000);
    assert.equal(without.exited, 1, 'without TLS the production server must exit 1');

    const verify = await runServer(3963, { DATABASE_URL: frontUrl, DATABASE_SSL: 'verify' }, 8000);
    assert.equal(verify.exited, 1, 'a self-signed certificate must fail with DATABASE_SSL=verify');
  } finally {
    front.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---- init.js + schema.sql on an empty scratch database ----
test('init.js builds the full schema on an empty scratch database, twice, then the database is dropped', async (t) => {
  const real = realDatabaseUrl();
  const scratch = `spooky_scratch_${process.pid}_${Date.now().toString(36)}`;
  assert.match(scratch, /^spooky_scratch_[a-z0-9_]+$/);
  assert.notEqual(scratch, new URL(real).pathname.slice(1));
  const admin = new Pool({ connectionString: withDatabase(real, 'postgres'), connectionTimeoutMillis: 4000 });
  let created = false;
  try {
    try {
      await admin.query(`CREATE DATABASE ${scratch}`);
      created = true;
    } catch (error) {
      return t.skip(`CREATE DATABASE not permitted: ${error.code || error.message}`);
    }
    const scratchUrl = withDatabase(real, scratch);
    const runInit = () => spawnSync(process.execPath, [path.join(ROOT, 'backend', 'db', 'init.js')], {
      cwd: ROOT, env: { ...process.env, DATABASE_URL: scratchUrl }, encoding: 'utf8',
    });
    for (let i = 0; i < 2; i += 1) {
      const out = runInit();
      assert.equal(out.status, 0, `init.js run ${i + 1} failed: ${String(out.stderr).slice(0, 300)}`);
      assert.equal(String(out.stdout).includes(new URL(real).password), false, 'init.js printed the password');
    }
    const db = new Pool({ connectionString: scratchUrl });
    try {
      const tables = (await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")).rows.map((r) => r.table_name);
      for (const name of ['students', 'colleges', 'applications']) assert.ok(tables.includes(name), `missing table ${name}`);
      const state = (await db.query("SELECT data_type, character_maximum_length FROM information_schema.columns WHERE table_name = 'colleges' AND column_name = 'state'")).rows[0];
      assert.deepEqual(state, { data_type: 'character varying', character_maximum_length: 50 });
      const indexes = (await db.query("SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'")).rows;
      const unique = indexes.find((i) => i.indexname === 'uq_applications_college_id');
      assert.ok(unique, 'unique index on applications.college_id is missing');
      assert.match(unique.indexdef, /UNIQUE INDEX .* ON public\.applications .*\(college_id\)/);
      for (const name of ['idx_colleges_student_id', 'idx_applications_student_id', 'idx_applications_college_id', 'idx_applications_deadline']) {
        assert.ok(indexes.some((i) => i.indexname === name), `missing index ${name}`);
      }
      // The unique index really rejects a second application for one college.
      const college = (await db.query("INSERT INTO colleges (name) VALUES ('Scratch U') RETURNING id")).rows[0].id;
      await db.query('INSERT INTO applications (college_id) VALUES ($1)', [college]);
      await assert.rejects(db.query('INSERT INTO applications (college_id) VALUES ($1)', [college]), (e) => e.code === '23505');
    } finally { await db.end(); }
  } finally {
    if (created) {
      await admin.query(`DROP DATABASE IF EXISTS ${scratch} WITH (FORCE)`);
      const left = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [scratch]);
      assert.equal(left.rowCount, 0, 'scratch database was not dropped');
    }
    await admin.end();
  }
});

// ---- render.yaml ----
test('render.yaml defines a Node web service and a database wired together, with secrets not synced', () => {
  const y = read('render.yaml');
  assert.match(y, /type:\s*web/);
  assert.match(y, /runtime:\s*node/);
  assert.match(y, /buildCommand:\s*npm ci\s*$/m);
  assert.match(y, /startCommand:\s*npm start\s*$/m);
  assert.match(y, /healthCheckPath:\s*\/api\/health\s*$/m);
  assert.match(y, /^databases:/m);
  assert.match(y, /key:\s*DATABASE_URL\s*\n\s*fromDatabase:\s*\n\s*name:\s*spooky-planner-db\s*\n\s*property:\s*connectionString/);
  assert.match(y, /key:\s*COLLEGE_SCORECARD_API_KEY\s*\n\s*sync:\s*false/);
  assert.match(y, /key:\s*NODE_ENV\s*\n\s*value:\s*production/);
  assert.equal(/postgres(ql)?:\/\//.test(y), false, 'render.yaml must not hold a connection string');
});

// ---- .env.example ----
test('.env.example lists every variable the backend reads', () => {
  const example = read('backend/config/.env.example');
  const listed = new Set([...example.matchAll(/^\s*#?\s*([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]));
  const used = new Set();
  for (const file of walk(path.join(ROOT, 'backend'))) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) used.add(m[1]);
    for (const m of src.matchAll(/intFromEnv\('([A-Z][A-Z0-9_]+)'/g)) used.add(m[1]);
  }
  assert.ok(used.size >= 10, `found only ${used.size} variables`);
  const missing = [...used].filter((name) => !listed.has(name));
  assert.deepEqual(missing, [], `missing from .env.example: ${missing.join(', ')}`);
  for (const name of ['DATABASE_URL', 'DATABASE_SSL', 'COLLEGE_SCORECARD_API_KEY', 'NODE_ENV', 'PORT', 'CORS_ORIGIN']) assert.ok(used.has(name), `${name} not found in code`);
});

test('.env.example keeps a placeholder password and no real API key', () => {
  const example = read('backend/config/.env.example');
  assert.match(example, /DATABASE_URL=postgresql:\/\/user:your_password@localhost/);
  assert.match(example, /COLLEGE_SCORECARD_API_KEY=exampleAPIKey/);
});

// ---- DEPLOY.md ----
test('DEPLOY.md covers every step and every variable in render.yaml', () => {
  const doc = read('DEPLOY.md');
  const y = read('render.yaml');
  for (const key of [...y.matchAll(/key:\s*(\w+)/g)].map((m) => m[1])) assert.ok(doc.includes(key), `DEPLOY.md does not mention ${key}`);
  for (const word of ['spooky-planner-db', 'spooky-college-planner', 'npm ci', 'npm start', '/api/health', 'init.js', 'smoke', 'expire', 'student UUID']) {
    assert.ok(doc.includes(word), `DEPLOY.md does not mention "${word}"`);
  }
  assert.equal(/postgres(ql)?:\/\/\w+:(?!your_password|<)[^@\s]+@/.test(doc), false, 'DEPLOY.md contains a connection string with a password');
});
