import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import {
  buildHeartbeatPayload,
  buildKioskHeaders,
  establishKioskSession,
  getKioskOptions,
  normaliseServerStatus,
} from '../src/kiosk-client.js';

test('buildKioskHeaders includes kiosk auth values', () => {
  const headers = buildKioskHeaders({ kioskCode: 'KSK-204', kioskSecret: 'super-secret' });

  assert.deepEqual(headers, {
    'x-kiosk-code': 'KSK-204',
    'x-kiosk-secret': 'super-secret',
    'content-type': 'application/json',
  });
});

test('buildHeartbeatPayload records the kiosk status and code', () => {
  const payload = buildHeartbeatPayload({ kioskCode: 'KSK-204', kioskLocation: 'Room 204' });

  assert.equal(payload.kioskCode, 'KSK-204');
  assert.equal(payload.location, 'Room 204');
  assert.equal(payload.status, 'online');
});

test('normaliseServerStatus preserves connection details', () => {
  const status = normaliseServerStatus({
    ok: true,
    server: 'https://api.example.test',
    kiosk: 'KSK-204',
  });

  assert.equal(status.ok, true);
  assert.equal(status.server, 'https://api.example.test');
  assert.equal(status.kiosk, 'KSK-204');
});

test('establishKioskSession returns a browser-safe cookie header', async () => {
  const session = await establishKioskSession({
    serverUrl: 'https://api.example.test',
    config: { kioskCode: 'KSK-204', kioskSecret: 'super-secret' },
    fetchImpl: async (_url, options) => {
      assert.equal(options.method, 'POST');
      return {
        ok: true,
        headers: {
          getSetCookie: () => ['ypass.sid=opaque; Path=/; HttpOnly', 'fbapp.csrf=token; Path=/'],
        },
        async json() {
          return { data: { kiosk: { code: 'KSK-204' } } };
        },
      };
    },
  });

  assert.equal(session.cookieHeader, 'ypass.sid=opaque; fbapp.csrf=token');
});

test('getKioskOptions returns destinations from the central kiosk API', async () => {
  const options = await getKioskOptions({
    serverUrl: 'https://api.example.test',
    config: { kioskCode: 'KSK-204', kioskSecret: 'super-secret' },
    fetchImpl: async (url, request) => {
      assert.equal(url, 'https://api.example.test/api/v1/kiosks/options');
      assert.equal(request.method, 'GET');
      return {
        ok: true,
        async json() {
          return {
            data: {
              kiosk: { code: 'KSK-204' },
              destinations: [{ id: 'location-1', name: 'Counselor' }],
            },
          };
        },
      };
    },
  });

  assert.deepEqual(options.destinations, [{ id: 'location-1', name: 'Counselor' }]);
});


test('local kiosk server exposes health without exposing its secret', async (t) => {
  const { createKioskServer } = await import('../src/server.js');
  const instance = await createKioskServer({
    host: '127.0.0.1',
    port: 0,
    heartbeatMs: 30000,
    kioskCode: 'KSK-TEST',
    kioskSecret: 'never-return-this-secret',
    kioskName: 'Test Kiosk',
    kioskLocation: 'Room 1',
    serverUrl: 'http://127.0.0.1:1',
    registered: true,
  });
  t.after(() => instance.close());
  const port = instance.server.address().port;
  const configResponse = await fetch(`http://127.0.0.1:${port}/api/config`);
  const config = await configResponse.json();
  assert.equal(config.kioskCode, 'KSK-TEST');
  assert.equal(config.registered, true);
  assert.equal(JSON.stringify(config).includes('never-return-this-secret'), false);
  assert.equal(configResponse.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');

  const healthResponse = await fetch(`http://127.0.0.1:${port}/api/health`);
  assert.equal(healthResponse.status, 200);
  assert.equal((await healthResponse.json()).ok, true);
});

test('local kiosk server retries central requests after an outage', async (t) => {
  const { createKioskServer } = await import('../src/server.js');
  const instance = await createKioskServer({
    host: '127.0.0.1',
    port: 0,
    heartbeatMs: 30000,
    registered: true,
    kioskCode: 'KSK-TEST',
    kioskSecret: 'secret',
    serverUrl: 'http://127.0.0.1:1',
  });
  t.after(() => instance.close());
  const port = instance.server.address().port;

  const pageResponse = await fetch(`http://127.0.0.1:${port}/kiosk/pass`);
  assert.equal(pageResponse.status, 200);
  const page = await pageResponse.text();
  assert.match(page, /Connecting to YPass/);
  assert.match(page, /fetch\('\/api\/central-status'/);
  assert.match(page, /window\.location\.replace\(requestedUrl\)/);

  const statusResponse = await fetch(`http://127.0.0.1:${port}/api/central-status`);
  assert.equal(statusResponse.status, 503);
  assert.deepEqual(await statusResponse.json(), { ok: false, status: 'offline' });
});

test('local kiosk server rejects cross-origin browser requests', async (t) => {
  const { createKioskServer } = await import('../src/server.js');
  const instance = await createKioskServer({
    host: '127.0.0.1',
    port: 0,
    heartbeatMs: 30000,
    registered: false,
    serverUrl: 'http://127.0.0.1:1',
  });
  t.after(() => instance.close());
  const port = instance.server.address().port;
  const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
    headers: { Origin: 'https://malicious.example' },
  });
  assert.equal(response.status, 403);
});

test('local kiosk server accepts Electron requests with a trusted origin', async (t) => {
  const { createKioskServer } = await import('../src/server.js');
  const instance = await createKioskServer({
    host: '127.0.0.1',
    port: 0,
    heartbeatMs: 30000,
    registered: false,
    serverUrl: 'http://127.0.0.1:1',
  });
  t.after(() => instance.close());
  const port = instance.server.address().port;
  const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
    headers: {
      Origin: `http://127.0.0.1:${port}`,
      'Sec-Fetch-Site': 'cross-site',
    },
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
});

test('local kiosk server accepts trusted origins when Host omits the dev port', async (t) => {
  const { createKioskServer } = await import('../src/server.js');
  const instance = await createKioskServer({
    host: '127.0.0.1',
    port: 0,
    heartbeatMs: 30000,
    registered: false,
    serverUrl: 'http://127.0.0.1:1',
  });
  t.after(() => instance.close());
  const port = instance.server.address().port;
  const response = await new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port,
      path: '/api/health',
      headers: {
        Host: 'localhost',
        Origin: `http://localhost:${port}`,
      },
    }, (result) => {
      const chunks = [];
      result.on('data', (chunk) => chunks.push(chunk));
      result.on('end', () => resolve({ status: result.statusCode, body: Buffer.concat(chunks).toString() }));
    });
    request.on('error', reject);
    request.end();
  });
  assert.equal(response.status, 200);
  assert.equal(JSON.parse(response.body).ok, true);
});

test('local kiosk server accepts sandboxed form posts with a local referer', async (t) => {
  const { createKioskServer } = await import('../src/server.js');
  const instance = await createKioskServer({
    host: '127.0.0.1',
    port: 0,
    heartbeatMs: 30000,
    registered: false,
    serverUrl: 'http://127.0.0.1:1',
  });
  t.after(() => instance.close());
  const port = instance.server.address().port;
  const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
    headers: {
      Origin: 'null',
      Referer: `http://127.0.0.1:${port}/kiosk/pass`,
    },
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
});

test('local kiosk server starts only one enrollment for concurrent config requests', async (t) => {
  const { createKioskServer } = await import('../src/server.js');
  let startCount = 0;
  const instance = await createKioskServer({
    host: '127.0.0.1',
    port: 0,
    heartbeatMs: 30000,
    registered: false,
    enrollmentCode: '',
    enrollmentToken: '',
    serverUrl: 'https://central.example.test',
    startEnrollment: async () => {
      startCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return {
        enrollmentCode: 'ABCD-EFGH',
        enrollmentToken: 'enrollment-token',
        expiresAt: '2026-11-06T10:00:00.000Z',
      };
    },
  });
  t.after(() => instance.close());
  const port = instance.server.address().port;
  const responses = await Promise.all([
    fetch(`http://127.0.0.1:${port}/api/config`),
    fetch(`http://127.0.0.1:${port}/api/config`),
  ]);
  const configs = await Promise.all(responses.map((response) => response.json()));

  assert.equal(startCount, 1);
  assert.equal(configs[0].enrollmentCode, 'ABCD-EFGH');
  assert.equal(configs[1].enrollmentCode, 'ABCD-EFGH');
});

test('local kiosk server returns to registration when enrolled credentials are rejected', async (t) => {
  const { createKioskServer } = await import('../src/server.js');
  const instance = await createKioskServer({
    host: '127.0.0.1',
    port: 0,
    heartbeatMs: 30000,
    registered: true,
    kioskCode: 'KSK-STALE',
    kioskSecret: 'stale-secret',
    serverUrl: 'https://central.example.test',
    startEnrollment: async () => ({
      enrollmentCode: 'NEW-CODE',
      enrollmentToken: 'new-token',
      expiresAt: '2026-11-06T10:00:00.000Z',
    }),
  });
  t.after(() => instance.close());

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith('/api/v1/kiosks/session')) {
      const error = new Error('Kiosk disabled');
      error.status = 401;
      throw error;
    }
    if (String(url).includes('127.0.0.1')) return originalFetch(url, options);
    throw new Error(`Unexpected request: ${url}`);
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const port = instance.server.address().port;
  const response = await fetch(`http://127.0.0.1:${port}/kiosk/pass`, { redirect: 'manual' });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/');

  const configResponse = await fetch(`http://127.0.0.1:${port}/api/config`);
  const config = await configResponse.json();
  assert.equal(config.registered, false);
  assert.equal(config.enrollmentCode, 'NEW-CODE');
});

test('kiosk registration page serves its site-themed stylesheet', async (t) => {
  const { createKioskServer } = await import('../src/server.js');
  const instance = await createKioskServer({
    host: '127.0.0.1',
    port: 0,
    heartbeatMs: 30000,
    registered: false,
    serverUrl: 'http://127.0.0.1:1',
  });
  t.after(() => instance.close());
  const baseUrl = `http://127.0.0.1:${instance.server.address().port}`;

  const pageResponse = await fetch(baseUrl);
  const page = await pageResponse.text();
  assert.equal(pageResponse.status, 200);
  assert.match(page, /href="\/css\/register\.css"/);

  const stylesheetResponse = await fetch(`${baseUrl}/css/register.css`);
  const stylesheet = await stylesheetResponse.text();
  assert.equal(stylesheetResponse.status, 200);
  assert.match(stylesheetResponse.headers.get('content-type'), /text\/css/);
  assert.match(stylesheet, /--accent: #586a4d/);
  assert.match(stylesheet, /--bg: #eceeea/);
});

test('local kiosk server does not serve files outside the public directory', async (t) => {
  const { createKioskServer } = await import('../src/server.js');
  const instance = await createKioskServer({
    host: '127.0.0.1',
    port: 0,
    heartbeatMs: 30000,
    registered: false,
    serverUrl: 'http://127.0.0.1:1',
  });
  t.after(() => instance.close());
  const port = instance.server.address().port;
  const response = await fetch(`http://127.0.0.1:${port}/%2e%2e/README.md`);
  assert.equal(response.status, 404);
});
