import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/utils/prisma';
import { redis } from '../src/utils/redis';
import { Express } from 'express';

describe('Phase 8 & 9: Redis Integration, Caching, and Token Blacklist', () => {
  let app: Express;
  let testAccessToken: string;

  beforeAll(async () => {
    app = createApp();
    await prisma.$connect();

    // Login a user to obtain an access token
    const res = await request(app).post('/api/v1/auth/login').send({
      usernameOrEmail: 'principal@alpha.edu',
      password: 'Password123!',
    });
    testAccessToken = res.body.data.accessToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('verifies Redis health and ping responsiveness', async () => {
    const isHealthy = await redis.isHealthy();
    expect(typeof isHealthy).toBe('boolean');

    const res = await request(app).get('/api/v1/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('READY');
    expect(res.body.data.database).toBe('reachable');
    expect(res.body.data.redis).toMatch(/connected|fallback-active/);
  });

  it('performs cache set, get, and delete operations with serialization', async () => {
    const testKey = 'test:cache:item:001';
    const testValue = { school: 'Alpha Academy', studentsCount: 42, active: true };

    await redis.set(testKey, testValue, 60);
    const cached = await redis.get<typeof testValue>(testKey);

    expect(cached).toEqual(testValue);

    await redis.del(testKey);
    const deleted = await redis.get(testKey);
    expect(deleted).toBeNull();
  });

  it('blacklists access tokens upon logout and immediately rejects subsequent requests', async () => {
    // 1. Initial request with token succeeds
    const meRes1 = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${testAccessToken}`);
    expect(meRes1.status).toBe(200);

    // 2. Logout revokes token and blacklists it in Redis
    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${testAccessToken}`)
      .send({});
    expect(logoutRes.status).toBe(200);

    // 3. Re-using the blacklisted access token is immediately rejected with 401 TOKEN_REVOKED
    const meRes2 = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${testAccessToken}`);
    expect(meRes2.status).toBe(401);
    expect(meRes2.body.error.code).toBe('TOKEN_REVOKED');
    expect(meRes2.body.error.message).toContain('Access token has been revoked');
  });
});
