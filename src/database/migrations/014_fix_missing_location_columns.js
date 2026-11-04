/**
 * Legacy databases created before the bathroom/default-location columns were added
 * may be missing one or both metadata columns. Repair them on startup without
 * rewriting the rest of the schema.
 *
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  if (!(await knex.schema.hasColumn('locations', 'bathroom'))) {
    await knex.schema.alterTable('locations', (table) => {
      table
        .uuid('bathroom')
        .nullable()
        .references('id')
        .inTable('locations')
        .onDelete('SET NULL');
    });
  }

  if (!(await knex.schema.hasColumn('locations', 'default_location'))) {
    await knex.schema.alterTable('locations', (table) => {
      table.boolean('default_location').notNullable().defaultTo(false);
    });
  }
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  if (await knex.schema.hasColumn('locations', 'bathroom')) {
    await knex.schema.alterTable('locations', (table) => {
      table.dropForeign(['bathroom']);
      table.dropColumn('bathroom');
    });
  }

  if (await knex.schema.hasColumn('locations', 'default_location')) {
    await knex.schema.alterTable('locations', (table) => {
      table.dropColumn('default_location');
    });
  }
}
