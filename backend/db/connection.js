// backend/db/connection.js
// PostgreSQL connection pool setup

const { Pool } = require('pg');
require('dotenv').config({ path: './.env' });

// Create connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,                    // Maximum number of clients in pool
  idleTimeoutMillis: 30000,   // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return error after 2 seconds if unable to connect
});

// Handle pool errors
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
});

// Test query function
const testConnection = async () => {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('? Database connection successful');
    console.log(`  Connected to: ${process.env.DATABASE_URL}`);
    console.log(`  Current time: ${result.rows[0].now}`);
    return true;
  } catch (error) {
    console.error('? Database connection failed');
    console.error(`  Error: ${error.message}`);
    return false;
  }
};

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  testConnection,
};
