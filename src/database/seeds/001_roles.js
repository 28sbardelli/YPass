import { randomUUID } from 'node:crypto';

const ROLES = [
  { name: 'admin', description: 'Application administrator' },
  { name: 'user', description: 'Standard authenticated user' },
];

const PERMISSIONS = [
  { name: 'account.self', description: 'Manage own account' },
  { name: 'users.read', description: 'Read user directory' },
  { name: 'users.manage', description: 'Manage users and roles' },
  { name: 'admin.health', description: 'View detailed health information' },
];

const ADMIN_PERMS = ['account.self', 'users.read', 'users.manage', 'admin.health'];
const USER_PERMS = ['account.self'];

/**
 * @param {import('knex').Knex} knex
 */
export async function seed(knex) {
  const existing = await knex('roles').select('name');
  if (existing.length > 0) {
    return;
  }

  const roleRows = ROLES.map((role) => ({ id: randomUUID(), ...role }));
  const permissionRows = PERMISSIONS.map((permission) => ({ id: randomUUID(), ...permission }));

  await knex('roles').insert(roleRows);
  await knex('permissions').insert(permissionRows);

  const roleByName = Object.fromEntries(roleRows.map((row) => [row.name, row.id]));
  const permByName = Object.fromEntries(permissionRows.map((row) => [row.name, row.id]));

  const rolePermissions = [
    ...ADMIN_PERMS.map((name) => ({
      role_id: roleByName.admin,
      permission_id: permByName[name],
    })),
    ...USER_PERMS.map((name) => ({
      role_id: roleByName.user,
      permission_id: permByName[name],
    })),
  ];

  await knex('role_permissions').insert(rolePermissions);
}
