import { createHmac, randomBytes } from 'node:crypto';
import { ExternalServiceError } from '#errors';
import { normalizeStudent } from '#services/sis/sis-normalizer.js';
import { SISProvider } from './sis-provider.js';
import { fetchJson, hasNextPage, pageRecords, requireHttpProvider } from './http-provider.js';

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_TIMEOUT_MS = 15_000;

export function createSchoologyProvider(options = {}) {
  return new SchoologyProvider(options);
}

export class SchoologyProvider extends SISProvider {
  constructor({
    baseUrl,
    protocol = 'api',
    studentPath = '/users',
    version = '1.1',
    authType = 'oauth1',
    consumerKey = '',
    consumerSecret = '',
    token = '',
    tokenSecret = '',
    username = '',
    password = '',
    pageSize = DEFAULT_PAGE_SIZE,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    minIntervalMs = 0,
    fetchImpl = globalThis.fetch,
    sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
  } = {}) {
    super();
    this.baseUrl = String(baseUrl || '').replace(/\/+$/, '');
    this.protocol = protocol;
    this.studentPath = studentPath;
    this.version = version === '1.2' ? 'v1p2' : 'v1p1';
    this.authType = authType;
    this.consumerKey = consumerKey;
    this.consumerSecret = consumerSecret;
    this.token = token;
    this.tokenSecret = tokenSecret;
    this.username = username;
    this.password = password;
    this.pageSize = Math.max(1, Number(pageSize) || DEFAULT_PAGE_SIZE);
    this.timeoutMs = Math.max(1, Number(timeoutMs) || DEFAULT_TIMEOUT_MS);
    this.minIntervalMs = Math.max(0, Number(minIntervalMs) || 0);
    this.fetchImpl = fetchImpl;
    this.sleep = sleep;
    this.connected = false;
    this.lastRequestAt = 0;
  }

  async connect() {
    if (!this.baseUrl) throw new ExternalServiceError('Schoology base URL is required');
    requireHttpProvider(this.fetchImpl, 'Schoology');
    if (!['api', 'oneroster'].includes(this.protocol)) {
      throw new ExternalServiceError('Schoology protocol must be api or oneroster');
    }
    if (this.protocol === 'api' && this.authType !== 'oauth1') {
      throw new ExternalServiceError('Schoology REST API requires OAuth 1.0a credentials');
    }
    if (this.protocol === 'api' && (!this.consumerKey || !this.consumerSecret || !this.token || !this.tokenSecret)) {
      throw new ExternalServiceError('Schoology OAuth 1.0a credentials are required');
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
      const records = pageRecords(payload, ['users', 'students', 'data'], 'Schoology');
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
    if (!this.connected) throw new ExternalServiceError('Schoology provider is not connected');
  }

  async fetchPage(offset) {
    const path = this.protocol === 'oneroster'
      ? `/ims/oneroster/${this.version}/students`
      : this.studentPath;
    const url = new URL(path, `${this.baseUrl}/`);
    if (this.protocol === 'api') url.searchParams.set('role', 'student');
    url.searchParams.set('limit', this.pageSize);
    url.searchParams.set(this.protocol === 'api' ? 'start' : 'offset', offset);
    const result = await fetchJson({
      fetchImpl: this.fetchImpl,
      url: url.toString(),
      headers: this.headers(url),
      timeoutMs: this.timeoutMs,
      minIntervalMs: this.minIntervalMs,
      lastRequestAt: this.lastRequestAt,
      sleep: this.sleep,
      providerName: 'Schoology',
    });
    this.lastRequestAt = result.requestedAt;
    if (!result.payload || typeof result.payload !== 'object') {
      throw new ExternalServiceError('Schoology returned an invalid student response');
    }
    return result;
  }

  headers(url) {
    if (this.protocol === 'oneroster') {
      const headers = { accept: 'application/json' };
      if (this.authType === 'basic') {
        headers.authorization = `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`;
      } else if (this.token) {
        headers.authorization = `Bearer ${this.token}`;
      }
      return headers;
    }
    const oauth = {
      oauth_consumer_key: this.consumerKey,
      oauth_nonce: randomBytes(16).toString('hex'),
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
      oauth_version: '1.0',
    };
    if (this.token) oauth.oauth_token = this.token;
    const parameters = [...url.searchParams].map(([key, value]) => [key, value]);
    parameters.push(...Object.entries(oauth));
    const parameterString = parameters.sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      `${leftKey}=${leftValue}`.localeCompare(`${rightKey}=${rightValue}`)).map(([key, value]) =>
      `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
    const base = `GET&${encodeURIComponent(url.origin + url.pathname)}&${encodeURIComponent(parameterString)}`;
    oauth.oauth_signature = createHmac('sha1', `${encodeURIComponent(this.consumerSecret)}&${encodeURIComponent(this.tokenSecret)}`).update(base).digest('base64');
    return {
      accept: 'application/json',
      authorization: `OAuth ${Object.keys(oauth).sort().map((key) => `${encodeURIComponent(key)}="${encodeURIComponent(oauth[key])}"`).join(', ')}`,
    };
  }
}