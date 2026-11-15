// backend/db/migrate-unique-application.js
// One-time migration (task 32): keeps the newest application per college and adds a unique index on
// applications.college_id. The removed rows are saved to a JSON file in the temp folder first.
// Safe to run again. Run: node backend/db/migrate-unique-application.js
// Add --report to only list duplicates and change nothing.
require('dotenv').config({ path: './.env' });
require('dotenv').config({ path: './backend/config/.env' });
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pool, describeTarget } = require('./connection');

const DUPLICATES_SQL = `
  SELECT * FROM (
    SELECT a.*, ROW_NUMBER() OVER (
      PARTITION BY college_id ORDER BY created_at DESC NULLS LAST, updated_at DESC NULLS LAST, id DESC
    ) AS rn
    FROM applications a
  ) ranked WHERE rn > 1`;

const run = async () => {
  const reportOnly = process.argv.includes('--report');
  const client = await pool.connect();
  try {
    console.log(`Database: ${describeTarget()}`);
    const before = await client.query('SELECT COUNT(*)::int AS n FROM applications');
    console.log(`applications rows before: ${before.rows[0].n}`);

    const groups = await client.query(
      'SELECT college_id, COUNT(*)::int AS n FROM applications GROUP BY college_id HAVING COUNT(*) > 1'
    );
    console.log(`colleges with more than one application: ${groups.rows.length}`);
    for (const g of groups.rows) console.log(`  college ${g.college_id}: ${g.n} rows`);
    if (reportOnly) return;

    const extra = await client.query(DUPLICATES_SQL);
    if (extra.rows.length > 0) {
      const backupFile = path.join(os.tmpdir(), `applications-duplicates-backup-${Date.now()}.json`);
      fs.writeFileSync(backupFile, JSON.stringify(extra.rows.map(({ rn, ...row }) => row), null, 2));
      console.log(`removed rows saved to: ${backupFile}`);
    }

    await client.query('BEGIN');
    const removed = await client.query(
      `DELETE FROM applications WHERE id IN (SELECT id FROM (${DUPLICATES_SQL}) d)`
    );
    await client.query('CREATE UNIQUE INDEX IF NOT EXISTS uq_applications_college_id ON applications(college_id)');
    const after = await client.query('SELECT COUNT(*)::int AS n FROM applications');
    if (before.rows[0].n - removed.rowCount !== after.rows[0].n) throw new Error('Row count mismatch, rolling back');
    await client.query('COMMIT');
    console.log(`duplicate rows removed: ${removed.rowCount}`);
    console.log(`applications rows after: ${after.rows[0].n}`);
    console.log('unique index uq_applications_college_id is in place');
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
