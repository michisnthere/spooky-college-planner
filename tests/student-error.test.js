// Student creation errors: a connection failure with an empty message still gives a readable reason.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../backend/db/connection');
const { createStudent } = require('../backend/controllers/studentController');

const original = pool.query;
test.afterEach(() => { pool.query = original; });
test.after(() => pool.end());

const failWith = async (error) => {
  pool.query = async () => { throw error; };
  const logged = console.error;
  console.error = () => {};
  try { await assert.rejects(createStudent()); return await createStudent().catch((e) => e.message); }
  finally { console.error = logged; }
};

test('an AggregateError with an empty message reports the inner errors', async () => {
  const error = new AggregateError([Object.assign(new Error('connect ECONNREFUSED ::1:5432'), { code: 'ECONNREFUSED' }), Object.assign(new Error(''), { code: 'ECONNREFUSED' })], '');
  assert.equal(await failWith(error), 'Failed to create student: connect ECONNREFUSED ::1:5432; ECONNREFUSED');
});
test('an empty error with a code reports the code', async () => {
  assert.equal(await failWith(Object.assign(new Error(''), { code: 'ETIMEDOUT' })), 'Failed to create student: ETIMEDOUT');
});
test('an error with a message keeps that message', async () => {
  assert.equal(await failWith(new Error('relation "students" does not exist')), 'Failed to create student: relation "students" does not exist');
});
test('an error with nothing at all still gives a non-empty reason', async () => {
  assert.equal(await failWith(new Error('')), 'Failed to create student: database error');
});
test('an AggregateError with no inner details falls back to the generic reason', async () => {
  assert.equal(await failWith(new AggregateError([], '')), 'Failed to create student: database error');
});
test('the full error is written to the server log', async () => {
  pool.query = async () => { throw new Error('boom'); };
  const calls = [];
  const logged = console.error;
  console.error = (...args) => calls.push(args);
  try { await createStudent().catch(() => {}); } finally { console.error = logged; }
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].message, 'boom');
});
test('a working database still creates the student', async () => {
  pool.query = async (sql, params) => ({ rows: [{ id: 'abc', name: 'Student', email: params[0] }] });
  const student = await createStudent();
  assert.equal(student.id, 'abc');
});
