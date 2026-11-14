// backend/routes/students.js
// Student endpoints

const express = require('express');
const router = express.Router();
const { createStudent } = require('../controllers/studentController');

// POST /api/students
router.post('/', async (req, res) => {
  try {
    const student = await createStudent();

    res.status(201).json({
      success: true,
      data: student,
      message: 'Student created successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'CREATE_ERROR',
    });
  }
});

module.exports = router;
