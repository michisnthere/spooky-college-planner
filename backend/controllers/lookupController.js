// backend/controllers/lookupController.js
// College Scorecard API lookup controller

const axios = require('axios');

const SCORECARD_API_URL = 'https://api.data.gov/ed/collegescorecard/v1/schools';
const API_KEY = process.env.COLLEGE_SCORECARD_API_KEY;

// Search colleges by name using College Scorecard API
const searchCollege = async (collegeName) => {
  if (!collegeName || collegeName.trim() === '') {
    throw new Error('College name is required');
  }

  if (!API_KEY || API_KEY === 'your_api_key_here') {
    throw new Error('College Scorecard API key not configured or invalid');
  }

  try {
    console.log(`[Lookup] Searching for: ${collegeName}`);
    console.log(`[Lookup] Using API URL: ${SCORECARD_API_URL}`);

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

    console.log(`[Lookup] API Response status: ${response.status}`);
    console.log(`[Lookup] Response has results property: ${!!response.data.results}`);

    if (!response.data.results || response.data.results.length === 0) {
      console.log(`[Lookup] No results found for: ${collegeName}`);
      return [];
    }

    // Parse and format results
    const colleges = response.data.results.map(college => {
      const admissionRate = college['latest.admissions.admission_rate'];
      return {
        id: college.id,
        name: college['school.name'],
        state: college['school.state'],
        city: college['school.city'],
        acceptanceRate: admissionRate !== null ? (admissionRate * 100).toFixed(2) : null,
        scorecardId: college.id,
      };
    });

    console.log(`[Lookup] Found ${colleges.length} results`);
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
};
