import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/app.js';
import { encryptString } from '#utils/crypto.js';

describe('SIS persistence and synchronization', () => {
  it('migrates SIS tables and syncs a mock connection idempotently', async () => {
    const testApp = await createTestApp({ SIS_ENABLED: 'true' });
    try {
      const connection = {
        id: randomUUID(),
        provider: 'mock',
        connection_name: 'Integration mock',
        configuration_json: JSON.stringify({
          students: [{ sisId: 'sis-1', firstName: 'Ada', lastName: 'Lovelace' }],
        }),
        credentials_encrypted: encryptString('{}', testApp.config.sis.encryptionKey),
        active: true,
        sync_interval_seconds: 0,
        last_synced_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      await testApp.container.sisRepository.createConnection(connection);

      await expect(
        testApp.container.sisSyncService.syncConnection(connection.id),
      ).resolves.toMatchObject({ created: 1, updated: 0, retrieved: 1 });
      await expect(
        testApp.container.sisSyncService.syncConnection(connection.id),
      ).resolves.toMatchObject({ created: 0, updated: 1, retrieved: 1 });

      const student = await testApp.container.db
        .knex('students')
        .where({ sis_connection_id: connection.id, sis_student_id: 'sis-1' })
        .first();
      expect(student).toMatchObject({ first_name: 'Ada', last_name: 'Lovelace', status: 'active' });
    } finally {
      await testApp.close();
    }
  });
});
