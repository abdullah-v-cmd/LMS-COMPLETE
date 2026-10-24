import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/app';
import { prisma } from '../src/utils/prisma';

describe('Phase 7 tenant-scoped transport workflows', () => {
  let app: Express;
  beforeAll(async () => {
    app = createApp();
    await prisma.$connect();
    const alice = await prisma.studentProfile.findFirst({
      where: { admissionNumber: 'ADM-2026-001' },
      select: { id: true },
    });
    if (alice) {
      const charges = await prisma.transportMonthlyCharge.findMany({
        where: { allocation: { studentId: alice.id } },
        select: { id: true },
      });
      const chargeIds = charges.map((c) => c.id);
      if (chargeIds.length > 0) {
        const invoices = await prisma.studentFeeInvoice.findMany({
          where: { transportChargeId: { in: chargeIds } },
          select: { id: true },
        });
        const invoiceIds = invoices.map((i) => i.id);
        if (invoiceIds.length > 0) {
          await prisma.financialLedgerEntry.deleteMany({
            where: { referenceType: 'TRANSPORT_INVOICE', referenceId: { in: invoiceIds } },
          });
          await prisma.studentFeeInvoice.deleteMany({
            where: { id: { in: invoiceIds } },
          });
        }
        await prisma.transportMonthlyCharge.deleteMany({
          where: { id: { in: chargeIds } },
        });
      }
      await prisma.transportAttendance.deleteMany({
        where: { allocation: { studentId: alice.id } },
      });
      await prisma.studentTransportAllocation.deleteMany({
        where: { studentId: alice.id },
      });
    }
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it('configures route stops, fleet records, secure allocations, tracking and incidents', async () => {
    const [managerLogin, studentLogin, parentLogin, manager] = await Promise.all([
      request(app).post('/api/v1/auth/login').send({ usernameOrEmail: 'transport@alpha.edu', password: 'Password123!' }),
      request(app).post('/api/v1/auth/login').send({ usernameOrEmail: 'student.alice@alpha.edu', password: 'Password123!' }),
      request(app).post('/api/v1/auth/login').send({ usernameOrEmail: 'parent.john@alpha.edu', password: 'Password123!' }),
      prisma.user.findUniqueOrThrow({ where: { email: 'transport@alpha.edu' }, select: { institutionId: true } }),
    ]);
    const managerToken = managerLogin.body.data.accessToken;
    const studentToken = studentLogin.body.data.accessToken;
    const parentToken = parentLogin.body.data.accessToken;
    const student = await prisma.studentProfile.findFirstOrThrow({ where: { institutionId: manager.institutionId!, admissionNumber: 'ADM-2026-001' }, select: { id: true } });
    const route = await request(app).post('/api/v1/transport/routes').set('Authorization', `Bearer ${managerToken}`).send({ name: `North ${Date.now()}`, startPoint: 'Depot', endPoint: 'School', monthlyFee: 2500 });
    expect(route.status).toBe(201);
    const vehicle = await request(app).post('/api/v1/transport/vehicles').set('Authorization', `Bearer ${managerToken}`).send({ routeId: route.body.data.id, vehicleNumber: `BUS-${Date.now()}`, driverName: 'Driver One', driverPhone: '1234567890', capacity: 1 });
    expect(vehicle.status).toBe(201);
    const stop = await request(app).post('/api/v1/transport/stops').set('Authorization', `Bearer ${managerToken}`).send({ routeId: route.body.data.id, name: 'North Gate', address: 'Main Road', sequence: 1, pickupTime: '07:15' });
    expect(stop.status).toBe(201);
    const allocation = await request(app).post('/api/v1/transport/allocations').set('Authorization', `Bearer ${managerToken}`).send({ routeId: route.body.data.id, studentId: student.id, pickupStop: 'North Gate' });
    expect(allocation.status).toBe(201);
    expect(allocation.body.data.pickupStopId).toBe(stop.body.data.id);
    const duplicate = await request(app).post('/api/v1/transport/allocations').set('Authorization', `Bearer ${managerToken}`).send({ routeId: route.body.data.id, studentId: student.id, pickupStopId: stop.body.data.id });
    expect(duplicate.body.data.id).toBe(allocation.body.data.id);
    expect((await request(app).post('/api/v1/transport/allocations').set('Authorization', `Bearer ${managerToken}`).send({ routeId: 'a0184c98-7f09-4b16-a22c-95b8dbf2a010', studentId: student.id, pickupStop: 'North Gate' })).status).toBe(404);
    expect((await request(app).post('/api/v1/transport/allocations').set('Authorization', `Bearer ${studentToken}`).send({ routeId: route.body.data.id, studentId: student.id, pickupStop: 'North Gate' })).status).toBe(403);
    const studentAllocations = await request(app).get('/api/v1/transport/allocations').set('Authorization', `Bearer ${studentToken}`);
    expect(studentAllocations.body.data.map((item: { student: { id: string } }) => item.student.id)).toEqual([student.id]);
    const parentAllocations = await request(app).get('/api/v1/transport/allocations').set('Authorization', `Bearer ${parentToken}`);
    expect(parentAllocations.body.data.some((item: { student: { id: string } }) => item.student.id === student.id)).toBe(true);
    expect((await request(app).post('/api/v1/transport/vehicle-documents').set('Authorization', `Bearer ${managerToken}`).send({ vehicleId: vehicle.body.data.id, documentType: 'INSURANCE', documentNumber: 'INS-123' })).status).toBe(201);
    expect((await request(app).post('/api/v1/transport/driver-assignments').set('Authorization', `Bearer ${managerToken}`).send({ vehicleId: vehicle.body.data.id, driverName: 'Driver Two', driverPhone: '1234567890', licenseNumber: `LIC-${Date.now()}`, effectiveFrom: new Date().toISOString() })).status).toBe(201);
    expect((await request(app).post('/api/v1/transport/tracking-logs').set('Authorization', `Bearer ${managerToken}`).send({ vehicleId: vehicle.body.data.id, latitude: 24.86, longitude: 67.0, recordedAt: new Date().toISOString() })).status).toBe(201);
    expect((await request(app).post('/api/v1/transport/incidents').set('Authorization', `Bearer ${managerToken}`).send({ routeId: route.body.data.id, vehicleId: vehicle.body.data.id, studentId: student.id, category: 'SAFETY', description: 'Seat belt latch needs repair', occurredAt: new Date().toISOString() })).status).toBe(201);

    // Transport Attendance: marking, idempotency / duplicate prevention
    const today = new Date().toISOString().slice(0, 10);
    const markRes = await request(app).post('/api/v1/transport/attendance').set('Authorization', `Bearer ${managerToken}`).send({
      allocationId: allocation.body.data.id,
      serviceDate: today,
      status: 'BOARDED',
      remarks: 'Boarded at North Gate stop on time',
    });
    expect(markRes.status).toBe(201);
    expect(markRes.body.data.status).toBe('BOARDED');

    // Duplicate submission updates existing record (upsert)
    const updateRes = await request(app).post('/api/v1/transport/attendance').set('Authorization', `Bearer ${managerToken}`).send({
      allocationId: allocation.body.data.id,
      serviceDate: today,
      status: 'ABSENT',
      remarks: 'Guardian called, student absent',
    });
    expect([200, 201]).toContain(updateRes.status);
    expect(updateRes.body.data.status).toBe('ABSENT');

    // Monthly Charge & Invoice Generation
    const period = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const chargeRes = await request(app).post('/api/v1/transport/charges/generate').set('Authorization', `Bearer ${managerToken}`).send({
      allocationId: allocation.body.data.id,
      period,
      dueDate: new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10),
    });
    expect(chargeRes.status).toBe(201);
    expect(chargeRes.body.data.created).toBe(true);
    expect(Number(chargeRes.body.data.charge.amount)).toBe(2500);
    expect(chargeRes.body.data.invoice.invoiceNumber).toMatch(/^TRN-/);
    expect(Number(chargeRes.body.data.invoice.totalAmount)).toBe(2500);

    // Retrying the same charge is idempotent
    const retryRes = await request(app).post('/api/v1/transport/charges/generate').set('Authorization', `Bearer ${managerToken}`).send({
      allocationId: allocation.body.data.id,
      period,
      dueDate: new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10),
    });
    expect([200, 201]).toContain(retryRes.status);
    expect(retryRes.body.data.created).toBe(false);

    // Verify balanced ledger entries exist for the invoice
    const ledger = await prisma.financialLedgerEntry.findMany({
      where: { referenceType: 'TRANSPORT_INVOICE', referenceId: chargeRes.body.data.invoice.id },
    });
    expect(ledger.length).toBe(2);
    const debit = ledger.find((e) => e.accountCode === '1100-ACCOUNTS-RECEIVABLE');
    const credit = ledger.find((e) => e.accountCode === '4010-TRANSPORT-REVENUE');
    expect(Number(debit?.debitAmount)).toBe(2500);
    expect(Number(credit?.creditAmount)).toBe(2500);
  });
});
