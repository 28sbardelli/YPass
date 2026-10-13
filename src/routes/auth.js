import { Router } from 'express';
import { createAuthController } from '#controllers/auth-controller.js';
import { validate } from '#middleware/validate.js';
import { registerSchema, loginSchema, forgotSchema, resetSchema } from '#validators/auth.js';

export function createAuthRouter(container) {
  const router = Router();
  const { config, rateLimiters } = container;
  const auth = createAuthController(container);
  const authLimit = rateLimiters.auth;

  router.get('/login', auth.loginPage);
  router.post('/logout', auth.logout);

  if (config.features.localAuth) {
    router.get('/register', auth.registerPage);
    router.post('/register', authLimit, validate(registerSchema), auth.register);
    router.post('/login', authLimit, validate(loginSchema), auth.localLogin);
    router.get('/forgot', auth.forgotPage);
    router.post('/forgot', authLimit, validate(forgotSchema), auth.forgot);
    router.get('/reset', auth.resetPage);
    router.post('/reset', authLimit, validate(resetSchema), auth.reset);
    router.get('/verify', auth.verify);
  }

  if (config.features.formbarAuth) {
    router.get('/formbar', authLimit, auth.startFormbar);
    router.get('/formbar/callback', auth.formbarCallback);
  }

  if (config.features.entraAuth) {
    router.get('/entra', authLimit, auth.startEntra);
    router.get('/entra/callback', auth.entraCallback);
  }

  return router;
}
