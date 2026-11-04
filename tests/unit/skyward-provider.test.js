import { describe, expect, it, vi } from 'vitest';
import { createSkywardProvider } from '#services/sis/providers/skyward-provider.js';

const response = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  async json() { return body; },
});

describe('Skyward provider', () => {
  it('uses OneRoster by default and normalizes paginated records', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({ students: [{ sourcedId: 's1', givenName: 'Ada', familyName: 'Lovelace', status: 'active' }], nextPage: true }))
      .mockResolvedValueOnce(response({ students: [{ sourcedId: 's2', givenName: 'Grace', familyName: 'Hopper', status: 'inactive' }], nextPage: false }));
    const provider = createSkywardProvider({ baseUrl: 'https://skyward.example.test', pageSize: 1, token: 'token', fetchImpl });

    await provider.connect();
    await expect(provider.getStudents()).resolves.toEqual([
      { sisId: 's1', firstName: 'Ada', lastName: 'Lovelace', active: true },
      { sisId: 's2', firstName: 'Grace', lastName: 'Hopper', active: false },
    ]);
    expect(fetchImpl).toHaveBeenNthCalledWith(1, 'https://skyward.example.test/ims/oneroster/v1p1/students?limit=1&offset=0', expect.anything());
  });

  it('supports district-provided SMS 2.0 or Qmlativ API paths and errors', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({ data: [{ id: 's1', firstName: 'Ada', lastName: 'Lovelace', active: true }] }));
    const provider = createSkywardProvider({ baseUrl: 'https://skyward.example.test', protocol: 'api', platform: 'sms20', studentPath: '/custom/students', apiKey: 'key', fetchImpl });

    await provider.connect();
    await expect(provider.testConnection()).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledWith('https://skyward.example.test/custom/students?limit=100&offset=0', expect.objectContaining({ headers: expect.objectContaining({ 'x-api-key': 'key' }) }));
    fetchImpl.mockResolvedValueOnce(response({ error: 'no' }, 500));
    await expect(provider.getStudents()).rejects.toThrow(/status 500/i);
  });
});