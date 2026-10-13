import { doubleCsrf } from 'csrf-csrf';
import { CsrfError } from '#errors';

/**
 * Cookie-authenticated browser CSRF protection (double-submit).
 * OAuth callbacks use `state` instead of this middleware.
 * JSON APIs that later use bearer tokens should skip CSRF; this app's
 * cookie-authenticated /api/v1 still requires the CSRF header.
 */
export function createCsrf(config) {
  const { doubleCsrfProtection, generateCsrfToken, invalidCsrfTokenError } = doubleCsrf({
    getSecret: () => config.session.secret,
    getSessionIdentifier: (req) => req.session?.id || 'anonymous',
    cookieName: config.isProduction ? '__Host-fbapp.csrf' : 'fbapp.csrf',
    cookieOptions: {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: config.isProduction,
    },
    getCsrfTokenFromRequest: (req) =>
      req.body?._csrf || req.get('csrf-token') || req.get('x-csrf-token'),
  });

  function csrfErrorHandler(error, req, res, next) {
    if (error === invalidCsrfTokenError || error?.code === 'EBADCSRFTOKEN') {
      next(new CsrfError());
      return;
    }
    next(error);
  }

  function attachToken(req, res, next) {
    try {
      res.locals.csrfToken = generateCsrfToken(req, res);
    } catch {
      res.locals.csrfToken = '';
    }
    next();
  }

  function skipSafeMethods(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      next();
      return;
    }
    if (req.path.startsWith('/api/v1/kiosks/')) {
      next();
      return;
    }
    // OAuth provider callbacks are GET plus state; nothing to skip here for POST token.
    doubleCsrfProtection(req, res, (error) => csrfErrorHandler(error, req, res, next));
  }

  return { doubleCsrfProtection, generateCsrfToken, attachToken, skipSafeMethods };
}
