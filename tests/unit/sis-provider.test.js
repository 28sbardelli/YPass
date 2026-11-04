import { describe, expect, it } from 'vitest';
import { createMockSisProvider } from '#services/sis/providers/mock-provider.js';
import { SISProvider } from '#services/sis/providers/sis-provider.js';

describe('SIS providers', () => {
  it('defines the provider contract', async () => {
    const provider = new SISProvider();
    await expect(provider.connect()).rejects.toThrow(/not implemented/i);
    await expect(provider.testConnection()).rejects.toThrow(/not implemented/i);
    await expect(provider.getStudents()).rejects.toThrow(/not implemented/i);
    await expect(provider.disconnect()).rejects.toThrow(/not implemented/i);
  });

  it('supports a deterministic mock provider', async () => {
    const provider = createMockSisProvider({
      students: [{ sisId: '10001', firstName: 'James', lastName: 'Anderson' }],
    });

    await provider.connect();
    await expect(provider.testConnection()).resolves.toEqual({ ok: true });
    await expect(provider.getStudents()).resolves.toEqual([
      { sisId: '10001', firstName: 'James', lastName: 'Anderson', active: true },
    ]);
    await provider.disconnect();
  });
});
