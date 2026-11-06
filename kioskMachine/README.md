# YPass Kiosk Machine

`kioskMachine/` is the local application installed on a physical hall-pass kiosk. The Node.js process serves the setup screen, keeps kiosk credentials and the central session cookie out of browser JavaScript, proxies the central server-rendered pass page, and reports heartbeats. Electron provides the Windows desktop shell; it does not decide whether a pass is approved, active, completed, expired, or valid.

## Requirements

- Windows 10/11 for the packaged kiosk application.
- Node.js 20 or newer for development and tests.
- A reachable YPass server with `API_ENABLED=true`.
- For production, a dedicated restricted Windows kiosk account and Windows Assigned Access (or an equivalent school-managed device policy).

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

The installer is written to `release/`. It includes the Electron runtime, so the target kiosk does not need a separate Node.js installation. The NSIS installer is configured for per-machine installation and offers an installation-directory choice; Windows may request administrator approval.

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

Electron's fullscreen `kiosk` window is not, by itself, a Windows security boundary. For a real school deployment:

1. Create a dedicated standard Windows account for the kiosk. Do not use a staff or administrator account for daily kiosk operation.
2. Install the application using the Windows installer, but do not launch it yet.
3. While signed in as the dedicated kiosk account, create `%APPDATA%\YPass Kiosk Machine\.env`. Set `KIOSK_SERVER_URL` to the reachable central YPass URL (for example, `https://ypass.school.edu`). This is important: the default `http://localhost:3000` is only suitable when YPass runs on the same computer. You can also set `KIOSK_START_ON_LOGIN=true`. The application creates this directory automatically on first launch, but you may create it beforehand.
4. Launch YPass Kiosk Machine. Enroll the kiosk through YPass Manager. Confirm the kiosk appears online and that its assigned location and type are correct.
5. Configure Windows Assigned Access (single-app or an approved managed multi-app kiosk policy) for that account. Where supported by your Windows edition and management tooling, use Shell Launcher for a managed desktop replacement.
6. Apply school device policies for Windows Update/restart windows, network access, removable media, and account recovery. Keep a separate administrator account for maintenance.
7. Test reboot, network loss, YPass outage, credential regeneration, camera scanning, and manager reconfiguration before putting the kiosk into student use.

The app's automatic startup setting is controlled by `KIOSK_START_ON_LOGIN` in the external `.env` file or process environment. In packaged Windows builds it defaults to enabled; set it to `false` to disable it. The startup setting is per Windows user.

## Operational limitations

- The app does not install or configure Windows Assigned Access. That must be configured by school IT for the correct Windows edition and device-management policy.
- Automatic in-app updates are not enabled because they require a trusted update feed and release-signing process. Publish signed installers through the school's approved software deployment process.
- Keep `kiosk-config.json` private. It contains the kiosk secret; do not copy it between kiosks or include it in backups accessible to students.
- The existing server-rendered YPass manager reconfiguration workflow remains a YPass responsibility. The Electron shell only hosts the existing local kiosk application; it does not implement new manager-code routes or change YPass business logic.
