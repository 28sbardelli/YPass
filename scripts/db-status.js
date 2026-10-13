#!/usr/bin/env node
import knexFactory from 'knex';
import knexfile from '../knexfile.js';
import { createSqlJsKnex } from '../src/database/knex-config.js';

const env = process.env.NODE_ENV || 'development';
const config = knexfile[env] || knexfile.development;
const provider = process.env.DATABASE_PROVIDER || 'sqlite';
const knex = provider === 'postgres' ? knexFactory(config) : await createSqlJsKnex(config);
try {
  const [completed, pending] = await knex.migrate.list();
  console.log('Completed migrations:');
  for (const item of completed) {
    console.log(
      `  - ${typeof item === 'string' ? item : item.name || item.file || JSON.stringify(item)}`,
    );
  }
  console.log('Pending migrations:');
  for (const item of pending) {
    console.log(
      `  - ${typeof item === 'string' ? item : item.file || item.name || JSON.stringify(item)}`,
    );
  }
} finally {
  await knex.destroy();
}
