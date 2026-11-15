// backend/controllers/applicationController.js
// Application status tracking controller

const { query } = require('../db/connection');
const { parseLocalDate, startOfDay } = require('../utils/dates');

// Checks an optional deadline. A missing deadline is allowed. Today is allowed, a past day is not
// (design 8.1, kept as "today or later" to match the add-college form).
const validateDeadline = (deadlineDate) => {
  if (deadlineDate === undefined || deadlineDate === null || deadlineDate === '') return;
  const deadline = parseLocalDate(deadlineDate);
  if (!deadline) {
    throw new Error('Invalid date format. Use YYYY-MM-DD');
  }
  if (deadline < startOfDay()) {
    throw new Error('Deadline date must be today or later');
  }
};

// Valid application statuses
const VALID_STATUSES = ['pending', 'submitted', 'accepted', 'rejected', 'waitlisted'];

// Update application status
const updateApplicationStatus = async (collegeId, status) => {
  // Validate status
  if (!status || !VALID_STATUSES.includes(status.toLowerCase())) {
    throw new Error(`Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  try {
    const normalizedStatus = status.toLowerCase();

    const result = await query(
      `UPDATE applications 
       SET status = $1,
           submitted_at = CASE WHEN $2 = 'submitted' THEN NOW() ELSE submitted_at END,
           updated_at = NOW()
       WHERE college_id = $3
       RETURNING *`,
      [normalizedStatus, normalizedStatus, collegeId]
    );

    if (result.rows.length === 0) {
      throw new Error('Application not found for this college');
    }

    return result.rows[0];
  } catch (error) {
    throw new Error(`Failed to update application status: ${error.message}`);
  }
};

// Get application details
const getApplication = async (collegeId) => {
  try {
    const result = await query(
      'SELECT * FROM applications WHERE college_id = $1',
      [collegeId]
    );

    if (result.rows.length === 0) {
      throw new Error('Application not found for this college');
    }

    return result.rows[0];
  } catch (error) {
    throw new Error(`Failed to fetch application: ${error.message}`);
  }
};

const duplicateError = () => {
  const error = new Error('An application already exists for this college.');
  error.status = 409;
  error.code = 'DUPLICATE_APPLICATION';
  return error;
};

// Create application for a college
const createApplication = async (studentId, collegeId, deadlineDate) => {
  validateDeadline(deadlineDate);
  try {
    // ON CONFLICT covers a second request for the same college. The unique index also decides a race.
    const result = await query(
      `INSERT INTO applications (student_id, college_id, status, deadline_date)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (college_id) DO NOTHING
       RETURNING *`,
      [studentId, collegeId, 'pending', deadlineDate || null]
    );

    if (result.rows.length === 0) throw duplicateError();
    return result.rows[0];
  } catch (error) {
    if (error.code === 'DUPLICATE_APPLICATION' || error.code === '23505') throw duplicateError();
    throw new Error(`Failed to create application: ${error.message}`);
  }
};

module.exports = {
  updateApplicationStatus,
  getApplication,
  createApplication,
  VALID_STATUSES,
};
