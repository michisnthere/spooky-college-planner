// backend/routes/colleges.js
// College endpoints

const express = require('express');
const router = express.Router();
const {
  getAllColleges,
  addCollege,
  deleteCollege,
  updateCollege,
} = require('../controllers/collegeController');

// GET /api/colleges?studentId=X
router.get('/', async (req, res) => {
  try {
    const { studentId } = req.query;

    if (!studentId) {
      return res.status(400).json({
        success: false,
        error: 'studentId query parameter is required',
        code: 'MISSING_STUDENT_ID',
      });
    }

    const colleges = await getAllColleges(studentId);
    res.json({
      success: true,
      data: colleges,
      count: colleges.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'FETCH_ERROR',
    });
  }
});

// POST /api/colleges
router.post('/', async (req, res) => {
  try {
    const { studentId, name, state, location, acceptanceRate, scorecardId } = req.body;

    if (!studentId) {
      return res.status(400).json({
        success: false,
        error: 'studentId is required',
        code: 'MISSING_STUDENT_ID',
      });
    }

    const collegeData = { name, state, location, acceptanceRate, scorecardId };
    const newCollege = await addCollege(studentId, collegeData);

    res.status(201).json({
      success: true,
      data: newCollege,
      message: 'College added successfully',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
      code: 'ADD_ERROR',
    });
  }
});

// DELETE /api/colleges/:collegeId
router.delete('/:collegeId', async (req, res) => {
  try {
    const { collegeId } = req.params;

    const deletedCollege = await deleteCollege(collegeId);

    res.json({
      success: true,
      data: deletedCollege,
      message: 'College deleted successfully',
    });
  } catch (error) {
    res.status(404).json({
      success: false,
      error: error.message,
      code: 'DELETE_ERROR',
    });
  }
});

// PATCH /api/colleges/:collegeId
router.patch('/:collegeId', async (req, res) => {
  try {
    const { collegeId } = req.params;
    const updates = req.body;

    const updatedCollege = await updateCollege(collegeId, updates);

    res.json({
      success: true,
      data: updatedCollege,
      message: 'College updated successfully',
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
