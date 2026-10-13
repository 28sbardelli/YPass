# Developer onboarding

This page is a first-week tutorial. It assumes you already know a little JavaScript (variables, functions, `import`/`export`) and can use a terminal, but not that you have shipped an Express app before.

Read it in order. After each “Try it” section, stop and do the steps before reading on.

Related pages (save these for after the tutorial): [architecture](architecture.md), [folder-structure](folder-structure.md), [request-lifecycle](request-lifecycle.md), [feature-flags](feature-flags.md), [authentication](authentication.md), [configuration](configuration.md), [troubleshooting](troubleshooting.md).

---

## What you are looking at

This repository is a **boilerplate**: a starter app you copy and customize. It is an [Express](https://expressjs.com/) server (Node.js HTTP framework) that can:

- Render HTML pages with [EJS](https://ejs.co/) templates
- Sign people in with a local username/password, [Formbar](https://github.com/csmith1188/Formbar.js), and/or Microsoft Entra
- Expose a small JSON API at `/api/v1`
- Optionally talk to Redis, email, Seq, background jobs, and Formbar’s HTTP/WebSocket APIs

**Optional features stay off until you turn them on.** A flag in `.env` is not a hint. If `EMAIL_ENABLED=false`, the app must not connect to SMTP, register email routes, or send mail. That rule is the most important design choice in this codebase.

---

## Words you will see constantly

| Term             | Meaning here                                                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **HTTP request** | A browser or client asking the server for a URL (`GET /auth/login`, `POST /auth/login`).                                                |
| **Route**        | The URL + method mapping. Lives in `src/routes/`. Routes should not contain business rules.                                             |
| **Middleware**   | A function that runs _before_ (or around) the route: sessions, CSRF, “are you logged in?”, rate limits.                                 |
| **Controller**   | Reads the request, calls a service, writes the response (HTML redirect or JSON). Lives in `src/controllers/`.                           |
| **Service**      | The use case: “register this user”, “link Formbar”. Services must not use `req` or `res`.                                               |
| **Repository**   | SQL only, through Knex. No HTTP, no Formbar, no “if the user is an admin”.                                                              |
| **Integration**  | Talks to something outside this app (Formbar, Entra, Redis, SMTP).                                                                      |
| **Container**    | `src/container.js` — the one place that _constructs_ services. Disabled flags mean those objects are never created.                     |
| **Session**      | Server-side login state, stored in a cookie (`fbapp.sid`). Not a JWT the browser sends on every API call.                               |
| **CSRF**         | Cross-site request forgery protection. HTML forms include a hidden `_csrf` field so other sites cannot POST as you.                     |
| **RBAC**         | Role-based access control. Roles (`user`, `admin`) grant permissions (`account.self`). The client cannot “send” a role to become admin. |
| **Feature flag** | An explicit `true`/`false` in `.env`. Do not infer “email is on because SMTP_HOST is set”.                                              |

If a new feature needs a Formbar call, that call belongs in `src/integrations/formbar/`, used by a **service**, used by a **controller**. Do not `fetch` Formbar from a route file.

---

## What you need installed

1. **Node.js 22 or newer** (`node -v`). The `engines` field in `package.json` requires this.
2. A terminal (PowerShell is fine on Windows).
3. A browser.

You do **not** need PostgreSQL, Redis, Docker, or Visual Studio C++ tools for the first run. Development SQLite uses [sql.js](https://sql.js.org/) (WebAssembly), so there is no native `better-sqlite3` build.

---

## First boot (local auth only)

Do this before you enable Formbar or Redis. If `.env.example` has `FORMBAR_AUTH_ENABLED=true` and you have not filled in client credentials, **startup will fail** with `Invalid configuration`. That is intentional.

### 1. Copy environment file

```bash
cp .env.example .env
```

On Windows PowerShell: `Copy-Item .env.example .env`

Open `.env`. For the first session set:

```env
NODE_ENV=development
LOCAL_AUTH_ENABLED=true
FORMBAR_AUTH_ENABLED=false
ENTRA_AUTH_ENABLED=false
EMAIL_ENABLED=false
SOCKET_IO_ENABLED=true
REDIS_ENABLED=false
API_ENABLED=true
API_DOCS_ENABLED=true
BACKGROUND_JOBS_ENABLED=false
DATABASE_PROVIDER=sqlite
DATABASE_URL=./data/app.sqlite
WEB_CONCURRENCY=1
LOCAL_AUTH_EMAIL_FLOW=disabled
```

Leave `SESSION_SECRET` and `TOKEN_ENCRYPTION_KEY` as long dummy values in development. Replace them before any shared or production host. Never commit `.env`.

`LOCAL_AUTH_EMAIL_FLOW=disabled` means you can register and sign in **without** verifying email. Production with local auth **requires** email (`EMAIL_ENABLED` + SMTP). See [authentication](authentication.md).

### 2. Install and create the database

```bash
npm install
npm run db:init
```

`db:init` runs migrations (creates tables) and seeds (inserts `user` and `admin` roles plus permissions). The SQLite file appears under `data/`.

### 3. Start the server

```bash
npm run dev
```

`--watch` restarts when you save files. Open [http://localhost:3000](http://localhost:3000). You should see the home page and a way to sign in.

If the process exits immediately, read the terminal. Zod prints **all** config problems at once (missing `FORMBAR_CLIENT_ID`, SQLite with `WEB_CONCURRENCY=2`, and so on). See [troubleshooting](troubleshooting.md).

### 4. Prove the process is healthy

In another terminal or the browser:

- [http://localhost:3000/health/live](http://localhost:3000/health/live) — process is up
- [http://localhost:3000/health/ready](http://localhost:3000/health/ready) — database (and Redis, if required) is reachable

These paths are **not** under `/api`. Load balancers and Docker healthchecks use them.

---

## How a request moves through the app

Example: you submit the login form.

1. **`src/server.js`** already loaded `.env`, validated it, created a logger, and started HTTP.
2. **`src/app.js`** (middleware stack) attaches a request id, Helmet/CSP, cookies, session, CSRF, rate limits, then “current user” if a session exists.
3. **`src/routes/auth.js`** matches `POST /auth/login`.
4. **`src/controllers/auth-controller.js`** reads the body, calls local auth, regenerates the session, redirects.
5. **`src/services/local-auth-service.js`** checks username/password (Argon2id hashes), lockout, email-verify rules.
6. **Repositories** in `src/repositories/index.js` run Knex SQL against `users` / `local_credentials`.
7. Failures become typed errors (`ValidationError`, `AuthenticationError`) and **`src/middleware/error.js`** renders an HTML page or JSON. Production responses never include stack traces.

**Try it:** set a breakpoint or add a `console.log` in the controller _and_ the service. Submit a bad password. Confirm the service throws and the controller/error handler turns that into the login page message — the service never called `res.render`.

The same layers apply to JSON: `GET /api/v1/me` is registered only if `API_ENABLED=true`. Unauthenticated browser navigations to that URL redirect to login; clients that ask for JSON get `401`.

Wiring lives in **`src/container.js`**. If `FORMBAR_AUTH_ENABLED=false`, `formbarOAuth` is `null` and Formbar routes are not registered. You cannot “accidentally” call Formbar from a disabled module if you follow this pattern.

---

## Folders that matter on day one

```
src/server.js          start here
src/config/            .env → typed config + flags
src/container.js       construct only enabled pieces
src/routes/            URLs
src/controllers/       HTTP
src/services/          rules
src/repositories/      SQL
src/integrations/      Formbar, Entra, email, Redis
src/middleware/        session, CSRF, auth, errors
src/database/          Knex + migrations + sql.js
views/                 EJS HTML
public/                CSS/JS the browser loads
tests/                 Vitest
```

[folder-structure.md](folder-structure.md) is the short map. You do not need `deploy/` until you ship to Ubuntu.

---

## First-time features: what to turn on, and in what order

Treat this as a ladder. Do not enable Redis, Entra, jobs, and Formbar WebSockets on day one.

### Layer A — always on for local exploration

| Flag / setting             | Why                                                      |
| -------------------------- | -------------------------------------------------------- |
| `LOCAL_AUTH_ENABLED=true`  | You can register a user without Formbar credentials.     |
| `DATABASE_PROVIDER=sqlite` | No Postgres install.                                     |
| `WEB_CONCURRENCY=1`        | SQLite cannot run with multiple workers.                 |
| `SOCKET_IO_ENABLED=true`   | Realtime exists; with one worker it does not need Redis. |
| `API_ENABLED=true`         | `/api/v1/me`                                             |
| `API_DOCS_ENABLED=true`    | Swagger UI at `/api/v1/docs`                             |

### Layer B — after local login works

| Flag                                | What you are testing                                                                                                                                                                                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FORMBAR_AUTH_ENABLED=true`         | “Continue with Formbar” on `/auth/login`. Requires `FORMBAR_BASE_URL`, `FORMBAR_CLIENT_ID`, `FORMBAR_CLIENT_SECRET`, `FORMBAR_REDIRECT_URI`. For [formbar.yorktechapps.com](https://formbar.yorktechapps.com) use `FORMBAR_OAUTH_MODE=legacy_redirect`. See [formbar.md](formbar.md). |
| `FORMBAR_HTTP_EXAMPLE_ENABLED=true` | Example HTTP call (development only; forced off in production). Needs Formbar base URL.                                                                                                                                                                                               |

Leave `FORMBAR_WS_CLIENT_ENABLED` off until you have a reason to open a **server-to-server** Socket.IO connection to Formbar. Browsers must not use Formbar’s API key.

### Layer C — only when you need them

| Flag                         | Requires                                | Skip until                                                                                  |
| ---------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------- |
| `REDIS_ENABLED`              | Redis running                           | You run more than one Node process, share sessions across workers, or enable jobs.          |
| `BACKGROUND_JOBS_ENABLED`    | Redis in production                     | You have a real queued job.                                                                 |
| `EMAIL_ENABLED`              | SMTP host/from                          | You want verify/reset mail, or you deploy production local auth.                            |
| `ENTRA_AUTH_ENABLED`         | Tenant, client id/secret, redirect URIs | School Microsoft login is required.                                                         |
| `SEQ_ENABLED`                | Seq URL                                 | You want structured logs in Seq.                                                            |
| `LOAD_TEST_FEATURES_ENABLED` | Never in production                     | Forced off in production. Load tests are a **CLI** (`npm run loadtest`), not an HTTP route. |

**Production** (`NODE_ENV=production`) forces example/debug/load-test HTTP off and requires email when local auth is on. SQLite + clustering is rejected. You cannot “sneak” those on with extra env vars.

---

## Hands-on checklist (first afternoon)

Work top to bottom. Check each box in your notes.

### Local account

1. Open `/auth/register`. Create a username, email, and a long password.
2. Sign in at `/auth/login`. You should land on `/` (or `next=`).
3. Open `/account`. You should see a **local** identity. You cannot unlink it (it is your only sign-in method).
4. Sign out. Confirm `/account` sends you back to login.

### Session and CSRF (security you can feel)

1. Stay signed in. Open DevTools → Application → Cookies. You should see `fbapp.sid` (HttpOnly: the page’s JavaScript cannot read it).
2. View source on a form. There is a hidden `_csrf` field. Submitting without it should fail (403 / CSRF page).
3. Wait, or lower `SESSION_IDLE_MS` in `.env` in a throwaway experiment, restart, and confirm idle expiry. Put the original value back.

### Health and API

1. `/health/live` and `/health/ready` return success while the app is up.
2. Signed in, open `/api/v1/me`. You should see your user JSON (roles/permissions included).
3. Open `/api/v1/docs` if docs are enabled. This is generated from comments in `src/routes/api.v1.js`, not a second source of truth for behavior.
4. Sign out, then request `/api/v1/me` with `Accept: application/json` (or from the docs “try it”). Expect **401**, not an HTML login page.

### Automated tests

```bash
npm test
```

Suites:

- `tests/unit` — functions in isolation (config, OAuth URL builders)
- `tests/integration` — database adapter, etc.
- `tests/e2e` — HTTP through the real app (register/login)
- `tests/security` — CSRF, linking rules

External systems are mocked. Tests use SQLite. Also run `npm run lint`.

If Vitest hangs on OneDrive/Windows, retry; it is an environment quirk, not your feature flags.

### Optional: Formbar (Layer B)

1. Set `FORMBAR_AUTH_ENABLED=true` and the Formbar variables. Restart. Config must boot cleanly.
2. Sign in with **Continue with Formbar**. You should hit Formbar’s `/oauth` login page, not a JSON error about `/api/v1/oauth/authorize`.
3. After redirect, `/account` should list a **formbar** identity. If you also have local auth, you can link/unlink as long as one method remains.
4. Do not paste access tokens into URLs in _your_ new code. Legacy Formbar production still returns `?token=` to _this_ app’s callback; this app verifies the JWT against Formbar `/certs`.

---

## How to add a feature without making a mess

1. Decide if it is optional. If yes, add a flag in `.env.example` and `src/config/env.js`, then construct it only in `container.js`.
2. Add a **service** method. Put SQL in a repository. Put Formbar HTTP in the Formbar client.
3. Add a **route** that only binds middleware + controller.
4. Add or extend an EJS view or `/api/v1` handler.
5. Add a test that would fail if the flag is ignored (disabled feature must not register the route).
6. Read [authentication](authentication.md) before you invent a second session or put roles in the browser.

**Do not:**

- Call Knex from a controller
- Read `process.env` in random files (use `loadConfig()` / the container’s `config`)
- Enable Redis “because Socket.IO is on” (one worker does not need it)
- Auto-migrate every production worker (`DATABASE_MIGRATE_ON_START` is not for clustered PM2)

---

## When something breaks

| Symptom                                | Likely cause                                                         |
| -------------------------------------- | -------------------------------------------------------------------- |
| Process exits listing config keys      | `.env` incomplete; Formbar flag on without client id/secret          |
| `/health/ready` is 503                 | SQLite file missing (run `db:init`) or Redis required but down       |
| CSRF 403                               | Form posted from another origin, or missing `_csrf`                  |
| SQLite + cluster error                 | `WEB_CONCURRENCY` > 1                                                |
| Formbar JSON “endpoint does not exist” | Browser was sent to `/api/v1/oauth/authorize`; use `legacy_redirect` |

Full list: [troubleshooting](troubleshooting.md).

---

## After this tutorial

- [architecture.md](architecture.md) — the five layers in one screen
- [request-lifecycle.md](request-lifecycle.md) — production path (Nginx → PM2)
- [database.md](database.md) — Postgres vs SQLite, migrator vs runtime roles
- [production.md](production.md) and `deploy/ubuntu/setup.md` — Ubuntu, Nginx, PM2, Docker
- [users/overview.md](../users/overview.md) — what operators tell end users
