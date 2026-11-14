// backend/controllers/collegeController.js
// College management controller

const { query, pool } = require('../db/connection');
const { normalizeState } = require('../utils/states');

const INVALID_STATE_MESSAGE = 'State must be a US state or territory, such as Massachusetts or MA';

// A blank state is allowed and stored as null. A code or name is stored as the full name.
// Anything else is rejected, so the column never holds free text.
const resolveState = (state) => {
  if (state === undefined || state === null || String(state).trim() === '') return null;
  const full = normalizeState(state);
  if (!full) throw new Error(INVALID_STATE_MESSAGE);
  return full;
};

// Get all colleges for a student
const getAllColleges = async (studentId) => {
  try {
    const result = await query(
      'SELECT * FROM colleges WHERE student_id = $1 ORDER BY created_at DESC',
      [studentId]
    );
    return result.rows;
  } catch (error) {
    throw new Error(`Failed to fetch colleges: ${error.message}`);
  }
};

// Add a new college
const addCollege = async (studentId, collegeData) => {
  const { name, state, location, acceptanceRate, scorecardId } = collegeData;

  // Validation
  if (typeof name !== 'string' || name.trim() === '') {
    throw new Error('College name is required');
  }

  // Duplicate check per student, ignoring case and outer spaces (design 8.2)
  let existing;
  try {
    existing = await query(
      'SELECT id FROM colleges WHERE student_id = $1 AND LOWER(TRIM(name)) = LOWER($2) LIMIT 1',
      [studentId, name.trim()]
    );
  } catch (error) {
    throw new Error(`Failed to check for duplicate college: ${error.message}`);
  }
  if (existing.rows.length > 0) {
    const duplicate = new Error('This college is already in your graveyard.');
    duplicate.code = 'DUPLICATE_COLLEGE';
    throw duplicate;
  }

  const fullState = resolveState(state);
  try {
    const result = await query(
      `INSERT INTO colleges (student_id, name, state, location, acceptance_rate, scorecard_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [studentId, name, fullState, location, acceptanceRate || null, scorecardId || null]
    );
    return result.rows[0];
  } catch (error) {
    throw new Error(`Failed to add college: ${error.message}`);
  }
};

// Delete a college
// The application row goes in the same transaction. The schema also cascades (ON DELETE CASCADE),
// but deleting it here keeps the result the same on a database created without the cascade.
const deleteCollege = async (collegeId) => {
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query('DELETE FROM applications WHERE college_id = $1', [collegeId]);
    const result = await client.query(
      'DELETE FROM colleges WHERE id = $1 RETURNING *',
      [collegeId]
    );
    if (result.rows.length === 0) {
      throw new Error('College not found');
    }
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    throw new Error(`Failed to delete college: ${error.message}`);
  } finally {
    if (client) client.release();
  }
};

// Update college details
const updateCollege = async (collegeId, updates) => {
  const { name, state, location, acceptanceRate } = updates;
  const fullState = resolveState(state);
  try {
    const result = await query(
      `UPDATE colleges 
       SET name = COALESCE($1, name),
           state = COALESCE($2, state),
           location = COALESCE($3, location),
           acceptance_rate = COALESCE($4, acceptance_rate)
       WHERE id = $5
       RETURNING *`,
      [name || null, fullState, location || null, acceptanceRate || null, collegeId]
    );
    if (result.rows.length === 0) {
      throw new Error('College not found');
    }
    return result.rows[0];
  } catch (error) {
    throw new Error(`Failed to update college: ${error.message}`);
  }
};

module.exports = {
  getAllColleges,
  addCollege,
  deleteCollege,
  updateCollege,
};
