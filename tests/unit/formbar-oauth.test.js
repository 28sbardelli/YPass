import { generateKeyPairSync, createSign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createFormbarOAuth } from '#integrations/formbar/oauth.js';
import { parseConfig } from '#config';
import { validTestEnv } from '../helpers/env.js';
import { createLogger } from '#logging/logger.js';

function silentOAuth(env) {
  const config = parseConfig(validTestEnv(env));
  return createFormbarOAuth({ config, logger: createLogger({ level: 'silent', pretty: false }) });
}

describe('formbar oauth urls', () => {
  it('sends the browser to Formbar /oauth, not the API authorize route', () => {
    const oauth = silentOAuth({ FORMBAR_OAUTH_MODE: 'legacy_redirect' });
    const url = oauth.buildAuthorizationUrl('state-token');
    expect(url).toContain('https://formbar.test/oauth?');
    expect(url).toContain('redirectURL=');
    expect(url).toContain('state-token');
    expect(url).not.toContain('/api/v1/oauth/authorize');
  });

  it('sends authorization-code users to the Formbar frontend consent page', () => {
    const oauth = silentOAuth({ FORMBAR_OAUTH_MODE: 'authorization_code' });
    const url = oauth.buildAuthorizationUrl('state-token');
    expect(url).toContain('https://formbar.test/oauth/authorize?');
    expect(url).toContain('client_id=test-client');
    expect(url).toContain('scope=app.profile.read');
    expect(url).not.toContain('/api/v1/oauth/authorize');
  });
});

describe('formbar oauth callback', () => {
  it('completes the legacy Formbar callback with a cert-verified JWT', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 1024,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ id: 42, email: 'pat@example.test', displayName: 'Pat' }),
    ).toString('base64url');
    const signer = createSign('RSA-SHA256');
    signer.update(`${header}.${payload}`);
    signer.end();
    const token = `${header}.${payload}.${signer.sign(privateKey, 'base64url')}`;

    const config = parseConfig(validTestEnv({ FORMBAR_OAUTH_MODE: 'legacy_redirect' }));
    const oauth = createFormbarOAuth({
      config,
      logger: createLogger({ level: 'silent', pretty: false }),
      fetchImpl: async (url) => {
        expect(String(url)).toBe('https://formbar.test/certs');
        return {
          ok: true,
          async json() {
            return { publicKey };
          },
        };
      },
    });
    const identity = await oauth.completeCallback({
      token,
      state: 'abc',
      expectedState: 'abc',
    });
    expect(identity.subject).toBe('42');
    expect(identity.email).toBe('pat@example.test');
  });
});
