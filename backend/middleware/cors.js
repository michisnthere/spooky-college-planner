// backend/middleware/cors.js
// Allows cross-origin requests only from the origins listed in CORS_ORIGIN.

const cors = require('cors');

// CORS_ORIGIN is a comma-separated list, e.g. "http://localhost:5500,http://127.0.0.1:5500"
const getAllowedOrigins = () =>
  (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const corsMiddleware = cors({
  origin: (origin, callback) => {
    // No Origin header (curl, server-to-server, same-origin requests): allow through.
    if (!origin) {
      return callback(null, true);
    }
    // Disallowed origins get no Access-Control-Allow-Origin header, so the browser blocks the response.
    return callback(null, getAllowedOrigins().includes(origin));
  },
});

module.exports = corsMiddleware;
