import { ExternalServiceError } from '#errors';
import { normalizeStudent } from '#services/sis/sis-normalizer.js';
import { SISProvider } from './sis-provider.js';
import { fetchJson, hasNextPage, pageRecords, requireHttpProvider } from './http-provider.js';

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_TIMEOUT_MS = 15_000;

export function createSkywardProvider(options = {}) {
  return new SkywardProvider(options);
}

export class SkywardProvider extends SISProvider {
  constructor({
    baseUrl,
    protocol = 'oneroster',
    version = '1.1',
    platform = 'qmlativ',
    studentPath,
    authType,
    username = '',
    password = '',
    token = '',
    apiKey = '',
    pageSize = DEFAULT_PAGE_SIZE,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    minIntervalMs = 0,
    fetchImpl = globalThis.fetch,
    sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
  } = {}) {
    super();
    this.baseUrl = String(baseUrl || '').replace(/\/+$/, '');
    this.protocol = protocol;
    this.version = version === '1.2' ? 'v1p2' : 'v1p1';
    this.platform = platform;
    this.studentPath = studentPath;
    this.authType = authType || (apiKey ? 'apiKey' : username || password ? 'basic' : 'bearer');
    this.username = username;
    this.password = password;
    this.token = token;
    this.apiKey = apiKey;
    this.pageSize = Math.max(1, Number(pageSize) || DEFAULT_PAGE_SIZE);
    this.timeoutMs = Math.max(1, Number(timeoutMs) || DEFAULT_TIMEOUT_MS);
    this.minIntervalMs = Math.max(0, Number(minIntervalMs) || 0);
    this.fetchImpl = fetchImpl;
    this.sleep = sleep;
    this.connected = false;
    this.lastRequestAt = 0;
  }

  async connect() {
    if (!this.baseUrl) throw new ExternalServiceError('Skyward base URL is required');
    requireHttpProvider(this.fetchImpl, 'Skyward');
    if (!['oneroster', 'api'].includes(this.protocol)) {
      throw new ExternalServiceError('Skyward protocol must be oneroster or api');
    }
    if (this.protocol === 'api' && !['sms20', 'qmlativ'].includes(this.platform)) {
      throw new ExternalServiceError('Skyward platform must be sms20 or qmlativ');
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
    let next = true;
    while (next) {
      const { payload } = await this.fetchPage(offset);
      const records = pageRecords(payload, ['students', 'users', 'data'], 'Skyward');
      students.push(...records.map(normalizeStudent));
      next = hasNextPage(payload, records, this.pageSize);
      if (next) offset += records.length || this.pageSize;
    }
    return students;
  }

  async disconnect() {
    this.connected = false;
  }

  ensureConnected() {
    if (!this.connected) throw new ExternalServiceError('Skyward provider is not connected');
  }

  async fetchPage(offset) {
    const path = this.studentPath ||
      (this.protocol === 'oneroster'
        ? `/ims/oneroster/${this.version}/students`
        : `/api/${this.platform}/students`);
    const url = new URL(path, `${this.baseUrl}/`);
    url.searchParams.set('limit', this.pageSize);
    url.searchParams.set('offset', offset);
    const result = await fetchJson({
      fetchImpl: this.fetchImpl,
      url: url.toString(),
      headers: this.headers(),
      timeoutMs: this.timeoutMs,
      minIntervalMs: this.minIntervalMs,
      lastRequestAt: this.lastRequestAt,
      sleep: this.sleep,
      providerName: 'Skyward',
    });
    this.lastRequestAt = result.requestedAt;
    if (!result.payload || typeof result.payload !== 'object') {
      throw new ExternalServiceError('Skyward returned an invalid student response');
    }
    return result;
  }

  headers() {
    const headers = { accept: 'application/json' };
    if (this.authType === 'basic') {
      headers.authorization = `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`;
    } else if (this.authType === 'apiKey' && this.apiKey) {
      headers['x-api-key'] = this.apiKey;
    } else if (this.token) {
      headers.authorization = `Bearer ${this.token}`;
    }
    return headers;
  }
}