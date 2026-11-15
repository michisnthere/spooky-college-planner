// backend/middleware/cors.js
// Same-origin requests always work (the frontend is served by this server, so CORS_ORIGIN is optional).
// Other origins are allowed only when listed in CORS_ORIGIN.
const cors = require('cors');

// CORS_ORIGIN is a comma-separated list, e.g. "http://localhost:5500,http://127.0.0.1:5500"
const getAllowedOrigins = () =>
  (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

// True when the Origin header names the host the request was sent to.
const isSameOrigin = (origin, req) => {
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
};

const corsMiddleware = cors((req, callback) => {
  const origin = req.headers.origin;
  // No Origin header (curl, server-to-server, same-origin GET): nothing to decide.
  if (!origin) {
    return callback(null, { origin: true });
  }
  // Disallowed origins get no Access-Control-Allow-Origin header, so the browser blocks the response.
  const allowed = isSameOrigin(origin, req) || getAllowedOrigins().includes(origin);
  return callback(null, { origin: allowed });
});

module.exports = corsMiddleware;
