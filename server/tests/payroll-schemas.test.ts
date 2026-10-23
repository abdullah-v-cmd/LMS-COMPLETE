import { describe, expect, it } from 'vitest';
import { compensationSchema, payrollPeriodSchema } from '../src/modules/payroll/payroll.schemas';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS } from '../src/constants/permissions';

describe('Payroll request validation', () => {
  it('accepts a valid salary effective date and rejects invalid amounts and IDs', () => {
    expect(compensationSchema.safeParse({ teacherProfileId: 'a0184c98-7f09-4b16-a22c-95b8dbf2a010', monthlySalary: 85000, effectiveFrom: '2026-10-01' }).success).toBe(true);
    expect(compensationSchema.safeParse({ teacherProfileId: 'bad', monthlySalary: 0, effectiveFrom: '2026-10-01' }).success).toBe(false);
  });

  it('accepts calendar month periods and rejects invalid months', () => {
    expect(payrollPeriodSchema.safeParse({ period: '2026-10' }).success).toBe(true);
    expect(payrollPeriodSchema.safeParse({ period: '2026-13' }).success).toBe(false);
  });

  it('limits payroll permissions to the principal and finance head roles', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.ROLE_INSTITUTION_ADMIN).toContain(PERMISSIONS.PAYROLL_READ);
    expect(DEFAULT_ROLE_PERMISSIONS.ROLE_FINANCE_HEAD).toContain(PERMISSIONS.PAYROLL_MANAGE);
    expect(DEFAULT_ROLE_PERMISSIONS.ROLE_AUDITOR).not.toContain(PERMISSIONS.PAYROLL_READ);
    expect(DEFAULT_ROLE_PERMISSIONS.ROLE_STUDENT).not.toContain(PERMISSIONS.PAYROLL_READ);
  });
});
