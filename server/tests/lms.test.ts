import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/utils/prisma';
import { Express } from 'express';

describe('Phase 3: Core LMS Workflow Tests', () => {
  let app: Express;
  let teacherToken: string;
  let studentToken: string;
  let courseId: string;
  let assignmentId: string;

  beforeAll(async () => {
    app = createApp();
    await prisma.$connect();

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

    // Retrieve seeded course and assignment
    const course = await prisma.course.findFirst({
      where: { code: 'MATH-10-A' },
      include: { assignments: true },
    });
    courseId = course!.id;
    assignmentId = course!.assignments[0].id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('GET /api/v1/lms/courses returns courses for enrolled student', async () => {
    const res = await request(app)
      .get('/api/v1/lms/courses')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0].code).toBe('MATH-10-A');
  });

  it('GET /api/v1/lms/courses/:id returns course structure with modules, lessons, and assignments', async () => {
    const res = await request(app)
      .get(`/api/v1/lms/courses/${courseId}`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.modules.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.assignments.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /api/v1/lms/assignments/:id/submit allows student to submit work', async () => {
    const res = await request(app)
      .post(`/api/v1/lms/assignments/${assignmentId}/submit`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        contentText: 'All 15 problem solutions computed using synthetic division and root factorization.',
        attachmentUrl: 'https://local-lms/uploads/alice_hw1.pdf',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toMatch(/SUBMITTED|RESUBMITTED/);

    // Verify submission saved in DB
    const sub = await prisma.assignmentSubmission.findFirst({
      where: { assignmentId },
    });
    expect(sub).toBeDefined();
    expect(sub?.contentText).toContain('synthetic division');
  });

  it('POST /api/v1/lms/submissions/:id/grade allows teacher to grade submission', async () => {
    const sub = await prisma.assignmentSubmission.findFirst({
      where: { assignmentId },
    });

    const res = await request(app)
      .post(`/api/v1/lms/submissions/${sub!.id}/grade`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        grade: 96.5,
        feedback: 'Excellent breakdown of quadratic roots and clear synthetic division steps!',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.grade).toBe(96.5);
    expect(res.body.data.status).toBe('GRADED');

    // Verify Audit Trail
    const audit = await prisma.auditEvent.findFirst({
      where: {
        action: 'SUBMISSION_GRADED',
        entity: 'AssignmentSubmission',
      },
      orderBy: { timestamp: 'desc' },
    });
    expect(audit).toBeDefined();
  });
});
