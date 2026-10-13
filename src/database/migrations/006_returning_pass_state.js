/**
 * Include returning round-trip passes in the one-active-pass constraint.
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.raw('DROP INDEX IF EXISTS passes_one_active_per_student');
  await knex.raw(
    "CREATE UNIQUE INDEX passes_one_active_per_student ON passes (student_id) WHERE status IN ('pending_approval', 'active', 'arrived', 'returning')",
  );
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.raw('DROP INDEX IF EXISTS passes_one_active_per_student');
  await knex.raw(
    "CREATE UNIQUE INDEX passes_one_active_per_student ON passes (student_id) WHERE status IN ('pending_approval', 'active', 'arrived')",
  );
}
