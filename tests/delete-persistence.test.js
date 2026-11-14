// Follow-up item 7: deleting a college persists. Backend (own server on port 3923) and the real
// frontend wiring in jsdom talking to that server. Removes the rows it creates.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { JSDOM } = require('jsdom');
const { createBackend, localDate } = require('./support/backend');

const FRONTEND = path.join(__dirname, '..', 'frontend');
const api = createBackend(3923);
const BASE = 'http://127.0.0.1:3923';
const MISSING_ID = '00000000-0000-4000-8000-000000000000';
let studentId;
const realFetch = globalThis.fetch;
const sent = [];
let failDeletes = false;

const dom = new JSDOM(fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8'), { url: 'http://localhost/', pretendToBeVisual: true });
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'localStorage', { value: dom.window.localStorage, configurable: true, writable: true });
globalThis.SPOOKY_API_BASE_URL = BASE;
globalThis.confirm = () => true;
globalThis.fetch = async (url, options = {}) => {
  const method = (options.method || 'GET').toUpperCase();
  sent.push(`${method} ${String(url).replace(BASE, '')}`);
  if (method === 'DELETE' && failDeletes) throw new TypeError('network down');
  return realFetch(url, options);
};

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const cards = () => Array.from(document.querySelectorAll('#college-tombstones .college-tombstone'));
const cardNamed = (name) => cards().find((c) => c.querySelector('.college-tombstone__stone').textContent.startsWith(name));
async function until(fn, label) {
  for (let i = 0; i < 200; i += 1) { if (await fn()) return; await wait(15); }
  throw new Error(`timed out: ${label}`);
}
async function college(name, deadline) {
  const r = await api.raw('POST', '/api/colleges', { studentId, name, state: 'Ohio' });
  assert.equal(r.status, 201, r.text);
  if (deadline) assert.equal((await api.raw('POST', '/api/applications', { studentId, collegeId: r.body.data.id, deadlineDate: deadline })).status, 201);
  return r.body.data;
}
const names = async () => (await api.raw('GET', `/api/colleges?studentId=${studentId}`)).body.data.map((c) => c.name);
async function dbCount(table, column, id) {
  const db = require('../backend/db/connection');
  return (await db.query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE ${column} = $1`, [id])).rows[0].n;
}

test.before(async () => {
  await api.start();
  studentId = await api.newStudent();
  dom.window.localStorage.setItem('spooky-planner.studentId', studentId);
});
test.after(async () => { globalThis.fetch = realFetch; await api.stop(); });

test('backend: deleting a college removes the college and its application row', async () => {
  const c = await college('Del A U', localDate(30));
  assert.equal(await dbCount('applications', 'college_id', c.id), 1);
  const r = await api.raw('DELETE', `/api/colleges/${c.id}`);
  assert.equal(r.status, 200, r.text);
  assert.equal(await dbCount('colleges', 'id', c.id), 0);
  assert.equal(await dbCount('applications', 'college_id', c.id), 0, 'no orphaned application');
  assert.equal((await api.raw('GET', `/api/applications/${c.id}`)).status, 404);
});
test('backend: a college with no application deletes cleanly', async () => {
  const c = await college('Del B U');
  assert.equal((await api.raw('DELETE', `/api/colleges/${c.id}`)).status, 200);
  assert.ok(!(await names()).includes('Del B U'));
});
test('backend: deleting one college leaves the other college and its application alone', async () => {
  const keep = await college('Del Keep U', localDate(10));
  const drop = await college('Del Drop U', localDate(20));
  await api.raw('DELETE', `/api/colleges/${drop.id}`);
  assert.equal(await dbCount('colleges', 'id', keep.id), 1);
  assert.equal(await dbCount('applications', 'college_id', keep.id), 1);
  const list = await names();
  assert.ok(list.includes('Del Keep U') && !list.includes('Del Drop U'));
});
test('backend: an unknown id, a repeat delete and a malformed id all return a 4xx error envelope, never a 5xx', async () => {
  const c = await college('Del Twice U');
  assert.equal((await api.raw('DELETE', `/api/colleges/${c.id}`)).status, 200);
  for (const id of [c.id, MISSING_ID, 'not-a-uuid']) {
    const r = await api.raw('DELETE', `/api/colleges/${id}`);
    assert.equal(r.status, 404, `${id}: ${r.text}`);
    assert.equal(r.body.success, false);
    assert.equal(typeof r.body.code, 'string');
  }
});
test('frontend: Delete calls DELETE /api/colleges/:id, then removes the card, and the card stays gone after a reload', async () => {
  await college('UI Gone U', localDate(15));
  await college('UI Stay U', localDate(16));
  const app = await import(pathToFileURL(path.join(FRONTEND, 'js', 'app.js')).href);
  app.initApp();
  await app.loadSavedColleges();
  assert.ok(cardNamed('UI Gone U') && cardNamed('UI Stay U'));
  const target = await api.raw('GET', `/api/colleges?studentId=${studentId}`);
  const goneId = target.body.data.find((c) => c.name === 'UI Gone U').id;
  sent.length = 0;
  cardNamed('UI Gone U').querySelector('.tombstone-delete').click();
  await until(() => !cardNamed('UI Gone U'), 'card removal');
  assert.ok(sent.includes(`DELETE /api/colleges/${goneId}`), sent.join(' | '));
  assert.ok(cardNamed('UI Stay U'), 'the other card is untouched');
  // A page refresh: build the page again from the server.
  app.initApp();
  await app.loadSavedColleges();
  assert.equal(cardNamed('UI Gone U'), undefined, 'the deleted college does not come back');
  assert.ok(cardNamed('UI Stay U'));
  assert.equal(await dbCount('applications', 'college_id', goneId), 0);
});
test('frontend: when the server cannot be reached, the card stays and an error is shown, and a retry works', async () => {
  await college('UI Fail U');
  const app = await import(pathToFileURL(path.join(FRONTEND, 'js', 'app.js')).href);
  app.initApp();
  await app.loadSavedColleges();
  failDeletes = true;
  cardNamed('UI Fail U').querySelector('.tombstone-delete').click();
  await until(() => /Could not delete/.test(($('graveyard-message') || {}).textContent || ''), 'error message');
  assert.ok(cardNamed('UI Fail U'), 'the card is still there');
  assert.ok((await names()).includes('UI Fail U'), 'the server still has it');
  failDeletes = false;
  cardNamed('UI Fail U').querySelector('.tombstone-delete').click();
  await until(() => !cardNamed('UI Fail U'), 'card removal after retry');
  assert.equal($('graveyard-message').textContent, '', 'the error is cleared after a success');
});
test('frontend: a server 404 (already deleted elsewhere) still removes the card', async () => {
  const c = await college('UI Ghost U');
  const app = await import(pathToFileURL(path.join(FRONTEND, 'js', 'app.js')).href);
  app.initApp();
  await app.loadSavedColleges();
  await api.raw('DELETE', `/api/colleges/${c.id}`);
  cardNamed('UI Ghost U').querySelector('.tombstone-delete').click();
  await until(() => !cardNamed('UI Ghost U'), 'card removal');
});
test('frontend: cancelling the confirmation sends no request and keeps the card', async () => {
  await college('UI Cancel U');
  const app = await import(pathToFileURL(path.join(FRONTEND, 'js', 'app.js')).href);
  app.initApp();
  await app.loadSavedColleges();
  globalThis.confirm = () => false;
  sent.length = 0;
  cardNamed('UI Cancel U').querySelector('.tombstone-delete').click();
  await wait(100);
  globalThis.confirm = () => true;
  assert.ok(cardNamed('UI Cancel U'));
  assert.deepEqual(sent.filter((s) => s.startsWith('DELETE')), []);
});
test('frontend: a double click sends one DELETE', async () => {
  await college('UI Double U');
  const app = await import(pathToFileURL(path.join(FRONTEND, 'js', 'app.js')).href);
  app.initApp();
  await app.loadSavedColleges();
  sent.length = 0;
  const button = cardNamed('UI Double U').querySelector('.tombstone-delete');
  button.click();
  button.click();
  await until(() => !cardNamed('UI Double U'), 'card removal');
  assert.equal(sent.filter((s) => s.startsWith('DELETE')).length, 1);
});
test('deadline tracker: removeCollege drops the lane, and the empty message returns after the last one', async () => {
  const pageDom = new JSDOM(fs.readFileSync(path.join(FRONTEND, 'deadlines.html'), 'utf8'), { pretendToBeVisual: true });
  const saved = globalThis.document;
  globalThis.document = pageDom.window.document;
  try {
    const { initDeadlineTracker, NO_COLLEGES_TEXT } = await import(pathToFileURL(path.join(FRONTEND, 'js', 'ui', 'deadline-tracker.js')).href);
    const t = initDeadlineTracker({ colleges: [{ id: 'a', name: 'A', deadline_date: '2030-01-01' }, { id: 'b', name: 'B', deadline_date: null }] });
    assert.equal(t.laneCount, 2);
    assert.equal(t.removeCollege('a'), true);
    assert.equal(t.laneCount, 1);
    assert.equal(pageDom.window.document.querySelectorAll('.deadline-lane').length, 1);
    assert.equal(t.removeCollege('zzz'), false);
    t.removeCollege('b');
    assert.equal(pageDom.window.document.querySelector('.deadline-empty').textContent, NO_COLLEGES_TEXT);
  } finally {
    globalThis.document = saved;
  }
});
