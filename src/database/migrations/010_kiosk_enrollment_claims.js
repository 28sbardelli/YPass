/**
 * Bind pre-registration credential delivery to the kiosk that started it.
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.alterTable('kiosk_enrollment_codes', (table) => {
    table.string('claim_hash', 64).nullable();
  });
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.alterTable('kiosk_enrollment_codes', (table) => {
    table.dropColumn('claim_hash');
  });
}
