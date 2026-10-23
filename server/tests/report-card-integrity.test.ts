import { describe, expect, it } from 'vitest';
import { signReportCard, verifyReportCardSignature } from '../src/modules/exams/report-card-integrity';

const card = {
  id: 'card-1', institutionId: 'institution-1', studentId: 'student-1', examSessionId: 'session-1',
  totalMarks: 80, percentage: 80, gpa: 3.5, gradeLetter: 'A', rank: 2,
  publishedAt: new Date('2026-10-24T10:00:00.000Z'),
};

describe('Report card integrity signatures', () => {
  const secret = 'test-only-report-card-signing-secret';

  it('verifies an unaltered persisted card signature', () => {
    const signature = signReportCard(card, secret);
    expect(signature).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyReportCardSignature(card, signature, secret)).toBe(true);
  });

  it('detects changed results, wrong secrets, and malformed signatures', () => {
    const signature = signReportCard(card, secret);
    expect(verifyReportCardSignature({ ...card, totalMarks: 81 }, signature, secret)).toBe(false);
    expect(verifyReportCardSignature(card, signature, 'another-secret')).toBe(false);
    expect(verifyReportCardSignature(card, 'not-a-signature', secret)).toBe(false);
  });
});
