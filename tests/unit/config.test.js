import { describe, expect, it } from 'vitest';
import { parseConfig, ConfigError } from '#config';
import { validTestEnv } from '../helpers/env.js';

describe('parseConfig', () => {
  it('loads a valid development-like test configuration', () => {
    const config = parseConfig(validTestEnv());
    expect(config.env).toBe('test');
    expect(config.features.formbarAuth).toBe(true);
    expect(config.features.localAuth).toBe(true);
    expect(config.database.provider).toBe('sqlite');
    expect(config.session.cookieName).toBe('fbapp.sid');
    expect(config.features.sis).toBe(false);
    expect(config.sis.timeoutMs).toBe(15_000);
  });

  it('fails when SESSION_SECRET is too short', () => {
    expect(() => parseConfig(validTestEnv({ SESSION_SECRET: 'short' }))).toThrow(ConfigError);
  });

  it('requires at least one auth method', () => {
    expect(() =>
      parseConfig(
        validTestEnv({
          LOCAL_AUTH_ENABLED: 'false',
          FORMBAR_AUTH_ENABLED: 'false',
          ENTRA_AUTH_ENABLED: 'false',
        }),
      ),
    ).toThrow(/At least one authentication method/);
  });

  it('rejects sqlite with WEB_CONCURRENCY>1', () => {
    expect(() =>
      parseConfig(
        validTestEnv({
          WEB_CONCURRENCY: '2',
          DATABASE_PROVIDER: 'sqlite',
        }),
      ),
    ).toThrow(/sqlite cannot be used/);
  });

  it('requires Redis when Socket.IO is clustered', () => {
    expect(() =>
      parseConfig(
        validTestEnv({
          WEB_CONCURRENCY: '2',
          DATABASE_PROVIDER: 'postgres',
          DATABASE_URL: 'postgres://user:pass@localhost:5432/app',
          SOCKET_IO_ENABLED: 'true',
          REDIS_ENABLED: 'false',
        }),
      ),
    ).toThrow(/REDIS_ENABLED/);
  });

  it('requires SMTP when email is enabled', () => {
    expect(() =>
      parseConfig(
        validTestEnv({
          EMAIL_ENABLED: 'true',
          SMTP_HOST: '',
        }),
      ),
    ).toThrow(/SMTP_HOST/);
  });

  it('requires Formbar credentials when Formbar auth is enabled', () => {
    expect(() =>
      parseConfig(
        validTestEnv({
          FORMBAR_AUTH_ENABLED: 'true',
          FORMBAR_CLIENT_ID: '',
        }),
      ),
    ).toThrow(/FORMBAR_CLIENT_ID/);
  });

  it('forces example flags off in production', () => {
    const config = parseConfig(
      validTestEnv({
        NODE_ENV: 'production',
        EMAIL_ENABLED: 'true',
        SMTP_HOST: 'smtp.example.test',
        SMTP_FROM: 'noreply@example.test',
        LOCAL_AUTH_EMAIL_FLOW: 'disabled',
        FORMBAR_WS_EXAMPLE_ENABLED: 'true',
        FORMBAR_HTTP_EXAMPLE_ENABLED: 'true',
        FORMBAR_OAUTH_MODE: 'legacy_redirect',
        HSTS_ENABLED: 'true',
        DATABASE_PROVIDER: 'postgres',
        DATABASE_URL: 'postgres://user:pass@localhost:5432/app',
        TRUST_PROXY: '1',
      }),
    );
    expect(config.features.formbarWsExample).toBe(false);
    expect(config.features.formbarHttpExample).toBe(false);
    expect(config.features.formbarOauthMode).toBe('legacy_redirect');
    expect(config.features.localAuthEmailFlow).toBe('required');
  });

  it('rejects production local auth without email', () => {
    expect(() =>
      parseConfig(
        validTestEnv({
          NODE_ENV: 'production',
          LOCAL_AUTH_ENABLED: 'true',
          EMAIL_ENABLED: 'false',
          DATABASE_PROVIDER: 'postgres',
          DATABASE_URL: 'postgres://user:pass@localhost:5432/app',
        }),
      ),
    ).toThrow(/EMAIL_ENABLED/);
  });

  it('rejects Formbar WS example without the WS client', () => {
    expect(() =>
      parseConfig(
        validTestEnv({
          FORMBAR_WS_EXAMPLE_ENABLED: 'true',
          FORMBAR_WS_CLIENT_ENABLED: 'false',
        }),
      ),
    ).toThrow(/FORMBAR_WS_CLIENT_ENABLED/);
  });
});
