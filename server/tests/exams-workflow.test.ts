import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/app';
import { prisma } from '../src/utils/prisma';

describe('Phase 5: examination workflow integration', () => {
  let app: Express;
  beforeAll(async () => {
    app = createApp();
    await prisma.$connect();
    const testSessions = await prisma.examSession.findMany({
      where: {
        OR: [
          { name: { startsWith: 'Workflow ' } },
          { name: { startsWith: 'Conflict Session ' } },
        ],
      },
      select: { id: true },
    });
    const sessionIds = testSessions.map((s) => s.id);
    if (sessionIds.length > 0) {
      await prisma.studentReportCard.deleteMany({
        where: { examSessionId: { in: sessionIds } },
      });
      await prisma.gradeChangeRequest.deleteMany({
        where: { examMark: { examSchedule: { examSessionId: { in: sessionIds } } } },
      });
      await prisma.examMark.deleteMany({
        where: { examSchedule: { examSessionId: { in: sessionIds } } },
      });
      await prisma.examInvigilator.deleteMany({
        where: { examSchedule: { examSessionId: { in: sessionIds } } },
      });
      await prisma.examSchedule.deleteMany({
        where: { examSessionId: { in: sessionIds } },
      });
      await prisma.examSession.deleteMany({
        where: { id: { in: sessionIds } },
      });
    }
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it('creates a session, schedules an exam, enters and moderates marks, and publishes a report card', async () => {
    const [controllerLogin, teacherLogin, principalLogin, controllerUser] = await Promise.all([
      request(app).post('/api/v1/auth/login').send({ usernameOrEmail: 'exam.controller@alpha.edu', password: 'Password123!' }),
      request(app).post('/api/v1/auth/login').send({ usernameOrEmail: 'teacher.math@alpha.edu', password: 'Password123!' }),
      request(app).post('/api/v1/auth/login').send({ usernameOrEmail: 'principal@alpha.edu', password: 'Password123!' }),
      prisma.user.findUniqueOrThrow({ where: { email: 'exam.controller@alpha.edu' }, select: { institutionId: true } }),
    ]);
    const term = await prisma.academicTerm.findFirstOrThrow({ where: { academicYear: { institutionId: controllerUser.institutionId! } }, select: { id: true } });
    const subject = await prisma.subject.findFirstOrThrow({ where: { institutionId: controllerUser.institutionId!, code: 'MATH-101' }, select: { id: true } });
    const student = await prisma.studentProfile.findFirstOrThrow({ where: { institutionId: controllerUser.institutionId!, admissionNumber: 'ADM-2026-001', status: 'ENROLLED' }, select: { id: true } });
    const controllerToken = controllerLogin.body.data.accessToken;
    const teacherToken = teacherLogin.body.data.accessToken;
    const principalToken = principalLogin.body.data.accessToken;
    const startDate = new Date().toISOString().slice(0, 10);
    const endDate = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);

    const session = await request(app).post('/api/v1/exams/sessions').set('Authorization', `Bearer ${controllerToken}`).send({ academicTermId: term.id, name: `Workflow ${Date.now()}`, startDate, endDate });
    expect(session.status).toBe(201);
    const schedule = await request(app).post('/api/v1/exams/schedules').set('Authorization', `Bearer ${controllerToken}`).send({ examSessionId: session.body.data.id, subjectId: subject.id, examDate: startDate, startTime: '09:00', endTime: '11:00', maxMarks: 100, passMarks: 40, roomNumber: 'TEST-1' });
    expect(schedule.status).toBe(201);

    const invigilator = await prisma.teacherProfile.findFirstOrThrow({ where: { institutionId: controllerUser.institutionId!, user: { email: 'teacher.math@alpha.edu' } }, select: { userId: true } });
    const assignment = await request(app).put(`/api/v1/exams/schedules/${schedule.body.data.id}/invigilators`).set('Authorization', `Bearer ${controllerToken}`).send({ userIds: [invigilator.userId] });
    expect(assignment.status).toBe(200);
    expect(assignment.body.data.map((item: { userId: string }) => item.userId)).toContain(invigilator.userId);
    const fetchedAssignments = await request(app).get(`/api/v1/exams/schedules/${schedule.body.data.id}/invigilators`).set('Authorization', `Bearer ${controllerToken}`);
    expect(fetchedAssignments.status).toBe(200);
    expect(fetchedAssignments.body.data).toHaveLength(1);
    const otherSubject = await prisma.subject.findFirstOrThrow({ where: { institutionId: controllerUser.institutionId!, id: { not: subject.id } }, select: { id: true } });
    const conflictSession = await request(app).post('/api/v1/exams/sessions').set('Authorization', `Bearer ${controllerToken}`).send({ academicTermId: term.id, name: `Conflict Session ${Date.now()}`, startDate, endDate });
    expect(conflictSession.status).toBe(201);
    const overlappingSchedule = await request(app).post('/api/v1/exams/schedules').set('Authorization', `Bearer ${controllerToken}`).send({ examSessionId: conflictSession.body.data.id, subjectId: otherSubject.id, examDate: startDate, startTime: '10:00', endTime: '12:00', maxMarks: 100, passMarks: 40, roomNumber: 'TEST-2' });
    expect(overlappingSchedule.status).toBe(201);
    const conflict = await request(app).put(`/api/v1/exams/schedules/${overlappingSchedule.body.data.id}/invigilators`).set('Authorization', `Bearer ${controllerToken}`).send({ userIds: [invigilator.userId] });
    expect(conflict.status).toBe(409);

    const roster = await request(app).get(`/api/v1/exams/schedules/${schedule.body.data.id}/roster`).set('Authorization', `Bearer ${teacherToken}`);
    expect(roster.status).toBe(200);
    expect(roster.body.data.students.some((row: { id: string }) => row.id === student.id)).toBe(true);
    const marksPayload = roster.body.data.students.map((row: { id: string }) => ({
      studentId: row.id,
      marksObtained: 75,
      isAbsent: false,
    }));
    const marks = await request(app).post('/api/v1/exams/marks').set('Authorization', `Bearer ${teacherToken}`).send({ examScheduleId: schedule.body.data.id, marks: marksPayload });
    expect(marks.status).toBe(200);
    expect((await prisma.examMark.findUnique({ where: { examScheduleId_studentId: { examScheduleId: schedule.body.data.id, studentId: student.id } } }))?.marksObtained).toBe(75);
    const duplicate = await request(app).post('/api/v1/exams/marks').set('Authorization', `Bearer ${teacherToken}`).send({ examScheduleId: schedule.body.data.id, marks: [{ studentId: student.id, marksObtained: 80, isAbsent: false }] });
    expect(duplicate.status).toBe(409);

    const aliceMark = marks.body.data.find((item: { studentId: string }) => item.studentId === student.id);
    const change = await request(app).post('/api/v1/exams/grade-changes').set('Authorization', `Bearer ${teacherToken}`).send({ examMarkId: aliceMark.id, proposedMarks: 80, reason: 'Verified marking calculation adjustment' });
    expect(change.status).toBe(201);
    const queue = await request(app).get('/api/v1/exams/grade-changes').set('Authorization', `Bearer ${controllerToken}`);
    expect(queue.status).toBe(200);
    expect(queue.body.data.some((item: { id: string }) => item.id === change.body.data.id)).toBe(true);
    const reviewed = await request(app).post(`/api/v1/exams/grade-changes/${change.body.data.id}/review`).set('Authorization', `Bearer ${principalToken}`).send({ status: 'APPROVED' });
    expect(reviewed.status).toBe(200);
    expect((await prisma.examMark.findUnique({ where: { id: aliceMark.id } }))?.marksObtained).toBe(80);

    const scale = await request(app).put('/api/v1/exams/grading-scale').set('Authorization', `Bearer ${controllerToken}`).send({ bands: [{ minimumPercentage: 0, gradeLetter: 'F', gpa: 0 }, { minimumPercentage: 70, gradeLetter: 'P', gpa: 3.25 }] });
    expect(scale.status).toBe(200);
    const savedScale = await prisma.institutionGradeBand.findMany({ where: { institutionId: controllerUser.institutionId! } });
    expect(savedScale).toHaveLength(2);

    const published = await request(app).post('/api/v1/exams/results/publish').set('Authorization', `Bearer ${controllerToken}`).send({ examSessionId: session.body.data.id });
    expect(published.status).toBe(200);
    const cards = await request(app).get('/api/v1/exams/report-cards').set('Authorization', `Bearer ${controllerToken}`);
    expect(cards.status).toBe(200);
    const publishedCard = cards.body.data.find((card: { examSession: { id: string }; studentId: string }) => card.examSession.id === session.body.data.id && card.studentId === student.id);
    expect(publishedCard).toMatchObject({ gradeLetter: 'P', gpa: 3.25 });
    expect(publishedCard.verificationSignature).toMatch(/^[a-f0-9]{64}$/);
    const verified = await request(app).get(`/api/v1/exams/report-cards/${publishedCard.id}/verify`).query({ signature: publishedCard.verificationSignature }).set('Authorization', `Bearer ${controllerToken}`);
    expect(verified.status).toBe(200);
    expect(verified.body.data.valid).toBe(true);
    const tampered = await request(app).get(`/api/v1/exams/report-cards/${publishedCard.id}/verify`).query({ signature: '0'.repeat(64) }).set('Authorization', `Bearer ${controllerToken}`);
    expect(tampered.status).toBe(200);
    expect(tampered.body.data.valid).toBe(false);
  });
});
