import { describe, expect, it } from 'vitest';
import { createSisSyncService } from '#services/sis/sis-sync-service.js';

function setup({ students, existing = [] }) {
  const rows = existing.map((row) => ({ ...row }));
  const histories = [];
  const connection = { id: 'connection-1', provider: 'mock', active: true };
  const provider = {
    async connect() {},
    async testConnection() {
      return { ok: true };
    },
    async getStudents() {
      return students;
    },
    async disconnect() {},
  };
  const sisService = {
    async createProvider() {
      return provider;
    },
  };
  const repository = {
    async findConnection() {
      return connection;
    },
    async createSyncHistory(row) {
      histories.push({ ...row });
      return row;
    },
    async completeSyncHistory(id, patch) {
      Object.assign(
        histories.find((row) => row.id === id),
        patch,
      );
    },
    async updateConnection() {},
    async upsertStudent(_connectionId, student) {
      const existingRow = rows.find((row) => row.sis_student_id === student.sisId);
      if (existingRow) {
        Object.assign(existingRow, {
          first_name: student.firstName,
          last_name: student.lastName,
          status: student.active ? 'active' : 'inactive',
        });
        return { created: false, updated: true };
      }
      rows.push({
        sis_student_id: student.sisId,
        first_name: student.firstName,
        last_name: student.lastName,
        status: student.active ? 'active' : 'inactive',
      });
      return { created: true, updated: false };
    },
    async markMissingStudentsInactive(_connectionId, seenIds) {
      let deactivated = 0;
      for (const row of rows) {
        if (!seenIds.has(row.sis_student_id) && row.status === 'active') {
          row.status = 'inactive';
          deactivated += 1;
        }
      }
      return deactivated;
    },
    rows,
    histories,
  };
  const db = {
    async transaction(fn) {
      return fn({});
    },
  };
  const service = createSisSyncService({
    db,
    sisService,
    repository,
    clock: { now: () => new Date('2026-01-01T00:00:00.000Z') },
  });
  return { service, repository };
}

describe('SIS synchronization', () => {
  it('creates, updates, deactivates missing records, and is idempotent', async () => {
    const first = setup({
      students: [
        { sisId: '1', firstName: 'Ada', lastName: 'Lovelace', active: true },
        { sisId: '2', firstName: 'Grace', lastName: 'Hopper', active: true },
      ],
      existing: [
        { sis_student_id: '3', first_name: 'Old', last_name: 'Student', status: 'active' },
      ],
    });

    await expect(first.service.syncConnection('connection-1')).resolves.toMatchObject({
      retrieved: 2,
      created: 2,
      updated: 0,
      deactivated: 1,
      skipped: 0,
      errors: 0,
    });
    expect(first.repository.rows.find((row) => row.sis_student_id === '3').status).toBe('inactive');

    const second = setup({
      students: [{ sisId: '1', firstName: 'Ada', lastName: 'Byron', active: true }],
      existing: [
        { sis_student_id: '1', first_name: 'Ada', last_name: 'Lovelace', status: 'active' },
      ],
    });
    await expect(second.service.syncConnection('connection-1')).resolves.toMatchObject({
      retrieved: 1,
      created: 0,
      updated: 1,
      deactivated: 0,
    });
    expect(second.repository.rows).toHaveLength(1);
  });

  it('skips invalid records and does not deactivate on provider failure', async () => {
    const setupResult = setup({
      students: [
        { sisId: '1', firstName: 'Ada', lastName: 'Lovelace', active: true },
        { sisId: '', firstName: 'Missing', lastName: 'Id' },
      ],
      existing: [
        { sis_student_id: '2', first_name: 'Existing', last_name: 'Student', status: 'active' },
      ],
    });

    await expect(setupResult.service.syncConnection('connection-1')).resolves.toMatchObject({
      retrieved: 2,
      created: 1,
      skipped: 1,
      errors: 1,
    });
    expect(setupResult.repository.rows.find((row) => row.sis_student_id === '2').status).toBe(
      'active',
    );
  });
});
