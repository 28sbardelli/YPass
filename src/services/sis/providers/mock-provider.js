import { normalizeStudent } from '#services/sis/sis-normalizer.js';
import { SISProvider } from './sis-provider.js';

export function createMockSisProvider({ students = [], failConnection = false } = {}) {
  let connected = false;
  const normalizedStudents = students.map(normalizeStudent);

  return new (class MockSisProvider extends SISProvider {
    async connect() {
      if (failConnection) throw new Error('Mock SIS connection failed');
      connected = true;
    }

    async testConnection() {
      if (failConnection) throw new Error('Mock SIS connection failed');
      return { ok: true };
    }

    async getStudents() {
      if (!connected) throw new Error('Mock SIS provider is not connected');
      return normalizedStudents.map((student) => ({ ...student }));
    }

    async disconnect() {
      connected = false;
    }
  })();
}
