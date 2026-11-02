import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/utils/prisma';
import { Express } from 'express';

describe('Subject Attendance (No Periods) & Verification Suite', () => {
  let app: Express;
  let teacherToken: string;
  let teacherUserId: string;
  let principalToken: string;
  let parentToken: string;
  let studentAliceId: string;
  let sectionId: string;
  let mathSubjectId: string;
  let unassignedSubjectId: string;
  let institutionId: string;
  let subjectAttendanceRecordId: string;

  beforeAll(async () => {
    app = createApp();
    await prisma.$connect();

    // 1. Log in Homeroom/Subject Teacher
    const tLogin = await request(app).post('/api/v1/auth/login').send({
      usernameOrEmail: 'teacher.homeroom@alpha.edu',
      password: 'Password123!',
    });
    teacherToken = tLogin.body.data.accessToken;
    teacherUserId = tLogin.body.data.user.id;

    // 2. Log in Principal (Checker)
    const pLogin = await request(app).post('/api/v1/auth/login').send({
      usernameOrEmail: 'principal@alpha.edu',
      password: 'Password123!',
    });
    principalToken = pLogin.body.data.accessToken;

    // 3. Log in Parent John
    const prLogin = await request(app).post('/api/v1/auth/login').send({
      usernameOrEmail: 'parent.john@alpha.edu',
      password: 'Password123!',
    });
    parentToken = prLogin.body.data.accessToken;

    // 4. Retrieve Student Alice, Section, and Subjects
    const alice = await prisma.studentProfile.findFirstOrThrow({
      where: { admissionNumber: 'ADM-2026-001' },
      include: { section: true },
    });
    studentAliceId = alice.id;
    sectionId = alice.sectionId;
    institutionId = alice.institutionId;

    const math = await prisma.subject.findFirstOrThrow({
      where: { code: 'MATH-101', institutionId },
    });
    mathSubjectId = math.id;

    // Find or create an unassigned subject in this institution to test authorization
    let unassigned = await prisma.subject.findFirst({
      where: {
        institutionId,
        id: { not: mathSubjectId },
        teacherAssignments: { none: { teacher: { user: { email: 'teacher.homeroom@alpha.edu' } } } },
      },
    });
    if (!unassigned) {
      unassigned = await prisma.subject.create({
        data: {
          institutionId,
          name: 'Unassigned Test Subject',
          code: 'UNASSIGNED-999',
        },
      });
    }
    unassignedSubjectId = unassigned.id;

    // Ensure teacher is assigned to Math in Section A
    const teacherProfile = await prisma.teacherProfile.findFirstOrThrow({
      where: { user: { email: 'teacher.homeroom@alpha.edu' } },
    });
    const term = await prisma.academicTerm.findFirstOrThrow({
      where: { academicYear: { institutionId } },
    });
    const existingAssignment = await prisma.teacherAssignment.findFirst({
      where: {
        teacherId: teacherProfile.id,
        subjectId: mathSubjectId,
        sectionId,
      },
    });
    if (!existingAssignment) {
      await prisma.teacherAssignment.create({
        data: {
          teacherId: teacherProfile.id,
          subjectId: mathSubjectId,
          sectionId,
          academicTermId: term.id,
        },
      });
    }

    // Clean up test records on test dates to ensure clean run
    const dateRange = {
      gte: new Date('2026-11-09T00:00:00.000Z'),
      lte: new Date('2026-11-15T23:59:59.000Z'),
    };
    await prisma.attendanceCorrection.deleteMany({
      where: {
        subjectAttendanceRecord: {
          date: dateRange,
        },
      },
    });
    await prisma.subjectAttendanceRecord.deleteMany({
      where: {
        date: dateRange,
      },
    });
    await prisma.attendanceRecord.deleteMany({
      where: {
        date: dateRange,
      },
    });
  });

  afterAll(async () => {
    // Clean up test records created during test
    const dateRange = {
      gte: new Date('2026-11-09T00:00:00.000Z'),
      lte: new Date('2026-11-15T23:59:59.000Z'),
    };
    await prisma.attendanceCorrection.deleteMany({
      where: {
        subjectAttendanceRecord: {
          date: dateRange,
        },
      },
    });
    await prisma.subjectAttendanceRecord.deleteMany({
      where: {
        date: dateRange,
      },
    });
    await prisma.attendanceRecord.deleteMany({
      where: {
        date: dateRange,
      },
    });
    await prisma.$disconnect();
  });

  it('1. Teacher can view subject roster without specifying a period', async () => {
    const res = await request(app)
      .get(`/api/v1/attendance/sections/${sectionId}/subject-roster`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .query({
        subjectId: mathSubjectId,
        date: '2026-11-10',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);

    // Verify Alice is in roster
    const aliceInRoster = res.body.data.find((s: any) => s.id === studentAliceId);
    expect(aliceInRoster).toBeDefined();
    expect(aliceInRoster.admissionNumber).toBe('ADM-2026-001');
    expect(aliceInRoster.attendance).toBeNull(); // not yet marked
  });

  it('2. Teacher cannot access or submit attendance for unassigned subject (403 Forbidden)', async () => {
    // Unassigned roster query
    const rosterRes = await request(app)
      .get(`/api/v1/attendance/sections/${sectionId}/subject-roster`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .query({
        subjectId: unassignedSubjectId,
        date: '2026-11-10',
      });
    expect(rosterRes.status).toBe(403);

    // Unassigned submit attempt
    const submitRes = await request(app)
      .post('/api/v1/attendance/subjects/mark')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        sectionId,
        subjectId: unassignedSubjectId,
        date: '2026-11-10',
        records: [{ studentId: studentAliceId, status: 'PRESENT' }],
      });
    expect(submitRes.status).toBe(403);
  });

  it('3. Teacher can submit subject attendance without period and it saves successfully', async () => {
    const res = await request(app)
      .post('/api/v1/attendance/subjects/mark')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        sectionId,
        subjectId: mathSubjectId,
        date: '2026-11-10',
        records: [
          {
            studentId: studentAliceId,
            status: 'PRESENT',
            remarks: 'On time for math',
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].status).toBe('PRESENT');
    expect(res.body.data[0].lockedAt).toBeTruthy();
    subjectAttendanceRecordId = res.body.data[0].id;

    // Verify database record has default periodNumber 1 and unique record exists
    const dbRecord = await prisma.subjectAttendanceRecord.findUnique({
      where: {
        studentId_date_subjectId: {
          studentId: studentAliceId,
          date: new Date('2026-11-10'),
          subjectId: mathSubjectId,
        },
      },
    });
    expect(dbRecord).toBeDefined();
    expect(dbRecord!.status).toBe('PRESENT');
    expect(dbRecord!.lockedAt).not.toBeNull();
  });

  it('4. Duplicate submissions are rejected safely (409 Conflict)', async () => {
    // Attempting to submit attendance for the same subject, section, and date again
    const res = await request(app)
      .post('/api/v1/attendance/subjects/mark')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        sectionId,
        subjectId: mathSubjectId,
        date: '2026-11-10',
        records: [
          {
            studentId: studentAliceId,
            status: 'ABSENT',
          },
        ],
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('already been submitted and is locked');
  });

  it('5. Duplicate student rows in payload are rejected safely (400 Bad Request)', async () => {
    const res = await request(app)
      .post('/api/v1/attendance/subjects/mark')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        sectionId,
        subjectId: mathSubjectId,
        date: '2026-11-11',
        records: [
          { studentId: studentAliceId, status: 'PRESENT' },
          { studentId: studentAliceId, status: 'ABSENT' },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message || JSON.stringify(res.body)).toContain('A student may appear only once');
  });

  it('6. Duplicate students and test artifacts do not appear in roster', async () => {
    const res = await request(app)
      .get(`/api/v1/attendance/sections/${sectionId}/subject-roster`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .query({
        subjectId: mathSubjectId,
        date: '2026-11-10',
      });

    expect(res.status).toBe(200);
    const students = res.body.data;
    const studentIds = students.map((s: any) => s.id);
    const uniqueStudentIds = Array.from(new Set(studentIds));

    // Must have no duplicates
    expect(studentIds.length).toBe(uniqueStudentIds.length);

    // Must not have test artifacts
    for (const student of students) {
      expect(student.admissionNumber).not.toMatch(/^ADM-AUTO/);
      expect(student.user.firstName).not.toMatch(/^Child/);
    }
  });

  it('7. Correction approval workflow (Maker-Checker) works without period', async () => {
    // Teacher requests correction
    const reqRes = await request(app)
      .post('/api/v1/attendance/corrections')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        subjectAttendanceRecordId,
        requestedStatus: 'LATE',
        reason: 'Student arrived 15 minutes late after traffic delay',
      });

    expect(reqRes.status).toBe(201);
    expect(reqRes.body.success).toBe(true);
    const correctionId = reqRes.body.data.id;

    // Self-approval prevented (Maker cannot be Checker)
    const selfApproveRes = await request(app)
      .post(`/api/v1/attendance/corrections/${correctionId}/review`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        status: 'APPROVED',
      });
    expect(selfApproveRes.status).toBe(403);
    expect(selfApproveRes.body.error.message).toContain('Maker-Checker violation');

    // Principal (Checker) approves correction
    const approveRes = await request(app)
      .post(`/api/v1/attendance/corrections/${correctionId}/review`)
      .set('Authorization', `Bearer ${principalToken}`)
      .send({
        status: 'APPROVED',
      });
    expect(approveRes.status).toBe(200);

    // Verify record in DB is now updated to LATE
    const updatedDbRecord = await prisma.subjectAttendanceRecord.findUnique({
      where: { id: subjectAttendanceRecordId },
    });
    expect(updatedDbRecord!.status).toBe('LATE');
  });

  it('8. Parent data isolation: parent only sees linked child records', async () => {
    const parentRes = await request(app)
      .get('/api/v1/attendance/subjects')
      .set('Authorization', `Bearer ${parentToken}`)
      .query({ startDate: '2026-11-10', endDate: '2026-11-10' });

    expect(parentRes.status).toBe(200);
    expect(Array.isArray(parentRes.body.data)).toBe(true);

    // Every record in parent's history must belong to Alice
    for (const record of parentRes.body.data) {
      expect(record.student.admissionNumber).toBe('ADM-2026-001');
    }
  });

  it('9. Homeroom attendance still works independently alongside subject attendance', async () => {
    // Teacher marks homeroom attendance for the same date
    const homeroomRes = await request(app)
      .post('/api/v1/attendance/mark')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        sectionId,
        date: '2026-11-10',
        records: [
          {
            studentId: studentAliceId,
            status: 'PRESENT',
            remarks: 'Morning homeroom roll call',
          },
        ],
      });

    expect(homeroomRes.status).toBe(201);
    expect(homeroomRes.body.data.length).toBe(1);

    // Verify both records exist simultaneously
    const homeroomRecord = await prisma.attendanceRecord.findFirst({
      where: { studentId: studentAliceId, date: new Date('2026-11-10') },
    });
    const subjectRecord = await prisma.subjectAttendanceRecord.findUnique({
      where: {
        studentId_date_subjectId: {
          studentId: studentAliceId,
          date: new Date('2026-11-10'),
          subjectId: mathSubjectId,
        },
      },
    });

    expect(homeroomRecord).not.toBeNull();
    expect(subjectRecord).not.toBeNull();
    expect(homeroomRecord!.sectionId).toBe(sectionId);
    expect(subjectRecord!.subjectId).toBe(mathSubjectId);
  });

  it('10. Historical attendance records with period numbers remain fully accessible', async () => {
    // Create a simulated historical record with periodNumber: 4
    const historicalRecord = await prisma.subjectAttendanceRecord.create({
      data: {
        institutionId,
        sectionId,
        subjectId: mathSubjectId,
        studentId: studentAliceId,
        date: new Date('2026-11-12'),
        periodNumber: 4,
        status: 'EXCUSED',
        remarks: 'Historical archive test record with period 4',
        lockedAt: new Date(),
        markedByUserId: teacherUserId,
      },
    });

    // Query subject history for that date
    const historyRes = await request(app)
      .get('/api/v1/attendance/subjects')
      .set('Authorization', `Bearer ${teacherToken}`)
      .query({ startDate: '2026-11-12', endDate: '2026-11-12' });

    expect(historyRes.status).toBe(200);
    const found = historyRes.body.data.find((r: any) => r.id === historicalRecord.id);
    expect(found).toBeDefined();
    expect(found.status).toBe('EXCUSED');
    expect(found.subject.name).toBe('Advanced Mathematics');
  });
});
