import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, saveEnrolledConfig, savePendingEnrollmentConfig } from './config.js';
import {
  callKioskApi,
  establishKioskSession,
  enrollKiosk,
  getKioskEnrollmentStatus,
  sendHeartbeat,
  startKioskEnrollment,
} from './kiosk-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '../public');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function readRequestBody(req, maxBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (chunk) => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > maxBytes) {
        tooLarge = true;
        const error = new Error('Request body is too large.');
        error.statusCode = 413;
        reject(error);
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});

      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(Object.fromEntries(new URLSearchParams(raw).entries()));
      }
    });
    req.on('error', reject);
  });
}

function readRawRequestBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (chunk) => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > maxBytes) {
        tooLarge = true;
        const error = new Error('Request body is too large.');
        error.statusCode = 413;
        reject(error);
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function serveStaticAsset(filePath, res) {
  try {
    const file = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] ?? 'application/octet-stream' });
    res.end(file);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

export async function createKioskServer(options = {}) {
  const config = { ...loadConfig(), ...options };
  const startEnrollment = options.startEnrollment || startKioskEnrollment;
  const state = {
    lastHeartbeatAt: null,
    lastStudent: null,
    enrollmentExpiresAt: config.enrollmentExpiresAt || null,
    centralSessionCookie: '',
  };
  let enrollmentStartPromise = null;
  let centralStatusPromise = null;

  async function ensureEnrollment() {
    if (config.registered || config.enrollmentCode || !config.serverUrl) return;
    if (!enrollmentStartPromise) {
      enrollmentStartPromise = (async () => {
        try {
          const result = await startEnrollment({
            serverUrl: config.serverUrl,
            softwareVersion: '1.0.0',
          });
          config.enrollmentCode = result.enrollmentCode;
          config.enrollmentToken = result.enrollmentToken;
          config.enrollmentExpiresAt = result.expiresAt;
          state.enrollmentExpiresAt = result.expiresAt;
          savePendingEnrollmentConfig(config);
        } catch (_error) {
          // The browser will show the connection failure and retry on its next poll.
        } finally {
          enrollmentStartPromise = null;
        }
      })();
    }
    await enrollmentStartPromise;
  }

  async function ensureCentralSession() {
    if (state.centralSessionCookie) return;
    const session = await establishKioskSession({ serverUrl: config.serverUrl, config });
    state.centralSessionCookie = session.cookieHeader;
    saveEnrolledConfig(config);
  }

  async function checkCentralStatus() {
    if (!centralStatusPromise) {
      centralStatusPromise = sendHeartbeat({ serverUrl: config.serverUrl, config })
        .then((result) => {
          state.lastHeartbeatAt = result.timestamp || new Date().toISOString();
          return result.ok;
        })
        .catch(() => false)
        .finally(() => {
          centralStatusPromise = null;
        });
    }
    return centralStatusPromise;
  }

  async function recoverFromInvalidCredentials(res) {
    Object.assign(config, {
      kioskCode: '',
      kioskSecret: '',
      registered: false,
      enrollmentCode: null,
      enrollmentToken: '',
      enrollmentExpiresAt: null,
    });
    state.centralSessionCookie = '';
    state.enrollmentExpiresAt = null;
    savePendingEnrollmentConfig(config);
    await ensureEnrollment();
    res.writeHead(302, { Location: '/' });
    res.end();
  }

  async function proxyCentralPage(req, res) {
    const body = req.method === 'GET' ? undefined : await readRawRequestBody(req);
    try {
      await ensureCentralSession();
      let response = await fetch(new URL(req.url, config.serverUrl), {
        method: req.method,
        headers: {
          ...(req.method === 'GET'
            ? {}
            : {
                'content-type': req.headers['content-type'] || 'application/x-www-form-urlencoded',
              }),
          ...(state.centralSessionCookie ? { cookie: state.centralSessionCookie } : {}),
        },
        body,
        redirect: 'manual',
      });
      rememberCentralCookies(response);
      if (response.status === 401) {
        state.centralSessionCookie = '';
        await ensureCentralSession();
        response = await fetch(new URL(req.url, config.serverUrl), {
          method: req.method,
          headers: {
            ...(req.method === 'GET'
              ? {}
              : {
                  'content-type':
                    req.headers['content-type'] || 'application/x-www-form-urlencoded',
                }),
            cookie: state.centralSessionCookie,
          },
          body,
          redirect: 'manual',
        });
        rememberCentralCookies(response);
      }
      const contentType = response.headers.get('content-type') || 'text/html; charset=utf-8';
      if (response.status === 401) {
        await recoverFromInvalidCredentials(res);
        return;
      }
      res.writeHead(response.status, { 'Content-Type': contentType });
      res.end(await response.text());
    } catch (error) {
      if (error.status === 401) {
        await recoverFromInvalidCredentials(res);
        return;
      }
      sendCentralOfflinePage(res, req.url);
    }
  }

  function sendCentralOfflinePage(res, requestedUrl) {
    const retryUrl = JSON.stringify(requestedUrl || '/kiosk/pass').replaceAll('<', '\\u003c');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Connecting to YPass</title></head>
  <body>
    <main>
      <h1>Connecting to YPass</h1>
      <p>The kiosk will keep trying until the server is available.</p>
    </main>
    <script>
      const requestedUrl = ${retryUrl};
      let retryTimer;

      async function checkConnection() {
        try {
          const response = await fetch('/api/central-status', { cache: 'no-store' });
          if (response.ok) {
            window.location.replace(requestedUrl);
            return;
          }
        } catch (_error) {}
        retryTimer = window.setTimeout(checkConnection, 3000);
      }
      retryTimer = window.setTimeout(checkConnection, 0);
    </script>
  </body>
</html>`);
  }

  function rememberCentralCookies(response) {
    const cookies =
      response.headers.getSetCookie?.() || getSetCookieFallback(response.headers.get('set-cookie'));
    for (const cookie of cookies) {
      const pair = cookie.split(';', 1)[0];
      const name = pair.split('=', 1)[0];
      const current = state.centralSessionCookie
        .split('; ')
        .filter((item) => item && !item.startsWith(`${name}=`));
      current.push(pair);
      state.centralSessionCookie = current.join('; ');
    }
  }

  function getSetCookieFallback(header) {
    return header ? header.split(/,\s*(?=[^;,=]+=[^;,]+)/) : [];
  }

  const server = http.createServer(async (req, res) => {
    try {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
    if (!isAllowedLocalOrigin(req)) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, message: 'Cross-origin requests are not allowed.' }));
      return;
    }
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/css/register.css') {
      await serveStaticAsset(path.join(publicDir, 'css', 'register.css'), res);
      return;
    }

    if (
      ['/kiosk/pass', '/kiosk/pass/status', '/kiosk/scan'].includes(url.pathname) ||
      url.pathname.startsWith('/css/') ||
      url.pathname.startsWith('/js/')
    ) {
      await proxyCentralPage(req, res);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/config') {
      await ensureEnrollment();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          kioskCode: config.kioskCode,
          kioskName: config.kioskName,
          kioskLocation: config.kioskLocation,
          serverUrl: config.serverUrl,
          status: 'online',
          registered: config.registered,
          enrollmentCode: config.enrollmentCode || null,
          enrollmentExpiresAt: state.enrollmentExpiresAt,
        }),
      );
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/enrollment/status') {
      if (!config.enrollmentCode) await ensureEnrollment();
      if (!config.enrollmentCode) {
        sendJson(
          res,
          { ok: false, status: 'offline', message: 'Unable to connect to YPass.' },
          502,
        );
        return;
      }
      try {
        const result = await getKioskEnrollmentStatus({
          serverUrl: config.serverUrl,
          enrollmentCode: config.enrollmentCode,
          enrollmentToken: config.enrollmentToken,
        });
        if (result.status === 'complete') {
          Object.assign(config, {
            kioskCode: result.kiosk.code,
            kioskSecret: result.credentials.secret,
            serverUrl: result.serverUrl || config.serverUrl,
            registered: true,
            enrollmentCode: null,
            enrollmentToken: '',
            enrollmentExpiresAt: null,
          });
          state.enrollmentExpiresAt = null;
          saveEnrolledConfig(config);
        }
        sendJson(res, { ok: true, ...result });
      } catch (error) {
        if (error.status === 404) {
          config.enrollmentCode = null;
          config.enrollmentToken = '';
          config.enrollmentExpiresAt = null;
          state.enrollmentExpiresAt = null;
          savePendingEnrollmentConfig(config);
          await ensureEnrollment();
        }
        sendJson(
          res,
          { ok: false, status: 'offline', message: error.message },
          error.status || 502,
        );
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/enroll') {
      const payload = await readRequestBody(req);
      try {
        const result = await enrollKiosk({
          serverUrl: String(payload.serverUrl || config.serverUrl),
          enrollmentCode: String(payload.enrollmentCode || ''),
          softwareVersion: String(payload.softwareVersion || 'unknown'),
        });
        Object.assign(config, {
          kioskCode: result.kiosk.code,
          kioskSecret: result.credentials.secret,
          serverUrl: result.serverUrl || config.serverUrl,
          registered: true,
        });
        saveEnrolledConfig(config);
        sendJson(res, { ok: true, kioskCode: config.kioskCode });
      } catch (error) {
        sendJson(res, { ok: false, message: error.message }, 400);
      }
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          ok: true,
          kioskCode: config.kioskCode,
          location: config.kioskLocation,
          status: 'online',
          lastHeartbeatAt: state.lastHeartbeatAt,
        }),
      );
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/central-status') {
      const online = await checkCentralStatus();
      sendJson(
        res,
        { ok: online, status: online ? 'online' : 'offline' },
        online ? 200 : 503,
      );
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/heartbeat') {
      if (!config.registered) {
        sendJson(
          res,
          { ok: false, status: 'unregistered', message: 'Kiosk is not registered.' },
          409,
        );
        return;
      }
      await readRequestBody(req);
      try {
        const result = await sendHeartbeat({ serverUrl: config.serverUrl, config });
        state.lastHeartbeatAt = result.timestamp || new Date().toISOString();
        sendJson(res, { ok: result.ok, ...result });
      } catch (error) {
        sendJson(res, { ok: false, status: 'offline', message: error.message }, 502);
      }
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/options') {
      try {
        const result = await callKioskApi({
          serverUrl: config.serverUrl,
          config,
          path: 'options',
          method: 'GET',
        });
        sendJson(res, { ok: true, ...result });
      } catch (error) {
        sendJson(res, { ok: false, message: error.message }, 502);
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/scan') {
      const payload = await readRequestBody(req);
      const studentNumber = String(payload.studentNumber || '').trim();
      const studentName = String(payload.studentName || '').trim();

      state.lastStudent = { studentNumber, studentName, scannedAt: new Date().toISOString() };
      try {
        const result = await callKioskApi({
          serverUrl: config.serverUrl,
          config,
          path: 'scan',
          payload: { studentNumber, studentName },
        });
        sendJson(res, { ok: true, ...result });
      } catch (error) {
        sendJson(res, { ok: false, message: error.message }, 400);
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/request-pass') {
      const payload = await readRequestBody(req);
      const destinationLocationId = String(payload.destinationLocationId || '').trim();
      const studentNumber = String(payload.studentNumber || '').trim();
      const studentName = String(payload.studentName || '').trim();

      try {
        const result = await callKioskApi({
          serverUrl: config.serverUrl,
          config,
          path: 'request-pass',
          payload: { studentNumber, studentName, destinationLocationId },
        });
        sendJson(res, { ok: true, ...result });
      } catch (error) {
        sendJson(res, { ok: false, message: error.message }, 400);
      }
      return;
    }

    if (req.method === 'GET' && url.pathname === '/') {
      await serveStaticAsset(path.join(publicDir, 'index.html'), res);
      return;
    }

    if (req.method === 'GET' && url.pathname.startsWith('/')) {
      let decodedPath;
      try { decodedPath = decodeURIComponent(url.pathname); } catch { decodedPath = ''; }
      const requestedFile = path.resolve(publicDir, `.${decodedPath}`);
      const relativePath = path.relative(publicDir, requestedFile);
      if (decodedPath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)) {
        await serveStaticAsset(requestedFile, res);
        return;
      }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    } catch (error) {
      if (!res.headersSent && !res.destroyed) {
        sendJson(
          res,
          {
            ok: false,
            message:
              error.statusCode === 413
                ? 'Request body is too large.'
                : 'The kiosk encountered an internal error.',
          },
          error.statusCode || 500,
        );
      } else if (!res.destroyed) {
        res.destroy();
      }
    }
  });

  let heartbeatInFlight = false;
  const heartbeatTimer = setInterval(async () => {
    if (!config.registered || heartbeatInFlight) return;
    heartbeatInFlight = true;
    try {
      const result = await sendHeartbeat({ serverUrl: config.serverUrl, config });
      state.lastHeartbeatAt = result.timestamp || new Date().toISOString();
    } catch (_error) {
      // The central server remains authoritative when the kiosk is offline.
    } finally {
      heartbeatInFlight = false;
    }
  }, config.heartbeatMs);
  heartbeatTimer.unref?.();

  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  const host = config.host || '127.0.0.1';
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, host, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  return {
    server,
    config,
    state,
    close: () =>
      new Promise((resolve, reject) => {
        clearInterval(heartbeatTimer);
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections?.();
      }),
  };
}

function isAllowedLocalOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  if (origin === 'null') return isAllowedLocalOriginValue(req.headers.referer, req);
  return isAllowedLocalOriginValue(origin, req);
}

function isAllowedLocalOriginValue(value, req) {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    const allowedHost = ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(hostname);
    const requestPort = String(req.socket.localPort || '');
    return parsed.protocol === 'http:' && allowedHost && parsed.port === requestPort;
  } catch {
    return false;
  }
}

function sendJson(res, body, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

if (process.argv[1] === __filename) {
  const config = loadConfig();
  const { server } = await createKioskServer(config);
  console.log(`Kiosk app running at http://localhost:${config.port}`);
  console.log(`Kiosk location: ${config.kioskLocation}`);
  server.on('close', () => process.exit(0));
}
