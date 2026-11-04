# Feature flags

Flags are explicit booleans. Production forces `FORMBAR_*_EXAMPLE` and load-test HTTP off, and requires email when local auth is on. Formbar OAuth mode is explicit: `legacy_redirect` for current Formbar production, `authorization_code` for Formbar DEV + ts-client.

Examples:

- `FORMBAR_AUTH_ENABLED` needs client id/secret/redirect
- `SOCKET_IO_ENABLED` + workers>1 needs Redis
- `BACKGROUND_JOBS_ENABLED` needs Redis in production
- `API_DOCS_ENABLED` needs `API_ENABLED`
- `SIS_ENABLED` enables SIS management and provider construction. Automatic synchronization additionally requires `BACKGROUND_JOBS_ENABLED`.
