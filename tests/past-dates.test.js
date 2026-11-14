// Follow-up item 1 and 2: deadline dates are local calendar days, and past dates are rejected everywhere
// on the backend. Starts its own server on port 3921 and removes the rows it creates.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createBackend, localDate } = require('./support/backend');
const { parseLocalDate, startOfDay, toLocalDay } = require('../backend/utils/dates');
const { calculateDaysRemaining } = require('../backend/controllers/deadlineController');

const api = createBackend(3921);
let studentId;

test.before(async () => {
  await api.start();
  studentId = await api.newStudent();
});
test.after(async () => { await api.stop(); });

async function college(name) {
  const r = await api.raw('POST', '/api/colleges', { studentId, name, state: 'MA' });
  assert.equal(r.status, 201, r.text);
  return r.body.data;
}
function envelope(r, status) {
  assert.equal(r.status, status, r.text);
  assert.equal(r.body.success, false);
  assert.equal(typeof r.body.error, 'string');
  assert.equal(typeof r.body.code, 'string');
}

test('parseLocalDate reads YYYY-MM-DD as local midnight, not UTC', () => {
  const d = parseLocalDate('2026-03-09');
  assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()], [2026, 2, 9, 0]);
});
test('parseLocalDate rejects impossible and malformed dates', () => {
  for (const bad of ['2026-02-31', '2026-13-01', '2026-00-10', '26-01-01', '2026/01/01', 'soon', '', null, undefined, 20260101]) {
    assert.equal(parseLocalDate(bad), null, String(bad));
  }
  assert.ok(parseLocalDate('2028-02-29'), 'leap day is valid');
  assert.equal(parseLocalDate('2027-02-29'), null, 'not a leap year');
});
test('calculateDaysRemaining gives 0 for today, 1 for tomorrow, -1 for yesterday, for strings and Dates', () => {
  assert.equal(calculateDaysRemaining(localDate(0)), 0);
  assert.equal(calculateDaysRemaining(localDate(1)), 1);
  assert.equal(calculateDaysRemaining(localDate(-1)), -1);
  assert.equal(calculateDaysRemaining(startOfDay()), 0);
  assert.equal(calculateDaysRemaining(toLocalDay(localDate(30))), 30);
  assert.equal(calculateDaysRemaining(null), null);
  assert.equal(calculateDaysRemaining('garbage'), null);
});
test('PATCH deadline: today is accepted and gives 0 days', async () => {
  const c = await college('Item1 Today U');
  assert.equal((await api.raw('POST', '/api/applications', { studentId, collegeId: c.id, deadlineDate: localDate(10) })).status, 201);
  const r = await api.raw('PATCH', `/api/deadlines/${c.id}`, { deadlineDate: localDate(0) });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.data.daysRemaining, 0);
});
test('PATCH deadline: yesterday, and a far past date, return 400 and leave the stored date', async () => {
  const c = await college('Item2 Patch U');
  await api.raw('POST', '/api/applications', { studentId, collegeId: c.id, deadlineDate: localDate(20) });
  for (const d of [localDate(-1), '2001-01-01']) {
    const r = await api.raw('PATCH', `/api/deadlines/${c.id}`, { deadlineDate: d });
    envelope(r, 400);
    assert.match(r.body.error, /today or later/);
  }
  const after = await api.raw('GET', `/api/deadlines/${c.id}`);
  assert.equal(after.body.data.daysRemaining, 20);
});
test('PATCH deadline: impossible date 2026-02-31 is a format error, not rolled into March', async () => {
  const c = await college('Item2 Overflow U');
  await api.raw('POST', '/api/applications', { studentId, collegeId: c.id, deadlineDate: localDate(5) });
  const r = await api.raw('PATCH', `/api/deadlines/${c.id}`, { deadlineDate: '2099-02-31' });
  envelope(r, 400);
  assert.match(r.body.error, /Invalid date format/);
});
test('POST application: yesterday and a far past date return 400 and create no row', async () => {
  const c = await college('Item2 Create U');
  for (const d of [localDate(-1), '1999-12-31']) {
    envelope(await api.raw('POST', '/api/applications', { studentId, collegeId: c.id, deadlineDate: d }), 400);
  }
  assert.equal((await api.raw('GET', `/api/applications/${c.id}`)).status, 404, 'no application was stored');
});
test('POST application: today, a future date, and no date at all are accepted', async () => {
  for (const [name, d] of [['Item2 A', localDate(0)], ['Item2 B', localDate(90)], ['Item2 C', undefined]]) {
    const c = await college(name);
    const r = await api.raw('POST', '/api/applications', { studentId, collegeId: c.id, deadlineDate: d });
    assert.equal(r.status, 201, `${name}: ${r.text}`);
  }
});
test('POST application: a malformed date string returns 400', async () => {
  const c = await college('Item2 Bad Format U');
  const r = await api.raw('POST', '/api/applications', { studentId, collegeId: c.id, deadlineDate: 'next week' });
  envelope(r, 400);
  assert.match(r.body.error, /Invalid date format/);
});
