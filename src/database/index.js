/**
 * Database adapter. Application code talks to this module, not to pg or sqlite.
 */

import knexFactory from 'knex';
import { AppError, DatabaseError } from '#errors';
import { buildKnexConfig, createSqlJsKnex } from './knex-config.js';

/**
 * @param {object} config
 * @param {import('pino').Logger} logger
 */
export async function createDatabase(config, logger) {
  const knexConfig = buildKnexConfig(config);
  const client =
    config.database.provider === 'sqlite'
      ? await createSqlJsKnex(knexConfig)
      : knexFactory(knexConfig);

  return {
    knex: client,
    provider: config.database.provider,
    query: client,
    async health() {
      try {
        await client.raw('select 1');
        return { ok: true };
      } catch (error) {
        logger.error({ err: error }, 'database health check failed');
        return { ok: false };
      }
    },
    /**
     * @template T
     * @param {(trx: import('knex').Knex.Transaction) => Promise<T>} fn
     */
    async transaction(fn) {
      try {
        return await client.transaction(fn);
      } catch (error) {
        if (error instanceof AppError) {
          throw error;
        }
        throw new DatabaseError(
          'Transaction failed',
          error instanceof Error ? error.message : error,
        );
      }
    },
    async destroy() {
      await client.destroy();
    },
  };
}

export { buildKnexConfig };
