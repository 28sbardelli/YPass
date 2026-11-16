# YPass Kiosk Machine

`kioskMachine/` is the local application installed on a physical hall-pass kiosk. The Node.js process serves the setup screen, keeps kiosk credentials and the central session cookie out of browser JavaScript, proxies the central server-rendered pass page, and reports heartbeats. Electron provides the Windows desktop shell; it does not decide whether a pass is approved, active, completed, expired, or valid.

## Requirements

- Windows 10/11 for the packaged kiosk application.
- Node.js 20 or newer for development and tests.
- A reachable YPass server with `API_ENABLED=true`.
- For production, a dedicated standard Windows kiosk account. Windows Shell Launcher requires Windows Education, Enterprise, or IoT Enterprise; other editions need an approved Assigned Access configuration.

## Development

```bash
cd kioskMachine
npm install
npm test
npm start
```

`npm start` opens the Electron kiosk window. To run the original local HTTP app in a normal browser instead:

```bash
npm run start:node
# then open http://127.0.0.1:4177
```

For development with Electron:

```bash
npm run dev
```

## Build a Windows installer

```bash
npm install
npm run dist
```

The installer is written to `release/`. It bundles Electron and the app code, so the target kiosk does not need a separate Node.js installation or `npm install`. The NSIS installer is configured for per-machine installation and offers an installation-directory choice; Windows may request administrator approval. The Windows shell-management scripts are copied to `resources/windows/` in the installed application.

## Electron architecture

```text
kioskMachine/
├── electron/
│   └── main.js          # Starts the local server and owns the fullscreen window
├── app.js               # Original Node.js-only entrypoint
├── src/                 # Existing local server, config, and YPass API client
├── public/              # Existing local setup UI
├── test/
├── package.json
└── package-lock.json
```

Electron starts the existing `createKioskServer()` function inside its main process and loads the local page at `http://127.0.0.1:4177`. The existing browser code continues to call the local `/api` endpoints. Kiosk credentials and the central session cookie remain in the Node.js main process and are not exposed through Electron renderer APIs.

The local HTTP server binds to `127.0.0.1`, rather than every network interface, so its local API is not intentionally exposed to other devices on the school network. It also applies same-origin checks to browser requests, rejects cross-site fetches, limits request sizes, applies basic security headers, and uses request timeouts. The Electron renderer has context isolation enabled, Node integration disabled, and sandboxing enabled. New windows and navigation to other origins are blocked. Camera permission is limited to camera access requested by the kiosk's own local page, for camera-based QR scanning. Electron enforces a single running instance, keeps the display awake while active, recovers from renderer crashes, and can start at Windows sign-in.

## Kiosk data and credentials

During normal Node.js development, `kiosk-config.json` is stored beside the project. In Electron, it is stored in Electron's per-user application data directory (`app.getPath('userData')`) so it remains writable after installation and is not placed inside the packaged application.

The generated `kiosk-config.json` contains the enrolled kiosk secret and must remain private. Do not commit it, serve it from `public/`, or paste it into logs. The `.env` file is optional for development; do not package real secrets in the installer.

## Enrollment

1. Start the central YPass server and sign in as a manager.
2. Start the kiosk; it requests a private enrollment claim and displays only its enrollment code.
3. Open `/manager`, complete registration for the displayed code, and choose the active location and kiosk type.
4. The kiosk polls the claim status, receives its generated kiosk code and secret, and stores them in its private local config.
5. It authenticates with the central kiosk API, then loads the active destination locations for that kiosk.

Enrollment codes and private claim tokens expire after 10 minutes and can be used once. The enrollment code alone cannot retrieve kiosk credentials. The kiosk secret is returned only during enrollment.

To replace a lost or compromised secret, a manager uses **Regenerate credentials** on `/manager`, then enters the new enrollment code on the kiosk. The old credential is disabled immediately.

## Configuration

Set values in the process environment or a local `.env` file during development. Values are optional during initial enrollment.

| Variable | Purpose | Default |
| --- | --- | --- |
| `KIOSK_CODE` | Assigned central kiosk code; normally supplied by enrollment | empty |
| `KIOSK_NAME` | Local display name | `Hall Pass Kiosk` |
| `KIOSK_LOCATION` | Local display location | `Unknown Location` |
| `KIOSK_SECRET` | Existing credential; use stored config or enrollment instead | empty |
| `KIOSK_PORT` | Local HTTP port | `4177` |
| `KIOSK_SERVER_URL` | Central YPass base URL | `http://localhost:3000` |
| `KIOSK_HEARTBEAT_MS` | Heartbeat interval (minimum 5000 ms) | `30000` |
| `KIOSK_START_ON_LOGIN` | Start automatically when the Windows kiosk user signs in (`true`/`false`) | `true` in packaged Windows builds; otherwise disabled |

Environment values take precedence over the local `kiosk-config.json`. In Electron, the persisted config is kept in the Electron user-data directory.

## Local endpoints

These endpoints are served by the local kiosk process:

- `GET /api/config`: local kiosk identity and registration state
- `GET /api/health`: local process and heartbeat state
- `GET /api/options`: fetch active destination locations from YPass
- `POST /api/heartbeat`: forward a heartbeat to YPass
- `POST /api/scan`: identify a student through YPass
- `POST /api/request-pass`: submit the selected destination and pass request to YPass

The local process authenticates with the kiosk code and secret. The browser only talks to the local kiosk process and never receives the kiosk secret.

## Testing and operations

```bash
npm test
```

The kiosk sends heartbeats every 30 seconds by default. If the kiosk is disabled, central session authentication fails and the local process shows a disabled screen. If the kiosk is offline, it shows a reconnecting state and does not submit passes locally. Check the local process, `KIOSK_SERVER_URL`, central health at `/health/ready`, and whether the credential was regenerated.

## Windows production setup

### 1. Build and install

Build the installer on a Windows build computer (or a supported CI Windows runner):

```powershell
npm ci
npm test
npm run dist
```

Run the generated `release\YPass-Kiosk-Machine-Setup-1.0.0.exe` on the kiosk computer. The installer includes Electron and all application runtime files. Node.js and npm are only needed on the development/build computer.

### 2. Configure the kiosk account

Create a dedicated **standard** Windows account, such as `YPassKiosk`. Keep a separate administrator account for maintenance. Sign in once as the kiosk account so its application-data directory is created. Create or edit:

```text
%APPDATA%\YPass Kiosk Machine\.env
```

Example for a device managed with Windows Shell Launcher:

```env
KIOSK_SERVER_URL=https://your-ypass-server.example
KIOSK_PORT=4177
KIOSK_HEARTBEAT_MS=30000
KIOSK_START_ON_LOGIN=false
KIOSK_SHELL_LAUNCHER=true
```

Replace the example URL with the real YPass server address. Do not put kiosk credentials in this file; enrollment stores the secret in the private `kiosk-config.json` under the same application-data directory.

### 3. Replace Explorer for the kiosk account (Shell Launcher)

Windows Shell Launcher is the supported way to make a desktop application replace `explorer.exe` as the shell. It is supported on Windows **Education, Enterprise, and IoT Enterprise** editions, not Windows Home or Pro. Check the Windows edition before proceeding.

Open **PowerShell as Administrator** and run the script installed with the application. For the default install location:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
& "$env:ProgramFiles\YPass Kiosk Machine\resources\windows\Enable-ShellLauncher.ps1" -KioskUser "YPassKiosk"
```

If you selected a custom installation directory, pass the actual executable path too:

```powershell
& "C:\Your\Install\resources\windows\Enable-ShellLauncher.ps1" -KioskUser "YPassKiosk" -ExecutablePath "C:\Your\Install\YPass Kiosk Machine.exe"
```

The script checks the Windows edition, enables the optional Shell Launcher feature if needed, and asks for a reboot before you rerun it when Windows needs to finish enabling the feature. It then assigns the installed Electron executable as the custom shell for the named kiosk account. Shell Launcher restarts the Electron app if it exits. Sign out and back in (or restart) to apply the shell.

**Recovery:** To remove the custom shell assignment for that account, open elevated PowerShell and run:

```powershell
& "$env:ProgramFiles\YPass Kiosk Machine\resources\windows\Disable-ShellLauncher.ps1" -KioskUser "YPassKiosk"
```

Then sign out and back in or restart. The recovery script explicitly assigns `explorer.exe` to the specified kiosk user; it deliberately does not disable Shell Launcher globally because another managed account may use it. Keep an administrator account that is not assigned to the kiosk shell.

### 4. Sign-in and device lockdown

Shell Launcher starts the custom shell **after the kiosk account signs in**. It does not itself configure automatic Windows sign-in. If the device must boot straight into the kiosk without staff entering credentials, have school IT configure automatic sign-in for the dedicated, restricted kiosk account using its approved device-management process. Automatic sign-in has physical-security implications and should not be enabled on a device that can be accessed by unauthorized people.

Shell Launcher replaces the shell, but it is not a complete application allow-list: it does not by itself prevent users from launching other programs or system components. Use school-managed policy such as AppLocker/WDAC, Group Policy, and/or an appropriate Assigned Access configuration to restrict the kiosk account. Do not rely on Electron fullscreen mode as a Windows security boundary.

### 5. Verify before student use

Test sign-in, kiosk enrollment, scanning, pass requests, camera permission, network loss/recovery, YPass outage, credential regeneration, Electron process exit/restart, and the administrator recovery path before deployment.

## Operational limitations

- The installer does not automatically switch the Windows shell. A school administrator must deliberately run the supplied Shell Launcher script on a supported Windows edition, or configure Assigned Access through the school's device-management tooling.
- Automatic in-app updates are not enabled because they require a trusted update feed and release-signing process. Publish signed installers through the school's approved software deployment process.
- Keep `kiosk-config.json` private. It contains the kiosk secret; do not copy it between kiosks or include it in backups accessible to students.
- The existing server-rendered YPass manager reconfiguration workflow remains a YPass responsibility. The Electron shell only hosts the existing local kiosk application; it does not implement new manager-code routes or change YPass business logic.

## Dependency model

KioskMachine does not import or use `formbar-app-boilerplate`; the previous `file:..` dependency has been removed. Its local server and API client use Node.js built-in modules. Electron and electron-builder are development/build dependencies. The Windows installer bundles the Electron runtime and application files, so the deployed kiosk does not need Node.js or a copy of the parent YPass repository.
