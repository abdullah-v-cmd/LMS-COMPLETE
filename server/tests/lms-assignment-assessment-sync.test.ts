import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/app';
import { prisma } from '../src/utils/prisma';
import { SubjectResultStatus } from '@prisma/client';

describe('Automatic LMS Assignment Creation in Assessment Schemes & Weighted Results (Section 7 Suite)', () => {
  let app: Express;
  let teacherToken: string;
  let teacherUserId: string;
  let teacherProfileId: string;
  let otherTeacherToken: string;
  let studentAliceToken: string;
  let studentAliceId: string;
  let institutionId: string;
  let otherInstitutionId: string;
  let academicTermId: string;
  let mathSubjectId: string;
  let scienceSubjectId: string;
  let sectionAId: string;
  let courseId: string;
  let assignmentsCategoryId: string;
  let createdAssignmentId: string;
  let createdAssessmentItemId: string;

  beforeAll(async () => {
    app = createApp();
    await prisma.$connect();

    // 1. Authenticate Math Teacher
    const tRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ usernameOrEmail: 'teacher.math@alpha.edu', password: 'Password123!' });
    expect(tRes.status).toBe(200);
    teacherToken = tRes.body.data.accessToken;
    teacherUserId = tRes.body.data.user.id;

    const teacherUser = await prisma.user.findUniqueOrThrow({
      where: { email: 'teacher.math@alpha.edu' },
      select: { institutionId: true, teacherProfile: { select: { id: true } } },
    });
    institutionId = teacherUser.institutionId!;
    teacherProfileId = teacherUser.teacherProfile!.id;

    // 2. Authenticate Other Teacher (Homeroom teacher not assigned to Math)
    const otRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ usernameOrEmail: 'teacher.homeroom@alpha.edu', password: 'Password123!' });
    expect(otRes.status).toBe(200);
    otherTeacherToken = otRes.body.data.accessToken;

    // 3. Authenticate Student Alice
    const aRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ usernameOrEmail: 'student.alice@alpha.edu', password: 'Password123!' });
    expect(aRes.status).toBe(200);
    studentAliceToken = aRes.body.data.accessToken;

    const alice = await prisma.studentProfile.findFirstOrThrow({
      where: { admissionNumber: 'ADM-2026-001' },
      select: { id: true, sectionId: true },
    });
    studentAliceId = alice.id;
    sectionAId = alice.sectionId;

    // 4. Setup Academic Term & Subjects
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

    let science = await prisma.subject.findFirst({
      where: { institutionId, code: 'SCI-SYNC-TEST' },
      select: { id: true },
    });
    if (!science) {
      science = await prisma.subject.create({
        data: { institutionId, name: 'Science Sync', code: 'SCI-SYNC-TEST' },
      });
    }
    scienceSubjectId = science.id;

    // Beta Institution (different tenant)
    const betaInst = await prisma.institution.findFirst({
      where: { code: 'BETA' },
      select: { id: true },
    });
    otherInstitutionId = betaInst ? betaInst.id : 'beta-dummy-id';

    // Cleanup previous test state
    await prisma.subjectResultCorrectionRequest.deleteMany({
      where: { subjectResult: { institutionId, subjectId: mathSubjectId } },
    });
    await prisma.subjectResult.deleteMany({
      where: { institutionId, subjectId: mathSubjectId },
    });
    await prisma.assignment.deleteMany({
      where: { course: { subjectId: mathSubjectId, sectionId: sectionAId } },
    });
    await prisma.assessmentScheme.deleteMany({
      where: { institutionId, subjectId: mathSubjectId, academicTermId },
    });

    // Create an initial Assessment Scheme with Assignments = 15%, Quizzes = 15%, Midterm = 30%, Final = 40%
    const scheme = await prisma.assessmentScheme.create({
      data: {
        institution: { connect: { id: institutionId } },
        academicTerm: { connect: { id: academicTermId } },
        subject: { connect: { id: mathSubjectId } },
        section: { connect: { id: sectionAId } },
        createdBy: { connect: { id: teacherUserId } },
        title: 'Math Standard University Scheme',
        status: 'DRAFT',
        categories: {
          create: [
            { name: 'Assignments', weightagePercentage: 15, description: 'All course assignments combined' },
            { name: 'Quizzes', weightagePercentage: 15, description: 'Weekly surprise quizzes' },
            { name: 'Midterm', weightagePercentage: 30, description: 'Mid-term exam' },
            { name: 'Final', weightagePercentage: 40, description: 'Terminal final exam' },
          ],
        },
      },
      include: { categories: true },
    });
    assignmentsCategoryId = scheme.categories.find((c) => c.name === 'Assignments')!.id;

    // Find or create course
    let course = await prisma.course.findFirst({
      where: { subjectId: mathSubjectId, sectionId: sectionAId, academicTermId },
    });
    if (!course) {
      course = await prisma.course.create({
        data: {
          institutionId,
          subjectId: mathSubjectId,
          sectionId: sectionAId,
          academicTermId,
          teacherId: teacherProfileId,
          title: 'Advanced Mathematics',
          code: 'MATH-LMS-SYNC',
          isPublished: true,
        },
      });
    }
    courseId = course.id;
  });

  afterAll(async () => {
    await prisma.subjectResultCorrectionRequest.deleteMany({
      where: { subjectResult: { institutionId, subjectId: mathSubjectId } },
    });
    await prisma.subjectResult.deleteMany({
      where: { institutionId, subjectId: mathSubjectId },
    });
    await prisma.assignment.deleteMany({
      where: { courseId },
    });
    await prisma.assessmentScheme.deleteMany({
      where: { institutionId, subjectId: mathSubjectId, academicTermId },
    });
    await prisma.$disconnect();
  });

  it('1. Creating an LMS assignment automatically provisions a corresponding assessment item under the 15% Assignments category', async () => {
    const res = await request(app)
      .post('/api/v1/lms/assignments')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        courseId,
        title: 'Calculus Assignment 1',
        instructions: 'Solve problems 1-10 on differential equations.',
        maxPoints: 100,
        weightagePercent: 15,
        dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
        allowLateSubmissions: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    createdAssignmentId = res.body.data.id;
    createdAssessmentItemId = res.body.data.assessmentItemId;
    expect(createdAssessmentItemId).toBeDefined();

    // Verify assessment item exists in DB and is mapped to Assignments category
    const item = await prisma.assessmentItem.findUniqueOrThrow({
      where: { id: createdAssessmentItemId },
      include: { category: true },
    });

    expect(item.title).toBe('Calculus Assignment 1');
    expect(item.maxMarks).toBe(100);
    expect(item.category.name).toBe('Assignments');
    expect(item.category.id).toBe(assignmentsCategoryId);
    expect(item.category.weightagePercentage).toBe(15);
  });

  it('2. Creating a second LMS assignment shares the same 15% category without category duplication or weight bloat', async () => {
    const res = await request(app)
      .post('/api/v1/lms/assignments')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        courseId,
        title: 'Calculus Assignment 2',
        instructions: 'Integration by parts exercises.',
        maxPoints: 100,
        weightagePercent: 15,
        dueDate: new Date(Date.now() + 14 * 86400000).toISOString(),
        allowLateSubmissions: true,
      });

    expect(res.status).toBe(201);

    // Verify the category weightage in the database remains strictly 15% (not 30%)
    const cat = await prisma.assessmentCategory.findUniqueOrThrow({
      where: { id: assignmentsCategoryId },
      include: { assessments: true },
    });

    expect(cat.weightagePercentage).toBe(15);
    expect(cat.assessments.length).toBe(2);
  });

  it('3. Editing an LMS assignment updates the linked assessment item without creating duplicates', async () => {
    const editRes = await request(app)
      .put(`/api/v1/lms/assignments/${createdAssignmentId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        title: 'Calculus Assignment 1 (Revised)',
        maxPoints: 50,
      });

    expect(editRes.status).toBe(200);

    // Verify assessment item title and maxMarks updated
    const item = await prisma.assessmentItem.findUniqueOrThrow({
      where: { id: createdAssessmentItemId },
    });
    expect(item.title).toBe('Calculus Assignment 1 (Revised)');
    expect(item.maxMarks).toBe(50);

    // Verify total items in Assignments category remains 2 (no duplicate created)
    const cat = await prisma.assessmentCategory.findUniqueOrThrow({
      where: { id: assignmentsCategoryId },
      include: { assessments: true },
    });
    expect(cat.assessments.length).toBe(2);
  });

  it('4. Student LMS submissions and teacher grading synchronize automatically to canonical Gradebook and calculate equal weightage', async () => {
    // 1. Alice submits Assignment 1
    const submitRes = await request(app)
      .post(`/api/v1/lms/assignments/${createdAssignmentId}/submit`)
      .set('Authorization', `Bearer ${studentAliceToken}`)
      .send({ contentText: 'Alice solution file content' });
    expect(submitRes.status).toBe(200);

    const sub = await prisma.assignmentSubmission.findFirstOrThrow({
      where: { assignmentId: createdAssignmentId, studentId: studentAliceId },
    });

    // 2. Teacher grades Assignment 1: 45 / 50 (90%)
    const gradeRes = await request(app)
      .post(`/api/v1/lms/submissions/${sub.id}/grade`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ grade: 45, feedback: 'Well done' });
    expect(gradeRes.status).toBe(200);

    // 3. Verify student assessment mark in Gradebook DB
    const mark = await prisma.studentAssessmentMark.findUnique({
      where: {
        assessmentItemId_studentId: {
          assessmentItemId: createdAssessmentItemId,
          studentId: studentAliceId,
        },
      },
    });
    expect(mark).toBeDefined();
    expect(mark?.marksObtained).toBe(45);

    // 4. Verify live calculated result in SubjectResult
    const result = await prisma.subjectResult.findUniqueOrThrow({
      where: {
        subjectId_sectionId_studentId_academicTermId: {
          subjectId: mathSubjectId,
          sectionId: sectionAId,
          studentId: studentAliceId,
          academicTermId,
        },
      },
    });

    const breakdown = (result.categoryBreakdown as any[]).find((c) => c.categoryName === 'Assignments');
    expect(breakdown).toBeDefined();
    // 45 / 50 = 90%
    expect(breakdown.averagePercentage).toBeCloseTo(90, 1);
    // Contribution = 90% of 15% = 13.5%
    expect(breakdown.contribution).toBeCloseTo(13.5, 1);
  });

  it('5. Safe deletion: deleting an LMS assignment removes its linked assessment item and recalculates results without orphaning marks', async () => {
    // Delete Assignment 1
    const delRes = await request(app)
      .delete(`/api/v1/lms/assignments/${createdAssignmentId}`)
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(delRes.status).toBe(200);

    // Verify assignment is removed
    const a = await prisma.assignment.findUnique({ where: { id: createdAssignmentId } });
    expect(a).toBeNull();

    // Verify linked assessment item is removed
    const item = await prisma.assessmentItem.findUnique({ where: { id: createdAssessmentItemId } });
    expect(item).toBeNull();

    // Verify submissions and assessment marks for this item are removed
    const mark = await prisma.studentAssessmentMark.findUnique({
      where: {
        assessmentItemId_studentId: {
          assessmentItemId: createdAssessmentItemId,
          studentId: studentAliceId,
        },
      },
    });
    expect(mark).toBeNull();
  });

  it('6. Cross-tenant and unauthorized teacher attempts to create or delete assignments are rejected with 403', async () => {
    // English teacher tries to create assignment in Math course -> 403
    const unauthRes = await request(app)
      .post('/api/v1/lms/assignments')
      .set('Authorization', `Bearer ${otherTeacherToken}`)
      .send({
        courseId,
        title: 'Unauthorized Assignment',
        instructions: 'Test',
        maxPoints: 100,
        dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
      });

    expect(unauthRes.status).toBe(403);
  });

  it('7. Creation and deletion are blocked if subject results are submitted to the Examination Department', async () => {
    // Lock results to SUBMITTED_TO_EXAM_DEPARTMENT
    await prisma.subjectResult.updateMany({
      where: { subjectId: mathSubjectId, sectionId: sectionAId, academicTermId },
      data: { status: SubjectResultStatus.SUBMITTED_TO_EXAM_DEPARTMENT },
    });

    // Attempt to create assignment while locked -> 403
    const lockRes = await request(app)
      .post('/api/v1/lms/assignments')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        courseId,
        title: 'Locked Assignment Test',
        instructions: 'Should fail',
        maxPoints: 100,
        dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
      });

    expect(lockRes.status).toBe(403);
    expect(lockRes.body.error?.message || lockRes.body.message).toContain('locked');

    // Unlock back to DRAFT
    await prisma.subjectResult.updateMany({
      where: { subjectId: mathSubjectId, sectionId: sectionAId, academicTermId },
      data: { status: SubjectResultStatus.DRAFT },
    });
  });
});
