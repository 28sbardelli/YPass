import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const dataDir = () => process.env.KIOSK_DATA_DIR || projectRoot;
const storedConfigPath = () => path.join(dataDir(), 'kiosk-config.json');

export function loadConfig(env = process.env) {
  // In packaged Electron builds, settings live outside app.asar in the
  // writable per-user data directory. Keep project-root .env for Node dev mode.
  const dotenvPaths = [...new Set([path.join(dataDir(), '.env'), path.join(projectRoot, '.env')])];
  for (const dotenvPath of dotenvPaths) {
    if (!fs.existsSync(dotenvPath)) continue;
    const raw = fs.readFileSync(dotenvPath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const [key, ...rest] = trimmed.split('=');
      const value = rest.join('=').trim();
      if (!(key in env)) env[key] = value.replace(/^['"]|['"]$/g, '');
    }
  }

  const port = Number(env.KIOSK_PORT ?? 4177);
  const heartbeatMs = Number(env.KIOSK_HEARTBEAT_MS ?? 30000);

  const stored = readStoredConfig();
  return {
    kioskCode: env.KIOSK_CODE || stored.kioskCode || '',
    kioskName: env.KIOSK_NAME || stored.kioskName || 'Hall Pass Kiosk',
    kioskLocation: env.KIOSK_LOCATION || stored.kioskLocation || 'Unknown Location',
    kioskSecret: env.KIOSK_SECRET || stored.kioskSecret || '',
    serverUrl: env.KIOSK_SERVER_URL || stored.serverUrl || 'http://localhost:3000',
    enrollmentCode: stored.enrollmentCode || '',
    enrollmentToken: stored.enrollmentToken || '',
    enrollmentExpiresAt: stored.enrollmentExpiresAt || null,
    port: Number.isInteger(port) && port >= 0 && port <= 65535 ? port : 4177,
    host: env.KIOSK_HOST || '127.0.0.1',
    heartbeatMs: Number.isFinite(heartbeatMs) && heartbeatMs >= 5000 ? heartbeatMs : 30000,
    registered: Boolean(
      (env.KIOSK_CODE || stored.kioskCode) && (env.KIOSK_SECRET || stored.kioskSecret),
    ),
  };
}

export function saveEnrolledConfig(config) {
  saveConfig({
    kioskCode: config.kioskCode,
    kioskSecret: config.kioskSecret,
    serverUrl: config.serverUrl,
  });
}

export function savePendingEnrollmentConfig(config) {
  saveConfig({
    serverUrl: config.serverUrl,
    enrollmentCode: config.enrollmentCode,
    enrollmentToken: config.enrollmentToken,
    enrollmentExpiresAt: config.enrollmentExpiresAt,
  });
}

function saveConfig(values) {
  const storedPath = storedConfigPath();
  fs.mkdirSync(path.dirname(storedPath), { recursive: true });
  const temporaryPath = `${storedPath}.${process.pid}.tmp`;
  const contents = JSON.stringify(values, null, 2);
  fs.writeFileSync(temporaryPath, contents, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporaryPath, storedPath);
  if (process.platform !== 'win32') fs.chmodSync(storedPath, 0o600);
}

function readStoredConfig() {
  const storedPath = storedConfigPath();
  try {
    return JSON.parse(fs.readFileSync(storedPath, 'utf8'));
  } catch (_error) {
    return {};
  }
}
