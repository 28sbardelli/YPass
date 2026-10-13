/**
 * Kiosk journey behavior belongs to its assigned location.
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.alterTable('kiosk_enrollment_codes', (table) => {
    table.dropColumn('type');
  });
  await knex.schema.alterTable('kiosks', (table) => {
    table.dropColumn('type');
  });
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.alterTable('kiosks', (table) => {
    table.string('type', 32).notNullable().defaultTo('ROUND_TRIP');
  });
  await knex.schema.alterTable('kiosk_enrollment_codes', (table) => {
    table.string('type', 32).notNullable().defaultTo('ROUND_TRIP');
  });
}