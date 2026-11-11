import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/app';
import { prisma } from '../src/utils/prisma';

describe('Assessment Item Edit, Delete, Exam Linking & Subject Teacher Strict Auth Suite', () => {
  let app: Express;
  let teacherToken: string;
  let examControllerToken: string;
  let adminToken: string;
  let unassignedTeacherToken: string;
  let institutionId: string;
  let academicTermId: string;
  let mathSubjectId: string;
  let sectionAId: string;
  let studentAliceId: string;
  let categoryId: string;
  let createdItemId: string;
  let examSessionId: string;
  let examScheduleId: string;

  beforeAll(async () => {
    app = createApp();
    // 1. Log in users
    const [tRes, cRes, aRes] = await Promise.all([
      request(app).post('/api/v1/auth/login').send({ usernameOrEmail: 'teacher.math@alpha.edu', password: 'Password123!' }),
      request(app).post('/api/v1/auth/login').send({ usernameOrEmail: 'exam.controller@alpha.edu', password: 'Password123!' }),
      request(app).post('/api/v1/auth/login').send({ usernameOrEmail: 'superadmin@alpha.edu', password: 'Password123!' }),
    ]);

    expect(tRes.status).toBe(200);
    expect(cRes.status).toBe(200);
    expect(aRes.status).toBe(200);

    teacherToken = tRes.body.data.accessToken;
    examControllerToken = cRes.body.data.accessToken;
    adminToken = aRes.body.data.accessToken;

    const teacherUser = await prisma.user.findUniqueOrThrow({
      where: { email: 'teacher.math@alpha.edu' },
      select: { institutionId: true },
    });
    institutionId = teacherUser.institutionId!;

    const term = await prisma.academicTerm.findFirstOrThrow({
      where: { academicYear: { institutionId } },
      select: { id: true },
    });
    academicTermId = term.id;

    const math = await prisma.subject.findFirstOrThrow({
      where: { institutionId, code: 'MATH-101' },
      select: { id: true },
    });
    mathSubjectId = math.id;

    const alice = await prisma.studentProfile.findFirstOrThrow({
      where: { admissionNumber: 'ADM-2026-001' },
      select: { id: true, sectionId: true },
    });
    studentAliceId = alice.id;
    sectionAId = alice.sectionId;

    await prisma.subjectResultCorrectionRequest.deleteMany({
      where: { subjectResult: { institutionId, subjectId: mathSubjectId } },
    });
    await prisma.subjectResult.deleteMany({
      where: { institutionId, subjectId: mathSubjectId },
    });

    // Find or create an exam schedule for linking
    const session = await prisma.examSession.findFirst({
      where: { institutionId, academicTermId },
    });
    if (session) {
      examSessionId = session.id;
    } else {
      const createdSession = await prisma.examSession.create({
        data: {
          institutionId,
          academicTermId,
          name: 'Mid-Term 2026-2027',
          startDate: new Date(),
          endDate: new Date(Date.now() + 14 * 86400000),
          status: 'SCHEDULED',
        },
      });
      examSessionId = createdSession.id;
    }

    const schedule = await prisma.examSchedule.findFirst({
      where: { examSessionId, subjectId: mathSubjectId },
    });
    if (schedule) {
      examScheduleId = schedule.id;
    } else {
      const createdSchedule = await prisma.examSchedule.create({
        data: {
          examSessionId,
          subjectId: mathSubjectId,
          examDate: new Date(),
          startTime: '09:00 AM',
          endTime: '12:00 PM',
          maxMarks: 50,
          passMarks: 20,
        },
      });
      examScheduleId = createdSchedule.id;
    }

    // Ensure an assessment category exists
    let scheme = await prisma.assessmentScheme.findFirst({
      where: { subjectId: mathSubjectId, academicTermId, sectionId: sectionAId },
      include: { categories: true },
    });

    if (!scheme) {
      const schemeRes = await request(app)
        .post('/api/v1/assessments/schemes')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          academicTermId,
          subjectId: mathSubjectId,
          sectionId: sectionAId,
          title: 'Math Assessment Scheme',
          categories: [
            { name: 'Assignments', weightagePercentage: 20 },
            { name: 'Quizzes', weightagePercentage: 20 },
            { name: 'Midterm', weightagePercentage: 20 },
            { name: 'Final', weightagePercentage: 40 },
          ],
        });
      categoryId = schemeRes.body.data.categories[0].id;
    } else {
      categoryId = scheme.categories[0].id;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('1. Subject teacher can create an assessment item with direct exam schedule linking', async () => {
    const res = await request(app)
      .post('/api/v1/assessments/items')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        assessmentCategoryId: categoryId,
        title: 'Midterm Exam Component',
        maxMarks: 50,
        examScheduleId,
        displayOrder: 5,
        isPublished: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.title).toBe('Midterm Exam Component');
    expect(res.body.data.examScheduleId).toBe(examScheduleId);
    createdItemId = res.body.data.id;
  });

  it('2. Subject teacher can edit assessment item properties and link exam schedule', async () => {
    const res = await request(app)
      .put(`/api/v1/assessments/items/${createdItemId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        title: 'Updated Midterm Component Title',
        maxMarks: 75,
        instructions: 'Comprehensive problem-solving test with calculator allowed.',
        displayOrder: 2,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Updated Midterm Component Title');
    expect(res.body.data.maxMarks).toBe(75);
    expect(res.body.data.instructions).toBe('Comprehensive problem-solving test with calculator allowed.');
  });

  it('3. Exam Controller is FORBIDDEN from editing assessment items', async () => {
    const res = await request(app)
      .put(`/api/v1/assessments/items/${createdItemId}`)
      .set('Authorization', `Bearer ${examControllerToken}`)
      .send({
        title: 'Exam Dept Unauthorized Tamper',
        maxMarks: 100,
      });

    expect(res.status).toBe(403);
    expect(res.body.error?.message || res.body.message).toContain('Only the authorized subject teacher');
  });

  it('4. Super Admin is FORBIDDEN from editing assessment items', async () => {
    const res = await request(app)
      .put(`/api/v1/assessments/items/${createdItemId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Admin Unauthorized Edit',
        maxMarks: 100,
      });

    expect(res.status).toBe(403);
    expect(res.body.error?.message || res.body.message).toContain('Only the authorized subject teacher');
  });

  it('5. Exam Controller is FORBIDDEN from deleting assessment items', async () => {
    const res = await request(app)
      .delete(`/api/v1/assessments/items/${createdItemId}`)
      .set('Authorization', `Bearer ${examControllerToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error?.message || res.body.message).toContain('Only the authorized subject teacher');
  });

  it('6. Super Admin is FORBIDDEN from deleting assessment items', async () => {
    const res = await request(app)
      .delete(`/api/v1/assessments/items/${createdItemId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error?.message || res.body.message).toContain('Only the authorized subject teacher');
  });

  it('7. Subject teacher can successfully delete the assessment item and results are recalculated', async () => {
    const res = await request(app)
      .delete(`/api/v1/assessments/items/${createdItemId}`)
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.deletedItemId).toBe(createdItemId);

    // Verify it is gone from database
    const itemInDb = await prisma.assessmentItem.findUnique({
      where: { id: createdItemId },
    });
    expect(itemInDb).toBeNull();
  });
});
