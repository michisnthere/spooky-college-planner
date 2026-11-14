// backend/db/testConnection.js
// Simple test script to verify database connectivity

require('dotenv').config({ path: './backend/config/.env' });
const { testConnection, describeTarget } = require('./connection');

console.log('Testing database connection...');
console.log(`Database: ${describeTarget()}`);
console.log('');

testConnection().then(success => {
  process.exit(success ? 0 : 1);
});
