import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/app';
import { prisma } from '../src/utils/prisma';

describe('Phase 5: examination workflow integration', () => {
  let app: Express;
  beforeAll(async () => { app = createApp(); await prisma.$connect(); });
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

    const roster = await request(app).get(`/api/v1/exams/schedules/${schedule.body.data.id}/roster`).set('Authorization', `Bearer ${teacherToken}`);
    expect(roster.status).toBe(200);
    expect(roster.body.data.students.some((row: { id: string }) => row.id === student.id)).toBe(true);
    const marks = await request(app).post('/api/v1/exams/marks').set('Authorization', `Bearer ${teacherToken}`).send({ examScheduleId: schedule.body.data.id, marks: [{ studentId: student.id, marksObtained: 75, isAbsent: false }] });
    expect(marks.status).toBe(200);
    expect((await prisma.examMark.findUnique({ where: { examScheduleId_studentId: { examScheduleId: schedule.body.data.id, studentId: student.id } } }))?.marksObtained).toBe(75);
    const duplicate = await request(app).post('/api/v1/exams/marks').set('Authorization', `Bearer ${teacherToken}`).send({ examScheduleId: schedule.body.data.id, marks: [{ studentId: student.id, marksObtained: 80, isAbsent: false }] });
    expect(duplicate.status).toBe(409);

    const change = await request(app).post('/api/v1/exams/grade-changes').set('Authorization', `Bearer ${teacherToken}`).send({ examMarkId: marks.body.data[0].id, proposedMarks: 80, reason: 'Verified marking calculation adjustment' });
    expect(change.status).toBe(201);
    const queue = await request(app).get('/api/v1/exams/grade-changes').set('Authorization', `Bearer ${controllerToken}`);
    expect(queue.status).toBe(200);
    expect(queue.body.data.some((item: { id: string }) => item.id === change.body.data.id)).toBe(true);
    const reviewed = await request(app).post(`/api/v1/exams/grade-changes/${change.body.data.id}/review`).set('Authorization', `Bearer ${principalToken}`).send({ status: 'APPROVED' });
    expect(reviewed.status).toBe(200);
    expect((await prisma.examMark.findUnique({ where: { id: marks.body.data[0].id } }))?.marksObtained).toBe(80);

    const published = await request(app).post('/api/v1/exams/results/publish').set('Authorization', `Bearer ${controllerToken}`).send({ examSessionId: session.body.data.id });
    expect(published.status).toBe(200);
    const cards = await request(app).get('/api/v1/exams/report-cards').set('Authorization', `Bearer ${controllerToken}`);
    expect(cards.status).toBe(200);
    expect(cards.body.data.some((card: { examSession: { id: string }; studentId: string }) => card.examSession.id === session.body.data.id && card.studentId === student.id)).toBe(true);
  });
});
