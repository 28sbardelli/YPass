import { describe, expect, it } from 'vitest';
import { createSisService } from '#services/sis/sis-service.js';
import { encryptString } from '#utils/crypto.js';

describe('SIS service', () => {
  it('decrypts connection credentials only when creating a provider', async () => {
    const secret = 'test-token-encryption-key-32ch!';
    const service = createSisService({
      config: {
        sis: { encryptionKey: secret, timeoutMs: 15_000, pageSize: 100, minIntervalMs: 0 },
      },
      logger: { warn() {} },
    });
    const provider = await service.createProvider({
      provider: 'mock',
      configuration_json: JSON.stringify({
        students: [{ sisId: '1', firstName: 'Ada', lastName: 'Lovelace' }],
      }),
      credentials_encrypted: encryptString(JSON.stringify({ token: 'not-exposed' }), secret),
    });

    await provider.connect();
    await expect(provider.getStudents()).resolves.toHaveLength(1);
  });

  it('rejects unsupported providers', async () => {
    const service = createSisService({ config: { sis: { encryptionKey: 'secret' } } });
    await expect(
      service.createProvider({
        provider: 'unknown',
        configuration_json: '{}',
        credentials_encrypted: null,
      }),
    ).rejects.toThrow(/unsupported SIS provider/i);
  });
});
