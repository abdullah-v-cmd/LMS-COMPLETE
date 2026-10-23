import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/utils/prisma';
import { Express } from 'express';

describe('Phase 1 Foundation: Auth, Health & Security Tests', () => {
  let app: Express;

  beforeAll(async () => {
    app = createApp();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('GET /api/v1/health returns 200 with service UP status', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('UP');
    expect(res.body.data.service).toBe('school-lms-api');
  });

  it('POST /api/v1/auth/login fails with invalid credentials', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({
      usernameOrEmail: 'principal@alpha.edu',
      password: 'WrongPassword!',
    });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('POST /api/v1/auth/login succeeds for Institution Admin with correct credentials', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({
      usernameOrEmail: 'principal@alpha.edu',
      password: 'Password123!',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.user.email).toBe('principal@alpha.edu');
    expect(res.body.data.user.role).toBe('ROLE_INSTITUTION_ADMIN');
    expect(res.body.data.user.institutionId).toBeDefined();
    expect(res.body.data.user.permissions.length).toBeGreaterThan(0);
  });

  it('GET /api/v1/auth/me succeeds with valid Bearer token', async () => {
    // Login first
    const loginRes = await request(app).post('/api/v1/auth/login').send({
      usernameOrEmail: 'superadmin@alpha.edu',
      password: 'Password123!',
    });

    const token = loginRes.body.data.accessToken;

    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.success).toBe(true);
    expect(meRes.body.data.user.role).toBe('ROLE_SUPER_ADMIN');
  });

  it('POST /api/v1/auth/refresh rotates the refresh token', async () => {
    const loginRes = await request(app).post('/api/v1/auth/login').send({
      usernameOrEmail: 'student.alice@alpha.edu',
      password: 'Password123!',
    });

    const originalRefreshToken = loginRes.body.data.refreshToken;

    const refreshRes = await request(app).post('/api/v1/auth/refresh').send({
      refreshToken: originalRefreshToken,
    });

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.success).toBe(true);
    expect(refreshRes.body.data.accessToken).toBeDefined();
    expect(refreshRes.body.data.refreshToken).toBeDefined();
    expect(refreshRes.body.data.refreshToken).not.toBe(originalRefreshToken);

    // Reusing the old refresh token must be rejected (revoked on rotation)
    const reuseRes = await request(app).post('/api/v1/auth/refresh').send({
      refreshToken: originalRefreshToken,
    });
    expect(reuseRes.status).toBe(401);
  });

  it('POST /api/v1/auth/logout revokes session and records audit event', async () => {
    const loginRes = await request(app).post('/api/v1/auth/login').send({
      usernameOrEmail: 'teacher.math@alpha.edu',
      password: 'Password123!',
    });

    const { accessToken, refreshToken, user } = loginRes.body.data;

    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken });

    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.success).toBe(true);

    // Verify audit event exists
    const auditEvent = await prisma.auditEvent.findFirst({
      where: {
        userId: user.id,
        action: 'AUTH_LOGOUT',
      },
      orderBy: { timestamp: 'desc' },
    });

    expect(auditEvent).toBeDefined();
  });
});
