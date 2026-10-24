import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/utils/prisma';
import { Express } from 'express';
import { createRateLimiter } from '../src/middleware/rateLimit';
import express from 'express';
import { hashPassword, verifyPassword } from '../src/utils/password';
import { encryptCounselingNote, decryptCounselingNote } from '../src/modules/counseling/encryption';
import { signReportCard, verifyReportCardSignature } from '../src/modules/exams/report-card-integrity';
import { redactAuditPayload } from '../src/middleware/audit';

describe('Phase 8: Security Audit & Quality Assurance Tests', () => {
  let app: Express;
  let alphaPrincipalToken: string;
  let alphaTeacherToken: string;
  let betaPrincipalToken: string;
  let alphaInstitutionId: string;
  let betaInstitutionId: string;

  beforeAll(async () => {
    app = createApp();
    await prisma.$connect();

    // Login Alpha Principal
    const aPLogin = await request(app).post('/api/v1/auth/login').send({
      usernameOrEmail: 'principal@alpha.edu',
      password: 'Password123!',
    });
    alphaPrincipalToken = aPLogin.body.data.accessToken;
    alphaInstitutionId = aPLogin.body.data.user.institutionId;

    // Login Alpha Teacher
    const aTLogin = await request(app).post('/api/v1/auth/login').send({
      usernameOrEmail: 'teacher.math@alpha.edu',
      password: 'Password123!',
    });
    alphaTeacherToken = aTLogin.body.data.accessToken;

    // Login Beta Principal
    const bPLogin = await request(app).post('/api/v1/auth/login').send({
      usernameOrEmail: 'principal@beta.edu',
      password: 'Password123!',
    });
    betaPrincipalToken = bPLogin.body.data.accessToken;
    betaInstitutionId = bPLogin.body.data.user.institutionId;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('1. Rate Limiting Defense', () => {
    it('returns HTTP 429 when request limits are exceeded', async () => {
      const testApp = express();
      const limiter = createRateLimiter({
        windowMs: 10000,
        max: 3,
        message: 'Rate limit test exceeded',
      });
      testApp.use(limiter);
      testApp.get('/test', (_req, res) => res.json({ ok: true }));

      // Requests 1-3 succeed
      for (let i = 0; i < 3; i++) {
        const res = await request(testApp).get('/test').set('x-test-rate-limit', 'true');
        expect(res.status).toBe(200);
      }

      // Request 4 is blocked
      const res4 = await request(testApp).get('/test').set('x-test-rate-limit', 'true');
      expect(res4.status).toBe(429);
      expect(res4.body.error.code).toBe('TOO_MANY_REQUESTS');
      expect(res4.headers['retry-after']).toBeDefined();
    });
  });

  describe('2. Cross-Tenant Isolation Enforcement', () => {
    it('prevents Beta Principal from creating an LMS course module on an Alpha Academy course', async () => {
      const alphaCourse = await prisma.course.findFirst({
        where: { institutionId: alphaInstitutionId },
      });
      expect(alphaCourse).toBeDefined();

      const res = await request(app)
        .post('/api/v1/lms/modules')
        .set('Authorization', `Bearer ${betaPrincipalToken}`)
        .send({
          courseId: alphaCourse!.id,
          title: 'Illicit Cross-Tenant Module',
          sequenceOrder: 99,
        });

      expect(res.status).toBe(404);
      expect(res.body.error.message).toContain('Course not found in this institution');
    });

    it('prevents Beta Principal from creating a section inside an Alpha Academy class grade', async () => {
      const alphaGrade = await prisma.classGrade.findFirst({
        where: { institutionId: alphaInstitutionId },
      });
      expect(alphaGrade).toBeDefined();

      const res = await request(app)
        .post('/api/v1/academic/sections')
        .set('Authorization', `Bearer ${betaPrincipalToken}`)
        .send({
          classGradeId: alphaGrade!.id,
          name: 'Section Sneak',
          roomNumber: 'ROOM-X',
          maxCapacity: 30,
        });

      expect(res.status).toBe(404);
      expect(res.body.error.message).toContain('Class grade not found in this institution');
    });

    it('prevents Beta Principal from enrolling a student into an Alpha Academy section', async () => {
      const alphaSection = await prisma.section.findFirst({
        where: { classGrade: { institutionId: alphaInstitutionId } },
      });
      expect(alphaSection).toBeDefined();

      const res = await request(app)
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${betaPrincipalToken}`)
        .send({
          email: 'infiltrator@beta.edu',
          username: 'infiltrator.student',
          password: 'Password123!',
          firstName: 'Infiltrator',
          lastName: 'Student',
          admissionNumber: 'INFILTRATE-001',
          sectionId: alphaSection!.id,
          dateOfBirth: '2010-01-01',
          gender: 'MALE',
        });

      expect(res.status).toBe(404);
      expect(res.body.error.message).toContain('Section not found in this institution');
    });
  });

  describe('3. Password Hashing & Sensitive Cryptography', () => {
    it('uses bcrypt with proper salt rounds and rejects incorrect passwords', async () => {
      const hash = await hashPassword('SecureP@ssw0rd!');
      expect(hash).toMatch(/^\$2[aby]\$12\$/); // Bcrypt 12 rounds prefix
      expect(await verifyPassword('SecureP@ssw0rd!', hash)).toBe(true);
      expect(await verifyPassword('WrongPassword!', hash)).toBe(false);
    });

    it('confidential counseling encryption uses AES-256-GCM and detects tampering', () => {
      const secret = 'counseling-audit-key-32-chars-ok';
      const plain = 'Confidential counseling diagnosis details';
      const ciphertext = encryptCounselingNote(plain, secret);

      expect(ciphertext.startsWith('v1:')).toBe(true);
      expect(decryptCounselingNote(ciphertext, secret)).toBe(plain);

      // Tampered data must fail authentication tag check
      const parts = ciphertext.split(':');
      parts[3] = 'tampered' + parts[3].slice(8);
      expect(() => decryptCounselingNote(parts.join(':'), secret)).toThrow();
    });

    it('report card cryptographic signatures prevent grade alteration', () => {
      const secret = 'report-card-signing-key-32-chars';
      const card = {
        id: 'card-audit-01',
        institutionId: alphaInstitutionId,
        studentId: 'student-audit-01',
        examSessionId: 'session-audit-01',
        totalMarks: 95,
        percentage: 95,
        gpa: 4.0,
        gradeLetter: 'A+',
        rank: 1,
        publishedAt: new Date('2026-10-24T00:00:00.000Z'),
      };

      const sig = signReportCard(card, secret);
      expect(verifyReportCardSignature(card, sig, secret)).toBe(true);

      // Modified total marks fails signature check
      expect(verifyReportCardSignature({ ...card, totalMarks: 96 }, sig, secret)).toBe(false);
    });

    it('redacts sensitive fields from audit event payloads', () => {
      const payload = {
        username: 'admin',
        password: 'PlainTextPassword123!',
        token: 'secret-token-string',
        notes: 'private health record',
        actionPlan: 'support action plan',
        deep: {
          passwordHash: 'hash123',
          normalData: 'public',
        },
      };

      const redacted = redactAuditPayload(payload) as any;
      expect(redacted.password).toBe('[REDACTED]');
      expect(redacted.token).toBe('[REDACTED]');
      expect(redacted.notes).toBe('[REDACTED]');
      expect(redacted.actionPlan).toBe('[REDACTED]');
      expect(redacted.deep.passwordHash).toBe('[REDACTED]');
      expect(redacted.deep.normalData).toBe('public');
    });
  });
});
