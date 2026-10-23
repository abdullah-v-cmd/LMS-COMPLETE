import { describe, expect, it } from 'vitest';
import { createLeaveSchema, reviewLeaveSchema } from '../src/modules/hr/leave.schemas';

describe('Staff leave request validation', () => {
  it('accepts a valid request and rejects a reversed date range', () => {
    expect(createLeaveSchema.safeParse({ leaveType: 'SICK', startDate: '2026-10-24', endDate: '2026-10-25', reason: 'Medical leave' }).success).toBe(true);
    expect(createLeaveSchema.safeParse({ leaveType: 'SICK', startDate: '2026-10-25', endDate: '2026-10-24', reason: 'Medical leave' }).success).toBe(false);
  });

  it('rejects invalid dates, short reasons, and unsupported decisions', () => {
    expect(createLeaveSchema.safeParse({ leaveType: 'SICK', startDate: '2026-02-30', endDate: '2026-03-01', reason: 'ill' }).success).toBe(false);
    expect(reviewLeaveSchema.safeParse({ status: 'PENDING' }).success).toBe(false);
  });
});
