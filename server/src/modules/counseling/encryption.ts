import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

function deriveKey(secret: string) { return createHash('sha256').update(secret).digest(); }

export function encryptCounselingNote(plainText: string, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${ciphertext.toString('base64')}`;
}

export function decryptCounselingNote(encrypted: string, secret: string) {
  const [version, rawIv, rawTag, rawData] = encrypted.split(':');
  if (version !== 'v1' || !rawIv || !rawTag || rawData === undefined) throw new Error('Unsupported counseling note encryption format');
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret), Buffer.from(rawIv, 'base64'));
  decipher.setAuthTag(Buffer.from(rawTag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(rawData, 'base64')), decipher.final()]).toString('utf8');
}
