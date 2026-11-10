import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/utils/prisma';
import { Express } from 'express';

describe('Vercel Routing & Path Normalization Test Suite', () => {
  let app: Express;

  beforeAll(async () => {
    app = createApp();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('1. Health & Readiness Route Normalization', () => {
    it('GET /api/v1/health responds with 200 UP', async () => {
      const res = await request(app).get('/api/v1/health');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('UP');
    });

    it('GET /health (unprefixed) normalizes and responds with 200 UP', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('UP');
    });

    it('GET /api/health (single api prefix) normalizes and responds with 200 UP', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('UP');
    });

    it('GET /api/index/health (Vercel serverless function rewrite) normalizes and responds with 200 UP', async () => {
      const res = await request(app).get('/api/index/health');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('UP');
    });

    it('GET /v1/health (v1 without /api) normalizes and responds with 200 UP', async () => {
      const res = await request(app).get('/v1/health');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('UP');
    });

    it('GET /api/v1/health/ready returns 200 or 503 structured response', async () => {
      const res = await request(app).get('/api/v1/health/ready');
      expect([200, 503]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.data.database).toBe('reachable');
      }
    });
  });

  describe('2. Query Parameter Preservation', () => {
    it('preserves query parameters on /api/v1/health?source=monitoring&test=1', async () => {
      const res = await request(app).get('/api/v1/health?source=monitoring&test=1');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('preserves query parameters on /health?debug=true', async () => {
      const res = await request(app).get('/health?debug=true');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('preserves query parameters on rewritten /api/index/health?env=vercel_preview', async () => {
      const res = await request(app).get('/api/index/health?env=vercel_preview');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('3. Reverse Proxy & Vercel Forwarded Headers', () => {
    it('respects x-forwarded-uri header when request URL is rewritten to /', async () => {
      const res = await request(app)
        .get('/')
        .set('x-forwarded-uri', '/api/v1/health?proxy=1');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('UP');
    });

    it('respects x-original-uri header when request URL is rewritten', async () => {
      const res = await request(app)
        .get('/')
        .set('x-original-uri', '/api/v1/health');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('UP');
    });
  });

  describe('4. Auth Subroutes Path Normalization', () => {
    it('POST /api/v1/auth/login routes correctly to AuthController (401 on bad credentials)', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        usernameOrEmail: 'unknown_user_test@lms.local',
        password: 'InvalidPassword123!',
      });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('POST /api/auth/login normalizes to /api/v1/auth/login and reaches AuthController', async () => {
      const res = await request(app).post('/api/auth/login').send({
        usernameOrEmail: 'unknown_user_test@lms.local',
        password: 'InvalidPassword123!',
      });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('POST /api/index/auth/login (Vercel serverless rewrite) reaches AuthController', async () => {
      const res = await request(app).post('/api/index/auth/login').send({
        usernameOrEmail: 'unknown_user_test@lms.local',
        password: 'InvalidPassword123!',
      });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('POST /auth/login normalizes to /api/v1/auth/login and reaches AuthController', async () => {
      const res = await request(app).post('/auth/login').send({
        usernameOrEmail: 'unknown_user_test@lms.local',
        password: 'InvalidPassword123!',
      });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('5. Protected Domain Routes Normalization', () => {
    it('GET /api/v1/lms/courses intercepts with 401 UNAUTHORIZED when unauthenticated', async () => {
      const res = await request(app).get('/api/v1/lms/courses');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('GET /api/index/lms/courses normalizes and intercepts with 401 UNAUTHORIZED', async () => {
      const res = await request(app).get('/api/index/lms/courses');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('GET /api/v1/finance/invoices intercepts with 401 UNAUTHORIZED when unauthenticated', async () => {
      const res = await request(app).get('/api/v1/finance/invoices');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('GET /api/v1/attendance/records intercepts with 401 UNAUTHORIZED when unauthenticated', async () => {
      const res = await request(app).get('/api/v1/attendance/records');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('6. 404 Routing for Non-Existent Endpoints', () => {
    it('returns 404 with ROUTE_NOT_FOUND code for /api/v1/non-existent-endpoint', async () => {
      const res = await request(app).get('/api/v1/non-existent-endpoint');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
    });

    it('returns 404 with ROUTE_NOT_FOUND code for /non-existent-endpoint', async () => {
      const res = await request(app).get('/non-existent-endpoint');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
    });
  });
});
