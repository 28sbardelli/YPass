export function createAccountController(container) {
  const { userService, localAuth, config } = container;

  return {
    async show(req, res, next) {
      try {
        const identities = await userService.listIdentities(req.session.userId);
        res.render('auth/link', {
          title: 'Account',
          identities,
          features: config.features,
          error: req.query.error || null,
        });
      } catch (error) {
        next(error);
      }
    },

    async changePassword(req, res, next) {
      try {
        await localAuth.changePassword(
          req.session.userId,
          req.body.currentPassword,
          req.body.newPassword,
          req,
        );
        res.redirect('/account?updated=1');
      } catch (error) {
        next(error);
      }
    },

    async unlink(req, res, next) {
      try {
        let hasReauthenticated =
          Boolean(req.session.reauthAt) && Date.now() - req.session.reauthAt < 5 * 60 * 1000;
        if (req.body.currentPassword && localAuth) {
          await localAuth.reauthenticate(req.session.userId, req.body.currentPassword);
          req.session.reauthAt = Date.now();
          hasReauthenticated = true;
        }
        await userService.unlink(
          {
            userId: req.session.userId,
            identityId: req.body.identityId,
            hasReauthenticated,
          },
          req,
        );
        res.redirect('/account');
      } catch (error) {
        if (error.expose) {
          res.redirect(`/account?error=${encodeURIComponent(error.message)}`);
          return;
        }
        next(error);
      }
    },
  };
}
