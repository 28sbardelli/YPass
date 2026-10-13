/**
 * Optional background jobs. Requires Redis in production/cluster.
 * Applications that do not need jobs leave BACKGROUND_JOBS_ENABLED=false.
 */

import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

export async function createJobs(config, logger, { challengeRepository, clock }) {
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

  const worker = new Worker(
    'cleanup',
    async () => {
      await challengeRepository.deleteExpired(clock.now());
    },
    { connection, prefix: `${config.redis.keyPrefix}jobs` },
  );

  worker.on('failed', (job, error) => {
    logger.warn({ err: error, jobId: job?.id }, 'job failed');
  });

  await cleanupQueue.add('expired-challenges', {}, { repeat: { every: 60 * 60 * 1000 } });

  return {
    async close() {
      await worker.close();
      await cleanupQueue.close();
      await connection.quit();
    },
  };
}
