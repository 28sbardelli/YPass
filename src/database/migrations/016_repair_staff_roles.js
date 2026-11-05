import { up as restoreStaffRoles } from './015_restore_staff_roles.js';

/**
 * Reapply the staff-role normalization for databases that need reconciliation.
 * The underlying operation is idempotent, so this also safely follows migration 015.
 *
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await restoreStaffRoles(knex);
}

/**
 * This repair does not own separate data that can be safely undone.
 *
 * @param {import('knex').Knex} knex
 */
export async function down() {}