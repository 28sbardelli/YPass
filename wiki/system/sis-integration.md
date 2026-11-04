# SIS integration

YPass keeps SIS integration behind provider adapters. Providers return only the canonical student shape:

```json
{
  "sisId": "10001",
  "firstName": "James",
  "lastName": "Anderson",
  "active": true
}
```

The provider contract is implemented in `src/services/sis/providers/sis-provider.js`. The mock adapter is useful for local development and tests. The OneRoster adapter supports OneRoster 1.1 and 1.2 student endpoints, bearer or Basic authentication, pagination, request timeouts, and a configurable minimum request interval.

## Enable SIS

Set these values in `.env`:

```dotenv
SIS_ENABLED=true
SIS_HTTP_TIMEOUT_MS=15000
SIS_PAGE_SIZE=100
SIS_RATE_LIMIT_MS=0
```

SIS credentials are encrypted with the existing `TOKEN_ENCRYPTION_KEY`. They are decrypted only while constructing a provider and are never returned by the API or manager page. Use HTTPS base URLs for external providers.

Automatic synchronization requires `BACKGROUND_JOBS_ENABLED=true` and the normal production Redis requirements. A connection with a zero interval remains manual-only. Scheduled jobs are created per active connection. A unique running-history index prevents overlapping manual and scheduled runs for the same connection.

## Manager workflow

Managers use `/manager` to create a connection, select `mock` or `oneroster`, configure its endpoint and authentication, test it, start a sync, inspect history, or delete it. The API is also available under `/api/v1/admin/sis/connections` and requires the existing authenticated manager authorization and CSRF protection.

The API never returns `credentials`, `credentials_encrypted`, or raw credential configuration:

- `POST /api/v1/admin/sis/connections`
- `GET /api/v1/admin/sis/connections`
- `GET /api/v1/admin/sis/connections/:connectionId`
- `POST /api/v1/admin/sis/connections/:connectionId/test`
- `POST /api/v1/admin/sis/connections/:connectionId/sync`
- `GET /api/v1/admin/sis/connections/:connectionId/sync-history`
- `DELETE /api/v1/admin/sis/connections/:connectionId`

## OneRoster configuration

Use a connection configuration like this:

```json
{
  "baseUrl": "https://sis.example.edu",
  "version": "1.2",
  "authType": "bearer"
}
```

Store the token in the credential fields. For Basic authentication, use `authType: "basic"` and store `username` and `password`. The adapter requests `/ims/oneroster/v1p1/students` or `/ims/oneroster/v1p2/students` and discards all fields other than source ID, given name, family name, and active status.

## Synchronization behavior

Each SIS student is identified by the composite `(sis_connection_id, sis_student_id)` and retains a separate YPass internal student UUID. New records are inserted, changed names/statuses are updated, and valid completed responses may mark records missing from that connection inactive. Records are never deleted because they are absent from one response. Invalid records are counted as skipped/errors.

Every run records retrieved, created, updated, deactivated, skipped, and error counts. A provider failure leaves existing students unchanged and records a failed history entry.

## Adding a provider

1. Extend `SISProvider` and implement `connect`, `testConnection`, `getStudents`, and `disconnect`.
2. Normalize every returned record with `normalizeStudent`.
3. Add the provider to the factory in `src/services/sis/sis-service.js`.
4. Add mocked unit tests for authentication, pagination, malformed responses, timeouts, and credential failures.
5. Keep provider requests out of routes and controllers.

## Troubleshooting

- A 401/403 test failure usually means the provider token or Basic credentials are expired or invalid.
- A timeout means the provider exceeded `SIS_HTTP_TIMEOUT_MS`; check endpoint reachability and provider rate limits.
- A sync conflict means another run for the same connection is still in progress.
- A connection can be tested manually even when automatic jobs are disabled.
- Inspect sync history for counts and the sanitized error message; never log or paste provider secrets.
