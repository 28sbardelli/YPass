import { describe, expect, it, vi } from 'vitest';
import { createOneRosterProvider } from '#services/sis/providers/oneroster-provider.js';

function response(body, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    async json() {
      return body;
    },
  };
}

describe('OneRoster provider', () => {
  it('fetches and normalizes paginated students with basic authentication', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          students: [{ sourcedId: '1', givenName: 'Ada', familyName: 'Lovelace' }],
          nextPage: true,
        }),
      )
      .mockResolvedValueOnce(
        response({
          students: [{ sourcedId: '2', givenName: 'Grace', familyName: 'Hopper' }],
          hasNextPage: false,
        }),
      );
    const provider = createOneRosterProvider({
      baseUrl: 'https://sis.example.test',
      username: 'client',
      password: 'secret',
      pageSize: 1,
      fetchImpl,
    });

    await provider.connect();
    await expect(provider.getStudents()).resolves.toEqual([
      { sisId: '1', firstName: 'Ada', lastName: 'Lovelace', active: true },
      { sisId: '2', firstName: 'Grace', lastName: 'Hopper', active: true },
    ]);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://sis.example.test/ims/oneroster/v1p1/students?limit=1&offset=0',
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: `Basic ${Buffer.from('client:secret').toString('base64')}`,
        }),
      }),
    );
  });

  it('supports bearer authentication and rejects expired credentials', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({ error: 'expired' }, 401));
    const provider = createOneRosterProvider({
      baseUrl: 'https://sis.example.test/',
      version: '1.2',
      token: 'access-token',
      authType: 'bearer',
      fetchImpl,
    });

    await provider.connect();
    await expect(provider.testConnection()).rejects.toThrow(/authentication/i);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://sis.example.test/ims/oneroster/v1p2/students?limit=100&offset=0',
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer access-token' }),
      }),
    );
  });

  it('surfaces request timeouts as provider errors', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    const provider = createOneRosterProvider({
      baseUrl: 'https://sis.example.test',
      token: 'access-token',
      fetchImpl,
    });

    await provider.connect();
    await expect(provider.getStudents()).rejects.toThrow(/timed out/i);
  });
});
