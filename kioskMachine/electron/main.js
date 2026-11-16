import { app, BrowserWindow, dialog, powerSaveBlocker, session } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { createKioskServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';

const HOST = '127.0.0.1';
const hasSingleInstanceLock = app.requestSingleInstanceLock();
let kioskServer;
let mainWindow;
let kioskOrigin;
let isQuitting = false;
let powerBlockerId;
let recoveryAttempts = 0;
let recoveryTimer;

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
}

function configureStartup() {
  if (process.platform !== 'win32') return;
  const configured = process.env.KIOSK_START_ON_LOGIN;
  const shellLauncherMode = ['1', 'true', 'yes', 'on'].includes(
    String(process.env.KIOSK_SHELL_LAUNCHER || '').toLowerCase(),
  );
  // Shell Launcher starts Electron as the Windows shell; do not also create a
  // Run-at-login entry for the same account.
  const openAtLogin = !shellLauncherMode && (configured == null
    ? app.isPackaged
    : !['0', 'false', 'no', 'off'].includes(configured.toLowerCase()));
  app.setLoginItemSettings({ openAtLogin, path: process.execPath, args: ['--kiosk-autostart'] });
}

function installPermissionPolicy() {
  session.defaultSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    return permission === 'media' && requestingOrigin === kioskOrigin;
  });
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestingOrigin = details?.requestingUrl ? safeOrigin(details.requestingUrl) : '';
    const wantsCamera = permission === 'media' && details?.mediaTypes?.includes('video');
    callback(Boolean(webContents && wantsCamera && requestingOrigin === kioskOrigin));
  });
}

function safeOrigin(value) {
  try { return new URL(value).origin; } catch { return ''; }
}

async function startKiosk() {
  // Use a predictable, writable per-user location for kiosk settings and secrets.
  const kioskDataPath = path.join(app.getPath('appData'), 'YPass Kiosk Machine');
  app.setPath('userData', kioskDataPath);
  fs.mkdirSync(kioskDataPath, { recursive: true });
  process.env.KIOSK_DATA_DIR = kioskDataPath;
  process.env.KIOSK_HOST = HOST;
  app.setAppUserModelId('org.ypass.kioskmachine');
  const config = loadConfig();
  configureStartup();
  config.host = HOST;
  kioskServer = await createKioskServer(config);
  const address = kioskServer.server.address();
  kioskOrigin = `http://${HOST}:${address.port}`;
  installPermissionPolicy();

  // Keep the display awake while the kiosk is operating.
  powerBlockerId = powerSaveBlocker.start('prevent-display-sleep');
  await createKioskWindow();
}

async function createKioskWindow() {
  if (isQuitting) return;
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    kiosk: true,
    fullscreen: true,
    autoHideMenuBar: true,
    backgroundColor: '#0f172a',
    title: 'YPass Kiosk',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: !app.isPackaged,
    },
  });

  mainWindow.setMenu(null);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Reuse the kiosk window for same-origin flows (including server-side manager
    // reconfiguration pages); never launch arbitrary external windows.
    if (safeOrigin(url) === kioskOrigin) {
      setImmediate(() => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL(url).catch(() => {});
      });
    }
    return { action: 'deny' };
  });
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = input.key.toLowerCase();
    const ctrl = input.control || input.meta;
    const blockedShortcut =
      key === 'f12' ||
      (ctrl && ['r', 'w', 'n', 'p', 's'].includes(key)) ||
      (ctrl && input.shift && ['i', 'j', 'c'].includes(key));
    if (blockedShortcut) event.preventDefault();
  });
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (safeOrigin(targetUrl) !== kioskOrigin) event.preventDefault();
  });
  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());
  mainWindow.webContents.on('render-process-gone', () => scheduleRendererRecovery());
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, _description, validatedURL, isMainFrame) => {
    if (isMainFrame && errorCode !== -3 && safeOrigin(validatedURL) === kioskOrigin) {
      scheduleRendererRecovery();
    }
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) event.preventDefault();
  });
  mainWindow.once('ready-to-show', () => {
    recoveryAttempts = 0;
    mainWindow?.show();
  });
  mainWindow.on('closed', () => { mainWindow = null; });

  await mainWindow.loadURL(kioskOrigin);
}

function scheduleRendererRecovery() {
  if (isQuitting || recoveryTimer) return;
  recoveryAttempts += 1;
  const delay = Math.min(1000 * (2 ** Math.min(recoveryAttempts - 1, 5)), 30000);
  recoveryTimer = setTimeout(async () => {
    recoveryTimer = null;
    if (isQuitting) return;
    try {
      if (!mainWindow || mainWindow.isDestroyed()) await createKioskWindow();
      else await mainWindow.loadURL(kioskOrigin);
    } catch {
      scheduleRendererRecovery();
    }
  }, delay);
}

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return;
  try {
    await startKiosk();
  } catch (error) {
    dialog.showErrorBox(
      'YPass Kiosk Machine could not start',
      `${error?.message || error}\n\nCheck the kiosk configuration and whether local port ${process.env.KIOSK_PORT || 4177} is available.`,
    );
    app.quit();
  }
});

app.on('activate', () => {
  if (!mainWindow && kioskOrigin) createKioskWindow().catch(scheduleRendererRecovery);
});

app.on('before-quit', () => {
  isQuitting = true;
  if (recoveryTimer) clearTimeout(recoveryTimer);
  if (powerBlockerId !== undefined && powerSaveBlocker.isStarted(powerBlockerId)) {
    powerSaveBlocker.stop(powerBlockerId);
  }
  if (kioskServer) {
    const runningServer = kioskServer;
    kioskServer = null;
    runningServer.close().catch(() => {});
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
