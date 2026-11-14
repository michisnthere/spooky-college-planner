// backend/controllers/studentController.js
// Student records. The browser creates one on first use and keeps its ID in localStorage.

const { randomUUID } = require('crypto');
const { query } = require('../db/connection');

// Creates a student row. The email is a unique placeholder, because the app has no sign-in yet.
const createStudent = async () => {
  try {
    const result = await query(
      'INSERT INTO students (email, name) VALUES ($1, $2) RETURNING id, name, created_at',
      [`anonymous-${randomUUID()}@students.local`, 'Student']
    );
    return result.rows[0];
  } catch (error) {
    throw new Error(`Failed to create student: ${error.message}`);
  }
};

module.exports = {
  createStudent,
};
