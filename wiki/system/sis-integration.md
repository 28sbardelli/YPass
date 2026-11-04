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

The provider contract is implemented in `src/services/sis/providers/sis-provider.js`. The mock adapter is useful for local development and tests. The OneRoster, Skyward, and Schoology adapters return only student ID, first name, last name, and active status. All HTTP adapters support pagination, request timeouts, rate limiting, authentication errors, and malformed-response errors.

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

Managers use `/manager` to create a connection, select `mock`, `oneroster`, `skyward`, or `schoology`, configure its endpoint and authentication, test it, start a sync, inspect history, or delete it. The API is also available under `/api/v1/admin/sis/connections` and requires the existing authenticated manager authorization and CSRF protection.

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

## Skyward

Skyward access is customer- and product-specific. A district administrator must obtain the appropriate Skyward integration/API entitlement, tenant or district endpoint, and credentials from Skyward or the district's Skyward administrator. Skyward's SMS 2.0 and Qmlativ APIs are separate product surfaces; YPass does not guess their routes or claim access to undocumented endpoints. Use a connection such as:

```json
{
  "baseUrl": "https://district.example.edu",
  "protocol": "oneroster",
  "version": "1.1",
  "authType": "bearer"
}
```

When the district has an authorized proprietary API endpoint, use `protocol: "api"`, `platform: "sms20"` or `"qmlativ"`, and provide the district-approved `studentPath` if the default path is not correct. Basic, bearer, and API-key credentials are supported. The adapter accepts common `students`, `users`, or `data` arrays and normalizes only ID, names, and status. OneRoster is preferred when the Skyward customer agreement exposes it. Skyward product/API licensing, support, and data-processing terms remain with Skyward and the district.

## Schoology

Schoology's official REST API is an LMS API and is not the same product as Schoology SIS Connect. The REST adapter uses OAuth 1.0a and requires an authorized Schoology developer/application registration plus a district administrator who can grant access to the student user endpoint. Store `consumerKey`, `consumerSecret`, `token`, and `tokenSecret` as encrypted credentials:

```json
{
  "baseUrl": "https://schoology.example.edu/v1",
  "protocol": "api",
  "studentPath": "/users",
  "authType": "oauth1"
}
```

The adapter requests the student role and retrieves only the fields needed by YPass. A Schoology OneRoster 1.1 endpoint can be selected with `protocol: "oneroster"`, but it must be separately provisioned and authorized by the district; an LMS OAuth credential is not assumed to authorize OneRoster. SIS Connect is a separate Schoology partnership/product arrangement and may require a vendor agreement, district administrator approval, and Schoology onboarding. YPass does not treat SIS Connect feeds, LMS REST credentials, and OneRoster credentials as interchangeable. Confirm Schoology licensing, API terms, privacy terms, and permitted student-data scope with Schoology and the district before enabling a connection.

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
