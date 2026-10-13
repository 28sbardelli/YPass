/**
 * Store kiosk authentication material and operational heartbeat data.
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.alterTable('kiosks', (table) => {
    table.string('secret_hash', 64).nullable();
    table.timestamp('last_seen').nullable();
    table.string('software_version', 64).nullable();
  });
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.alterTable('kiosks', (table) => {
    table.dropColumn('software_version');
    table.dropColumn('last_seen');
    table.dropColumn('secret_hash');
  });
}
