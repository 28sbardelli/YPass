# YPass Kiosk Machine

`kioskMachine/` is the local application installed on a physical hall-pass kiosk. It serves the setup screen, keeps kiosk credentials and the central session cookie out of browser JavaScript, proxies the central server-rendered pass page, and reports heartbeats. It does not decide whether a pass is approved, active, completed, expired, or valid.

## Requirements and setup

The kiosk requires Node.js 18 or newer and a reachable YPass server with `API_ENABLED=true`.

```bash
cd kioskMachine
npm install
npm test
npm start
# or: node app
```

The complete `kioskMachine` directory can be copied to another machine and run independently; it does not need to be located inside the YPass server directory. Run commands from that directory so Node can find `app.js`, `src/`, and `public/`.

Set kiosk environment variables in the process environment or a local `.env` file when needed. Open <http://localhost:4177>, or use the URL printed by the process when `KIOSK_PORT` is changed.

## Enrollment

Enrollment is the normal first-run path:

1. Start the central YPass server and sign in as a manager.
2. Start the kiosk; it requests a private enrollment claim and displays only its enrollment code.
3. Open `/manager`, complete registration for the displayed code, and choose the active location and kiosk type.
4. The kiosk polls the claim status, receives its generated kiosk code and secret, and stores them in local `kiosk-config.json`.
5. It authenticates once to create a central kiosk session, then automatically displays the central `/kiosk/pass` page.

Enrollment codes and private claim tokens expire after 10 minutes and can be used once. The enrollment code alone cannot retrieve kiosk credentials. The kiosk secret is returned only during enrollment. Do not put it in the browser UI, commit `kiosk-config.json`, or paste it into logs.

To replace a lost or compromised secret, a manager uses **Regenerate credentials** on `/manager`, then enters the new enrollment code on the kiosk. The old credential is disabled immediately.

## Configuration

All values are optional during the initial enrollment flow. The kiosk can persist its assigned code, server URL, and secret after enrollment.

| Variable             | Purpose                                                          | Default            |
| -------------------- | ---------------------------------------------------------------- | ------------------ |
| `KIOSK_CODE`         | Assigned central kiosk code; normally supplied by enrollment     | empty              |
| `KIOSK_NAME`         | Local display name                                               | `Hall Pass Kiosk`  |
| `KIOSK_LOCATION`     | Local display location                                           | `Unknown Location` |
| `KIOSK_SECRET`       | Existing credential; use the stored config or enrollment instead | empty              |
| `KIOSK_PORT`         | Local HTTP port                                                  | `4177`             |
| `KIOSK_SERVER_URL`   | Central YPass base URL                                           | empty              |
| `KIOSK_HEARTBEAT_MS` | Heartbeat interval                                               | `30000`            |

Environment values take precedence over the local `kiosk-config.json`. Keep the kiosk process and its config file on the physical kiosk; do not expose the file through the served `public/` directory.

## Local endpoints

These endpoints are served by the kiosk process, not directly by the central server:

- `GET /api/config`: local kiosk identity and registration state
- `GET /api/health`: local process and heartbeat state
- `POST /api/heartbeat`: forward a heartbeat to YPass
- `GET /kiosk/pass`: proxy the central server-rendered pass page
- `POST /kiosk/scan`: proxy the central student scan form
- `POST /kiosk/pass`: proxy the central pass request form

The local process authenticates with `POST /api/v1/kiosks/session`, retains the server-side session cookie, and proxies the central pass page and assets. The browser only talks to the local kiosk process and never receives the kiosk secret or central session cookie.

## Testing and operations

```bash
npm test
npm run dev
```

The kiosk sends heartbeats every 30 seconds by default. If the kiosk is disabled, central session authentication fails and the local process shows a disabled screen. If the kiosk is offline, it shows a reconnecting state and does not submit passes locally. Check the local process, `KIOSK_SERVER_URL`, central health at `/health/ready`, and whether the credential was regenerated.
