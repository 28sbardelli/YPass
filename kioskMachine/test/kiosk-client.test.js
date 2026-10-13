import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildHeartbeatPayload,
  buildKioskHeaders,
  establishKioskSession,
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
