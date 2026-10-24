import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/app';
import { prisma } from '../src/utils/prisma';

describe('Phase 7 & 8: role-scoped persisted analytics workflow integration', () => {
  let app: Express;
  beforeAll(async () => {
    app = createApp();
    await prisma.$connect();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('serves role-scoped dashboard and domain analytics with tenant isolation', async () => {
    const [adminLogin, studentLogin] = await Promise.all([
      request(app).post('/api/v1/auth/login').send({ usernameOrEmail: 'admin@alpha.edu', password: 'Password123!' }),
      request(app).post('/api/v1/auth/login').send({ usernameOrEmail: 'student.alice@alpha.edu', password: 'Password123!' }),
    ]);

    const adminToken = adminLogin.body.data.accessToken;
    const studentToken = studentLogin.body.data.accessToken;

    // 1. Admin gets institution dashboard stats
    const adminDash = await request(app)
      .get('/api/v1/analytics/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminDash.status).toBe(200);
    expect(adminDash.body.data).toHaveProperty('institution');
    expect(adminDash.body.data.institution).toHaveProperty('students');
    expect(adminDash.body.data.institution).toHaveProperty('teachers');

    // 2. Student gets student-scoped dashboard stats
    const studentDash = await request(app)
      .get('/api/v1/analytics/dashboard')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(studentDash.status).toBe(200);
    expect(studentDash.body.data).toHaveProperty('student');

    // 3. Admin can access finance analytics
    const financeAnalytics = await request(app)
      .get('/api/v1/analytics/finance')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(financeAnalytics.status).toBe(200);
    expect(financeAnalytics.body.data).toHaveProperty('invoicesByStatus');
    expect(financeAnalytics.body.data).toHaveProperty('totalCollected');

    // 4. Student is rejected from finance analytics (403)
    const unauthorizedFinance = await request(app)
      .get('/api/v1/analytics/finance')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(unauthorizedFinance.status).toBe(403);

    // 5. Attendance analytics
    const attendanceAnalytics = await request(app)
      .get('/api/v1/analytics/attendance')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(attendanceAnalytics.status).toBe(200);
    expect(attendanceAnalytics.body.data).toHaveProperty('total');
    expect(attendanceAnalytics.body.data).toHaveProperty('presentRate');

    // 6. Transport analytics
    const transportAnalytics = await request(app)
      .get('/api/v1/analytics/transport')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(transportAnalytics.status).toBe(200);
    expect(transportAnalytics.body.data).toHaveProperty('byStatus');
    expect(transportAnalytics.body.data).toHaveProperty('byRoute');

    // 7. Library analytics
    const libraryAnalytics = await request(app)
      .get('/api/v1/analytics/library')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(libraryAnalytics.status).toBe(200);
    expect(libraryAnalytics.body.data).toHaveProperty('catalogBooks');

    // 8. Hostel analytics
    const hostelAnalytics = await request(app)
      .get('/api/v1/analytics/hostel')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(hostelAnalytics.status).toBe(200);
    expect(hostelAnalytics.body.data).toHaveProperty('blocks');
    expect(hostelAnalytics.body.data).toHaveProperty('occupancyRate');

    // 9. HR analytics
    const hrAnalytics = await request(app)
      .get('/api/v1/analytics/hr')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(hrAnalytics.status).toBe(200);
    expect(hrAnalytics.body.data).toHaveProperty('totalTeachers');
  });
});
