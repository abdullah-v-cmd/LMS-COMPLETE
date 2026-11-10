import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { env } from '../../config/env';

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

/**
 * Encrypts sensitive finance gateway credentials at rest using authenticated AES-256-GCM.
 */
export function encryptGatewaySecret(plainText: string): string {
  const secret = env.FINANCE_ENCRYPTION_SECRET || env.JWT_ACCESS_SECRET;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`;
}

/**
 * Decrypts authenticated AES-256-GCM finance gateway credentials.
 */
export function decryptGatewaySecret(encrypted: string): string {
  const secret = env.FINANCE_ENCRYPTION_SECRET || env.JWT_ACCESS_SECRET;
  const [version, rawIv, rawTag, rawData] = encrypted.split(':');
  if (version !== 'v1' || !rawIv || !rawTag || rawData === undefined) {
    // If legacy unencrypted string was stored, return as-is
    return encrypted;
  }
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret), Buffer.from(rawIv, 'base64'));
  decipher.setAuthTag(Buffer.from(rawTag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(rawData, 'base64')), decipher.final()]).toString('utf8');
}

