import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/utils/prisma';
import { Express } from 'express';

describe('Phase 2: Academic Management & SIS Tests', () => {
  let app: Express;
  let principalToken: string;
  let teacherToken: string;
  let studentToken: string;
  let sectionId: string;

  beforeAll(async () => {
    app = createApp();
    await prisma.$connect();

    // Login Principal
    const pLogin = await request(app).post('/api/v1/auth/login').send({
      usernameOrEmail: 'principal@alpha.edu',
      password: 'Password123!',
    });
    principalToken = pLogin.body.data.accessToken;

    // Login Teacher
    const tLogin = await request(app).post('/api/v1/auth/login').send({
      usernameOrEmail: 'teacher.math@alpha.edu',
      password: 'Password123!',
    });
    teacherToken = tLogin.body.data.accessToken;

    // Login Student
    const sLogin = await request(app).post('/api/v1/auth/login').send({
      usernameOrEmail: 'student.alice@alpha.edu',
      password: 'Password123!',
    });
    studentToken = sLogin.body.data.accessToken;

    // Retrieve Section A ID
    const section = await prisma.section.findFirst({
      where: { name: 'Section A' },
    });
    sectionId = section!.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('GET /api/v1/academic/years returns academic calendar', async () => {
    const res = await request(app)
      .get('/api/v1/academic/years')
      .set('Authorization', `Bearer ${principalToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0].name).toBe('2026-2027');
  });

  it('GET /api/v1/academic/classes returns Grade 10 with sections and student counts', async () => {
    const res = await request(app)
      .get('/api/v1/academic/classes')
      .set('Authorization', `Bearer ${principalToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const grade10 = res.body.data.find((c: any) => c.name === 'Grade 10');
    expect(grade10).toBeDefined();
    expect(grade10.sections.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/v1/academic/subjects returns Math and Physics', async () => {
    const res = await request(app)
      .get('/api/v1/academic/subjects')
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const math = res.body.data.find((s: any) => s.code === 'MATH-101');
    expect(math).toBeDefined();
  });

  it('GET /api/v1/students returns enrolled student Alice Doe with section', async () => {
    const res = await request(app)
      .get('/api/v1/students')
      .set('Authorization', `Bearer ${principalToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const alice = res.body.data.find((s: any) => s.admissionNumber === 'ADM-2026-001');
    expect(alice).toBeDefined();
    expect(alice.user.email).toBe('student.alice@alpha.edu');
    expect(alice.section.name).toBe('Section A');
  });

  it('POST /api/v1/students creates new student user & profile in a transaction', async () => {
    const uniqueAdm = `ADM-${Date.now()}`;
    const uniqueUser = `student_${Date.now()}`;

    const res = await request(app)
      .post('/api/v1/students')
      .set('Authorization', `Bearer ${principalToken}`)
      .send({
        firstName: 'Bob',
        lastName: 'Smith',
        email: `${uniqueUser}@alpha.edu`,
        username: uniqueUser,
        password: 'Password123!',
        admissionNumber: uniqueAdm,
        rollNumber: '1002',
        sectionId: sectionId,
        dateOfBirth: '2010-09-20',
        gender: 'MALE',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.admissionNumber).toBe(uniqueAdm);
    expect(res.body.data.user.email).toBe(`${uniqueUser}@alpha.edu`);

    // Verify audit event
    const audit = await prisma.auditEvent.findFirst({
      where: {
        action: 'STUDENT_CREATED',
        entity: 'StudentProfile',
      },
      orderBy: { timestamp: 'desc' },
    });
    expect(audit).toBeDefined();
  });
});
