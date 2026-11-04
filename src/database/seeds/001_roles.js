import { randomUUID } from 'node:crypto';

const ROLES = [
  { name: 'student', description: 'Student account' },
  { name: 'teacher', description: 'Teacher account' },
  { name: 'manager', description: 'Hall-pass manager' },
];

const PERMISSIONS = [
  { name: 'account.self', description: 'Manage own account' },
  { name: 'users.read', description: 'Read user directory' },
  { name: 'users.manage', description: 'Manage users and roles' },
  { name: 'admin.health', description: 'View detailed health information' },
];

const ADMIN_PERMS = ['account.self', 'users.read', 'users.manage', 'admin.health'];
const TEACHER_PERMS = ['account.self'];
const STUDENT_PERMS = ['account.self'];

/**
 * @param {import('knex').Knex} knex
 */
export async function seed(knex) {
  for (const role of ROLES) {
    await knex('roles')
      .insert({ id: randomUUID(), ...role })
      .onConflict('name')
      .ignore();
  }
  for (const permission of PERMISSIONS) {
    await knex('permissions')
      .insert({ id: randomUUID(), ...permission })
      .onConflict('name')
      .ignore();
  }

  const roleRows = await knex('roles').whereIn(
    'name',
    ROLES.map((role) => role.name),
  );
  const permissionRows = await knex('permissions').whereIn(
    'name',
    PERMISSIONS.map((permission) => permission.name),
  );
  const roleByName = Object.fromEntries(roleRows.map((row) => [row.name, row.id]));
  const permByName = Object.fromEntries(permissionRows.map((row) => [row.name, row.id]));

  const rolePermissions = [
    ...ADMIN_PERMS.map((name) => ({
      role_id: roleByName.manager,
      permission_id: permByName[name],
    })),
    ...TEACHER_PERMS.map((name) => ({
      role_id: roleByName.teacher,
      permission_id: permByName[name],
    })),
    ...STUDENT_PERMS.map((name) => ({
      role_id: roleByName.student,
      permission_id: permByName[name],
    })),
  ];

  await knex('role_permissions')
    .insert(rolePermissions)
    .onConflict(['role_id', 'permission_id'])
    .ignore();
}
