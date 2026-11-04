import { randomUUID } from 'node:crypto';

/**
 * Restore the hall-pass role names while preserving existing assignments.
 *
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await migrateLegacyRole(knex, 'admin', 'manager', 'Hall-pass manager');
  await migrateLegacyRole(knex, 'user', 'student', 'Student account');

  if (!(await knex('roles').where({ name: 'teacher' }).first())) {
    await knex('roles').insert({
      id: randomUUID(),
      name: 'teacher',
      description: 'Teacher account',
    });
  }

  const teacher = await knex('roles').where({ name: 'teacher' }).first();
  const accountPermission = await knex('permissions').where({ name: 'account.self' }).first();
  if (teacher && accountPermission) {
    await knex('role_permissions')
      .insert({ role_id: teacher.id, permission_id: accountPermission.id })
      .onConflict(['role_id', 'permission_id'])
      .ignore();
  }
}

async function migrateLegacyRole(knex, legacyName, currentName, description) {
  const legacy = await knex('roles').where({ name: legacyName }).first();
  if (!legacy) return;

  const current = await knex('roles').where({ name: currentName }).first();
  if (!current) {
    await knex('roles').where({ id: legacy.id }).update({
      name: currentName,
      description,
    });
    return;
  }

  const assignments = await knex('user_roles').where({ role_id: legacy.id });
  if (assignments.length) {
    await knex('user_roles')
      .insert(assignments.map(({ user_id }) => ({ user_id, role_id: current.id })))
      .onConflict(['user_id', 'role_id'])
      .ignore();
  }
  await knex('user_roles').where({ role_id: legacy.id }).delete();
  await knex('role_permissions').where({ role_id: legacy.id }).delete();
  await knex('roles').where({ id: legacy.id }).delete();
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  const teacher = await knex('roles').where({ name: 'teacher' }).first();
  if (teacher) {
    await knex('role_permissions').where({ role_id: teacher.id }).delete();
    await knex('user_roles').where({ role_id: teacher.id }).delete();
    await knex('roles').where({ id: teacher.id }).delete();
  }

  const manager = await knex('roles').where({ name: 'manager' }).first();
  if (manager) {
    await knex('roles').where({ id: manager.id }).update({
      name: 'admin',
      description: 'Application administrator',
    });
  }

  const student = await knex('roles').where({ name: 'student' }).first();
  if (student) {
    await knex('roles').where({ id: student.id }).update({
      name: 'user',
      description: 'Standard authenticated user',
    });
  }
}
