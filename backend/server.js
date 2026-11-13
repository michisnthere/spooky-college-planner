// Load environment variables from root .env
require('dotenv').config({ path: './.env' });

const express = require('express');
const cors = require('cors');
const { testConnection } = require('./db/connection');

// Import routes
const collegeRoutes = require('./routes/colleges');
const lookupRoutes = require('./routes/lookup');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
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

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    code: 'NOT_FOUND',
  });
});

// Error handler middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
  });
});

// Start server and test database connection
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  console.log('');
  
  // Test database connection
  await testConnection();
});
