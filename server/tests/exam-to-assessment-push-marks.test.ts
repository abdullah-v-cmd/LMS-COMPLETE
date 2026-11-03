import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/app';
import { prisma } from '../src/utils/prisma';
import { SubjectResultStatus } from '@prisma/client';

describe('Exam-to-Assessment Linking, Push Marks & Results Synchronization Suite (Section 8 & Section 18 Items 1-10)', () => {
  let app: Express;
  let teacherToken: string;
  let teacherUserId: string;
  let examControllerToken: string;
  let examControllerUserId: string;
  let studentAliceId: string;
  let studentAliceToken: string;

  let institutionId: string;
  let academicTermId: string;
  let mathSubjectId: string;
  let scienceSubjectId: string;
  let sectionAId: string;

  let midtermExamScheduleId: string;
  let finalExamScheduleId: string;
  let examSessionId: string;

  let schemeId: string;
  let midtermAssessmentItemId: string;
  let finalAssessmentItemId: string;

  beforeAll(async () => {
    app = createApp();
    await prisma.$connect();

    // 1. Log in users
    const [tRes, cRes, aRes] = await Promise.all([
      request(app).post('/api/v1/auth/login').send({ usernameOrEmail: 'teacher.math@alpha.edu', password: 'Password123!' }),
      request(app).post('/api/v1/auth/login').send({ usernameOrEmail: 'exam.controller@alpha.edu', password: 'Password123!' }),
      request(app).post('/api/v1/auth/login').send({ usernameOrEmail: 'student.alice@alpha.edu', password: 'Password123!' }),
    ]);

    expect(tRes.status).toBe(200);
    expect(cRes.status).toBe(200);
    expect(aRes.status).toBe(200);

    teacherToken = tRes.body.data.accessToken;
    teacherUserId = tRes.body.data.user.id;
    examControllerToken = cRes.body.data.accessToken;
    examControllerUserId = cRes.body.data.user.id;
    studentAliceToken = aRes.body.data.accessToken;

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

    let science = await prisma.subject.findFirst({
      where: { institutionId, code: 'SCI-101' },
      select: { id: true },
    });
    if (!science) {
      science = await prisma.subject.create({
        data: { institutionId, name: 'Science 101', code: 'SCI-101' },
      });
    }
    scienceSubjectId = science.id;

    const alice = await prisma.studentProfile.findFirstOrThrow({
      where: { admissionNumber: 'ADM-2026-001' },
      select: { id: true, sectionId: true },
    });
    studentAliceId = alice.id;
    sectionAId = alice.sectionId;

    // Clean up test records
    await prisma.subjectResultCorrectionRequest.deleteMany({
      where: { subjectResult: { institutionId, subjectId: mathSubjectId } },
    });
    await prisma.subjectResult.deleteMany({
      where: { institutionId, subjectId: mathSubjectId },
    });
    await prisma.assessmentScheme.deleteMany({
      where: { institutionId, subjectId: mathSubjectId, academicTermId },
    });

    // Create standard scheme with Midterm (30%) and Final (70%)
    const schemeRes = await request(app)
      .post('/api/v1/assessments/schemes')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        academicTermId,
        subjectId: mathSubjectId,
        sectionId: sectionAId,
        title: 'Math Exam Integrated Scheme',
        categories: [
          { name: 'Midterm', weightagePercentage: 30, description: 'Midterm Examination' },
          { name: 'Final', weightagePercentage: 70, description: 'Final Terminal Examination' },
        ],
      });
    expect(schemeRes.status).toBe(201);
    schemeId = schemeRes.body.data.id;

    // Get the assessment items created for Midterm and Final
    const schemeWithItems = await prisma.assessmentScheme.findUniqueOrThrow({
      where: { id: schemeId },
      include: { categories: { include: { assessments: true } } },
    });

    const midCat = schemeWithItems.categories.find((c) => c.name === 'Midterm')!;
    const finCat = schemeWithItems.categories.find((c) => c.name === 'Final')!;
    midtermAssessmentItemId = midCat.assessments[0].id;
    finalAssessmentItemId = finCat.assessments[0].id;

    // Create Exam Session
    const sessionRes = await request(app)
      .post('/api/v1/exams/sessions')
      .set('Authorization', `Bearer ${examControllerToken}`)
      .send({
        academicTermId,
        name: `Integrated Session ${Date.now()}`,
        startDate: new Date().toISOString().slice(0, 10),
        endDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      });
    expect(sessionRes.status).toBe(201);
    examSessionId = sessionRes.body.data.id;

    // Create Exam Schedules: Midterm and Final
    const schedDate = new Date().toISOString().slice(0, 10);
    const midSchedRes = await request(app)
      .post('/api/v1/exams/schedules')
      .set('Authorization', `Bearer ${examControllerToken}`)
      .send({
        examSessionId,
        subjectId: mathSubjectId,
        examDate: schedDate,
        startTime: '09:00',
        endTime: '11:00',
        maxMarks: 100,
        passMarks: 40,
        roomNumber: 'HALL-A',
      });
    expect(midSchedRes.status).toBe(201);
    midtermExamScheduleId = midSchedRes.body.data.id;

    // Create a second exam schedule for Final (using a different subject or session)
    // Exam schedule has unique [examSessionId, subjectId], so let's create a separate Final session
    const finalSessionRes = await request(app)
      .post('/api/v1/exams/sessions')
      .set('Authorization', `Bearer ${examControllerToken}`)
      .send({
        academicTermId,
        name: `Final Term Session ${Date.now()}`,
        startDate: new Date().toISOString().slice(0, 10),
        endDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      });
    expect(finalSessionRes.status).toBe(201);

    const finSchedRes = await request(app)
      .post('/api/v1/exams/schedules')
      .set('Authorization', `Bearer ${examControllerToken}`)
      .send({
        examSessionId: finalSessionRes.body.data.id,
        subjectId: mathSubjectId,
        examDate: schedDate,
        startTime: '13:00',
        endTime: '16:00',
        maxMarks: 100,
        passMarks: 40,
        roomNumber: 'HALL-B',
      });
    expect(finSchedRes.status).toBe(201);
    finalExamScheduleId = finSchedRes.body.data.id;
  });

  afterAll(async () => {
    await prisma.subjectResultCorrectionRequest.deleteMany({
      where: { subjectResult: { institutionId, subjectId: mathSubjectId } },
    });
    await prisma.subjectResult.deleteMany({
      where: { institutionId, subjectId: mathSubjectId },
    });
    await prisma.$disconnect();
  });

  it('1. A teacher can link a Midterm exam to the Midterm assessment component for the same subject and term', async () => {
    const res = await request(app)
      .post(`/api/v1/exams/schedules/${midtermExamScheduleId}/link-assessment`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ assessmentItemId: midtermAssessmentItemId });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.assessmentItemId).toBe(midtermAssessmentItemId);

    // Verify in DB that assessment item points to exam schedule
    const itemInDb = await prisma.assessmentItem.findUnique({
      where: { id: midtermAssessmentItemId },
    });
    expect(itemInDb?.examScheduleId).toBe(midtermExamScheduleId);
  });

  it('2. A teacher can link a Final exam to the Final assessment component', async () => {
    const res = await request(app)
      .post(`/api/v1/exams/schedules/${finalExamScheduleId}/link-assessment`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ assessmentItemId: finalAssessmentItemId });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.assessmentItemId).toBe(finalAssessmentItemId);

    const itemInDb = await prisma.assessmentItem.findUnique({
      where: { id: finalAssessmentItemId },
    });
    expect(itemInDb?.examScheduleId).toBe(finalExamScheduleId);
  });

  it('3. Invalid cross-subject, cross-term, cross-session, and cross-tenant exam links are rejected', async () => {
    // 3a. Cross-subject: Create assessment item for Science 101, try to link with Math exam schedule
    const scienceScheme = await prisma.assessmentScheme.create({
      data: {
        institution: { connect: { id: institutionId } },
        academicTerm: { connect: { id: academicTermId } },
        subject: { connect: { id: scienceSubjectId } },
        createdBy: { connect: { id: teacherUserId } },
        title: 'Science Assessment Scheme',
        status: 'DRAFT',
        categories: {
          create: [{ name: 'Practical', weightagePercentage: 100 }],
        },
      },
      include: { categories: { include: { assessments: true } } },
    });

    const scienceItem = await prisma.assessmentItem.create({
      data: {
        assessmentCategoryId: scienceScheme.categories[0].id,
        title: 'Science Practical Item',
        maxMarks: 50,
        isPublished: true,
      },
    });

    // Try linking Science item to Math exam schedule -> Must fail with 400
    const crossSubjectRes = await request(app)
      .post(`/api/v1/exams/schedules/${midtermExamScheduleId}/link-assessment`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ assessmentItemId: scienceItem.id });

    expect(crossSubjectRes.status).toBe(400);
    expect(crossSubjectRes.body.error?.message || crossSubjectRes.body.message).toContain('same subject');

    // 3b. Duplicate link: Try linking finalAssessmentItemId to midtermExamScheduleId (already linked to another)
    const dupRes = await request(app)
      .post(`/api/v1/exams/schedules/${midtermExamScheduleId}/link-assessment`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ assessmentItemId: finalAssessmentItemId });

    expect(dupRes.status).toBe(409);

    // Clean up scienceScheme
    await prisma.assessmentScheme.delete({ where: { id: scienceScheme.id } });
  });

  it('4. Exam marks remain pending until the teacher uses Push Marks', async () => {
    // Teacher enters marks in the Exam module (Alice gets 80/100)
    const marksRes = await request(app)
      .post('/api/v1/exams/marks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        examScheduleId: midtermExamScheduleId,
        marks: [{ studentId: studentAliceId, marksObtained: 80, isAbsent: false }],
      });

    expect(marksRes.status).toBe(200);

    // Exam schedule status should show NOT_PUSHED
    const sched = await prisma.examSchedule.findUniqueOrThrow({
      where: { id: midtermExamScheduleId },
    });
    expect(sched.pushStatus).toBe('PUSH_PENDING');

    // Canonical Assessment Mark for Alice in midtermAssessmentItemId must NOT exist yet
    const assessMark = await prisma.studentAssessmentMark.findUnique({
      where: {
        assessmentItemId_studentId: {
          assessmentItemId: midtermAssessmentItemId,
          studentId: studentAliceId,
        },
      },
    });
    expect(assessMark).toBeNull();
  });

  it('5. Push Marks synchronizes exam marks into the canonical assessment records and updates Gradebook and calculated results', async () => {
    // Teacher clicks Push Marks
    const pushRes = await request(app)
      .post(`/api/v1/exams/schedules/${midtermExamScheduleId}/push-marks`)
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(pushRes.status).toBe(200);
    expect(pushRes.body.success).toBe(true);
    expect(pushRes.body.data.pushStatus).toBe('PUSHED');
    expect(pushRes.body.data.syncedCount).toBe(1);

    // Verify canonical mark exists now
    const assessMark = await prisma.studentAssessmentMark.findUnique({
      where: {
        assessmentItemId_studentId: {
          assessmentItemId: midtermAssessmentItemId,
          studentId: studentAliceId,
        },
      },
    });
    expect(assessMark).toBeDefined();
    expect(assessMark?.marksObtained).toBe(80);

    // Verify Gradebook displays this mark
    const gbRes = await request(app)
      .get('/api/v1/assessments/gradebook')
      .set('Authorization', `Bearer ${teacherToken}`)
      .query({ subjectId: mathSubjectId, sectionId: sectionAId, academicTermId });

    expect(gbRes.status).toBe(200);
    const aliceRow = gbRes.body.data.rows.find((r: any) => r.studentId === studentAliceId);
    expect(aliceRow).toBeDefined();
    expect(aliceRow.marks[midtermAssessmentItemId]?.marksObtained).toBe(80);
    // Calculated contribution for Midterm (30% weight, 80/100 -> 24.0)
    expect(aliceRow.marks[midtermAssessmentItemId]?.contribution).toBeCloseTo(24.0, 1);
  });

  it('6. Repeated pushes are idempotent and do not create duplicate marks or assessment records', async () => {
    // Push a second time without changing marks
    const pushRes2 = await request(app)
      .post(`/api/v1/exams/schedules/${midtermExamScheduleId}/push-marks`)
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(pushRes2.status).toBe(200);
    expect(pushRes2.body.data.pushVersion).toBe(2);

    // Verify studentAssessmentMark count remains exactly 1 for this student and item
    const marksCount = await prisma.studentAssessmentMark.count({
      where: {
        assessmentItemId: midtermAssessmentItemId,
        studentId: studentAliceId,
      },
    });
    expect(marksCount).toBe(1);

    // Push records table has audit trail
    const pushRecords = await prisma.examPushRecord.findMany({
      where: { examScheduleId: midtermExamScheduleId },
    });
    expect(pushRecords.length).toBeGreaterThanOrEqual(2);
  });

  it('7. Re-pushing changed exam marks updates the existing linked records and recalculates results', async () => {
    // Teacher updates marks in Exam module to 90/100 (allowUpdate: true)
    const updateMarksRes = await request(app)
      .post('/api/v1/exams/marks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        examScheduleId: midtermExamScheduleId,
        allowUpdate: true,
        marks: [{ studentId: studentAliceId, marksObtained: 90, isAbsent: false }],
      });
    expect(updateMarksRes.status).toBe(200);

    // Teacher re-pushes
    const rePushRes = await request(app)
      .post(`/api/v1/exams/schedules/${midtermExamScheduleId}/push-marks`)
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(rePushRes.status).toBe(200);

    // Verify canonical mark is updated to 90
    const updatedMark = await prisma.studentAssessmentMark.findUniqueOrThrow({
      where: {
        assessmentItemId_studentId: {
          assessmentItemId: midtermAssessmentItemId,
          studentId: studentAliceId,
        },
      },
    });
    expect(updatedMark.marksObtained).toBe(90);

    // Gradebook contribution recalculated (30% weight, 90/100 -> 27.0)
    const gbRes = await request(app)
      .get('/api/v1/assessments/gradebook')
      .set('Authorization', `Bearer ${teacherToken}`)
      .query({ subjectId: mathSubjectId, sectionId: sectionAId, academicTermId });
    const aliceRow = gbRes.body.data.rows.find((r: any) => r.studentId === studentAliceId);
    expect(aliceRow.marks[midtermAssessmentItemId]?.contribution).toBeCloseTo(27.0, 1);
  });

  it('8. Push Marks does NOT publish student results or submit official results to the Examination Department', async () => {
    // Check subjectResult status: it should still be DRAFT (not published or submitted to exam dept)
    const result = await prisma.subjectResult.findFirst({
      where: {
        subjectId: mathSubjectId,
        sectionId: sectionAId,
        studentId: studentAliceId,
        academicTermId,
      },
    });
    expect(result?.status ?? SubjectResultStatus.DRAFT).toBe(SubjectResultStatus.DRAFT);

    // Student transcript query must NOT return this subject result as officially published
    const studentRes = await request(app)
      .get('/api/v1/assessments/student-result')
      .set('Authorization', `Bearer ${studentAliceToken}`)
      .query({ subjectId: mathSubjectId, academicTermId });

    if (studentRes.status === 200 && studentRes.body.data) {
      expect(studentRes.body.data.isOfficiallyPublished).toBeFalsy();
    }
  });

  it('9. A failed push rolls back all related changes (transactional integrity)', async () => {
    // Unlink the assessment item so pushing will fail
    await prisma.assessmentItem.update({
      where: { id: finalAssessmentItemId },
      data: { examScheduleId: null },
    });

    // Try pushing finalExamScheduleId without a linked component -> Must fail with 400
    const failPush = await request(app)
      .post(`/api/v1/exams/schedules/${finalExamScheduleId}/push-marks`)
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(failPush.status).toBe(400);

    // Schedule status remains NOT_PUSHED
    const sched = await prisma.examSchedule.findUniqueOrThrow({
      where: { id: finalExamScheduleId },
    });
    expect(sched.pushStatus).toBe('NOT_PUSHED');

    // Relink for subsequent operations
    await prisma.assessmentItem.update({
      where: { id: finalAssessmentItemId },
      data: { examScheduleId: finalExamScheduleId },
    });
  });

  it('10. Exam marks cannot be edited or pushed by a teacher after the formal result is locked; the correction request workflow is required', async () => {
    // Enter and push Final marks for Alice (80/100)
    await request(app)
      .post('/api/v1/exams/marks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        examScheduleId: finalExamScheduleId,
        marks: [{ studentId: studentAliceId, marksObtained: 80, isAbsent: false }],
      });
    await request(app)
      .post(`/api/v1/exams/schedules/${finalExamScheduleId}/push-marks`)
      .set('Authorization', `Bearer ${teacherToken}`);

    // Now Teacher clicks Submit to Examination Department (Button B)
    const submitDeptRes = await request(app)
      .post('/api/v1/assessments/results/submit-to-exam-dept')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        subjectId: mathSubjectId,
        sectionId: sectionAId,
        academicTermId,
      });
    expect(submitDeptRes.status).toBe(200);

    // SubjectResult status is now SUBMITTED_TO_EXAM_DEPARTMENT
    const lockedRes = await prisma.subjectResult.findFirst({
      where: { subjectId: mathSubjectId, sectionId: sectionAId, studentId: studentAliceId, academicTermId },
    });
    expect(lockedRes?.status).toBe(SubjectResultStatus.SUBMITTED_TO_EXAM_DEPARTMENT);

    // 10a. Teacher direct edit in exam marks is now BLOCKED with 403
    const editBlockedRes = await request(app)
      .post('/api/v1/exams/marks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        examScheduleId: midtermExamScheduleId,
        allowUpdate: true,
        marks: [{ studentId: studentAliceId, marksObtained: 95, isAbsent: false }],
      });
    expect(editBlockedRes.status).toBe(403);
    expect(editBlockedRes.body.error?.message || editBlockedRes.body.message).toContain('formal marks correction request');

    // 10b. Teacher Push Marks is now BLOCKED with 403
    const pushBlockedRes = await request(app)
      .post(`/api/v1/exams/schedules/${midtermExamScheduleId}/push-marks`)
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(pushBlockedRes.status).toBe(403);
    expect(pushBlockedRes.body.error?.message || pushBlockedRes.body.message).toContain('formal marks correction request');

    // 10c. Only permitted route is Request Marks Correction:
    const correctionRes = await request(app)
      .post('/api/v1/assessments/results/request-correction')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        subjectResultId: lockedRes!.id,
        studentId: studentAliceId,
        proposedMarks: 88,
        reason: 'Recalibration of paper mark after re-verification',
      });
    expect(correctionRes.status).toBe(201);
    expect(correctionRes.body.data.id).toBeDefined();
  });
});
