import { describe, expect, it } from 'vitest';
import { allocationSchema, routeSchema, vehicleSchema, stopSchema, trackingLogSchema, driverAssignmentSchema } from '../src/modules/transport/transport.schemas';

describe('Transport request validation', () => {
  it('requires route stops and money at currency precision', () => {
    const valid = { name: 'North route', startPoint: 'Depot', endPoint: 'School', monthlyFee: 20.25 };
    expect(routeSchema.safeParse(valid).success).toBe(true);
    expect(routeSchema.safeParse({ ...valid, monthlyFee: 1.256 }).success).toBe(false);
    expect(routeSchema.safeParse({ ...valid, endPoint: '' }).success).toBe(false);
  });

  it('validates stop sequencing, GPS coordinate bounds, and driver date ranges', () => {
    const routeId = 'a0184c98-7f09-4b16-a22c-95b8dbf2a010'; const vehicleId = 'b0184c98-7f09-4b16-a22c-95b8dbf2a010';
    expect(stopSchema.safeParse({ routeId, name: 'North Gate', address: 'Main Road', sequence: 1, pickupTime: '07:15' }).success).toBe(true);
    expect(stopSchema.safeParse({ routeId, name: 'North Gate', address: 'Main Road', sequence: 0 }).success).toBe(false);
    expect(trackingLogSchema.safeParse({ vehicleId, latitude: 91, longitude: 0, recordedAt: '2026-10-24T10:00:00.000Z' }).success).toBe(false);
    expect(driverAssignmentSchema.safeParse({ vehicleId, driverName: 'Driver Name', driverPhone: '1234567', licenseNumber: 'ABC-123', effectiveFrom: '2026-10-24T10:00:00.000Z', effectiveTo: '2026-10-23T10:00:00.000Z' }).success).toBe(false);
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
