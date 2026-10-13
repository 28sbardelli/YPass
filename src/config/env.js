/**
 * Centralized environment loading and validation.
 *
 * Configuration is loaded from process.env (after optional .env file).
 * Invalid or incomplete required configuration fails startup with a
 * single aggregated error list.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';
import { parseBoolean, parseInteger, parseList } from './parsers.js';
import { applyProductionGuards, validateFeatureDependencies } from './features.js';

const bool = (defaultValue) =>
  z.preprocess((value) => {
    if (value === undefined || value === '') {
      return defaultValue;
    }
    return parseBoolean(value, defaultValue);
  }, z.boolean());

const int = (defaultValue) =>
  z.preprocess((value) => {
    if (value === undefined || value === '') {
      return defaultValue;
    }
    return parseInteger(value, defaultValue);
  }, z.number().int());

const rawSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_NAME: z.string().min(1).default('formbar-app'),
  APP_BASE_URL: z.string().min(1).default('http://localhost:3000'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: int(3000),
  TRUST_PROXY: z.string().default('0'),
  WEB_CONCURRENCY: int(1),
  MANAGERS: z.string().optional().default(''),

  LOCAL_AUTH_ENABLED: bool(true),
  FORMBAR_AUTH_ENABLED: bool(true),
  ENTRA_AUTH_ENABLED: bool(false),
  EMAIL_ENABLED: bool(false),
  SOCKET_IO_ENABLED: bool(true),
  REDIS_ENABLED: bool(false),
  SEQ_ENABLED: bool(false),
  FORMBAR_WS_CLIENT_ENABLED: bool(false),
  FORMBAR_WS_EXAMPLE_ENABLED: bool(false),
  FORMBAR_HTTP_EXAMPLE_ENABLED: bool(false),
  API_ENABLED: bool(true),
  API_DOCS_ENABLED: bool(false),
  BACKGROUND_JOBS_ENABLED: bool(false),
  LOAD_TEST_FEATURES_ENABLED: bool(false),
  LOCAL_AUTH_EMAIL_FLOW: z.enum(['required', 'disabled']).default('disabled'),
  FORMBAR_OAUTH_MODE: z
    .enum(['authorization_code', 'legacy_redirect'])
    .default('authorization_code'),

  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  SESSION_COOKIE_NAME: z.string().min(1).default('fbapp.sid'),
  SESSION_IDLE_MS: int(1_800_000),
  SESSION_ABSOLUTE_MS: int(28_800_000),

  CORS_ORIGINS: z.string().optional().default(''),
  BODY_LIMIT: z.string().default('100kb'),
  HSTS_ENABLED: bool(false),
  TOKEN_ENCRYPTION_KEY: z.string().min(16).default('change-me-to-a-32-byte-base64-or-hex-key!!!!'),

  DATABASE_PROVIDER: z.enum(['sqlite', 'postgres']).default('sqlite'),
  DATABASE_URL: z.string().min(1).default('./data/app.sqlite'),
  DATABASE_POOL_MIN: int(0),
  DATABASE_POOL_MAX: int(10),
  DATABASE_SSL: z.enum(['disable', 'require']).default('disable'),
  DATABASE_SSL_CA: z.string().optional().default(''),
  DATABASE_MIGRATE_ON_START: bool(false),

  REDIS_URL: z.string().optional().default('redis://127.0.0.1:6379'),
  REDIS_PASSWORD: z.string().optional().default(''),
  REDIS_TLS: bool(false),
  REDIS_KEY_PREFIX: z.string().optional().default(''),
  REDIS_REQUIRED_TIMEOUT_MS: int(5000),

  FORMBAR_BASE_URL: z.string().optional().default(''),
  FORMBAR_CLIENT_ID: z.string().optional().default(''),
  FORMBAR_CLIENT_SECRET: z.string().optional().default(''),
  FORMBAR_REDIRECT_URI: z.string().optional().default(''),
  FORMBAR_SCOPES: z.string().optional().default('app.profile.read'),
  FORMBAR_FRONTEND_URL: z.string().optional().default(''),
  FORMBAR_API_KEY: z.string().optional().default(''),
  FORMBAR_PERSIST_TOKENS: bool(false),
  FORMBAR_MAP_PERMISSIONS: bool(false),

  ENTRA_TENANT_ID: z.string().optional().default(''),
  ENTRA_CLIENT_ID: z.string().optional().default(''),
  ENTRA_CLIENT_SECRET: z.string().optional().default(''),
  ENTRA_REDIRECT_URI: z.string().optional().default(''),
  ENTRA_LOGOUT_URI: z.string().optional().default(''),
  ENTRA_SCOPES: z.string().optional().default('openid profile email'),
  ENTRA_PERSIST_TOKENS: bool(false),

  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: int(587),
  SMTP_SECURE: bool(false),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASSWORD: z.string().optional().default(''),
  SMTP_FROM: z.string().optional().default('noreply@localhost'),
  SMTP_TIMEOUT_MS: int(10_000),

  SEQ_URL: z.string().optional().default(''),
  SEQ_API_KEY: z.string().optional().default(''),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  LOG_FILE_ENABLED: bool(false),
  LOG_FILE_DIR: z.string().default('./logs'),
  LOG_FILE_MAX_BYTES: int(10_485_760),
  LOG_FILE_MAX_FILES: int(5),

  RATE_LIMIT_GENERAL_WINDOW_MS: int(60_000),
  RATE_LIMIT_GENERAL_MAX: int(120),
  RATE_LIMIT_AUTH_WINDOW_MS: int(900_000),
  RATE_LIMIT_AUTH_MAX: int(10),

  SOCKET_IO_ALLOW_POLLING: bool(false),
  SOCKET_IO_MAX_BUFFER_BYTES: int(1_000_000),

  LOADTEST_ALLOWED_HOSTS: z.string().optional().default('127.0.0.1,localhost'),
  LOADTEST_ALLOW_PRODUCTION: bool(false),
});

export class ConfigError extends Error {
  /**
   * @param {string[]} issues
   */
  constructor(issues) {
    super(`Invalid configuration:\n- ${issues.join('\n- ')}`);
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

/**
 * Load dotenv from the project root when a .env file exists.
 * Secrets still come only from the environment after this call.
 *
 * @param {string} [cwd]
 */
export function loadEnvFile(cwd = process.cwd()) {
  const envPath = path.join(cwd, '.env');
  if (existsSync(envPath)) {
    loadDotenv({ path: envPath, override: false });
  }
}

/**
 * Parse and validate an env object into a typed config.
 * Does not read files; pass process.env or a test double.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} source
 */
export function parseConfig(source) {
  const parsed = rawSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => {
      const field = issue.path.join('.') || 'config';
      return `${field}: ${issue.message}`;
    });
    throw new ConfigError(issues);
  }

  const raw = parsed.data;
  const env = raw.NODE_ENV;
  const pm2Cluster = process.env.NODE_APP_INSTANCE !== undefined;
  const webConcurrency = pm2Cluster ? Math.max(raw.WEB_CONCURRENCY, 2) : raw.WEB_CONCURRENCY;

  const features = applyProductionGuards(
    {
      localAuth: raw.LOCAL_AUTH_ENABLED,
      formbarAuth: raw.FORMBAR_AUTH_ENABLED,
      entraAuth: raw.ENTRA_AUTH_ENABLED,
      email: raw.EMAIL_ENABLED,
      socketIo: raw.SOCKET_IO_ENABLED,
      redis: raw.REDIS_ENABLED,
      seq: raw.SEQ_ENABLED,
      formbarWsClient: raw.FORMBAR_WS_CLIENT_ENABLED,
      formbarWsExample: env === 'production' ? false : raw.FORMBAR_WS_EXAMPLE_ENABLED,
      formbarHttpExample: env === 'production' ? false : raw.FORMBAR_HTTP_EXAMPLE_ENABLED,
      api: raw.API_ENABLED,
      apiDocs:
        env === 'production' ? raw.API_DOCS_ENABLED && raw.API_ENABLED : raw.API_DOCS_ENABLED,
      backgroundJobs: raw.BACKGROUND_JOBS_ENABLED,
      loadTestFeatures: env === 'production' ? false : raw.LOAD_TEST_FEATURES_ENABLED,
      formbarOauthMode: raw.FORMBAR_OAUTH_MODE,
      localAuthEmailFlow:
        env === 'production' && raw.LOCAL_AUTH_ENABLED ? 'required' : raw.LOCAL_AUTH_EMAIL_FLOW,
    },
    env,
  );

  const redisPrefix = raw.REDIS_KEY_PREFIX || `${raw.APP_NAME}:${env}:`;

  const trustProxy =
    raw.TRUST_PROXY === 'true' || raw.TRUST_PROXY === '1'
      ? 1
      : raw.TRUST_PROXY === 'false' || raw.TRUST_PROXY === '0'
        ? false
        : Number.parseInt(raw.TRUST_PROXY, 10) || (env === 'production' ? 1 : false);

  const config = {
    env,
    isProduction: env === 'production',
    isTest: env === 'test',
    isDevelopment: env === 'development',
    appName: raw.APP_NAME,
    baseUrl: raw.APP_BASE_URL.replace(/\/+$/, ''),
    host: raw.HOST,
    port: raw.PORT,
    trustProxy,
    webConcurrency,
    features,
    session: {
      secret: raw.SESSION_SECRET,
      cookieName: raw.SESSION_COOKIE_NAME,
      idleMs: raw.SESSION_IDLE_MS,
      absoluteMs: raw.SESSION_ABSOLUTE_MS,
    },
    security: {
      corsOrigins: parseList(raw.CORS_ORIGINS),
      bodyLimit: raw.BODY_LIMIT,
      hsts: env === 'production' ? true : raw.HSTS_ENABLED,
      tokenEncryptionKey: raw.TOKEN_ENCRYPTION_KEY,
    },
    database: {
      provider: raw.DATABASE_PROVIDER,
      url: raw.DATABASE_URL,
      poolMin: raw.DATABASE_POOL_MIN,
      poolMax: raw.DATABASE_POOL_MAX,
      ssl: raw.DATABASE_SSL,
      sslCa: raw.DATABASE_SSL_CA || '',
      migrateOnStart: env === 'production' ? false : raw.DATABASE_MIGRATE_ON_START,
    },
    redis: {
      url: raw.REDIS_URL,
      password: raw.REDIS_PASSWORD,
      tls: raw.REDIS_TLS,
      keyPrefix: redisPrefix,
      requiredTimeoutMs: raw.REDIS_REQUIRED_TIMEOUT_MS,
    },
    formbar: {
      baseUrl: (raw.FORMBAR_BASE_URL || '').replace(/\/+$/, ''),
      frontendUrl: (raw.FORMBAR_FRONTEND_URL || '').replace(/\/+$/, ''),
      clientId: raw.FORMBAR_CLIENT_ID,
      clientSecret: raw.FORMBAR_CLIENT_SECRET,
      redirectUri: raw.FORMBAR_REDIRECT_URI,
      scopes: raw.FORMBAR_SCOPES,
      apiKey: raw.FORMBAR_API_KEY,
      persistTokens: raw.FORMBAR_PERSIST_TOKENS,
      mapPermissions: raw.FORMBAR_MAP_PERMISSIONS,
    },
    entra: {
      tenantId: raw.ENTRA_TENANT_ID,
      clientId: raw.ENTRA_CLIENT_ID,
      clientSecret: raw.ENTRA_CLIENT_SECRET,
      redirectUri: raw.ENTRA_REDIRECT_URI,
      logoutUri: raw.ENTRA_LOGOUT_URI,
      scopes: raw.ENTRA_SCOPES.split(/\s+/).filter(Boolean),
      persistTokens: raw.ENTRA_PERSIST_TOKENS,
    },
    email: {
      host: raw.SMTP_HOST,
      port: raw.SMTP_PORT,
      secure: raw.SMTP_SECURE,
      user: raw.SMTP_USER,
      password: raw.SMTP_PASSWORD,
      from: raw.SMTP_FROM,
      timeoutMs: raw.SMTP_TIMEOUT_MS,
    },
    seq: {
      url: (raw.SEQ_URL || '').replace(/\/+$/, ''),
      apiKey: raw.SEQ_API_KEY,
    },
    log: {
      level: raw.LOG_LEVEL,
      fileEnabled: raw.LOG_FILE_ENABLED,
      fileDir: raw.LOG_FILE_DIR,
      maxBytes: raw.LOG_FILE_MAX_BYTES,
      maxFiles: raw.LOG_FILE_MAX_FILES,
    },
    rateLimit: {
      generalWindowMs: raw.RATE_LIMIT_GENERAL_WINDOW_MS,
      generalMax: raw.RATE_LIMIT_GENERAL_MAX,
      authWindowMs: raw.RATE_LIMIT_AUTH_WINDOW_MS,
      authMax: raw.RATE_LIMIT_AUTH_MAX,
    },
    socketIo: {
      allowPolling: raw.SOCKET_IO_ALLOW_POLLING,
      maxBufferBytes: raw.SOCKET_IO_MAX_BUFFER_BYTES,
    },
    loadtest: {
      allowedHosts: parseList(raw.LOADTEST_ALLOWED_HOSTS),
      allowProduction: raw.LOADTEST_ALLOW_PRODUCTION,
    },
    managers: parseList(raw.MANAGERS).map((email) => email.toLowerCase()),
  };

  const dependencyErrors = validateFeatureDependencies(config);
  if (dependencyErrors.length > 0) {
    throw new ConfigError(dependencyErrors);
  }

  return Object.freeze(config);
}

/**
 * Load .env (if present) then parse process.env.
 */
export function loadConfig() {
  if (process.env.NODE_ENV !== 'production') {
    loadEnvFile();
  }
  return parseConfig(process.env);
}
