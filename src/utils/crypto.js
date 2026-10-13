/**
 * Cryptographic helpers. Never log the output of randomToken.
 */

import {
  randomBytes,
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
  createCipheriv,
  createDecipheriv,
  scryptSync,
} from 'node:crypto';

export { randomUUID };

/**
 * Cryptographically secure random hex string.
 * @param {number} bytes
 */
export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('hex');
}

/**
 * SHA-256 hex digest. Store one-time tokens as hashes, never plaintext.
 * @param {string} value
 */
export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * HMAC-SHA256 hex digest.
 * @param {string} key
 * @param {string} value
 */
export function hmacSha256(key, value) {
  return createHmac('sha256', key).update(value).digest('hex');
}

/**
 * Timing-safe string equality.
 * @param {string} a
 * @param {string} b
 */
export function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

function encryptionKey(secret) {
  return scryptSync(secret, 'formbar-app-token-v1', 32);
}

/**
 * Encrypt a UTF-8 string for at-rest provider token storage.
 * @param {string} plaintext
 * @param {string} secret
 */
export function encryptString(plaintext, secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

/**
 * Decrypt a value produced by encryptString.
 * @param {string} payload
 * @param {string} secret
 */
export function decryptString(payload, secret) {
  const [ivB64, tagB64, dataB64] = String(payload).split('.');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Invalid encrypted payload');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(secret),
    Buffer.from(ivB64, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
