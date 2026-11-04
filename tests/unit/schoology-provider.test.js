import { describe, expect, it, vi } from 'vitest';
import { createSchoologyProvider } from '#services/sis/providers/schoology-provider.js';

const response = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  async json() { return body; },
});

describe('Schoology provider', () => {
  it('uses the official OAuth 1.0a REST API and filters for students', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({ users: [{ id: 's1', name: { givenName: 'Ada', familyName: 'Lovelace' }, status: 'active' }], total: 1 }));
    const provider = createSchoologyProvider({ baseUrl: 'https://schoology.example.test/v1', consumerKey: 'key', consumerSecret: 'secret', token: 'token', tokenSecret: 'token-secret', fetchImpl });

    await provider.connect();
    await expect(provider.getStudents()).resolves.toEqual([{ sisId: 's1', firstName: 'Ada', lastName: 'Lovelace', active: true }]);
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining('/users?role=student&limit=100&start=0'), expect.objectContaining({ headers: expect.objectContaining({ authorization: expect.stringContaining('oauth_consumer_key') }) }));
  });

  it('supports a separately authorized OneRoster endpoint and reports auth failures', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({ students: [] }, 403));
    const provider = createSchoologyProvider({ baseUrl: 'https://schoology.example.test', protocol: 'oneroster', authType: 'bearer', token: 'token', fetchImpl });

    await provider.connect();
    await expect(provider.testConnection()).rejects.toThrow(/authentication/i);
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining('/ims/oneroster/v1p1/students'), expect.objectContaining({ headers: expect.objectContaining({ authorization: 'Bearer token' }) }));
  });
});