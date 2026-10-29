/**
 * Socket.IO server for this application (not Formbar).
 * Authentication comes from the Express session. Client-supplied user IDs are ignored.
 */

import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { pingEventSchema } from '#validators/auth.js';

export async function createRealtime(httpServer, { config, logger, redis, sessionMiddleware }) {
  if (!config.features.socketIo) {
    return null;
  }

  if (config.webConcurrency > 1 && !redis) {
    throw new Error('Socket.IO clustering requires Redis');
  }

  if (config.isProduction && config.socketIo.allowPolling && !redis) {
    throw new Error('HTTP long-polling in production requires Redis and Nginx sticky sessions');
  }

  const io = new Server(httpServer, {
    maxHttpBufferSize: config.socketIo.maxBufferBytes,
    transports: config.socketIo.allowPolling ? ['websocket', 'polling'] : ['websocket'],
    cors:
      config.security.corsOrigins.length > 0
        ? { origin: config.security.corsOrigins, credentials: true }
        : { origin: false },
  });

  if (redis) {
    const sub = redis.client.duplicate();
    await sub.connect();
    io.adapter(createAdapter(redis.client, sub));
    io._redisSub = sub;
  }

  io.engine.use(sessionMiddleware);

  const connectionHits = new Map();

  io.use((socket, next) => {
    const ip = socket.handshake.address;
    const now = Date.now();
    const windowMs = 10_000;
    const current = connectionHits.get(ip) || [];
    const recent = current.filter((ts) => now - ts < windowMs);
    recent.push(now);
    connectionHits.set(ip, recent);
    if (recent.length > 20) {
      next(new Error('Too many connections'));
      return;
    }
    next();
  });

  io.use((socket, next) => {
    const session = socket.request.session;
    if (!session?.userId) {
      next(new Error('unauthorized'));
      return;
    }
    socket.data.userId = session.userId;
    socket.data.sessionId = session.id;
    next();
  });

  io.on('connection', (socket) => {
    socket.join(socket.data.sessionId);
    socket.join(`teacher:${socket.data.userId}`);
    const eventHits = [];

    socket.on('ping', (payload, callback) => {
      eventHits.push(Date.now());
      const recent = eventHits.filter((ts) => Date.now() - ts < 1000);
      if (recent.length > 10) {
        socket.emit('error', { message: 'Too many events' });
        return;
      }
      const parsed = pingEventSchema.safeParse(payload || {});
      if (!parsed.success) {
        socket.emit('error', { message: 'Invalid payload' });
        return;
      }
      const reply = { ok: true, at: Date.now() };
      socket.emit('pong', reply);
      if (typeof callback === 'function') {
        callback(reply);
      }
    });
  });

  logger.info(
    { adapter: redis ? 'redis' : 'memory', polling: config.socketIo.allowPolling },
    'socket.io attached',
  );

  return io;
}
