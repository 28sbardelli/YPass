/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.createTable('students', (table) => {
    table.string('id', 36).primary();
    table.string('student_number', 64).notNullable().unique();
    table.string('display_name', 120).notNullable();
    table.string('status', 32).notNullable().defaultTo('active');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('locations', (table) => {
    table.string('id', 36).primary();
    table.string('name', 120).notNullable().unique();
    table.string('type', 32).notNullable();
    table
      .string('teacher_user_id', 36)
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table.boolean('active').notNullable().defaultTo(true);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.index(['teacher_user_id']);
  });

  await knex.schema.createTable('kiosks', (table) => {
    table.string('id', 36).primary();
    table
      .string('location_id', 36)
      .notNullable()
      .references('id')
      .inTable('locations')
      .onDelete('RESTRICT');
    table.string('name', 120).notNullable();
    table.string('kiosk_code', 64).notNullable().unique();
    table.boolean('active').notNullable().defaultTo(true);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.unique(['location_id', 'name']);
    table.index(['location_id']);
  });

  await knex.schema.createTable('passes', (table) => {
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
      .string('origin_kiosk_id', 36)
      .notNullable()
      .references('id')
      .inTable('kiosks')
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
    table.string('journey_type', 32).notNullable();
    table.string('status', 32).notNullable();
    table
      .string('created_by', 36)
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table
      .string('approved_by', 36)
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamp('requested_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('approved_at').nullable();
    table.timestamp('departed_at').nullable();
    table.timestamp('arrived_at').nullable();
    table.timestamp('ended_at').nullable();
    table
      .string('ended_location_id', 36)
      .nullable()
      .references('id')
      .inTable('locations')
      .onDelete('SET NULL');
    table
      .string('ended_kiosk_id', 36)
      .nullable()
      .references('id')
      .inTable('kiosks')
      .onDelete('SET NULL');
    table
      .string('ended_teacher_id', 36)
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamp('timeout_at').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.index(['student_id', 'status']);
    table.index(['status', 'timeout_at']);
  });

  await knex.schema.createTable('pass_events', (table) => {
    table.string('id', 36).primary();
    table
      .string('pass_id', 36)
      .notNullable()
      .references('id')
      .inTable('passes')
      .onDelete('CASCADE');
    table.string('event_type', 32).notNullable();
    table.string('kiosk_id', 36).nullable().references('id').inTable('kiosks').onDelete('SET NULL');
    table
      .string('location_id', 36)
      .nullable()
      .references('id')
      .inTable('locations')
      .onDelete('SET NULL');
    table
      .string('actor_user_id', 36)
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamp('occurred_at').notNullable().defaultTo(knex.fn.now());
    table.text('metadata_json').nullable();
    table.index(['pass_id', 'occurred_at']);
  });

  await knex.raw(
    "CREATE UNIQUE INDEX passes_one_active_per_student ON passes (student_id) WHERE status IN ('pending_approval', 'active', 'arrived', 'returning')",
  );
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.raw('DROP INDEX IF EXISTS passes_one_active_per_student');
  await knex.schema.dropTableIfExists('pass_events');
  await knex.schema.dropTableIfExists('passes');
  await knex.schema.dropTableIfExists('kiosks');
  await knex.schema.dropTableIfExists('locations');
  await knex.schema.dropTableIfExists('students');
}
