export function buildKioskHeaders(config = {}) {
  return {
    'x-kiosk-code': config.kioskCode ?? '',
    'x-kiosk-secret': config.kioskSecret ?? '',
    'content-type': 'application/json',
  };
}

export function buildHeartbeatPayload(config = {}) {
  return {
    kioskCode: config.kioskCode ?? '',
    location: config.kioskLocation ?? 'Unknown Location',
    name: config.kioskName ?? 'Hall Pass Kiosk',
    status: 'online',
    timestamp: new Date().toISOString(),
  };
}

export function normaliseServerStatus(serverState = {}) {
  return {
    ok: Boolean(serverState.ok),
    server: serverState.server ?? '',
    kiosk: serverState.kiosk ?? '',
    status: serverState.status ?? 'unknown',
    message: serverState.message ?? '',
  };
}

export async function sendHeartbeat({ serverUrl, config, fetchImpl = globalThis.fetch }) {
  const response = await fetchImpl(new URL('/api/v1/kiosks/heartbeat', serverUrl).toString(), {
    method: 'POST',
    headers: buildKioskHeaders(config),
    body: JSON.stringify(buildHeartbeatPayload(config)),
  });

  const data = await response.json().catch(() => ({}));
  return normaliseServerStatus({
    ok: response.ok,
    server: serverUrl,
    kiosk: config.kioskCode ?? '',
    status: response.ok ? 'online' : 'offline',
    message: data.message ?? (response.ok ? 'heartbeat received' : 'heartbeat failed'),
  });
}

export async function establishKioskSession({ serverUrl, config, fetchImpl = globalThis.fetch }) {
  const response = await fetchImpl(new URL('/api/v1/kiosks/session', serverUrl).toString(), {
    method: 'POST',
    headers: buildKioskHeaders(config),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error?.message || 'Unable to authenticate kiosk');
    error.status = response.status;
    throw error;
  }
  const cookies =
    response.headers.getSetCookie?.() || getSetCookieFallback(response.headers.get('set-cookie'));
  const cookieHeader = cookies.map((cookie) => cookie.split(';', 1)[0]).join('; ');
  return { ...data.data, cookieHeader };
}

function getSetCookieFallback(header) {
  return header ? header.split(/,\s*(?=[^;,=]+=[^;,]+)/) : [];
}

export async function enrollKiosk({
  serverUrl,
  enrollmentCode,
  softwareVersion,
  fetchImpl = globalThis.fetch,
}) {
  const response = await fetchImpl(new URL('/api/v1/kiosks/enroll', serverUrl).toString(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ enrollmentCode, softwareVersion }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || data.message || 'Kiosk enrollment failed');
  }
  return data;
}

export async function startKioskEnrollment({
  serverUrl,
  softwareVersion,
  fetchImpl = globalThis.fetch,
}) {
  const response = await fetchImpl(new URL('/api/v1/kiosks/enrollment/start', serverUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ softwareVersion }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || 'Unable to start kiosk enrollment');
  return data;
}

export async function getKioskEnrollmentStatus({
  serverUrl,
  enrollmentCode,
  enrollmentToken,
  fetchImpl = globalThis.fetch,
}) {
  const url = new URL('/api/v1/kiosks/enrollment/status', serverUrl);
  url.searchParams.set('enrollmentCode', enrollmentCode);
  url.searchParams.set('enrollmentToken', enrollmentToken);
  const response = await fetchImpl(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error?.message || 'Unable to check kiosk enrollment');
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function callKioskApi({
  serverUrl,
  config,
  path,
  payload,
  method = 'POST',
  fetchImpl = globalThis.fetch,
}) {
  const response = await fetchImpl(new URL(`/api/v1/kiosks/${path}`, serverUrl).toString(), {
    method,
    headers: buildKioskHeaders(config),
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || data.message || 'Central YPass request failed');
  }
  return data.data;
}
