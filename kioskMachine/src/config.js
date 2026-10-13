import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

export function loadConfig(env = process.env) {
  const dotenvPath = path.join(projectRoot, '.env');

  if (fs.existsSync(dotenvPath)) {
    const raw = fs.readFileSync(dotenvPath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const [key, ...rest] = trimmed.split('=');
      const value = rest.join('=').trim();
      if (!(key in env)) {
        env[key] = value.replace(/^['"]|['"]$/g, '');
      }
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
    serverUrl: env.KIOSK_SERVER_URL || stored.serverUrl || '',
    enrollmentToken: '',
    port: Number.isFinite(port) ? port : 4177,
    heartbeatMs: Number.isFinite(heartbeatMs) ? heartbeatMs : 30000,
    registered: Boolean(
      (env.KIOSK_CODE || stored.kioskCode) && (env.KIOSK_SECRET || stored.kioskSecret),
    ),
  };
}

export function saveEnrolledConfig(config) {
  const storedPath = path.join(projectRoot, 'kiosk-config.json');
  fs.writeFileSync(
    storedPath,
    JSON.stringify(
      {
        kioskCode: config.kioskCode,
        kioskSecret: config.kioskSecret,
        serverUrl: config.serverUrl,
      },
      null,
      2,
    ),
    { encoding: 'utf8', mode: 0o600 },
  );
}

function readStoredConfig() {
  const storedPath = path.join(projectRoot, 'kiosk-config.json');
  try {
    return JSON.parse(fs.readFileSync(storedPath, 'utf8'));
  } catch (_error) {
    return {};
  }
}
