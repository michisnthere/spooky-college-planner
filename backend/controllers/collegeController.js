// backend/controllers/collegeController.js
// College management controller

const { query } = require('../db/connection');

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
  if (!name || name.trim() === '') {
    throw new Error('College name is required');
  }

  try {
    const result = await query(
      `INSERT INTO colleges (student_id, name, state, location, acceptance_rate, scorecard_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [studentId, name, state, location, acceptanceRate || null, scorecardId || null]
    );
    return result.rows[0];
  } catch (error) {
    throw new Error(`Failed to add college: ${error.message}`);
  }
};

// Delete a college
const deleteCollege = async (collegeId) => {
  try {
    const result = await query(
      'DELETE FROM colleges WHERE id = $1 RETURNING *',
      [collegeId]
    );
    if (result.rows.length === 0) {
      throw new Error('College not found');
    }
    return result.rows[0];
  } catch (error) {
    throw new Error(`Failed to delete college: ${error.message}`);
  }
};

// Update college details
const updateCollege = async (collegeId, updates) => {
  const { name, state, location, acceptanceRate } = updates;

  try {
    const result = await query(
      `UPDATE colleges 
       SET name = COALESCE($1, name),
           state = COALESCE($2, state),
           location = COALESCE($3, location),
           acceptance_rate = COALESCE($4, acceptance_rate)
       WHERE id = $5
       RETURNING *`,
      [name || null, state || null, location || null, acceptanceRate || null, collegeId]
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
