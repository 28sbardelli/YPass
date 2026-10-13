import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '#auth/password.js';
import { createRbac } from '#authorization/rbac.js';

describe('password hashing', () => {
  it('hashes with argon2 and verifies', async () => {
    const hash = await hashPassword('correct-horse-battery', 'test');
    expect(hash).not.toContain('correct-horse-battery');
    expect(await verifyPassword(hash, 'correct-horse-battery')).toBe(true);
    expect(await verifyPassword(hash, 'wrong-password-value')).toBe(false);
  });
});

describe('rbac', () => {
  it('checks roles and permissions from server-side user objects', () => {
    const rbac = createRbac({
      rbacRepository: {
        listRolesForUser: async () => [{ name: 'admin' }],
        listPermissionsForUser: async () => [{ name: 'users.manage' }],
      },
    });
    expect(rbac.hasRole({ roles: ['admin'] }, 'admin')).toBe(true);
    expect(rbac.hasPermission({ permissions: ['users.manage'] }, 'users.read')).toBe(false);
  });
});
