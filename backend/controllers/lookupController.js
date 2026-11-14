// backend/controllers/lookupController.js
// College Scorecard API lookup controller

const axios = require('axios');
const { normalizeState } = require('../utils/states');

const SCORECARD_API_URL = 'https://api.data.gov/ed/collegescorecard/v1/schools';
const API_KEY = process.env.COLLEGE_SCORECARD_API_KEY;

// Turns one Scorecard result into the shape the frontend uses. Missing values become null, never
// "NaN" or "undefined", so the frontend can tell which attributes it still needs from the user.
// The state is stored as a full name ("Massachusetts"); an unrecognised code is kept as sent.
const formatCollege = (college) => {
  const admissionRate = college['latest.admissions.admission_rate'];
  const rate = admissionRate != null ? Number(admissionRate) : NaN;
  const rawState = college['school.state'];
  const city = college['school.city'];
  return {
    id: college.id,
    name: college['school.name'],
    state: rawState != null && String(rawState).trim() !== '' ? (normalizeState(rawState) ?? String(rawState).trim()) : null,
    city: city != null && String(city).trim() !== '' ? city : null,
    acceptanceRate: Number.isFinite(rate) ? (rate * 100).toFixed(2) : null,
    scorecardId: college.id,
  };
};

// Search colleges by name using College Scorecard API
const searchCollege = async (collegeName) => {
  if (!collegeName || collegeName.trim() === '') {
    throw new Error('College name is required');
  }

  if (!API_KEY || API_KEY === 'your_api_key_here') {
    throw new Error('College Scorecard API key not configured or invalid');
  }

  try {
    // Query the Scorecard API - note: school.name parameter for filtering
    const response = await axios.get(SCORECARD_API_URL, {
      params: {
        'api_key': API_KEY,
        'school.name': collegeName,
        'fields': 'id,school.name,school.state,school.city,latest.admissions.admission_rate',
        'per_page': 10,
      },
      timeout: 5000,
    });

    if (!response.data.results || response.data.results.length === 0) {
      return [];
    }

    // Parse and format results
    const colleges = response.data.results.map(formatCollege);

    return colleges;
  } catch (error) {
    console.error(`[Lookup] Error: ${error.message}`);
    console.error(`[Lookup] Error response: ${error.response?.data ? JSON.stringify(error.response.data) : 'N/A'}`);
    
    if (error.response?.status === 403) {
      throw new Error('API key is invalid or unauthorized. Please verify your COLLEGE_SCORECARD_API_KEY in .env');
    }
    if (error.response?.status === 400) {
      throw new Error('Invalid search parameters - check the school.name parameter');
    }
    if (error.code === 'ECONNABORTED') {
      throw new Error('API request timeout - try again');
    }
    throw new Error(`College Scorecard API error: ${error.message}`);
  }
};

module.exports = {
  searchCollege,
  formatCollege,
};
