/**
 * Record which appointment initiated a pass.
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.alterTable('appointments', (table) => {
    table.timestamp('used_at').nullable();
  });
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.alterTable('appointments', (table) => {
    table.dropColumn('used_at');
  });
}
