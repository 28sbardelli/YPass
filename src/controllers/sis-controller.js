import { randomUUID } from 'node:crypto';
import { encryptString } from '#utils/crypto.js';
import { NotFoundError } from '#errors';

function publicConnection(connection) {
  if (!connection) return null;
  return {
    id: connection.id,
    provider: connection.provider,
    connectionName: connection.connection_name,
    active: Boolean(connection.active),
    syncIntervalSeconds: connection.sync_interval_seconds,
    lastSyncedAt: connection.last_synced_at,
    createdAt: connection.created_at,
    updatedAt: connection.updated_at,
  };
}

export function createSisController(container) {
  const { sisRepository, sisService, sisSyncService, config } = container;

  return {
    async listConnections(_req, res, next) {
      try {
        const connections = await sisRepository.listConnections();
        res.json({ data: connections.map(publicConnection) });
      } catch (error) {
        next(error);
      }
    },

    async getConnection(req, res, next) {
      try {
        const connection = await sisRepository.findConnection(req.params.connectionId);
        if (!connection) throw new NotFoundError('SIS connection not found');
        res.json({ data: publicConnection(connection) });
      } catch (error) {
        next(error);
      }
    },

    async createConnection(req, res, next) {
      try {
        const now = new Date();
        const row = {
          id: randomUUID(),
          provider: req.body.provider,
          connection_name: req.body.connectionName,
          configuration_json: JSON.stringify(req.body.configuration || {}),
          credentials_encrypted: encryptString(
            JSON.stringify(req.body.credentials || {}),
            config.sis.encryptionKey,
          ),
          active: req.body.active,
          sync_interval_seconds: req.body.syncIntervalSeconds,
          created_at: now,
          updated_at: now,
          last_synced_at: null,
        };
        const connection = await sisRepository.createConnection(row);
        res.status(201).json({ data: publicConnection(connection) });
      } catch (error) {
        next(error);
      }
    },

    async testConnection(req, res, next) {
      let provider;
      try {
        const connection = await sisRepository.findConnection(req.params.connectionId);
        if (!connection) throw new NotFoundError('SIS connection not found');
        provider = await sisService.createProvider(connection);
        await provider.connect();
        const result = await provider.testConnection();
        res.json({ data: result });
      } catch (error) {
        next(error);
      } finally {
        await provider?.disconnect().catch(() => {});
      }
    },

    async syncConnection(req, res, next) {
      try {
        const result = await sisSyncService.syncConnection(req.params.connectionId);
        res.json({ data: result });
      } catch (error) {
        next(error);
      }
    },

    async syncHistory(req, res, next) {
      try {
        const connection = await sisRepository.findConnection(req.params.connectionId);
        if (!connection) throw new NotFoundError('SIS connection not found');
        const history = await sisRepository.listSyncHistory(connection.id);
        res.json({ data: history });
      } catch (error) {
        next(error);
      }
    },

    async deleteConnection(req, res, next) {
      try {
        const connection = await sisRepository.findConnection(req.params.connectionId);
        if (!connection) throw new NotFoundError('SIS connection not found');
        await sisRepository.deleteConnection(connection.id);
        res.status(204).end();
      } catch (error) {
        next(error);
      }
    },
  };
}
