/**
 * Associate an enrollment code with an existing kiosk for credential rotation.
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.alterTable('kiosk_enrollment_codes', (table) => {
    table.string('kiosk_id', 36).nullable().references('id').inTable('kiosks').onDelete('CASCADE');
  });
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.alterTable('kiosk_enrollment_codes', (table) => {
    table.dropColumn('kiosk_id');
  });
}