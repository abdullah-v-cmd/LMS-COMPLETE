import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/app';
import { prisma } from '../src/utils/prisma';

describe('Phase 7: restricted monthly payroll workflow', () => {
  let app: Express;
  beforeAll(async () => { app = createApp(); await prisma.$connect(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('lets finance set salary and generate a snapshot while denying auditor access', async () => {
    const [financeLogin, auditorLogin, principalLogin, financeUser] = await Promise.all([
      request(app).post('/api/v1/auth/login').send({ usernameOrEmail: 'finance.head@alpha.edu', password: 'Password123!' }),
      request(app).post('/api/v1/auth/login').send({ usernameOrEmail: 'auditor@alpha.edu', password: 'Password123!' }),
      request(app).post('/api/v1/auth/login').send({ usernameOrEmail: 'principal@alpha.edu', password: 'Password123!' }),
      prisma.user.findUniqueOrThrow({ where: { email: 'finance.head@alpha.edu' }, select: { institutionId: true } }),
    ]);
    const financeToken = financeLogin.body.data.accessToken;
    const auditorToken = auditorLogin.body.data.accessToken;
    const principalToken = principalLogin.body.data.accessToken;
    const profile = await prisma.teacherProfile.findFirstOrThrow({ where: { institutionId: financeUser.institutionId!, user: { email: 'teacher.math@alpha.edu' } }, select: { id: true } });
    const today = new Date();
    const period = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}`;
    const effectiveFrom = `${period}-01`;
    const salary = await request(app).post('/api/v1/payroll/compensations').set('Authorization', `Bearer ${financeToken}`).send({ teacherProfileId: profile.id, monthlySalary: 82500.5, effectiveFrom });
    expect(salary.status).toBe(201);
    const generated = await request(app).post('/api/v1/payroll/runs').set('Authorization', `Bearer ${financeToken}`).send({ period });
    expect(generated.status).toBe(201);
    expect(generated.body.data.totalGross).toBe('82500.5');
    expect(generated.body.data.entries).toHaveLength(1);
    expect((await request(app).get('/api/v1/payroll/runs').set('Authorization', `Bearer ${principalToken}`)).status).toBe(200);
    expect((await request(app).get('/api/v1/payroll/staff').set('Authorization', `Bearer ${auditorToken}`)).status).toBe(403);
  });
});
