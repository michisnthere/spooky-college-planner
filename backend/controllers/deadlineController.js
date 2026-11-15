// backend/controllers/deadlineController.js
// Deadline tracking and zombie progress controller

const { query } = require('../db/connection');
const { parseLocalDate, startOfDay, toLocalDay } = require('../utils/dates');

// Calculate days remaining from deadline date to today
const calculateDaysRemaining = (deadlineDate) => {
  if (!deadlineDate) return null;
  
  const today = startOfDay();
  const deadline = toLocalDay(deadlineDate);
  if (!deadline) return null;
  // Round, not ceil: a day across a daylight-saving change is 23 or 25 hours long.
  const daysRemaining = Math.round((deadline - today) / (1000 * 60 * 60 * 24));
  
  return daysRemaining;
};

// Calculate zombie progress (0-100%)
// Progress is based on how much time has passed relative to deadline
const calculateZombieProgress = (deadlineDate) => {
  if (!deadlineDate) return null;
  
  // Assume a standard application cycle (e.g., 365 days from start)
  // For simplicity, we calculate progress based on a 120-day cycle from today
  const TOTAL_DAYS = 120;
  const daysRemaining = calculateDaysRemaining(deadlineDate);
  
  if (daysRemaining === null) return null;
  if (daysRemaining < 0) return 100; // Deadline passed
  
  const daysPassed = TOTAL_DAYS - daysRemaining;
  const progress = Math.max(0, Math.min(100, (daysPassed / TOTAL_DAYS) * 100));
  
  return Math.round(progress);
};

// Get deadline info for a college
const getDeadlineInfo = async (collegeId) => {
  try {
    const result = await query(
      'SELECT id, college_id, deadline_date, status FROM applications WHERE college_id = $1',
      [collegeId]
    );

    if (result.rows.length === 0) {
      throw new Error('Application not found for this college');
    }

    const app = result.rows[0];
    const daysRemaining = calculateDaysRemaining(app.deadline_date);
    const zombieProgress = calculateZombieProgress(app.deadline_date);

    return {
      applicationId: app.id,
      collegeId: app.college_id,
      deadlineDate: app.deadline_date,
      daysRemaining: daysRemaining,
      zombieProgress: zombieProgress,
      status: app.status,
    };
  } catch (error) {
    const wrapped = new Error(`Failed to fetch deadline info: ${error.message}`);
    // Only "no application" and "id is not a UUID" are a missing resource. Any other failure
    // (connection lost, query error) is a server error, so the frontend does not treat it as "no application".
    wrapped.notFound = error.message === 'Application not found for this college' || error.code === '22P02';
    throw wrapped;
  }
};

// Update deadline date
const updateDeadline = async (collegeId, newDeadlineDate) => {
  if (!newDeadlineDate) {
    throw new Error('Deadline date is required');
  }

  // Validate date format and that it's in the future
  const deadline = parseLocalDate(newDeadlineDate);
  if (!deadline) {
    throw new Error('Invalid date format. Use YYYY-MM-DD');
  }
  if (deadline < startOfDay()) {
    throw new Error('Deadline date must be today or later');
  }

  try {
    const result = await query(
      `UPDATE applications 
       SET deadline_date = $1,
           updated_at = NOW()
       WHERE college_id = $2
       RETURNING *`,
      [newDeadlineDate, collegeId]
    );

    if (result.rows.length === 0) {
      throw new Error('Application not found for this college');
    }

    const app = result.rows[0];
    const daysRemaining = calculateDaysRemaining(app.deadline_date);
    const zombieProgress = calculateZombieProgress(app.deadline_date);

    return {
      applicationId: app.id,
      collegeId: app.college_id,
      deadlineDate: app.deadline_date,
      daysRemaining: daysRemaining,
      zombieProgress: zombieProgress,
    };
  } catch (error) {
    throw new Error(`Failed to update deadline: ${error.message}`);
  }
};

module.exports = {
  getDeadlineInfo,
  updateDeadline,
  calculateDaysRemaining,
  calculateZombieProgress,
};
