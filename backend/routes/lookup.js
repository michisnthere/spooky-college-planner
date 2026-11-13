// backend/routes/lookup.js
// College Scorecard API lookup endpoints

const express = require('express');
const router = express.Router();
const { searchCollege } = require('../controllers/lookupController');

// GET /api/lookup/college?name=<collegeName>
router.get('/college', async (req, res) => {
  try {
    const { name } = req.query;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'College name query parameter is required',
        code: 'MISSING_NAME',
      });
    }

    const colleges = await searchCollege(name);

    res.json({
      success: true,
      data: colleges,
      count: colleges.length,
      query: name,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
      code: 'LOOKUP_ERROR',
    });
  }
});

module.exports = router;
