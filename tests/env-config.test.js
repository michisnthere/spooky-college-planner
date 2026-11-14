// Follow-up item 3: env files agree on the database password, the committed template holds only a
// placeholder, and the DB scripts never print the password. No assertion message includes the password.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Pool } = require('pg');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const urlOf = (f) => /^\s*DATABASE_URL\s*=\s*(\S+)/m.exec(read(f))[1];
const pwOf = (f) => { const u = new URL(urlOf(f)); return u.password; };

test('root .env and backend/config/.env hold the same password (compared, never printed)', () => {
  assert.ok(pwOf('.env').length > 0);
  assert.equal(pwOf('.env') === pwOf('backend/config/.env'), true, 'passwords differ');
});
test('.env.example holds a placeholder, not the real password', () => {
  const example = pwOf('backend/config/.env.example');
  assert.equal(example === pwOf('.env'), false, 'example contains the real password');
  assert.match(example, /^(your_password|password|changeme|<.*>)$/i);
});
test('every env file keeps host, port and database name', () => {
  for (const f of ['.env', 'backend/config/.env', 'backend/config/.env.example']) {
    const u = new URL(urlOf(f));
    assert.equal(u.hostname, 'localhost', f);
    assert.equal(u.port, '5432', f);
    assert.equal(u.pathname, '/spooky_planner', f);
  }
});
test('both real env files connect to the database', async () => {
  for (const f of ['.env', 'backend/config/.env']) {
    const pool = new Pool({ connectionString: urlOf(f), connectionTimeoutMillis: 3000 });
    try { await pool.query('SELECT 1'); } catch { assert.fail(`${f} could not connect`); } finally { await pool.end(); }
  }
});
test('testConnection.js prints host and database name, and never the password', () => {
  const out = execFileSync(process.execPath, ['backend/db/testConnection.js'], { cwd: ROOT, encoding: 'utf8' });
  assert.match(out, /localhost\/spooky_planner/);
  assert.equal(out.includes(pwOf('.env')), false, 'output contains the password');
  assert.equal(out.includes('postgresql://'), false, 'output prints the connection URL');
});
test('connection.js describeTarget handles a missing or malformed URL without throwing', () => {
  const saved = process.env.DATABASE_URL;
  const { describeTarget } = require('../backend/db/connection');
  try {
    delete process.env.DATABASE_URL;
    assert.match(describeTarget(), /not set/);
    process.env.DATABASE_URL = 'not a url';
    assert.match(describeTarget(), /invalid/);
    process.env.DATABASE_URL = 'postgresql://u:secretpw@h:1/db';
    assert.equal(describeTarget(), 'h/db');
  } finally {
    process.env.DATABASE_URL = saved;
    require('../backend/db/connection').pool.end();
  }
});
