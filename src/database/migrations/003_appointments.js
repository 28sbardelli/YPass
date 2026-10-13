/**
 * Add scheduled appointments and connect them to passes.
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.createTable('appointments', (table) => {
    table.string('id', 36).primary();
    table
      .string('student_id', 36)
      .notNullable()
      .references('id')
      .inTable('students')
      .onDelete('RESTRICT');
    table
      .string('origin_location_id', 36)
      .notNullable()
      .references('id')
      .inTable('locations')
      .onDelete('RESTRICT');
    table
      .string('destination_location_id', 36)
      .notNullable()
      .references('id')
      .inTable('locations')
      .onDelete('RESTRICT');
    table
      .string('destination_teacher_id', 36)
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table
      .string('created_by', 36)
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table.timestamp('scheduled_at').notNullable();
    table.string('status', 32).notNullable().defaultTo('scheduled');
    table.text('notes').nullable();
    table.timestamp('cancelled_at').nullable();
    table
      .string('cancelled_by', 36)
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.index(['student_id', 'status']);
    table.index(['scheduled_at', 'status']);
  });

  await knex.schema.alterTable('passes', (table) => {
    table
      .string('appointment_id', 36)
      .nullable()
      .references('id')
      .inTable('appointments')
      .onDelete('SET NULL');
    table.index(['appointment_id']);
  });
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.alterTable('passes', (table) => {
    table.dropColumn('appointment_id');
  });
  await knex.schema.dropTableIfExists('appointments');
}
