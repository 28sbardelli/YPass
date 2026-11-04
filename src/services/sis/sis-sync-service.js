import { randomUUID } from 'node:crypto';
import { ConflictError, NotFoundError } from '#errors';
import { normalizeStudent } from './sis-normalizer.js';

export function createSisSyncService({ db, sisService, repository, clock, logger = null }) {
  return {
    async syncConnection(connectionId) {
      const connection = await repository.findConnection(connectionId);
      if (!connection) throw new NotFoundError('SIS connection not found');

      const startedAt = clock.now();
      let history;
      try {
        history = await repository.createSyncHistory({
          id: randomUUID(),
          connection_id: connectionId,
          status: 'running',
          started_at: startedAt,
          completed_at: null,
          retrieved: 0,
          created: 0,
          updated: 0,
          deactivated: 0,
          skipped: 0,
          errors: 0,
          error_message: null,
        });
      } catch (error) {
        if (String(error?.message || '').includes('sis_one_running_per_connection')) {
          throw new ConflictError('SIS synchronization is already running');
        }
        throw error;
      }

      let provider;
      try {
        provider = await sisService.createProvider(connection);
        await provider.connect();
        await provider.testConnection();
        const incoming = await provider.getStudents();
        const result = {
          retrieved: incoming.length,
          created: 0,
          updated: 0,
          deactivated: 0,
          skipped: 0,
          errors: 0,
        };
        const validStudents = [];

        for (const record of incoming) {
          try {
            validStudents.push(normalizeStudent(record));
          } catch (error) {
            result.skipped += 1;
            result.errors += 1;
            logger?.warn({ err: error, connectionId }, 'invalid SIS student record skipped');
          }
        }

        await db.transaction(async (trx) => {
          for (const student of validStudents) {
            const change = await repository.upsertStudent(connectionId, student, trx);
            result.created += change.created ? 1 : 0;
            result.updated += change.updated ? 1 : 0;
          }
          if (result.errors === 0) {
            result.deactivated = await repository.markMissingStudentsInactive(
              connectionId,
              new Set(validStudents.map((student) => student.sisId)),
              trx,
            );
          }
        });

        const completedAt = clock.now();
        await repository.completeSyncHistory(history.id, {
          ...result,
          status: 'completed',
          completed_at: completedAt,
        });
        await repository.updateConnection(connectionId, { last_synced_at: completedAt });
        return result;
      } catch (error) {
        await repository.completeSyncHistory(history.id, {
          status: 'failed',
          completed_at: clock.now(),
          errors: 1,
          error_message: error instanceof Error ? error.message : 'Synchronization failed',
        });
        logger?.error({ err: error, connectionId }, 'SIS synchronization failed');
        throw error;
      } finally {
        await provider?.disconnect().catch((error) => {
          logger?.warn({ err: error, connectionId }, 'SIS provider disconnect failed');
        });
      }
    },
  };
}
