/**
 * Optional background jobs. Requires Redis in production/cluster.
 * Applications that do not need jobs leave BACKGROUND_JOBS_ENABLED=false.
 */

import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

export async function createJobs(
  config,
  logger,
  { challengeRepository, clock, sisRepository, sisSyncService },
) {
  if (!config.features.backgroundJobs) {
    if (!config.isProduction && config.webConcurrency === 1 && challengeRepository) {
      const timer = setInterval(
        () => {
          challengeRepository.deleteExpired(clock.now()).catch((error) => {
            logger.warn({ err: error }, 'challenge cleanup failed');
          });
        },
        60 * 60 * 1000,
      );
      timer.unref?.();
      return {
        async close() {
          clearInterval(timer);
        },
      };
    }
    return null;
  }

  const connection = new IORedis(config.redis.url, {
    password: config.redis.password || undefined,
    maxRetriesPerRequest: null,
  });

  const cleanupQueue = new Queue('cleanup', {
    connection,
    prefix: `${config.redis.keyPrefix}jobs`,
  });

  const sisQueue =
    config.features.sis && sisRepository && sisSyncService
      ? new Queue('sis-sync', { connection, prefix: `${config.redis.keyPrefix}jobs` })
      : null;

  const worker = new Worker(
    'cleanup',
    async () => {
      await challengeRepository.deleteExpired(clock.now());
    },
    { connection, prefix: `${config.redis.keyPrefix}jobs` },
  );

  const sisWorker = sisQueue
    ? new Worker('sis-sync', async (job) => sisSyncService.syncConnection(job.data.connectionId), {
        connection,
        prefix: `${config.redis.keyPrefix}jobs`,
      })
    : null;

  worker.on('failed', (job, error) => {
    logger.warn({ err: error, jobId: job?.id }, 'job failed');
  });
  sisWorker?.on('failed', (job, error) => {
    logger.warn({ err: error, jobId: job?.id }, 'SIS synchronization job failed');
  });

  await cleanupQueue.add('expired-challenges', {}, { repeat: { every: 60 * 60 * 1000 } });

  if (sisQueue) {
    const connections = await sisRepository.listConnections();
    for (const sisConnection of connections) {
      if (sisConnection.active && sisConnection.sync_interval_seconds > 0) {
        await sisQueue.add(
          `sync-${sisConnection.id}`,
          { connectionId: sisConnection.id },
          {
            jobId: `sis-${sisConnection.id}`,
            attempts: 3,
            backoff: { type: 'exponential', delay: 5_000 },
            repeat: { every: sisConnection.sync_interval_seconds * 1000 },
          },
        );
      }
    }
  }

  return {
    async close() {
      await worker.close();
      await sisWorker?.close();
      await cleanupQueue.close();
      await sisQueue?.close();
      await connection.quit();
    },
  };
}
