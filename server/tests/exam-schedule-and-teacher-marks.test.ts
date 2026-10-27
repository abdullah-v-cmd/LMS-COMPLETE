import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/app';
import { prisma } from '../src/utils/prisma';

describe('Examination Schedule Building and Subject Teacher Marks Upload Test', () => {
  let app: Express;
  let controllerToken: string;
  let teacherToken: string;
  let studentToken: string;
  let principalToken: string;
  let institutionId: string;
  let academicTermId: string;
  let mathSubjectId: string;
  let physicsSubjectId: string;
  let sectionAId: string;
  let sectionBId: string;
  let studentAliceId: string;
  let studentBobId: string; // Enrolled in Section B, where Math Teacher is NOT assigned

  beforeAll(async () => {
    app = createApp();
    await prisma.$connect();

    // 1. Log in users
    const [controllerRes, teacherRes, studentRes, principalRes] = await Promise.all([
      request(app).post('/api/v1/auth/login').send({ usernameOrEmail: 'exam.controller@alpha.edu', password: 'Password123!' }),
      request(app).post('/api/v1/auth/login').send({ usernameOrEmail: 'teacher.math@alpha.edu', password: 'Password123!' }),
      request(app).post('/api/v1/auth/login').send({ usernameOrEmail: 'student.alice@alpha.edu', password: 'Password123!' }),
      request(app).post('/api/v1/auth/login').send({ usernameOrEmail: 'principal@alpha.edu', password: 'Password123!' }),
    ]);

    expect(controllerRes.status).toBe(200);
    expect(teacherRes.status).toBe(200);
    expect(studentRes.status).toBe(200);
    expect(principalRes.status).toBe(200);

    controllerToken = controllerRes.body.data.accessToken;
    teacherToken = teacherRes.body.data.accessToken;
    studentToken = studentRes.body.data.accessToken;
    principalToken = principalRes.body.data.accessToken;

    const controllerUser = await prisma.user.findUniqueOrThrow({
      where: { email: 'exam.controller@alpha.edu' },
      select: { institutionId: true },
    });
    institutionId = controllerUser.institutionId!;

    const term = await prisma.academicTerm.findFirstOrThrow({
      where: { academicYear: { institutionId } },
      select: { id: true },
    });
    academicTermId = term.id;

    const mathSubject = await prisma.subject.findFirstOrThrow({
      where: { institutionId, code: 'MATH-101' },
      select: { id: true },
    });
    mathSubjectId = mathSubject.id;

    const physicsSubject = await prisma.subject.findFirstOrThrow({
      where: { institutionId, code: 'PHYS-101' },
      select: { id: true },
    });
    physicsSubjectId = physicsSubject.id;

    const alice = await prisma.studentProfile.findFirstOrThrow({
      where: { institutionId, admissionNumber: 'ADM-2026-001', status: 'ENROLLED' },
      select: { id: true, sectionId: true },
    });
    studentAliceId = alice.id;
    sectionAId = alice.sectionId;

    // Create Section B and Student Bob in Section B (where Math Teacher is NOT assigned)
    const classGrade = await prisma.classGrade.findFirstOrThrow({
      where: { institutionId, name: 'Grade 10' },
      select: { id: true },
    });

    const sectionB = await prisma.section.upsert({
      where: { classGradeId_name: { classGradeId: classGrade.id, name: 'Section B' } },
      update: {},
      create: { classGradeId: classGrade.id, name: 'Section B', roomNumber: '102' },
    });
    sectionBId = sectionB.id;

    const bobUser = await prisma.user.upsert({
      where: { email: 'student.bob.examtest@alpha.edu' },
      update: {},
      create: {
        email: 'student.bob.examtest@alpha.edu',
        username: 'student_bob_examtest',
        passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz12345678901234567890123456',
        firstName: 'Bob',
        lastName: 'ExamTester',
        role: 'ROLE_STUDENT',
        institutionId,
      },
    });

    const bobProfile = await prisma.studentProfile.upsert({
      where: { userId: bobUser.id },
      update: { sectionId: sectionB.id },
      create: {
        userId: bobUser.id,
        institutionId,
        admissionNumber: 'ADM-2026-TESTBOB',
        rollNumber: '2001',
        sectionId: sectionB.id,
        gender: 'MALE',
        bloodGroup: 'B+',
        dateOfBirth: new Date('2010-01-01'),
      },
    });
    studentBobId = bobProfile.id;

    // Clean up any previous test sessions
    const oldSessions = await prisma.examSession.findMany({
      where: { name: { startsWith: 'E2E Exam Schedule Test ' } },
      select: { id: true },
    });
    const oldIds = oldSessions.map((s) => s.id);
    if (oldIds.length > 0) {
      await prisma.studentReportCard.deleteMany({ where: { examSessionId: { in: oldIds } } });
      await prisma.gradeChangeRequest.deleteMany({ where: { examMark: { examSchedule: { examSessionId: { in: oldIds } } } } });
      await prisma.examMark.deleteMany({ where: { examSchedule: { examSessionId: { in: oldIds } } } });
      await prisma.examInvigilator.deleteMany({ where: { examSchedule: { examSessionId: { in: oldIds } } } });
      await prisma.examSchedule.deleteMany({ where: { examSessionId: { in: oldIds } } });
      await prisma.examSession.deleteMany({ where: { id: { in: oldIds } } });
    }
  });

  afterAll(async () => {
    // Cleanup created test records
    const testSessions = await prisma.examSession.findMany({
      where: { name: { startsWith: 'E2E Exam Schedule Test ' } },
      select: { id: true },
    });
    const sessionIds = testSessions.map((s) => s.id);
    if (sessionIds.length > 0) {
      await prisma.studentReportCard.deleteMany({ where: { examSessionId: { in: sessionIds } } });
      await prisma.gradeChangeRequest.deleteMany({ where: { examMark: { examSchedule: { examSessionId: { in: sessionIds } } } } });
      await prisma.examMark.deleteMany({ where: { examSchedule: { examSessionId: { in: sessionIds } } } });
      await prisma.examInvigilator.deleteMany({ where: { examSchedule: { examSessionId: { in: sessionIds } } } });
      await prisma.examSchedule.deleteMany({ where: { examSessionId: { in: sessionIds } } });
      await prisma.examSession.deleteMany({ where: { id: { in: sessionIds } } });
    }
    await prisma.$disconnect();
  });

  it('1. Verifies role authority: only Examination Authority can build exam sessions and schedules', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const inSevenDays = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

    // Student attempting to create an exam session must be rejected (403)
    const studentSessionAttempt = await request(app)
      .post('/api/v1/exams/sessions')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        academicTermId,
        name: `Illegal Student Session ${Date.now()}`,
        startDate: today,
        endDate: inSevenDays,
      });
    expect(studentSessionAttempt.status).toBe(403);

    // Subject Teacher attempting to create an exam session must also be rejected (403)
    const teacherSessionAttempt = await request(app)
      .post('/api/v1/exams/sessions')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        academicTermId,
        name: `Illegal Teacher Session ${Date.now()}`,
        startDate: today,
        endDate: inSevenDays,
      });
    expect(teacherSessionAttempt.status).toBe(403);

    // Exam Controller creates the exam session successfully (201)
    const sessionRes = await request(app)
      .post('/api/v1/exams/sessions')
      .set('Authorization', `Bearer ${controllerToken}`)
      .send({
        academicTermId,
        name: `E2E Exam Schedule Test ${Date.now()}`,
        startDate: today,
        endDate: inSevenDays,
      });
    expect(sessionRes.status).toBe(201);
    expect(sessionRes.body.data.id).toBeDefined();
    expect(sessionRes.body.data.status).toBe('SCHEDULED');

    const examSessionId = sessionRes.body.data.id;

    // Student attempting to build an exam schedule must be rejected (403)
    const studentScheduleAttempt = await request(app)
      .post('/api/v1/exams/schedules')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        examSessionId,
        subjectId: mathSubjectId,
        examDate: today,
        startTime: '09:00',
        endTime: '12:00',
        maxMarks: 100,
        passMarks: 40,
        roomNumber: 'ROOM-101',
      });
    expect(studentScheduleAttempt.status).toBe(403);

    // Exam Controller building schedule with date outside session range must be rejected (400)
    const invalidDateSchedule = await request(app)
      .post('/api/v1/exams/schedules')
      .set('Authorization', `Bearer ${controllerToken}`)
      .send({
        examSessionId,
        subjectId: mathSubjectId,
        examDate: '2020-01-01', // Out of bounds
        startTime: '09:00',
        endTime: '12:00',
        maxMarks: 100,
        passMarks: 40,
        roomNumber: 'ROOM-101',
      });
    expect(invalidDateSchedule.status).toBe(400);

    // Exam Controller successfully builds the exam schedule (201)
    const scheduleRes = await request(app)
      .post('/api/v1/exams/schedules')
      .set('Authorization', `Bearer ${controllerToken}`)
      .send({
        examSessionId,
        subjectId: mathSubjectId,
        examDate: today,
        startTime: '09:00',
        endTime: '12:00',
        maxMarks: 100,
        passMarks: 40,
        roomNumber: 'ROOM-101',
      });
    expect(scheduleRes.status).toBe(201);
    expect(scheduleRes.body.data.maxMarks).toBe(100);
    expect(scheduleRes.body.data.passMarks).toBe(40);
    expect(scheduleRes.body.data.roomNumber).toBe('ROOM-101');
  });

  it('2. Subject Teacher accesses roster and uploads marks for their assigned section', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const inSevenDays = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

    // Create session and schedule for this test
    const sessionRes = await request(app)
      .post('/api/v1/exams/sessions')
      .set('Authorization', `Bearer ${controllerToken}`)
      .send({
        academicTermId,
        name: `E2E Exam Schedule Test Marks ${Date.now()}`,
        startDate: today,
        endDate: inSevenDays,
      });
    const examSessionId = sessionRes.body.data.id;

    const scheduleRes = await request(app)
      .post('/api/v1/exams/schedules')
      .set('Authorization', `Bearer ${controllerToken}`)
      .send({
        examSessionId,
        subjectId: mathSubjectId,
        examDate: today,
        startTime: '09:00',
        endTime: '12:00',
        maxMarks: 100,
        passMarks: 40,
        roomNumber: 'ROOM-101',
      });
    const examScheduleId = scheduleRes.body.data.id;

    // Math Teacher fetches roster for this schedule
    const rosterRes = await request(app)
      .get(`/api/v1/exams/schedules/${examScheduleId}/roster`)
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(rosterRes.status).toBe(200);
    expect(rosterRes.body.data.schedule.maxMarks).toBe(100);

    // Section A student (Alice) must be in the roster
    const studentInRoster = rosterRes.body.data.students.find(
      (s: { id: string }) => s.id === studentAliceId
    );
    expect(studentInRoster).toBeDefined();

    // Section B student (Bob) must NOT be in Math Teacher's roster because Math Teacher is only assigned to Section A
    const bobInRoster = rosterRes.body.data.students.find(
      (s: { id: string }) => s.id === studentBobId
    );
    expect(bobInRoster).toBeUndefined();

    // Invariant: Marks exceeding maxMarks must be rejected (400)
    const exceedMaxMarksRes = await request(app)
      .post('/api/v1/exams/marks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        examScheduleId,
        marks: [{ studentId: studentAliceId, marksObtained: 105, isAbsent: false }],
      });
    expect(exceedMaxMarksRes.status).toBe(400);

    // Invariant: Absent student with non-zero marks must be rejected (400)
    const absentNonZeroRes = await request(app)
      .post('/api/v1/exams/marks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        examScheduleId,
        marks: [{ studentId: studentAliceId, marksObtained: 50, isAbsent: true }],
      });
    expect(absentNonZeroRes.status).toBe(400);

    // Strict Isolation: Teacher attempting to upload marks for Bob (Section B, which teacher doesn't teach) is rejected (403)
    const wrongSectionRes = await request(app)
      .post('/api/v1/exams/marks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        examScheduleId,
        marks: [{ studentId: studentBobId, marksObtained: 85, isAbsent: false }],
      });
    expect(wrongSectionRes.status).toBe(403);
    expect(wrongSectionRes.body.error.message).toMatch(/assigned subject sections/i);

    // Valid upload: Subject Teacher uploads marks for Alice (Section A)
    const validMarksRes = await request(app)
      .post('/api/v1/exams/marks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        examScheduleId,
        marks: [
          {
            studentId: studentAliceId,
            marksObtained: 92,
            isAbsent: false,
            remarks: 'Exceptional problem solving',
          },
        ],
      });
    expect(validMarksRes.status).toBe(200);
    expect(validMarksRes.body.data[0].marksObtained).toBe(92);
    expect(validMarksRes.body.data[0].studentId).toBe(studentAliceId);

    // Verify marks in database
    const savedMark = await prisma.examMark.findUnique({
      where: {
        examScheduleId_studentId: {
          examScheduleId,
          studentId: studentAliceId,
        },
      },
    });
    expect(savedMark).toBeDefined();
    expect(savedMark?.marksObtained).toBe(92);

    // Invariant: Duplicate mark upload without formal grade correction workflow is rejected (409)
    const duplicateRes = await request(app)
      .post('/api/v1/exams/marks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        examScheduleId,
        marks: [{ studentId: studentAliceId, marksObtained: 95, isAbsent: false }],
      });
    expect(duplicateRes.status).toBe(409);
    expect(duplicateRes.body.error.message).toMatch(/already entered.*grade correction/i);
  });

  it('3. Moderation workflow: Teacher requests grade change, Authority approves, and Results are published', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const inSevenDays = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

    const sessionRes = await request(app)
      .post('/api/v1/exams/sessions')
      .set('Authorization', `Bearer ${controllerToken}`)
      .send({
        academicTermId,
        name: `E2E Exam Schedule Test Moderation ${Date.now()}`,
        startDate: today,
        endDate: inSevenDays,
      });
    const examSessionId = sessionRes.body.data.id;

    const scheduleRes = await request(app)
      .post('/api/v1/exams/schedules')
      .set('Authorization', `Bearer ${controllerToken}`)
      .send({
        examSessionId,
        subjectId: mathSubjectId,
        examDate: today,
        startTime: '09:00',
        endTime: '12:00',
        maxMarks: 100,
        passMarks: 40,
        roomNumber: 'ROOM-101',
      });
    const examScheduleId = scheduleRes.body.data.id;

    // Fetch roster to enter marks for all enrolled students in the section
    const rosterRes = await request(app)
      .get(`/api/v1/exams/schedules/${examScheduleId}/roster`)
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(rosterRes.status).toBe(200);

    const marksPayload = rosterRes.body.data.students.map((student: { id: string }) => ({
      studentId: student.id,
      marksObtained: student.id === studentAliceId ? 85 : 78,
      isAbsent: false,
    }));

    const marksRes = await request(app)
      .post('/api/v1/exams/marks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        examScheduleId,
        marks: marksPayload,
      });
    expect(marksRes.status).toBe(200);

    const aliceMark = marksRes.body.data.find(
      (m: { studentId: string }) => m.studentId === studentAliceId
    );
    const markId = aliceMark.id;

    // Teacher submits grade change request to 89
    const changeReq = await request(app)
      .post('/api/v1/exams/grade-changes')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        examMarkId: markId,
        proposedMarks: 89,
        reason: 'Re-evaluation of final geometry proof',
      });
    expect(changeReq.status).toBe(201);
    const changeId = changeReq.body.data.id;

    // Principal reviews and approves
    const reviewRes = await request(app)
      .post(`/api/v1/exams/grade-changes/${changeId}/review`)
      .set('Authorization', `Bearer ${principalToken}`)
      .send({ status: 'APPROVED' });
    expect(reviewRes.status).toBe(200);

    // Verify mark updated to 89
    const updatedMark = await prisma.examMark.findUnique({ where: { id: markId } });
    expect(updatedMark?.marksObtained).toBe(89);

    // Exam Controller publishes results
    const publishRes = await request(app)
      .post('/api/v1/exams/results/publish')
      .set('Authorization', `Bearer ${controllerToken}`)
      .send({ examSessionId });
    expect(publishRes.status).toBe(200);

    // Report cards generated and verified
    const reportCardsRes = await request(app)
      .get('/api/v1/exams/report-cards')
      .set('Authorization', `Bearer ${controllerToken}`)
      .query({ examSessionId });
    expect(reportCardsRes.status).toBe(200);

    const aliceReportCard = reportCardsRes.body.data.find(
      (c: { studentId: string }) => c.studentId === studentAliceId
    );
    expect(aliceReportCard).toBeDefined();
    expect(aliceReportCard.verificationSignature).toBeDefined();

    // Verify cryptographic integrity
    const verifyRes = await request(app)
      .get(`/api/v1/exams/report-cards/${aliceReportCard.id}/verify`)
      .set('Authorization', `Bearer ${controllerToken}`)
      .query({ signature: aliceReportCard.verificationSignature });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.valid).toBe(true);

    // Check tamper resistance
    const tamperRes = await request(app)
      .get(`/api/v1/exams/report-cards/${aliceReportCard.id}/verify`)
      .set('Authorization', `Bearer ${controllerToken}`)
      .query({ signature: 'a'.repeat(64) });
    expect(tamperRes.status).toBe(200);
    expect(tamperRes.body.data.valid).toBe(false);
  });
});
