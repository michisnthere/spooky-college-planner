// backend/db/init.js
// Initialize database with schema

require('dotenv').config({ path: './.env' });
const fs = require('fs');
const path = require('path');
const { pool } = require('./connection');

const initDatabase = async () => {
  try {
    console.log('Initializing database...');
    
    // Read schema file
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Execute schema
    await pool.query(schema);
    
    console.log('? Database initialized successfully');
    console.log('? Tables created: students, colleges, applications');
    console.log('? Indexes created for performance');
    
  } catch (error) {
    console.error('? Error initializing database:');
    console.error(`  ${error.message}`);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
};

initDatabase();
