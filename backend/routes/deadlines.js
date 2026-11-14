// backend/routes/deadlines.js
// Deadline tracking endpoints

const express = require('express');
const router = express.Router();
const {
  getDeadlineInfo,
  updateDeadline,
} = require('../controllers/deadlineController');

// GET /api/deadlines/:collegeId
router.get('/:collegeId', async (req, res) => {
  try {
    const { collegeId } = req.params;

    if (!collegeId) {
      return res.status(400).json({
        success: false,
        error: 'collegeId parameter is required',
        code: 'MISSING_COLLEGE_ID',
      });
    }

    const deadlineInfo = await getDeadlineInfo(collegeId);

    res.json({
      success: true,
      data: deadlineInfo,
    });
  } catch (error) {
    res.status(404).json({
      success: false,
      error: error.message,
      code: 'FETCH_ERROR',
    });
  }
});

// PATCH /api/deadlines/:collegeId
router.patch('/:collegeId', async (req, res) => {
  try {
    const { collegeId } = req.params;
    const { deadlineDate } = req.body;

    if (!deadlineDate) {
      return res.status(400).json({
        success: false,
        error: 'deadlineDate is required',
        code: 'MISSING_DEADLINE',
      });
    }

    const updatedDeadline = await updateDeadline(collegeId, deadlineDate);

    res.json({
      success: true,
      data: updatedDeadline,
      message: 'Deadline updated successfully',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
      code: 'UPDATE_ERROR',
    });
  }
});

module.exports = router;
