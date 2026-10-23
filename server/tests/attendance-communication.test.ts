import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/utils/prisma';
import { Express } from 'express';

describe('Phase 4: Attendance & Communication Workflow Tests', () => {
  let app: Express;
  let homeroomTeacherToken: string;
  let principalToken: string;
  let parentToken: string;
  let studentAliceId: string;
  let sectionId: string;
  let mathSubjectId: string;
  let attendanceRecordId: string;
  let correctionRequestId: string;

  beforeAll(async () => {
    app = createApp();
    await prisma.$connect();

    // Login Homeroom Teacher
    const htLogin = await request(app).post('/api/v1/auth/login').send({
      usernameOrEmail: 'teacher.homeroom@alpha.edu',
      password: 'Password123!',
    });
    homeroomTeacherToken = htLogin.body.data.accessToken;

    // Login Principal (Checker)
    const pLogin = await request(app).post('/api/v1/auth/login').send({
      usernameOrEmail: 'principal@alpha.edu',
      password: 'Password123!',
    });
    principalToken = pLogin.body.data.accessToken;

    // Login Parent John
    const prLogin = await request(app).post('/api/v1/auth/login').send({
      usernameOrEmail: 'parent.john@alpha.edu',
      password: 'Password123!',
    });
    parentToken = prLogin.body.data.accessToken;

    // Retrieve Student Alice and Section A
    const alice = await prisma.studentProfile.findFirst({
      where: { admissionNumber: 'ADM-2026-001' },
    });
    studentAliceId = alice!.id;
    sectionId = alice!.sectionId;
    mathSubjectId = (await prisma.subject.findFirstOrThrow({ where: { code: 'MATH-101', institutionId: alice!.institutionId }, select: { id: true } })).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('POST /api/v1/attendance/mark allows Homeroom Teacher to mark attendance and triggers parent alert', async () => {
    const today = '2026-10-22';

    const res = await request(app)
      .post('/api/v1/attendance/mark')
      .set('Authorization', `Bearer ${homeroomTeacherToken}`)
      .send({
        sectionId,
        date: today,
        records: [
          {
            studentId: studentAliceId,
            status: 'ABSENT',
            remarks: 'Unexcused morning absence',
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].status).toBe('ABSENT');
    attendanceRecordId = res.body.data[0].id;

    // Verify parent received automated absence alert notification
    const parentNotifications = await request(app)
      .get('/api/v1/communication/notifications')
      .set('Authorization', `Bearer ${parentToken}`);

    expect(parentNotifications.status).toBe(200);
    const alert = parentNotifications.body.data.find((n: any) => n.title === 'Student Absence Alert');
    expect(alert).toBeDefined();
  });

  it('GET /api/v1/attendance allows Parent to view attendance for their linked child', async () => {
    const res = await request(app)
      .get(`/api/v1/attendance?studentId=${studentAliceId}`)
      .set('Authorization', `Bearer ${parentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0].status).toBe('ABSENT');
  });

  it('POST /api/v1/attendance/corrections allows Teacher to request a status correction', async () => {
    const res = await request(app)
      .post('/api/v1/attendance/corrections')
      .set('Authorization', `Bearer ${homeroomTeacherToken}`)
      .send({
        attendanceRecordId,
        requestedStatus: 'EXCUSED',
        reason: 'Medical certificate verified from family physician',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.requestedStatus).toBe('EXCUSED');
    correctionRequestId = res.body.data.id;
  });

  it('MAKER-CHECKER RULE: Self-approval is rejected when requester attempts to approve own request', async () => {
    // 1. Teacher cannot review due to lack of ATTENDANCE_APPROVE permission
    const teacherReviewRes = await request(app)
      .post(`/api/v1/attendance/corrections/${correctionRequestId}/review`)
      .set('Authorization', `Bearer ${homeroomTeacherToken}`)
      .send({ status: 'APPROVED' });
    expect(teacherReviewRes.status).toBe(403);

    // 2. Principal requests a correction and tries to self-approve it (Maker-Checker violation)
    const principalReq = await request(app)
      .post('/api/v1/attendance/corrections')
      .set('Authorization', `Bearer ${principalToken}`)
      .send({
        attendanceRecordId,
        requestedStatus: 'LATE',
        reason: 'Principal correction request for self-approval check',
      });
    const principalCorrId = principalReq.body.data.id;

    const selfApproveRes = await request(app)
      .post(`/api/v1/attendance/corrections/${principalCorrId}/review`)
      .set('Authorization', `Bearer ${principalToken}`)
      .send({ status: 'APPROVED' });

    expect(selfApproveRes.status).toBe(403);
    expect(selfApproveRes.body.error.message).toContain('Maker-Checker violation');
  });

  it('POST /api/v1/attendance/corrections/:id/review allows Principal to approve and update record', async () => {
    const res = await request(app)
      .post(`/api/v1/attendance/corrections/${correctionRequestId}/review`)
      .set('Authorization', `Bearer ${principalToken}`)
      .send({ status: 'APPROVED' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('APPROVED');

    // Verify underlying record status updated to EXCUSED
    const updatedRecord = await prisma.attendanceRecord.findUnique({
      where: { id: attendanceRecordId },
    });
    expect(updatedRecord?.status).toBe('EXCUSED');
  });

  it('POST /api/v1/communication/announcements publishes institutional notice', async () => {
    const res = await request(app)
      .post('/api/v1/communication/announcements')
      .set('Authorization', `Bearer ${principalToken}`)
      .send({
        title: 'Fall Semester Parent-Teacher Conference',
        content: 'Conferences are scheduled for next Friday starting at 9:00 AM.',
        isPinned: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toContain('Parent-Teacher Conference');
  });

  it('marks, retrieves, and approves a correction for subject-period attendance', async () => {
    const date = '2026-10-24';
    const marked = await request(app).post('/api/v1/attendance/subjects/mark')
      .set('Authorization', `Bearer ${homeroomTeacherToken}`)
      .send({ sectionId, subjectId: mathSubjectId, date, periodNumber: 3, records: [{ studentId: studentAliceId, status: 'PRESENT' }] });
    expect(marked.status).toBe(201);
    const subjectRecordId = marked.body.data[0].id;
    const persisted = await prisma.subjectAttendanceRecord.findUnique({ where: { id: subjectRecordId } });
    expect(persisted?.lockedAt).toBeTruthy();

    const parentView = await request(app).get(`/api/v1/attendance/subjects?studentId=${studentAliceId}&startDate=${date}&endDate=${date}`)
      .set('Authorization', `Bearer ${parentToken}`);
    expect(parentView.status).toBe(200);
    expect(parentView.body.data.some((row: any) => row.id === subjectRecordId && row.periodNumber === 3)).toBe(true);

    const correction = await request(app).post('/api/v1/attendance/corrections')
      .set('Authorization', `Bearer ${homeroomTeacherToken}`)
      .send({ subjectAttendanceRecordId: subjectRecordId, requestedStatus: 'LATE', reason: 'Student arrived after the period began' });
    expect(correction.status).toBe(201);

    const duplicate = await request(app).post('/api/v1/attendance/corrections')
      .set('Authorization', `Bearer ${homeroomTeacherToken}`)
      .send({ subjectAttendanceRecordId: subjectRecordId, requestedStatus: 'ABSENT', reason: 'Duplicate pending request' });
    expect(duplicate.status).toBe(409);

    const reviewed = await request(app).post(`/api/v1/attendance/corrections/${correction.body.data.id}/review`)
      .set('Authorization', `Bearer ${principalToken}`).send({ status: 'APPROVED' });
    expect(reviewed.status).toBe(200);
    expect((await prisma.subjectAttendanceRecord.findUnique({ where: { id: subjectRecordId } }))?.status).toBe('LATE');
  });

  it('accepts a linked guardian absence explanation once and applies the approved excuse', async () => {
    const date = '2026-10-25';
    const marked = await request(app).post('/api/v1/attendance/mark')
      .set('Authorization', `Bearer ${homeroomTeacherToken}`)
      .send({ sectionId, date, records: [{ studentId: studentAliceId, status: 'ABSENT' }] });
    expect(marked.status).toBe(201);
    const recordId = marked.body.data[0].id;
    const explanation = await request(app).post('/api/v1/attendance/justifications')
      .set('Authorization', `Bearer ${parentToken}`).send({ attendanceRecordId: recordId, reason: 'Student was ill and attended a clinic' });
    expect(explanation.status).toBe(201);
    expect(explanation.body.data.status).toBe('PENDING');
    const duplicate = await request(app).post('/api/v1/attendance/justifications')
      .set('Authorization', `Bearer ${parentToken}`).send({ attendanceRecordId: recordId, reason: 'A second explanation attempt' });
    expect(duplicate.status).toBe(409);
    const reviewed = await request(app).post(`/api/v1/attendance/corrections/${explanation.body.data.id}/review`)
      .set('Authorization', `Bearer ${principalToken}`).send({ status: 'APPROVED' });
    expect(reviewed.status).toBe(200);
    expect((await prisma.attendanceRecord.findUnique({ where: { id: recordId } }))?.status).toBe('EXCUSED');
  });

  it('submits and approves staff leave and persists the decision', async () => {
    const submitted = await request(app).post('/api/v1/hr/requests')
      .set('Authorization', `Bearer ${homeroomTeacherToken}`)
      .send({ leaveType: 'SICK', startDate: '2026-11-01', endDate: '2026-11-02', reason: 'Medical rest advised by physician' });
    expect(submitted.status).toBe(201);
    const reviewed = await request(app).post(`/api/v1/hr/requests/${submitted.body.data.id}/review`)
      .set('Authorization', `Bearer ${principalToken}`).send({ status: 'APPROVED' });
    expect(reviewed.status).toBe(200);
    expect((await prisma.staffLeaveRequest.findUnique({ where: { id: submitted.body.data.id } }))?.status).toBe('APPROVED');
  });
});
