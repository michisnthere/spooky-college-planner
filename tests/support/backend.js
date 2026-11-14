// tests/support/backend.js
// Starts backend/server.js on its own port against the .env database, and removes every student
// (and the colleges and applications that belong to it) created through it.
'use strict';
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');

function localDate(offsetDays) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function createBackend(port) {
  const base = `http://127.0.0.1:${port}`;
  let child = null;
  let log = '';
  const studentIds = [];

  async function raw(method, route, body) {
    const response = await fetch(`${base}${route}`, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch { json = null; }
    return { status: response.status, text, body: json };
  }

  async function start() {
    child = spawn(process.execPath, [path.join(ROOT, 'backend', 'server.js')], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (c) => { log += c; });
    child.stderr.on('data', (c) => { log += c; });
    const limit = Date.now() + 15000;
    for (;;) {
      if (child.exitCode !== null) throw new Error('server exited early');
      try { if ((await raw('GET', '/api/health')).status === 200) break; } catch { /* not up yet */ }
      if (Date.now() > limit) throw new Error('server did not start');
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  async function newStudent() {
    const created = await raw('POST', '/api/students', {});
    if (created.status !== 201) throw new Error(`could not create a student (${created.status})`);
    studentIds.push(created.body.data.id);
    return created.body.data.id;
  }

  async function stop() {
    if (child && child.exitCode === null) child.kill();
    const db = require(path.join(ROOT, 'backend', 'db', 'connection'));
    for (const id of studentIds) {
      await db.query('DELETE FROM applications WHERE student_id = $1', [id]).catch(() => {});
      await db.query('DELETE FROM colleges WHERE student_id = $1', [id]).catch(() => {});
      await db.query('DELETE FROM students WHERE id = $1', [id]).catch(() => {});
    }
    await db.pool.end();
  }

  return { raw, start, stop, newStudent, getLog: () => log };
}

module.exports = { createBackend, localDate };
