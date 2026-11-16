// backend/controllers/studentController.js
// Student records. The browser creates one on first use and keeps its ID in localStorage.

const { randomUUID } = require('crypto');
const { query } = require('../db/connection');

// Some connection failures (for example "localhost" refused on both IPv6 and IPv4) arrive as an
// AggregateError with an empty message. Fall back to the inner errors, then to the error code.
const describeError = (error) =>
  error.message ||
  (Array.isArray(error.errors) && error.errors.map((e) => e.message || e.code).filter(Boolean).join('; ')) ||
  error.code ||
  'database error';

// Creates a student row. The email is a unique placeholder, because the app has no sign-in yet.
const createStudent = async () => {
  try {
    const result = await query(
      'INSERT INTO students (email, name) VALUES ($1, $2) RETURNING id, name, created_at',
      [`anonymous-${randomUUID()}@students.local`, 'Student']
    );
    return result.rows[0];
  } catch (error) {
    // The full error goes to the server log, so the cause shows up in the Render logs.
    console.error('Failed to create student:', error);
    throw new Error(`Failed to create student: ${describeError(error)}`);
  }
};
module.exports = {
  createStudent,
};
