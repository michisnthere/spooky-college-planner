const path = require('path');

// Load environment variables from root .env
require('dotenv').config({ path: './.env' });
// Fallback to backend/config/.env (existing values are not overridden)
require('dotenv').config({ path: path.join(__dirname, 'config', '.env') });

const express = require('express');
const morgan = require('morgan');
const corsMiddleware = require('./middleware/cors');
const { securityHeaders, createLimiters } = require('./middleware/security');
const errorHandler = require('./middleware/errorHandler');
const { testConnection } = require('./db/connection');

// Import routes
const collegeRoutes = require('./routes/colleges');
const lookupRoutes = require('./routes/lookup');
const applicationRoutes = require('./routes/applications');
const deadlineRoutes = require('./routes/deadlines');
const studentRoutes = require('./routes/students');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';
const isProduction = process.env.NODE_ENV === 'production';

// Render puts one proxy in front of the app. Trusting it makes req.ip the real client IP,
// which the rate limiters need. Only enabled in production, where that proxy exists.
if (isProduction) {
  app.set('trust proxy', 1);
}

// Request logging: method, path, status, and response time
morgan.token('path', (req) => (req.originalUrl || req.url).split('?')[0]);
app.use(morgan(':method :path :status :response-time ms'));

// Middleware
app.use(securityHeaders());
app.use(corsMiddleware);
app.use(express.json());

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'Server is running', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV 
  });
});

// Rate limits. The health check is registered above, so Render's probe is never limited.
const limiters = createLimiters();
app.use('/api', limiters.general);

// Register routes
app.use('/api/colleges', collegeRoutes);
app.use('/api/lookup', limiters.lookup, lookupRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/deadlines', deadlineRoutes);
app.post('/api/students', limiters.students);
app.use('/api/students', studentRoutes);

// Unknown /api paths return the JSON 404 envelope, never index.html
app.use('/api', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    code: 'NOT_FOUND',
  });
});

// Frontend: static files, registered after the /api routes. index.html is served at /.
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// 404 handler for everything else
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    code: 'NOT_FOUND',
  });
});

// Error handler middleware (must be registered last)
app.use(errorHandler);

// Start server and test database connection
app.listen(PORT, HOST, async () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  console.log('');

  // Test database connection
  const connected = await testConnection();
  // In production a server with no database cannot do anything useful, so exit and let the host restart it.
  if (!connected && isProduction) {
    console.error('Exiting: the database connection failed in production.');
    process.exit(1);
  }
});