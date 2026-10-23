import { describe, expect, it } from 'vitest';
import { atRiskRuleSchema, createCaseSchema, followUpSchema, referralSchema, supportPlanSchema } from '../src/modules/counseling/counseling.schemas';

describe('Counseling input validation', () => {
  const id = 'a0184c98-7f09-4b16-a22c-95b8dbf2a010';
  it('validates referral, case, and encrypted note request bounds', () => {
    expect(referralSchema.safeParse({ studentId: id, reason: 'Concern about recent attendance' }).success).toBe(true);
    expect(createCaseSchema.safeParse({ studentId: id, caseTitle: 'Student support', riskLevel: 'HIGH' }).success).toBe(true);
    expect(createCaseSchema.safeParse({ studentId: id, caseTitle: 'x', riskLevel: 'UNKNOWN' }).success).toBe(false);
  });
  it('validates support plan dates, follow-up, and configurable risk thresholds', () => {
    expect(supportPlanSchema.safeParse({ caseId: id, title: 'Attendance support', goal: 'Improve weekly attendance', actions: 'Weekly check in', startsAt: '2026-10-20T10:00:00.000Z', endsAt: '2026-10-19T10:00:00.000Z' }).success).toBe(false);
    expect(followUpSchema.safeParse({ supportPlanId: id, dueAt: '2026-11-01T10:00:00.000Z', notes: 'Follow up' }).success).toBe(true);
    expect(atRiskRuleSchema.safeParse({ name: 'Absence watch', minimumAbsences: 4, lookbackDays: 30, minimumGradePercent: 60 }).success).toBe(true);
    expect(atRiskRuleSchema.safeParse({ name: 'x', minimumAbsences: 0, lookbackDays: 500, minimumGradePercent: 120 }).success).toBe(false);
  });
});
