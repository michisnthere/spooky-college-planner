// Load environment variables
require('dotenv').config({ path: './backend/config/.env' });

const express = require('express');
const cors = require('cors');
const { testConnection } = require('./backend/db/connection');

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

// Start server and test database connection
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  console.log('');
  
  // Test database connection
  await testConnection();
});
