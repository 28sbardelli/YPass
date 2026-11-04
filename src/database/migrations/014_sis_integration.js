/** @param {import('knex').Knex} knex */
export async function up(knex) {
  await knex.schema.createTable('sis_connections', (table) => {
    table.string('id', 36).primary();
    table.string('provider', 64).notNullable();
    table.string('connection_name', 120).notNullable();
    table.text('configuration_json').notNullable();
    table.text('credentials_encrypted').nullable();
    table.boolean('active').notNullable().defaultTo(true);
    table.integer('sync_interval_seconds').notNullable().defaultTo(0);
    table.timestamp('last_synced_at').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.unique(['connection_name']);
    table.index(['provider', 'active']);
  });

  await knex.schema.alterTable('students', (table) => {
    table
      .string('sis_connection_id', 36)
      .nullable()
      .references('id')
      .inTable('sis_connections')
      .onDelete('SET NULL');
    table.string('sis_student_id', 128).nullable();
    table.string('first_name', 120).nullable();
    table.string('last_name', 120).nullable();
    table.index(['sis_connection_id']);
    table.unique(['sis_connection_id', 'sis_student_id']);
  });

  await knex.schema.createTable('sis_sync_history', (table) => {
    table.string('id', 36).primary();
    table
      .string('connection_id', 36)
      .notNullable()
      .references('id')
      .inTable('sis_connections')
      .onDelete('CASCADE');
    table.string('status', 32).notNullable();
    table.timestamp('started_at').notNullable();
    table.timestamp('completed_at').nullable();
    table.integer('retrieved').notNullable().defaultTo(0);
    table.integer('created').notNullable().defaultTo(0);
    table.integer('updated').notNullable().defaultTo(0);
    table.integer('deactivated').notNullable().defaultTo(0);
    table.integer('skipped').notNullable().defaultTo(0);
    table.integer('errors').notNullable().defaultTo(0);
    table.text('error_message').nullable();
    table.index(['connection_id', 'started_at']);
  });
  await knex.raw(
    "CREATE UNIQUE INDEX sis_one_running_per_connection ON sis_sync_history (connection_id) WHERE status = 'running'",
  );
}

/** @param {import('knex').Knex} knex */
export async function down(knex) {
  await knex.raw('DROP INDEX IF EXISTS sis_one_running_per_connection');
  await knex.schema.dropTableIfExists('sis_sync_history');
  await knex.schema.alterTable('students', (table) => {
    table.dropUnique(['sis_connection_id', 'sis_student_id']);
    table.dropIndex(['sis_connection_id']);
    table.dropColumn('last_name');
    table.dropColumn('first_name');
    table.dropColumn('sis_student_id');
    table.dropColumn('sis_connection_id');
  });
  await knex.schema.dropTableIfExists('sis_connections');
}
