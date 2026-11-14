// backend/routes/applications.js
// Application status endpoints

const express = require('express');
const router = express.Router();
const {
  updateApplicationStatus,
  getApplication,
  createApplication,
  VALID_STATUSES,
} = require('../controllers/applicationController');

// PATCH /api/applications/:collegeId/status
router.patch('/:collegeId/status', async (req, res) => {
  try {
    const { collegeId } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'Status field is required',
        code: 'MISSING_STATUS',
      });
    }

    const updatedApp = await updateApplicationStatus(collegeId, status);

    res.json({
      success: true,
      data: updatedApp,
      message: `Application status updated to ${updatedApp.status}`,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
      code: 'UPDATE_STATUS_ERROR',
    });
  }
});

// GET /api/applications/:collegeId
router.get('/:collegeId', async (req, res) => {
  try {
    const { collegeId } = req.params;

    const app = await getApplication(collegeId);

    res.json({
      success: true,
      data: app,
    });
  } catch (error) {
    res.status(404).json({
      success: false,
      error: error.message,
      code: 'FETCH_ERROR',
    });
  }
});

// POST /api/applications
router.post('/', async (req, res) => {
  try {
    const { studentId, collegeId, deadlineDate } = req.body;

    if (!studentId || !collegeId) {
      return res.status(400).json({
        success: false,
        error: 'studentId and collegeId are required',
        code: 'MISSING_FIELDS',
      });
    }

    const newApp = await createApplication(studentId, collegeId, deadlineDate);

    res.status(201).json({
      success: true,
      data: newApp,
      message: 'Application created successfully',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
      code: 'CREATE_ERROR',
    });
  }
});

module.exports = router;
