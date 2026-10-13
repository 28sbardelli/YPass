import { Router } from 'express';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { createApiController } from '#controllers/api-controller.js';
import { requireAuthentication, requireManager } from '#middleware/auth.js';
import { sha256, safeEqual } from '#utils/crypto.js';
import { AuthenticationError } from '#errors';
import { validate } from '#middleware/validate.js';
import {
  kioskEnrollmentSchema,
  kioskEnrollmentStartSchema,
  kioskEnrollmentStatusSchema,
} from '#validators/pass.js';
import { managerEnrollmentCompleteSchema } from '#validators/staff.js';

export function createApiV1Router(container) {
  if (!container.config.features.api) {
    return Router();
  }

  const router = Router();
  const api = createApiController(container);
  const requireKiosk = async (req, _res, next) => {
    try {
      const code = req.get('x-kiosk-code');
      const secret = req.get('x-kiosk-secret');
      if (!code || !secret) throw new AuthenticationError('Kiosk credentials required');
      const kiosk = await container.passRepository.findAuthenticatedKiosk(code, sha256(secret));
      if (!kiosk || !safeEqual(kiosk.secret_hash, sha256(secret)))
        throw new AuthenticationError('Invalid kiosk credentials');
      req.kiosk = kiosk;
      next();
    } catch (error) {
      next(error);
    }
  };

  /**
   * @openapi
   * /api/v1/me:
   *   get:
   *     summary: Current user
   *     security:
   *       - cookieAuth: []
   *     responses:
   *       200:
   *         description: The authenticated user
   *       401:
   *         description: Authentication required
   */
  router.get('/me', requireAuthentication(), api.me);
  router.post(
    '/kiosks/enrollment/start',
    container.rateLimiters?.auth,
    validate(kioskEnrollmentStartSchema),
    api.kioskEnrollmentStart,
  );
  router.get(
    '/kiosks/enrollment/status',
    validate(kioskEnrollmentStatusSchema, 'query'),
    api.kioskEnrollmentStatus,
  );
  router.post(
    '/kiosks/enrollment/complete',
    requireAuthentication(),
    requireManager(container.config.managers),
    validate(managerEnrollmentCompleteSchema),
    api.kioskEnrollmentComplete,
  );
  router.post(
    '/kiosks/enroll',
    container.rateLimiters?.auth,
    validate(kioskEnrollmentSchema),
    api.kioskEnroll,
  );
  router.post('/kiosks/session', requireKiosk, api.kioskSession);
  router.get('/kiosks/options', requireKiosk, api.kioskOptions);
  router.post('/kiosks/heartbeat', requireKiosk, api.kioskHeartbeat);
  router.post('/kiosks/scan', requireKiosk, api.kioskScan);
  router.post('/kiosks/request-pass', requireKiosk, api.kioskRequestPass);

  if (container.config.features.formbarHttpExample && container.formbarHttpExample) {
    router.get('/examples/formbar', requireAuthentication(), api.exampleFormbarHttp);
  }

  if (container.config.features.apiDocs) {
    const spec = swaggerJsdoc({
      definition: {
        openapi: '3.0.3',
        info: {
          title: `${container.config.appName} API`,
          version: '1.0.0',
        },
        servers: [{ url: container.config.baseUrl }],
        components: {
          securitySchemes: {
            cookieAuth: { type: 'apiKey', in: 'cookie', name: container.config.session.cookieName },
          },
        },
      },
      apis: ['./src/routes/api.v1.js'],
    });
    router.use('/docs', swaggerUi.serve, swaggerUi.setup(spec));
    router.get('/openapi.json', (req, res) => res.json(spec));
  }

  return router;
}
