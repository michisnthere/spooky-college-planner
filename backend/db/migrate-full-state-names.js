// backend/db/migrate-full-state-names.js
// One-time, non-destructive migration: widens colleges.state to VARCHAR(50) and converts
// two-letter codes to full names. Safe to run again (already-converted rows are left alone).
// Run: node backend/db/migrate-full-state-names.js
require('dotenv').config({ path: './.env' });
require('dotenv').config({ path: './backend/config/.env' });
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pool, describeTarget } = require('./connection');
const { STATE_NAMES } = require('../utils/states');

const run = async () => {
  const client = await pool.connect();
  try {
    console.log(`Database: ${describeTarget()}`);
    const before = await client.query('SELECT COUNT(*)::int AS n FROM colleges');
    console.log(`colleges rows before: ${before.rows[0].n}`);

    // Record the old values, so a mistake can be undone by hand. Kept outside the repo.
    const old = await client.query('SELECT id, state FROM colleges');
    const backupFile = path.join(os.tmpdir(), `colleges-state-backup-${Date.now()}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(old.rows));
    console.log(`state values saved to: ${backupFile}`);

    await client.query('BEGIN');
    await client.query('ALTER TABLE colleges ALTER COLUMN state TYPE VARCHAR(50)');
    let converted = 0;
    for (const [code, name] of Object.entries(STATE_NAMES)) {
      const result = await client.query(
        'UPDATE colleges SET state = $2 WHERE UPPER(TRIM(state)) = $1',
        [code, name]
      );
      converted += result.rowCount;
    }
    const left = await client.query(
      'SELECT COUNT(*)::int AS n FROM colleges WHERE state IS NOT NULL AND LENGTH(TRIM(state)) = 2'
    );
    const after = await client.query('SELECT COUNT(*)::int AS n FROM colleges');
    if (after.rows[0].n !== before.rows[0].n) throw new Error('Row count changed, rolling back');
    await client.query('COMMIT');
    console.log(`rows converted from a code to a full name: ${converted}`);
    console.log(`rows still holding an unknown 2-letter value: ${left.rows[0].n}`);
    console.log(`colleges rows after: ${after.rows[0].n}`);
    const col = await client.query(
      "SELECT character_maximum_length FROM information_schema.columns WHERE table_name = 'colleges' AND column_name = 'state'"
    );
    console.log(`colleges.state max length now: ${col.rows[0].character_maximum_length}`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(`Migration failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
};

run();
