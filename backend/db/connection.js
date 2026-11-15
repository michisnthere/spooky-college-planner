// backend/db/connection.js
// PostgreSQL connection pool setup

const { Pool } = require('pg');
require('dotenv').config({ path: './.env' });

// DATABASE_SSL controls TLS to the database. Unset or false: no TLS (local development).
//   true / 1 / require: TLS without checking the server certificate (hosted databases such as Render).
//   verify: TLS and the certificate must be valid.
const parseSslOption = (value = process.env.DATABASE_SSL) => {
  const setting = String(value ?? '').trim().toLowerCase();
  if (['true', '1', 'yes', 'on', 'require'].includes(setting)) return { rejectUnauthorized: false };
  if (setting === 'verify') return { rejectUnauthorized: true };
  return false;
};

// Create connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: parseSslOption(),
  max: 20,                    // Maximum number of clients in pool
  idleTimeoutMillis: 30000,   // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return error after 2 seconds if unable to connect
});

// Handle pool errors
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
});

// Host and database name only. Never print the full URL, it holds the password.
const describeTarget = () => {
  try {
    const url = new URL(process.env.DATABASE_URL);
    return `${url.hostname}/${url.pathname.replace(/^\//, '')}`;
  } catch {
    return '(DATABASE_URL not set or invalid)';
  }
};
// Test query function
const testConnection = async () => {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('? Database connection successful');
    console.log(`  Connected to: ${describeTarget()}`);
    console.log(`  Current time: ${result.rows[0].now}`);
    return true;
  } catch (error) {
    console.error('? Database connection failed');
    console.error(`  Error: ${error.message}`);
    return false;
  }
};

module.exports = {
  describeTarget,
  parseSslOption,
  pool,
  query: (text, params) => pool.query(text, params),
  testConnection,
};
