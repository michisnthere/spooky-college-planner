// backend/middleware/security.js
// Security headers (helmet) and rate limits (express-rate-limit) for a public deploy.
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');

const isProduction = () => process.env.NODE_ENV === 'production';

// Reads a positive integer from the environment, or returns the fallback.
const intFromEnv = (name, fallback) => {
  const value = Number.parseInt(process.env[name], 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

// The app loads only its own scripts and styles, so everything stays on 'self'.
// style-src keeps 'unsafe-inline' because the UI sets inline style attributes at runtime.
// upgrade-insecure-requests is production only, so http://localhost keeps working in development.
const securityHeaders = () =>
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:'],
        'font-src': ["'self'"],
        'connect-src': ["'self'"],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
        ...(isProduction() ? { 'upgrade-insecure-requests': [] } : {}),
      },
    },
  });

// Standard error envelope with code RATE_LIMITED.
const limitHandler = (req, res) => {
  res.status(429).json({
    success: false,
    error: 'Too many requests. Please wait a moment and try again.',
    code: 'RATE_LIMITED',
  });
};

const makeLimiter = (max, windowMs) =>
  rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: limitHandler,
  });

// Limits are read when the app starts. Defaults are per client IP.
const createLimiters = () => {
  const windowMs = intFromEnv('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000);
  return {
    // Every /api route except the health check.
    general: makeLimiter(intFromEnv('RATE_LIMIT_MAX', 300), windowMs),
    // Proxies the College Scorecard API, which has its own quota.
    lookup: makeLimiter(intFromEnv('RATE_LIMIT_LOOKUP_MAX', 60), windowMs),
    // Creating a student is the only unauthenticated write that makes new data.
    students: makeLimiter(intFromEnv('RATE_LIMIT_STUDENTS_MAX', 10), intFromEnv('RATE_LIMIT_STUDENTS_WINDOW_MS', 60 * 60 * 1000)),
  };
};

module.exports = { securityHeaders, createLimiters, intFromEnv };
