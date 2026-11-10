/**
 * Allow manager deletion to preserve records while clearing their location or kiosk links.
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.alterTable('kiosks', (table) => {
    table.string('location_id', 36).nullable().alter();
  });
  await knex.schema.alterTable('passes', (table) => {
    table.string('origin_location_id', 36).nullable().alter();
    table.string('origin_kiosk_id', 36).nullable().alter();
    table.string('destination_location_id', 36).nullable().alter();
  });
  await knex.schema.alterTable('appointments', (table) => {
    table.string('origin_location_id', 36).nullable().alter();
    table.string('destination_location_id', 36).nullable().alter();
  });
}

/**
 * Rollback is only safe while no records have been left unassigned.
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  const nullableReferences = [
    ['kiosks', 'location_id'],
    ['passes', 'origin_location_id'],
    ['passes', 'origin_kiosk_id'],
    ['passes', 'destination_location_id'],
    ['appointments', 'origin_location_id'],
    ['appointments', 'destination_location_id'],
  ];

  for (const [tableName, columnName] of nullableReferences) {
    const [{ count }] = await knex(tableName).whereNull(columnName).count({ count: '*' });
    if (Number(count) > 0) {
      throw new Error(
        `Cannot restore ${tableName}.${columnName} to required while unassigned references exist`,
      );
    }
  }

  await knex.schema.alterTable('kiosks', (table) => {
    table.string('location_id', 36).notNullable().alter();
  });
  await knex.schema.alterTable('passes', (table) => {
    table.string('origin_location_id', 36).notNullable().alter();
    table.string('origin_kiosk_id', 36).notNullable().alter();
    table.string('destination_location_id', 36).notNullable().alter();
  });
  await knex.schema.alterTable('appointments', (table) => {
    table.string('origin_location_id', 36).notNullable().alter();
    table.string('destination_location_id', 36).notNullable().alter();
  });
}
