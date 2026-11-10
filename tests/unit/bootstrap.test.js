import { describe, expect, it, vi } from 'vitest';
import { syncPrimaryManagerRole } from '../../src/bootstrap.js';

function makeContainer({ user, role } = {}) {
  const trx = {};
  const container = {
    users: { findByEmail: vi.fn().mockResolvedValue(user) },
    rbacRepository: {
      findRoleByName: vi.fn().mockResolvedValue(role),
      replaceRoles: vi.fn().mockResolvedValue(undefined),
    },
    db: {
      transaction: vi.fn(async (callback) => callback(trx)),
    },
  };
  return { container, trx };
}

describe('syncPrimaryManagerRole', () => {
  it('does not fail startup when the configured manager account is not registered', async () => {
    const { container } = makeContainer();

    await expect(syncPrimaryManagerRole(container, ['manager@example.test'])).resolves.toBeUndefined();

    expect(container.db.transaction).not.toHaveBeenCalled();
  });

  it('assigns the manager role when the configured account and role exist', async () => {
    const user = { id: 'user-1' };
    const role = { id: 'role-1' };
    const { container, trx } = makeContainer({ user, role });

    await syncPrimaryManagerRole(container, ['manager@example.test']);

    expect(container.rbacRepository.replaceRoles).toHaveBeenCalledWith(user.id, role.id, trx);
  });
});
