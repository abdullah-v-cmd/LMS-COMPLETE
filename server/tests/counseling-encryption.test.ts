import { describe, expect, it } from 'vitest';
import { decryptCounselingNote, encryptCounselingNote } from '../src/modules/counseling/encryption';
import { redactAuditPayload } from '../src/middleware/audit';

describe('Confidential counseling data protection', () => {
  const secret = 'counseling-test-encryption-secret';
  it('encrypts notes and action plans and detects wrong keys or tampering', () => {
    const encrypted = encryptCounselingNote('private clinical observations', secret);
    expect(encrypted).not.toContain('private clinical observations');
    expect(decryptCounselingNote(encrypted, secret)).toBe('private clinical observations');
    expect(() => decryptCounselingNote(encrypted, 'wrong-key')).toThrow();
    expect(() => decryptCounselingNote(`${encrypted.slice(0, -2)}AA`, secret)).toThrow();
  });
  it('redacts confidential counseling fields from audit snapshots', () => {
    expect(redactAuditPayload({ caseTitle: 'title', notes: 'private', nested: { reason: 'sensitive' } }, ['caseTitle', 'reason'])).toEqual({ caseTitle: '[REDACTED]', notes: '[REDACTED]', nested: { reason: '[REDACTED]' } });
  });
});
