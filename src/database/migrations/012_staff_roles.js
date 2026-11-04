/**
 * Historical migration metadata for an earlier branch that was already applied to
 * the existing database. Keeping this file in the repo prevents Knex from
 * treating the migration directory as corrupt when old SQLite metadata is still
 * present in `knex_migrations`.
 *
 * @param {import('knex').Knex} knex
 */
export async function up() {
  return undefined;
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down() {
  return undefined;
}
