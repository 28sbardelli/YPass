import { describe, expect, it } from 'vitest';
import { createUserService } from '#services/user-service.js';
import { createTokenService } from '#auth/tokens.js';
import { systemClock } from '#utils/clock.js';
import { sha256 } from '#utils/crypto.js';

function memoryChallenges() {
  const rows = [];
  return {
    async create(row) {
      rows.push({ ...row });
    },
    async findByHash(tokenHash) {
      return rows.find((row) => row.token_hash === tokenHash) || null;
    },
    async markUsed(id) {
      const row = rows.find((item) => item.id === id);
      if (row) row.used_at = new Date();
    },
    rows,
  };
}

describe('account linking', () => {
  it('does not link accounts just because emails match', async () => {
    const users = new Map();
    const identities = [];
    const service = createUserService({
      db: {
        async transaction(fn) {
          return fn({});
        },
      },
      users: {
        async create(user) {
          users.set(user.id, user);
        },
        async findById(id) {
          return users.get(id);
        },
        async findByEmail() {
          return [...users.values()][0];
        },
      },
      identities: {
        async create(identity) {
          identities.push(identity);
        },
        async findByProviderSubject(provider, subject) {
          return (
            identities.find((item) => item.provider === provider && item.subject === subject) ||
            null
          );
        },
        async listByUser(userId) {
          return identities.filter((item) => item.user_id === userId);
        },
        async deleteById() {},
      },
      credentials: {
        async findByUserId() {
          return null;
        },
      },
      rbacRepository: {
        async findRoleByName() {
          return { id: 'role' };
        },
        async assignRole() {},
      },
      rbac: {
        async getRoles() {
          return ['user'];
        },
        async getPermissions() {
          return [];
        },
      },
      tokens: createTokenService(memoryChallenges(), systemClock()),
      audit: { async write() {} },
    });

    const first = await service.loginWithExternalIdentity({
      provider: 'formbar',
      subject: '1',
      email: 'same@example.test',
      displayName: 'One',
    });
    const second = await service.loginWithExternalIdentity({
      provider: 'entra',
      subject: 'oid-2',
      email: 'same@example.test',
      displayName: 'Two',
    });
    expect(first.id).not.toBe(second.id);
  });

  it('refuses to unlink the last sign-in method', async () => {
    const identities = [{ id: 'ident-1', user_id: 'user-1', provider: 'formbar', subject: '1' }];
    const challenges = memoryChallenges();
    const tokens = createTokenService(challenges, systemClock());
    const service = createUserService({
      db: {
        async transaction(fn) {
          return fn({});
        },
      },
      users: {
        async create() {},
        async findById() {
          return { id: 'user-1' };
        },
      },
      identities: {
        async create() {},
        async findByProviderSubject() {
          return null;
        },
        async listByUser() {
          return identities;
        },
        async deleteById() {
          throw new Error('should not delete');
        },
      },
      credentials: {
        async findByUserId() {
          return null;
        },
        async deleteByUserId() {},
      },
      rbacRepository: {
        async findRoleByName() {
          return null;
        },
        async assignRole() {},
      },
      rbac: {
        async getRoles() {
          return [];
        },
        async getPermissions() {
          return [];
        },
      },
      tokens,
      audit: { async write() {} },
    });

    await expect(
      service.unlink({ userId: 'user-1', identityId: 'ident-1', hasReauthenticated: true }),
    ).rejects.toThrow(/last sign-in method/);
  });

  it('requires a linking nonce rather than an email match', async () => {
    const challenges = memoryChallenges();
    const tokens = createTokenService(challenges, systemClock());
    const identities = [];
    const service = createUserService({
      db: {
        async transaction(fn) {
          return fn({});
        },
      },
      users: {
        async create() {},
        async findById() {
          return { id: 'user-1' };
        },
      },
      identities: {
        async create(row) {
          identities.push(row);
        },
        async findByProviderSubject() {
          return null;
        },
        async listByUser() {
          return identities;
        },
      },
      credentials: {
        async findByUserId() {
          return null;
        },
      },
      rbacRepository: {
        async findRoleByName() {
          return null;
        },
        async assignRole() {},
      },
      rbac: {
        async getRoles() {
          return [];
        },
        async getPermissions() {
          return [];
        },
      },
      tokens,
      audit: { async write() {} },
    });

    await expect(
      service.completeLink({
        userId: 'user-1',
        provider: 'formbar',
        subject: '99',
        email: 'same@example.test',
        linkNonce: 'not-a-real-token',
      }),
    ).rejects.toThrow(/invalid or has expired/);
  });

  it('stores challenge tokens as hashes', async () => {
    const challenges = memoryChallenges();
    const tokens = createTokenService(challenges, systemClock());
    const token = await tokens.issue({ userId: 'user-1', purpose: 'reset-password' });
    expect(challenges.rows[0].token_hash).toBe(sha256(token));
    expect(challenges.rows[0].token_hash).not.toBe(token);
  });
});
