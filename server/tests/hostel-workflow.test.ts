import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/app';
import { prisma } from '../src/utils/prisma';

describe('Phase 7: tenant-scoped hostel resident workflows', () => {
  let app: Express;
  beforeAll(async () => {
    app = createApp();
    await prisma.$connect();
    const alice = await prisma.studentProfile.findFirst({
      where: { admissionNumber: 'ADM-2026-001' },
      select: { id: true },
    });
    if (alice) {
      await prisma.hostelStay.deleteMany({ where: { studentId: alice.id } });
      await prisma.hostelMessCharge.deleteMany({ where: { studentId: alice.id } });
      await prisma.hostelVisitorLog.deleteMany({ where: { studentId: alice.id } });
      await prisma.hostelGatePass.deleteMany({ where: { studentId: alice.id } });
      await prisma.hostelBedAllocation.deleteMany({ where: { studentId: alice.id } });
    }
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it('allocates a bed, processes resident gate pass, visitor, and mess billing records', async () => {
    const [wardenLogin, studentLogin, warden] = await Promise.all([
      request(app).post('/api/v1/auth/login').send({ usernameOrEmail: 'hostel.warden@alpha.edu', password: 'Password123!' }),
      request(app).post('/api/v1/auth/login').send({ usernameOrEmail: 'student.alice@alpha.edu', password: 'Password123!' }),
      prisma.user.findUniqueOrThrow({ where: { email: 'hostel.warden@alpha.edu' }, select: { institutionId: true } }),
    ]);
    const wardenToken = wardenLogin.body.data.accessToken;
    const studentToken = studentLogin.body.data.accessToken;
    const student = await prisma.studentProfile.findFirstOrThrow({ where: { institutionId: warden.institutionId!, admissionNumber: 'ADM-2026-001' }, select: { id: true } });
    const block = await request(app).post('/api/v1/hostel/blocks').set('Authorization', `Bearer ${wardenToken}`).send({ name: `Block ${Date.now()}`, type: 'MIXED', totalRooms: 1 });
    expect(block.status).toBe(201);
    const room = await request(app).post('/api/v1/hostel/rooms').set('Authorization', `Bearer ${wardenToken}`).send({ blockId: block.body.data.id, roomNumber: '101', capacity: 1 });
    expect(room.status).toBe(201);
    const allocation = await request(app).post('/api/v1/hostel/allocations').set('Authorization', `Bearer ${wardenToken}`).send({ roomId: room.body.data.id, studentId: student.id, bedNumber: 1 });
    expect(allocation.status).toBe(201);
    expect((await prisma.hostelRoom.findUniqueOrThrow({ where: { id: room.body.data.id } })).occupiedBeds).toBe(1);

    const expectedReturnAt = new Date(Date.now() + 86400000).toISOString();
    const pass = await request(app).post('/api/v1/hostel/gate-passes').set('Authorization', `Bearer ${studentToken}`).send({ reason: 'Medical appointment', destination: 'City clinic', expectedReturnAt });
    expect(pass.status).toBe(201);
    expect((await request(app).post(`/api/v1/hostel/gate-passes/${pass.body.data.id}/review`).set('Authorization', `Bearer ${wardenToken}`).send({ status: 'APPROVED' })).status).toBe(200);
    expect((await request(app).post(`/api/v1/hostel/gate-passes/${pass.body.data.id}/depart`).set('Authorization', `Bearer ${wardenToken}`)).body.data.status).toBe('DEPARTED');
    expect((await request(app).post(`/api/v1/hostel/gate-passes/${pass.body.data.id}/return`).set('Authorization', `Bearer ${wardenToken}`)).body.data.status).toBe('RETURNED');

    const visitor = await request(app).post('/api/v1/hostel/visitors').set('Authorization', `Bearer ${wardenToken}`).send({ studentId: student.id, visitorName: 'Guest Example', purpose: 'Family visit' });
    expect(visitor.status).toBe(201);
    expect((await request(app).post(`/api/v1/hostel/visitors/${visitor.body.data.id}/checkout`).set('Authorization', `Bearer ${wardenToken}`)).body.data.exitedAt).toBeTruthy();
    const period = new Date().toISOString().slice(0, 7);
    const charge = await request(app).post('/api/v1/hostel/mess-charges').set('Authorization', `Bearer ${wardenToken}`).send({ studentId: student.id, period, amount: 2500 });
    expect(charge.status).toBe(201);
    expect((await request(app).post(`/api/v1/hostel/mess-charges/${charge.body.data.id}/pay`).set('Authorization', `Bearer ${wardenToken}`)).body.data.status).toBe('PAID');
    expect((await request(app).get('/api/v1/hostel/allocations').set('Authorization', `Bearer ${wardenToken}`)).body.data.some((row: { studentId: string }) => row.studentId === student.id)).toBe(true);
    const stay = await request(app).post('/api/v1/hostel/stays/check-in').set('Authorization', `Bearer ${wardenToken}`).send({ studentId: student.id });
    expect(stay.status).toBe(201);
    expect((await request(app).post('/api/v1/hostel/stays/check-in').set('Authorization', `Bearer ${wardenToken}`).send({ studentId: student.id })).status).toBe(409);
    expect((await request(app).get('/api/v1/hostel/stays').set('Authorization', `Bearer ${wardenToken}`)).body.data.some((row: { id: string }) => row.id === stay.body.data.id)).toBe(true);
    expect((await request(app).post(`/api/v1/hostel/stays/${stay.body.data.id}/check-out`).set('Authorization', `Bearer ${wardenToken}`)).body.data.checkedOutAt).toBeTruthy();
    expect((await prisma.hostelRoom.findUniqueOrThrow({ where: { id: room.body.data.id } })).occupiedBeds).toBe(0);  });
});
