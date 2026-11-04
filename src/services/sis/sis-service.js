import { ValidationError } from '#errors';
import { decryptString } from '#utils/crypto.js';
import { createMockSisProvider } from './providers/mock-provider.js';
import { createOneRosterProvider } from './providers/oneroster-provider.js';

export function createSisService({ config, logger = null, providerFactories = {} }) {
  const factories = {
    mock: createMockSisProvider,
    oneroster: createOneRosterProvider,
    ...providerFactories,
  };

  return {
    async createProvider(connection) {
      const factory = factories[connection.provider];
      if (!factory) throw new ValidationError(`Unsupported SIS provider: ${connection.provider}`);

      let configuration;
      try {
        configuration = JSON.parse(connection.configuration_json || '{}');
      } catch {
        throw new ValidationError('SIS connection configuration is invalid');
      }

      let credentials = {};
      if (connection.credentials_encrypted) {
        try {
          credentials = JSON.parse(
            decryptString(connection.credentials_encrypted, config.sis.encryptionKey),
          );
        } catch (error) {
          logger?.error(
            { err: error, provider: connection.provider },
            'SIS credentials could not be decrypted',
          );
          throw new ValidationError('SIS connection credentials are invalid');
        }
      }

      return factory({
        ...configuration,
        ...credentials,
        timeoutMs: configuration.timeoutMs || config.sis.timeoutMs,
        pageSize: configuration.pageSize || config.sis.pageSize,
        minIntervalMs: configuration.minIntervalMs ?? config.sis.minIntervalMs,
      });
    },
  };
}
