// backend/controllers/applicationController.js
// Application status tracking controller

const { query } = require('../db/connection');

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
           submitted_at = CASE WHEN $1 = $2 THEN NOW() ELSE submitted_at END,
           updated_at = NOW()
       WHERE college_id = $3
       RETURNING *`,
      [normalizedStatus, 'submitted', collegeId]
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

// Create application for a college
const createApplication = async (studentId, collegeId, deadlineDate) => {
  try {
    const result = await query(
      `INSERT INTO applications (student_id, college_id, status, deadline_date)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [studentId, collegeId, 'pending', deadlineDate || null]
    );

    return result.rows[0];
  } catch (error) {
    throw new Error(`Failed to create application: ${error.message}`);
  }
};

module.exports = {
  updateApplicationStatus,
  getApplication,
  createApplication,
  VALID_STATUSES,
};
