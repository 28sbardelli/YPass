# Formbar integration

This app talks to Formbar as a confidential OAuth client and optional HTTP/WebSocket client.

## OAuth

Current Formbar production (`https://formbar.yorktechapps.com`) is the monolith login page, not an OAuth2 authorize API.

Set `FORMBAR_OAUTH_MODE=legacy_redirect` (the default in `.env.example`). The browser goes to `{FORMBAR_BASE_URL}/oauth?redirectURL={callback}?state=…`. After login, Formbar redirects to the callback with `token` (JWT). This app verifies that JWT against `{FORMBAR_BASE_URL}/certs` and never sends the user to `/api/v1/oauth/authorize`.

That API path is not a login page. If you already have a Formbar session cookie, Formbar answers:

```json
{ "error": "The requested endpoint, /api/v1/oauth/authorize?…, does not exist." }
```

`FORMBAR_OAUTH_MODE=authorization_code` is for Formbar DEV plus [Formbar.ts-client](https://github.com/csmith1188/Formbar.ts-client). The browser goes to `{FORMBAR_FRONTEND_URL or FORMBAR_BASE_URL}/oauth/authorize` (consent UI). That UI calls Formbar's authenticated API (`/api/v1/oauth/authorize` and `/api/v1/oauth/token`) with the user's Bearer token. Default scope is `app.profile.read`. Register `FORMBAR_REDIRECT_URI` on the Formbar app.

Identity subject is the Formbar user `id`. Email is profile data, not a join key.

## HTTP client

`src/integrations/formbar/http-client.js` sends the app API key or a user Bearer token. Timeouts and GET-only retries are built in.

## WebSocket client

One shared `socket.io-client` connection using `extraHeaders: { api }` (Node only). Application code subscribes through the manager. Example listeners are disabled in production.

See the Formbar wiki: https://github.com/csmith1188/Formbar.js/wiki/WebSocket-API
