import { safeRedirect } from '#utils/urls.js';
import { regenerateSession, destroySession } from '#middleware/session.js';
import { AuthenticationError } from '#errors';

export function createAuthController(container) {
  const { config, localAuth, userService, formbarOAuth, entraProvider } = container;

  return {
    loginPage(req, res) {
      res.render('auth/login', {
        title: 'Sign in',
        next: safeRedirect(req.query.next),
        features: config.features,
        error: null,
      });
    },

    registerPage(req, res) {
      if (!config.features.localAuth) {
        res.redirect('/auth/login');
        return;
      }
      res.render('auth/register', { title: 'Create account', error: null });
    },

    async register(req, res, next) {
      try {
        await localAuth.register(req.body, req);
        res.redirect('/auth/login?registered=1');
      } catch (error) {
        if (error.expose) {
          res.status(error.status).render('auth/register', {
            title: 'Create account',
            error: error.message,
          });
          return;
        }
        next(error);
      }
    },

    async localLogin(req, res, next) {
      try {
        const user = await localAuth.login(req.body, req);
        await regenerateSession(req, { userId: user.id });
        res.redirect(safeRedirect(req.body.next));
      } catch (error) {
        if (error.expose) {
          res.status(error.status).render('auth/login', {
            title: 'Sign in',
            next: safeRedirect(req.body.next),
            features: config.features,
            error: error.message,
          });
          return;
        }
        next(error);
      }
    },

    async logout(req, res, next) {
      try {
        const sessionId = await destroySession(req, res, config);
        if (container.io && sessionId) {
          container.io.in(sessionId).disconnectSockets();
        }
        container.auditLogger.info({ userId: req.currentUser?.id, eventType: 'logout' }, 'logout');
        res.redirect('/auth/login');
      } catch (error) {
        next(error);
      }
    },

    startFormbar(req, res) {
      const state = formbarOAuth.createState();
      req.session.oauth = {
        provider: 'formbar',
        state,
        next: safeRedirect(req.query.next),
        link: req.query.link === '1',
      };
      if (req.query.link === '1' && req.session.userId) {
        userService.beginLink(req.session.userId, 'formbar').then((nonce) => {
          req.session.oauth.linkNonce = nonce;
          req.session.save(() => res.redirect(formbarOAuth.buildAuthorizationUrl(state)));
        });
        return;
      }
      res.redirect(formbarOAuth.buildAuthorizationUrl(state));
    },

    async formbarCallback(req, res, next) {
      try {
        const pending = req.session.oauth;
        const identity = await formbarOAuth.completeCallback({
          code: req.query.code,
          token: req.query.token,
          state: req.query.state,
          expectedState: pending?.state,
        });
        await finishExternal(req, res, identity, pending);
      } catch (error) {
        next(error);
      }
    },

    async startEntra(req, res, next) {
      try {
        const started = await entraProvider.begin();
        req.session.oauth = {
          provider: 'entra',
          state: started.state,
          nonce: started.nonce,
          verifier: started.verifier,
          next: safeRedirect(req.query.next),
          link: req.query.link === '1',
        };
        if (req.query.link === '1' && req.session.userId) {
          req.session.oauth.linkNonce = await userService.beginLink(req.session.userId, 'entra');
        }
        res.redirect(started.url);
      } catch (error) {
        next(error);
      }
    },

    async entraCallback(req, res, next) {
      try {
        const pending = req.session.oauth;
        const identity = await entraProvider.complete({
          code: req.query.code,
          state: req.query.state,
          expectedState: pending?.state,
          nonce: pending?.nonce,
          verifier: pending?.verifier,
        });
        await finishExternal(req, res, identity, pending);
      } catch (error) {
        next(error);
      }
    },

    forgotPage(req, res) {
      res.render('auth/forgot', { title: 'Forgot password', message: null });
    },

    async forgot(req, res, next) {
      try {
        const message = await localAuth.requestPasswordReset(req.body.email, req);
        res.render('auth/forgot', { title: 'Forgot password', message });
      } catch (error) {
        next(error);
      }
    },

    resetPage(req, res) {
      res.render('auth/reset', { title: 'Reset password', token: req.query.token, error: null });
    },

    async reset(req, res, next) {
      try {
        await localAuth.resetPassword(req.body.token, req.body.password, req);
        res.redirect('/auth/login');
      } catch (error) {
        if (error.expose) {
          res.status(error.status).render('auth/reset', {
            title: 'Reset password',
            token: req.body.token,
            error: error.message,
          });
          return;
        }
        next(error);
      }
    },

    async verify(req, res, next) {
      try {
        await localAuth.verifyEmail(req.query.token, req);
        res.render('auth/verify', { title: 'Email verified', ok: true });
      } catch (error) {
        if (error.expose) {
          res.status(error.status).render('auth/verify', {
            title: 'Email verification',
            ok: false,
            error: error.message,
          });
          return;
        }
        next(error);
      }
    },
  };

  async function finishExternal(req, res, identity, pending) {
    if (pending?.link && req.session.userId) {
      await userService.completeLink(
        {
          userId: req.session.userId,
          provider: identity.provider,
          subject: identity.subject,
          email: identity.email,
          profile: identity.profile,
          linkNonce: pending.linkNonce,
        },
        req,
      );
      req.session.oauth = null;
      res.redirect('/account');
      return;
    }
    const user = await userService.loginWithExternalIdentity(identity, req);
    if (!user?.id) {
      throw new AuthenticationError('Formbar authentication failed');
    }
    await regenerateSession(req, { userId: user.id });
    res.redirect(safeRedirect(pending?.next));
  }
}
