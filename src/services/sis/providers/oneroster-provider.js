import { ExternalServiceError } from '#errors';
import { normalizeStudent } from '#services/sis/sis-normalizer.js';
import { SISProvider } from './sis-provider.js';

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_TIMEOUT_MS = 15_000;

export function createOneRosterProvider(options = {}) {
  return new OneRosterProvider(options);
}

export class OneRosterProvider extends SISProvider {
  constructor({
    baseUrl,
    version = '1.1',
    authType,
    username = '',
    password = '',
    token = '',
    pageSize = DEFAULT_PAGE_SIZE,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    minIntervalMs = 0,
    fetchImpl = globalThis.fetch,
    sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
  } = {}) {
    super();
    this.baseUrl = String(baseUrl || '').replace(/\/+$/, '');
    this.version = version === '1.2' ? 'v1p2' : 'v1p1';
    this.authType = authType || (username || password ? 'basic' : 'bearer');
    this.username = username;
    this.password = password;
    this.token = token;
    this.pageSize = Math.max(1, Number(pageSize) || DEFAULT_PAGE_SIZE);
    this.timeoutMs = Math.max(1, Number(timeoutMs) || DEFAULT_TIMEOUT_MS);
    this.minIntervalMs = Math.max(0, Number(minIntervalMs) || 0);
    this.fetchImpl = fetchImpl;
    this.sleep = sleep;
    this.connected = false;
    this.lastRequestAt = 0;
  }

  async connect() {
    if (!this.baseUrl) throw new ExternalServiceError('OneRoster base URL is required');
    if (typeof this.fetchImpl !== 'function') {
      throw new ExternalServiceError('A fetch implementation is required for OneRoster');
    }
    this.connected = true;
  }

  async testConnection() {
    this.ensureConnected();
    await this.fetchPage(0);
    return { ok: true };
  }

  async getStudents() {
    this.ensureConnected();
    const students = [];
    let offset = 0;
    let hasNextPage = true;

    while (hasNextPage) {
      const page = await this.fetchPage(offset);
      const records = Array.isArray(page.students) ? page.students : [];
      students.push(...records.map(normalizeStudent));
      const hasPaginationSignal =
        Object.hasOwn(page, 'nextPage') ||
        Object.hasOwn(page, 'hasNextPage') ||
        Object.hasOwn(page, 'next');
      hasNextPage = hasPaginationSignal
        ? Boolean(page.nextPage || page.hasNextPage || page.next)
        : records.length === this.pageSize;
      if (hasNextPage) {
        offset += records.length || this.pageSize;
      }
    }

    return students;
  }

  async disconnect() {
    this.connected = false;
  }

  ensureConnected() {
    if (!this.connected) throw new ExternalServiceError('OneRoster provider is not connected');
  }

  async fetchPage(offset) {
    const url = `${this.baseUrl}/ims/oneroster/${this.version}/students?limit=${this.pageSize}&offset=${offset}`;
    const now = Date.now();
    const wait = this.minIntervalMs - (now - this.lastRequestAt);
    if (wait > 0) await this.sleep(wait);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        headers: this.headers(),
        signal: controller.signal,
      });
      this.lastRequestAt = Date.now();
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new ExternalServiceError('OneRoster authentication failed');
        }
        throw new ExternalServiceError(`OneRoster request failed with status ${response.status}`);
      }
      const payload = await response.json();
      if (!payload || !Array.isArray(payload.students)) {
        throw new ExternalServiceError('OneRoster returned an invalid student response');
      }
      return payload;
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      if (error?.name === 'AbortError') {
        throw new ExternalServiceError('OneRoster request timed out');
      }
      throw new ExternalServiceError('OneRoster request failed');
    } finally {
      clearTimeout(timeout);
    }
  }

  headers() {
    const headers = { accept: 'application/json' };
    if (this.authType === 'basic') {
      headers.authorization = `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`;
    } else if (this.token) {
      headers.authorization = `Bearer ${this.token}`;
    }
    return headers;
  }
}
