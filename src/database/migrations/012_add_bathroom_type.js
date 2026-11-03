/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.alterTable('locations', (table) => {
    table
      .uuid('bathroom')
      .nullable()
      .references('id')
      .inTable('locations')
      .onDelete('SET NULL');
  });
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.alterTable('locations', (table) => {
    table.dropForeign(['bathroom']);
    table.dropColumn('bathroom');
  });
}