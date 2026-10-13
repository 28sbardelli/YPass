#!/usr/bin/env node
/**
 * Clear users and hall-pass data while preserving the database schema.
 * Usage: node scripts/db-clear-pass-data.js --confirm
 */

import knexFactory from 'knex';
import knexfile from '../knexfile.js';
import { createSqlJsKnex } from '../src/database/knex-config.js';

if (!process.argv.includes('--confirm')) {
  console.error('Refusing to clear data without the --confirm flag.');
  process.exitCode = 1;
} else {
  const env = process.env.NODE_ENV || 'development';
  const config = knexfile[env] || knexfile.development;
  const provider = process.env.DATABASE_PROVIDER || 'sqlite';
  const knex = provider === 'postgres' ? knexFactory(config) : await createSqlJsKnex(config);

  const tables = [
    'pass_events',
    'passes',
    'kiosk_enrollment_codes',
    'appointments',
    'kiosks',
    'locations',
    'students',
    'users',
  ];

  try {
    const deleted = await knex.transaction(async (transaction) => {
      const counts = {};
      for (const table of tables) {
        counts[table] = await transaction(table).del();
      }
      return counts;
    });

    for (const table of tables) {
      console.log(`Deleted ${deleted[table]} row(s) from ${table}.`);
    }
    console.log('Selected user and hall-pass data cleared.');
  } finally {
    await knex.destroy();
  }
}
