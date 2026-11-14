const path = require('path');

// Load environment variables from root .env
require('dotenv').config({ path: './.env' });
// Fallback to backend/config/.env (existing values are not overridden)
require('dotenv').config({ path: path.join(__dirname, 'config', '.env') });

const express = require('express');
const morgan = require('morgan');
const corsMiddleware = require('./middleware/cors');
const errorHandler = require('./middleware/errorHandler');
const { testConnection } = require('./db/connection');

// Import routes
const collegeRoutes = require('./routes/colleges');
const lookupRoutes = require('./routes/lookup');
const applicationRoutes = require('./routes/applications');
const deadlineRoutes = require('./routes/deadlines');

const app = express();
const PORT = process.env.PORT || 3000;

// Request logging: method, path, status, and response time
morgan.token('path', (req) => (req.originalUrl || req.url).split('?')[0]);
app.use(morgan(':method :path :status :response-time ms'));

// Middleware
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

// Register routes
app.use('/api/colleges', collegeRoutes);
app.use('/api/lookup', lookupRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/deadlines', deadlineRoutes);

// 404 handler
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
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  console.log('');
  
  // Test database connection
  await testConnection();
});
