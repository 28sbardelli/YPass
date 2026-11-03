/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.alterTable('locations', (table) => {
    table.boolean('default_location').notNullable().defaultTo(false);
  });
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.alterTable('locations', (table) => {
    table.dropColumn('default_location');
  });
}
