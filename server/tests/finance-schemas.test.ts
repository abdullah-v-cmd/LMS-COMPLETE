import { describe, expect, it } from 'vitest';
import { feeStructureSchema, recordPaymentSchema, waiverRequestSchema } from '../src/modules/finance/finance.schemas';

describe('Finance request validation', () => {
  it('requires valid tenant IDs, positive currency with cents, and a supported fee frequency', () => {
    const valid = {
      academicYearId: 'a0184c98-7f09-4b16-a22c-95b8dbf2a010',
      classGradeId: 'b0184c98-7f09-4b16-a22c-95b8dbf2a010',
      name: 'Annual tuition',
      amount: 1250.25,
      dueDate: '2026-12-01',
      frequency: 'ANNUAL',
    };
    expect(feeStructureSchema.safeParse(valid).success).toBe(true);
    expect(feeStructureSchema.safeParse({ ...valid, amount: 1.239 }).success).toBe(false);
  });

  it('rejects client-asserted online payment confirmations', () => {
    expect(recordPaymentSchema.safeParse({
      invoiceId: 'a0184c98-7f09-4b16-a22c-95b8dbf2a010',
      amount: 20,
      paymentMethod: 'ONLINE',
      transactionRef: 'forged-client-reference',
    }).success).toBe(false);
  });

  it('requires a reason and positive amount for a waiver', () => {
    const valid = { invoiceId: 'a0184c98-7f09-4b16-a22c-95b8dbf2a010', amount: 80, reason: 'Approved scholarship support' };
    expect(waiverRequestSchema.safeParse(valid).success).toBe(true);
    expect(waiverRequestSchema.safeParse({ ...valid, reason: 'no' }).success).toBe(false);
  });
});
