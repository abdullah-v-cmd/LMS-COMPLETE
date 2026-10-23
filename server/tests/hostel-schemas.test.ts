import { describe, expect, it } from 'vitest';
import { allocationSchema, blockSchema, gatePassSchema, messChargeSchema, roomSchema, visitorSchema, incidentSchema } from '../src/modules/hostel/hostel.schemas';

describe('Hostel request validation', () => {
  const id = 'a0184c98-7f09-4b16-a22c-95b8dbf2a010';
  it('validates block type, room and bed capacity inputs', () => {
    expect(blockSchema.safeParse({ name: 'North', type: 'BOYS', totalRooms: 10 }).success).toBe(true);
    expect(blockSchema.safeParse({ name: 'North', type: 'UNKNOWN', totalRooms: 10 }).success).toBe(false);
    expect(roomSchema.safeParse({ blockId: id, roomNumber: '1A', capacity: 2 }).success).toBe(true);
    expect(allocationSchema.safeParse({ roomId: id, studentId: id, bedNumber: 1 }).success).toBe(true);
    expect(allocationSchema.safeParse({ roomId: id, studentId: id, bedNumber: 0 }).success).toBe(false);
  });
  it('validates incidents and prevents unbounded or missing incident details', () => {
    expect(incidentSchema.safeParse({ studentId: id, category: 'SAFETY', description: 'Wet floor by stairs', occurredAt: '2026-10-24T10:00:00.000Z' }).success).toBe(true);
    expect(incidentSchema.safeParse({ category: 'UNKNOWN', description: 'x', occurredAt: 'bad' }).success).toBe(false);
  });
  it('requires reasoned passes, well-formed visitor records and valid billing periods', () => {
    expect(gatePassSchema.safeParse({ reason: 'Medical appointment', destination: 'City clinic', expectedReturnAt: '2026-12-01T12:00:00.000Z' }).success).toBe(true);
    expect(gatePassSchema.safeParse({ reason: 'no', destination: 'X', expectedReturnAt: 'invalid' }).success).toBe(false);
    expect(visitorSchema.safeParse({ visitorName: 'Sam Example', purpose: 'Family visit' }).success).toBe(true);
    expect(messChargeSchema.safeParse({ studentId: id, period: '2026-10', amount: 1000 }).success).toBe(true);
    expect(messChargeSchema.safeParse({ studentId: id, period: '2026-19', amount: -2 }).success).toBe(false);
  });
});
