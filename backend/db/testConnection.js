// backend/db/testConnection.js
// Simple test script to verify database connectivity

require('dotenv').config({ path: './backend/config/.env' });
const { testConnection } = require('./connection');

console.log('Testing database connection...');
console.log(`DATABASE_URL: ${process.env.DATABASE_URL}`);
console.log('');

testConnection().then(success => {
  process.exit(success ? 0 : 1);
});
