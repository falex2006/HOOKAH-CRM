'use strict';

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  const directory = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(directory).filter((file) => file.endsWith('.sql')).sort();
  await client.connect();
  try {
    await client.query('BEGIN');
    for (const file of files) await client.query(fs.readFileSync(path.join(directory, file), 'utf8'));
    await client.query('COMMIT');
    process.stdout.write(`Applied ${files.length} migration(s).\n`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
