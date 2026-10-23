import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/app';
import { prisma } from '../src/utils/prisma';

describe('Phase 7: restricted encrypted counseling workflows', () => {
  let app: Express;
  beforeAll(async () => { app = createApp(); await prisma.$connect(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('scopes referrals, encrypts case content, schedules follow-ups, and evaluates at-risk rules', async () => {
    const [counselorLogin, teacherLogin, parentLogin, counselor] = await Promise.all([
      request(app).post('/api/v1/auth/login').send({ usernameOrEmail: 'counselor@alpha.edu', password: 'Password123!' }),
      request(app).post('/api/v1/auth/login').send({ usernameOrEmail: 'teacher.homeroom@alpha.edu', password: 'Password123!' }),
      request(app).post('/api/v1/auth/login').send({ usernameOrEmail: 'parent.john@alpha.edu', password: 'Password123!' }),
      prisma.user.findUniqueOrThrow({ where: { email: 'counselor@alpha.edu' }, select: { institutionId: true } }),
    ]);
    const counselorToken = counselorLogin.body.data.accessToken;
    const teacherToken = teacherLogin.body.data.accessToken;
    const parentToken = parentLogin.body.data.accessToken;
    const student = await prisma.studentProfile.findFirstOrThrow({ where: { institutionId: counselor.institutionId!, admissionNumber: 'ADM-2026-001', status: 'ENROLLED' }, select: { id: true } });

    const unauthorizedCases = await request(app).get('/api/v1/counseling/cases').set('Authorization', `Bearer ${teacherToken}`);
    expect(unauthorizedCases.status).toBe(403);
    const referral = await request(app).post('/api/v1/counseling/referrals').set('Authorization', `Bearer ${teacherToken}`).send({ studentId: student.id, reason: 'Attendance support would be helpful' });
    expect(referral.status).toBe(201);
    const storedReferral = await prisma.counselingReferral.findUniqueOrThrow({ where: { id: referral.body.data.id } });
    expect(storedReferral.reason).toBeNull();
    expect(storedReferral.encryptedReason).not.toContain('Attendance support');
    const parentReferral = await request(app).post('/api/v1/counseling/referrals').set('Authorization', `Bearer ${parentToken}`).send({ studentId: student.id, reason: 'Family requests student support' });
    expect(parentReferral.status).toBe(201);
    const queue = await request(app).get('/api/v1/counseling/referrals').set('Authorization', `Bearer ${counselorToken}`);
    expect(queue.body.data.some((item: { id: string }) => item.id === referral.body.data.id)).toBe(true);
    expect((await request(app).post(`/api/v1/counseling/referrals/${referral.body.data.id}/review`).set('Authorization', `Bearer ${counselorToken}`).send({ status: 'ACCEPTED' })).status).toBe(200);

    const caseResponse = await request(app).post('/api/v1/counseling/cases').set('Authorization', `Bearer ${counselorToken}`).send({ studentId: student.id, caseTitle: 'Private support case', riskLevel: 'MEDIUM' });
    expect(caseResponse.status).toBe(201);
    const storedCase = await prisma.counselingCase.findUniqueOrThrow({ where: { id: caseResponse.body.data.id } });
    expect(storedCase.caseTitle).toBeNull();
    expect(storedCase.encryptedCaseTitle).not.toContain('Private support');
    const note = await request(app).post(`/api/v1/counseling/cases/${caseResponse.body.data.id}/notes`).set('Authorization', `Bearer ${counselorToken}`).send({ notes: 'Private clinical detail', actionPlan: 'Confidential check-in plan' });
    expect(note.status).toBe(201);
    const storedNote = await prisma.counselingNote.findUniqueOrThrow({ where: { id: note.body.data.id } });
    expect(storedNote.encryptedNotes).not.toContain('Private clinical detail');
    expect(storedNote.encryptedActionPlan).not.toContain('Confidential check-in');
    expect((await request(app).get(`/api/v1/counseling/cases/${caseResponse.body.data.id}/notes`).set('Authorization', `Bearer ${counselorToken}`)).body.data[0]).toMatchObject({ notes: 'Private clinical detail', actionPlan: 'Confidential check-in plan' });

    const plan = await request(app).post('/api/v1/counseling/support-plans').set('Authorization', `Bearer ${counselorToken}`).send({ caseId: caseResponse.body.data.id, title: 'Confidential plan', goal: 'Support attendance', actions: 'Weekly counselor meeting' });
    expect(plan.status).toBe(201);
    const storedPlan = await prisma.counselingSupportPlan.findUniqueOrThrow({ where: { id: plan.body.data.id } });
    expect(storedPlan.title).toBeNull();
    expect(storedPlan.encryptedActions).not.toContain('Weekly counselor meeting');
    const followUp = await request(app).post('/api/v1/counseling/follow-ups').set('Authorization', `Bearer ${counselorToken}`).send({ supportPlanId: plan.body.data.id, dueAt: new Date(Date.now() + 86400000).toISOString(), notes: 'Private follow-up note' });
    expect(followUp.status).toBe(201);
    expect((await prisma.counselingFollowUp.findUniqueOrThrow({ where: { id: followUp.body.data.id } })).encryptedNotes).not.toContain('Private follow-up note');
    expect((await request(app).post(`/api/v1/counseling/follow-ups/${followUp.body.data.id}/complete`).set('Authorization', `Bearer ${counselorToken}`).send({ notes: 'Follow-up completed' })).status).toBe(200);

    expect((await request(app).put('/api/v1/counseling/at-risk/rules').set('Authorization', `Bearer ${counselorToken}`).send({ name: 'Attendance threshold', minimumAbsences: 1, lookbackDays: 90, minimumGradePercent: 60 })).status).toBe(200);
    const atRisk = await request(app).get('/api/v1/counseling/at-risk/students').set('Authorization', `Bearer ${counselorToken}`);
    expect(atRisk.status).toBe(200);
    expect(Array.isArray(atRisk.body.data)).toBe(true);
  });
});
