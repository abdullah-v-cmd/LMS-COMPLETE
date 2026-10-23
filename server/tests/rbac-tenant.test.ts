import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/utils/prisma';
import { Express } from 'express';

describe('Phase 1 RBAC & Multi-Tenant Isolation Tests', () => {
  let app: Express;
  let superAdminToken: string;
  let alphaPrincipalToken: string;
  let betaPrincipalToken: string;
  let studentToken: string;
  let alphaInstId: string;
  let betaInstId: string;

  beforeAll(async () => {
    app = createApp();
    await prisma.$connect();

    // Fetch institution IDs
    const alpha = await prisma.institution.findUnique({ where: { code: 'ALPHA' } });
    const beta = await prisma.institution.findUnique({ where: { code: 'BETA' } });
    alphaInstId = alpha!.id;
    betaInstId = beta!.id;

    // Login Super Admin
    const saLogin = await request(app).post('/api/v1/auth/login').send({
      usernameOrEmail: 'superadmin@alpha.edu',
      password: 'Password123!',
    });
    superAdminToken = saLogin.body.data.accessToken;

    // Login Alpha Principal
    const apLogin = await request(app).post('/api/v1/auth/login').send({
      usernameOrEmail: 'principal@alpha.edu',
      password: 'Password123!',
    });
    alphaPrincipalToken = apLogin.body.data.accessToken;

    // Login Beta Principal
    const bpLogin = await request(app).post('/api/v1/auth/login').send({
      usernameOrEmail: 'principal@beta.edu',
      password: 'Password123!',
    });
    betaPrincipalToken = bpLogin.body.data.accessToken;

    // Login Student
    const stLogin = await request(app).post('/api/v1/auth/login').send({
      usernameOrEmail: 'student.alice@alpha.edu',
      password: 'Password123!',
    });
    studentToken = stLogin.body.data.accessToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('Super Admin can list all institutions', async () => {
    const res = await request(app)
      .get('/api/v1/institutions')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
  });

  it('Institution Admin can only view their own institution', async () => {
    const res = await request(app)
      .get('/api/v1/institutions')
      .set('Authorization', `Bearer ${alphaPrincipalToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].id).toBe(alphaInstId);
  });

  it('Student is forbidden from creating an institution (403 Role Forbidden)', async () => {
    const res = await request(app)
      .post('/api/v1/institutions')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        name: 'Rogue Academy',
        code: 'ROGUE',
        slug: 'rogue-academy',
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
  });

  it('CROSS-TENANT VIOLATION: Alpha Principal cannot read Beta Institute details', async () => {
    const res = await request(app)
      .get(`/api/v1/institutions/${betaInstId}`)
      .set('Authorization', `Bearer ${alphaPrincipalToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('Super Admin can create a new institution and trigger audit log', async () => {
    const uniqueCode = `GAMMA_${Date.now()}`;
    const uniqueSlug = `gamma-${Date.now()}`;

    const res = await request(app)
      .post('/api/v1/institutions')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        name: 'Gamma High School',
        code: uniqueCode,
        slug: uniqueSlug,
        currency: 'GBP',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.code).toBe(uniqueCode);

    // Verify audit event exists
    const audit = await prisma.auditEvent.findFirst({
      where: {
        action: 'INSTITUTION_CREATED',
        entity: 'Institution',
      },
      orderBy: { timestamp: 'desc' },
    });
    expect(audit).toBeDefined();
  });
});
