/**
 * Allow a kiosk to create an enrollment request before an administrator configures it.
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.alterTable('kiosk_enrollment_codes', (table) => {
    table.string('created_by', 36).nullable().alter();
    table.string('software_version', 64).nullable();
  });
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.alterTable('kiosk_enrollment_codes', (table) => {
    table.dropColumn('software_version');
    table.string('created_by', 36).notNullable().alter();
  });
}