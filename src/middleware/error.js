import { mapError, toPublicError, CsrfError } from '#errors';
import { wantsJson } from '#utils/urls.js';

/**
 * Centralized Express error handler.
 * Production responses never include stack traces.
 */
export function errorHandler(config, logger) {
  return (error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    const mapped = mapError(error);
    const logPayload = {
      err: error,
      requestId: req.requestId,
      route: req.originalUrl,
      userId: req.session?.userId,
    };

    if (mapped.status >= 500) {
      logger.error(logPayload, mapped.message);
    } else {
      logger.warn(logPayload, mapped.message);
    }

    if (wantsJson(req) || req.path.startsWith('/api/')) {
      res.status(mapped.status).json(toPublicError(mapped, !config.isProduction));
      return;
    }

    const view =
      mapped instanceof CsrfError || mapped.code === 'CSRF_ERROR'
        ? 'errors/csrf'
        : mapped.status === 404
          ? 'errors/404'
          : mapped.status === 403
            ? 'errors/403'
            : 'errors/500';

    res.status(mapped.status).render(view, {
      title: mapped.status === 404 ? '页面未找到' : '出现错误',
      message: mapped.expose ? mapped.message : 'An unexpected error occurred',
    });
  };
}

export function notFoundHandler(req, res, _next) {
  if (wantsJson(req) || req.path.startsWith('/api/')) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
    return;
  }
  res.status(404).render('errors/404', { title: '页面未找到' });
}
