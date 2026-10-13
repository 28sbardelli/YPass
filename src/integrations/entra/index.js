/**
 * Microsoft Entra ID via MSAL Node confidential client.
 * Tokens stay on the server. Identity subject is the Entra oid.
 */

import { ConfidentialClientApplication, CryptoProvider } from '@azure/msal-node';
import { AuthenticationError, ValidationError } from '#errors';

export function createEntraProvider({ config, logger }) {
  const authority = `https://login.microsoftonline.com/${config.entra.tenantId}`;
  const cryptoProvider = new CryptoProvider();
  const pca = new ConfidentialClientApplication({
    auth: {
      clientId: config.entra.clientId,
      authority,
      clientSecret: config.entra.clientSecret,
    },
  });

  return {
    async begin() {
      const { verifier, challenge } = await cryptoProvider.generatePkceCodes();
      const nonce = cryptoProvider.createNewGuid();
      const state = cryptoProvider.createNewGuid();
      const url = await pca.getAuthCodeUrl({
        scopes: config.entra.scopes,
        redirectUri: config.entra.redirectUri,
        state,
        nonce,
        codeChallenge: challenge,
        codeChallengeMethod: 'S256',
      });
      return { url, state, nonce, verifier };
    },

    async complete({ code, state, expectedState, nonce, verifier }) {
      if (!state || state !== expectedState) {
        throw new ValidationError('Entra state mismatch');
      }
      if (!code) {
        throw new ValidationError('Missing Entra authorization code');
      }
      try {
        const result = await pca.acquireTokenByCode({
          code,
          scopes: config.entra.scopes,
          redirectUri: config.entra.redirectUri,
          codeVerifier: verifier,
          nonce,
        });
        const claims = result.idTokenClaims || {};
        if (nonce && claims.nonce && claims.nonce !== nonce) {
          throw new AuthenticationError('Entra nonce mismatch');
        }
        const issuerOk =
          typeof claims.iss === 'string' && claims.iss.includes(`/${config.entra.tenantId}/`);
        if (config.entra.tenantId !== 'common' && !issuerOk) {
          throw new AuthenticationError('Entra issuer mismatch');
        }
        const oid = claims.oid || claims.sub;
        if (!oid) {
          throw new AuthenticationError('Entra authentication failed');
        }
        return {
          provider: 'entra',
          subject: String(oid),
          email: claims.preferred_username || claims.email || null,
          displayName: claims.name || 'Entra user',
          profile: { tid: claims.tid },
          tokens: config.entra.persistTokens
            ? { accessToken: result.accessToken, idToken: result.idToken }
            : null,
        };
      } catch (error) {
        if (error instanceof AuthenticationError || error instanceof ValidationError) {
          throw error;
        }
        logger.error({ err: error }, 'entra token exchange failed');
        throw new AuthenticationError('Entra authentication failed');
      }
    },

    logoutUrl() {
      const url = new URL(`${authority}/oauth2/v2.0/logout`);
      if (config.entra.logoutUri) {
        url.searchParams.set('post_logout_redirect_uri', config.entra.logoutUri);
      }
      return url.toString();
    },
  };
}
