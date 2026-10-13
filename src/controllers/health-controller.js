import { isLoopback } from '#utils/net.js';

export function createHealthController(container) {
  return {
    live(req, res) {
      res.json({ status: 'live' });
    },

    async ready(req, res) {
      const details = await collectDetails(container);
      const ready = details.database.ok && (!container.config.features.redis || details.redis.ok);
      const body = { status: ready ? 'ready' : 'not_ready' };
      const allowDetails =
        req.query.details === '1' &&
        (isLoopback(req) || req.currentUser?.permissions?.includes('admin.health'));
      if (allowDetails) {
        body.details = details;
      }
      res.status(ready ? 200 : 503).json(body);
    },
  };
}

async function collectDetails(container) {
  const database = container.db ? await container.db.health() : { ok: false };
  const redis = container.redis
    ? await container.redis.health()
    : { ok: !container.config.features.redis };
  return { database, redis };
}
