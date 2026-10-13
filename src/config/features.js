/**
 * Feature flags and cross-flag dependency rules.
 *
 * Flags are explicit. Disabled features must not register routes,
 * listeners, jobs, or background connections.
 */

/**
 * @typedef {object} FeatureFlags
 * @property {boolean} localAuth
 * @property {boolean} formbarAuth
 * @property {boolean} entraAuth
 * @property {boolean} email
 * @property {boolean} socketIo
 * @property {boolean} redis
 * @property {boolean} seq
 * @property {boolean} formbarWsClient
 * @property {boolean} formbarWsExample
 * @property {boolean} formbarHttpExample
 * @property {boolean} api
 * @property {boolean} apiDocs
 * @property {boolean} backgroundJobs
 * @property {boolean} loadTestFeatures
 * @property {'authorization_code'|'legacy_redirect'} formbarOauthMode
 * @property {'required'|'disabled'} localAuthEmailFlow
 */

/**
 * Apply production hard-offs that cannot be overridden by mis-set flags.
 * Example/debug/load-test HTTP never run in production.
 *
 * @param {FeatureFlags} flags
 * @param {string} nodeEnv
 * @returns {FeatureFlags}
 */
export function applyProductionGuards(flags, nodeEnv) {
  if (nodeEnv !== 'production') {
    return flags;
  }

  return {
    ...flags,
    formbarWsExample: false,
    formbarHttpExample: false,
    loadTestFeatures: false,
    apiDocs: flags.apiDocs,
    localAuthEmailFlow: flags.localAuth ? 'required' : flags.localAuthEmailFlow,
  };
}

/**
 * Validate feature dependencies. Returns an array of human-readable errors.
 *
 * @param {object} config
 * @returns {string[]}
 */
export function validateFeatureDependencies(config) {
  const errors = [];
  const { features, env, webConcurrency, database, redis, formbar, entra, email } = config;
  const clustered = webConcurrency > 1 || env === 'production';

  if (!features.localAuth && !features.formbarAuth && !features.entraAuth) {
    errors.push('At least one authentication method must be enabled (local, Formbar, or Entra).');
  }

  if (database.provider === 'sqlite' && webConcurrency > 1) {
    errors.push(
      'DATABASE_PROVIDER=sqlite cannot be used with WEB_CONCURRENCY>1. Use PostgreSQL for clustered workers.',
    );
  }

  if (env === 'production' && webConcurrency > 1 && database.provider !== 'postgres') {
    errors.push('Production cluster mode requires DATABASE_PROVIDER=postgres.');
  }

  if (features.localAuth && env === 'production' && !features.email) {
    errors.push(
      'LOCAL_AUTH_ENABLED in production requires EMAIL_ENABLED for verification and password reset.',
    );
  }

  if (features.localAuth && features.localAuthEmailFlow === 'required' && !features.email) {
    errors.push('LOCAL_AUTH_EMAIL_FLOW=required requires EMAIL_ENABLED.');
  }

  if (features.email) {
    if (!email.host || !email.from) {
      errors.push('EMAIL_ENABLED requires SMTP_HOST and SMTP_FROM.');
    }
  }

  if (features.formbarAuth) {
    if (!formbar.baseUrl || !formbar.clientId || !formbar.clientSecret || !formbar.redirectUri) {
      errors.push(
        'FORMBAR_AUTH_ENABLED requires FORMBAR_BASE_URL, FORMBAR_CLIENT_ID, FORMBAR_CLIENT_SECRET, and FORMBAR_REDIRECT_URI.',
      );
    }
  }

  if (features.formbarHttpExample && env === 'production') {
    errors.push('FORMBAR_HTTP_EXAMPLE_ENABLED is forced off in production.');
  }

  if (features.formbarWsExample && env === 'production') {
    errors.push('FORMBAR_WS_EXAMPLE_ENABLED is forced off in production.');
  }

  if ((features.formbarWsClient || features.formbarWsExample) && !formbar.baseUrl) {
    errors.push('Formbar WebSocket client requires FORMBAR_BASE_URL.');
  }

  if (features.formbarWsExample && !features.formbarWsClient) {
    errors.push('FORMBAR_WS_EXAMPLE_ENABLED requires FORMBAR_WS_CLIENT_ENABLED.');
  }

  if (features.formbarHttpExample && !formbar.baseUrl) {
    errors.push('FORMBAR_HTTP_EXAMPLE_ENABLED requires FORMBAR_BASE_URL.');
  }

  if (features.entraAuth) {
    if (!entra.tenantId || !entra.clientId || !entra.clientSecret || !entra.redirectUri) {
      errors.push(
        'ENTRA_AUTH_ENABLED requires ENTRA_TENANT_ID, ENTRA_CLIENT_ID, ENTRA_CLIENT_SECRET, and ENTRA_REDIRECT_URI.',
      );
    }
    if (env === 'production' && entra.tenantId === 'common') {
      errors.push('ENTRA_TENANT_ID=common is discouraged in production; set a specific tenant.');
    }
  }

  if (features.socketIo && webConcurrency > 1 && !features.redis) {
    errors.push('SOCKET_IO_ENABLED with WEB_CONCURRENCY>1 requires REDIS_ENABLED.');
  }

  if (features.backgroundJobs && !features.redis && (env === 'production' || webConcurrency > 1)) {
    errors.push('BACKGROUND_JOBS_ENABLED in production or cluster mode requires REDIS_ENABLED.');
  }

  if (features.seq && !config.seq.url) {
    errors.push('SEQ_ENABLED requires SEQ_URL.');
  }

  if (features.redis) {
    if (!redis.url) {
      errors.push('REDIS_ENABLED requires REDIS_URL.');
    }
  }

  if (clustered && features.redis === false && env === 'production' && webConcurrency > 1) {
    errors.push(
      'Production multi-worker deployments require REDIS_ENABLED for shared sessions and rate limits.',
    );
  }

  if (features.apiDocs && !features.api) {
    errors.push('API_DOCS_ENABLED requires API_ENABLED.');
  }

  return errors;
}
