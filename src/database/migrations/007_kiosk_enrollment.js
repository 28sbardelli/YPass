/**
 * Add server-managed kiosk types and one-time enrollment codes.
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.alterTable('kiosks', (table) => {
    table.string('type', 32).notNullable().defaultTo('ROUND_TRIP');
    table.timestamp('last_seen_at').nullable();
  });

  await knex.schema.createTable('kiosk_enrollment_codes', (table) => {
    table.string('id', 36).primary();
    table.string('code_hash', 64).notNullable().unique();
    table.timestamp('expires_at').notNullable();
    table.timestamp('used_at').nullable();
    table.string('created_by', 36).notNullable().references('id').inTable('users').onDelete('RESTRICT');
    table.string('name', 120).nullable();
    table.string('location_id', 36).nullable().references('id').inTable('locations').onDelete('RESTRICT');
    table.string('type', 32).notNullable().defaultTo('ROUND_TRIP');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.index(['expires_at', 'used_at']);
  });
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('kiosk_enrollment_codes');
  await knex.schema.alterTable('kiosks', (table) => {
    table.dropColumn('last_seen_at');
    table.dropColumn('type');
  });
}