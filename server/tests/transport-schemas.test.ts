import { describe, expect, it } from 'vitest';
import { allocationSchema, routeSchema, vehicleSchema } from '../src/modules/transport/transport.schemas';

describe('Transport request validation', () => {
  it('requires route stops and money at currency precision', () => {
    const valid = { name: 'North route', startPoint: 'Depot', endPoint: 'School', monthlyFee: 20.25 };
    expect(routeSchema.safeParse(valid).success).toBe(true);
    expect(routeSchema.safeParse({ ...valid, monthlyFee: 1.256 }).success).toBe(false);
    expect(routeSchema.safeParse({ ...valid, endPoint: '' }).success).toBe(false);
  });

  it('validates driver, vehicle capacity, and student seat allocation inputs', () => {
    const routeId = 'a0184c98-7f09-4b16-a22c-95b8dbf2a010';
    const studentId = 'b0184c98-7f09-4b16-a22c-95b8dbf2a010';
    expect(vehicleSchema.safeParse({ routeId, vehicleNumber: 'ABC-123', driverName: 'Driver Name', driverPhone: '+123456789', capacity: 30 }).success).toBe(true);
    expect(vehicleSchema.safeParse({ routeId, vehicleNumber: 'ABC-123', driverName: 'Driver Name', driverPhone: '+123456789', capacity: 0 }).success).toBe(false);
    expect(allocationSchema.safeParse({ routeId, studentId, pickupStop: 'Main street' }).success).toBe(true);
    expect(allocationSchema.safeParse({ routeId, studentId, pickupStop: '' }).success).toBe(false);
  });
});
