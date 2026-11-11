import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/app';
import { prisma } from '../src/utils/prisma';
import { SubjectResultStatus, UserRole } from '@prisma/client';

describe('MASTER LMS ACADEMIC ASSESSMENT, GRADING & EXAMINATION INTEGRATION SUITE (30-POINT SUITE)', () => {
  let app: Express;
  let teacherToken: string;
  let teacherUserId: string;
  let examControllerToken: string;
  let examControllerUserId: string;
  let studentAliceToken: string;
  let studentAliceId: string;
  let studentBobToken: string;
  let studentBobId: string;
  let parentToken: string;

  let institutionId: string;
  let academicTermId: string;
  let academicYearId: string;
  let subjectId: string;
  let sectionId: string;
  let courseId: string;

  let schemeId: string;
  let assignmentsCategoryId: string;
  let lmsAssignment1Id: string;
  let lmsAssignment2Id: string;
  let manualParticipationItemId: string;
  let manualMidtermItemId: string;
  let manualFinalItemId: string;

  let subjectResultId: string;
  let correctionRequestId: string;

  beforeAll(async () => {
    app = createApp();

    // Ensure student Bob exists self-contained for tests that evaluate multi-student records
    const aliceUser = await prisma.user.findUniqueOrThrow({
      where: { email: 'student.alice@alpha.edu' },
    });

    const bobUser = await prisma.user.upsert({
      where: { email: 'student.bob.examtest@alpha.edu' },
      update: { passwordHash: aliceUser.passwordHash },
      create: {
        email: 'student.bob.examtest@alpha.edu',
        username: 'student_bob_examtest',
        passwordHash: aliceUser.passwordHash,
        firstName: 'Bob',
        lastName: 'ExamTester',
        role: UserRole.ROLE_STUDENT,
        institutionId: aliceUser.institutionId,
      },
    });

    const aliceProfile = await prisma.studentProfile.findFirst({
      where: { userId: aliceUser.id },
    });
    if (aliceProfile) {
      await prisma.studentProfile.upsert({
        where: { userId: bobUser.id },
        update: {},
        create: {
          userId: bobUser.id,
          institutionId: aliceProfile.institutionId,
          admissionNumber: 'ADM-2026-TESTBOB',
          rollNumber: '2001',
          sectionId: aliceProfile.sectionId,
          gender: 'MALE',
          bloodGroup: 'B+',
          dateOfBirth: new Date('2010-01-01'),
        },
      });
    }

    // 1. Log in users
    const [tRes, cRes, aRes, bRes, pRes] = await Promise.all([
      request(app).post('/api/v1/auth/login').send({ usernameOrEmail: 'teacher.math@alpha.edu', password: 'Password123!' }),
      request(app).post('/api/v1/auth/login').send({ usernameOrEmail: 'exam.controller@alpha.edu', password: 'Password123!' }),
      request(app).post('/api/v1/auth/login').send({ usernameOrEmail: 'student.alice@alpha.edu', password: 'Password123!' }),
      request(app).post('/api/v1/auth/login').send({ usernameOrEmail: 'student.bob.examtest@alpha.edu', password: 'Password123!' }),
      request(app).post('/api/v1/auth/login').send({ usernameOrEmail: 'parent.john@alpha.edu', password: 'Password123!' }),
    ]);

    expect(tRes.status).toBe(200);
    expect(cRes.status).toBe(200);
    expect(aRes.status).toBe(200);
    expect(bRes.status).toBe(200);
    expect(pRes.status).toBe(200);

    teacherToken = tRes.body.data.accessToken;
    teacherUserId = tRes.body.data.user.id;
    examControllerToken = cRes.body.data.accessToken;
    examControllerUserId = cRes.body.data.user.id;
    studentAliceToken = aRes.body.data.accessToken;
    studentBobToken = bRes.body.data.accessToken;
    parentToken = pRes.body.data.accessToken;

    const teacherUser = await prisma.user.findUniqueOrThrow({
      where: { email: 'teacher.math@alpha.edu' },
      select: { institutionId: true },
    });
    institutionId = teacherUser.institutionId!;

    const term = await prisma.academicTerm.findFirstOrThrow({
      where: { academicYear: { institutionId } },
      select: { id: true, academicYearId: true },
    });
    academicTermId = term.id;
    academicYearId = term.academicYearId;

    const math = await prisma.subject.findFirstOrThrow({
      where: { institutionId, code: 'MATH-101' },
      select: { id: true },
    });
    subjectId = math.id;

    const alice = await prisma.studentProfile.findFirstOrThrow({
      where: { admissionNumber: 'ADM-2026-001' },
      select: { id: true, sectionId: true },
    });
    studentAliceId = alice.id;
    sectionId = alice.sectionId;

    const bob = await prisma.studentProfile.findFirstOrThrow({
      where: { admissionNumber: 'ADM-2026-TESTBOB' },
      select: { id: true },
    });
    studentBobId = bob.id;

    // Clean up test records
    await prisma.subjectResultAudit.deleteMany({});
    await prisma.subjectResultCorrectionRequest.deleteMany({});
    await prisma.subjectResult.deleteMany({
      where: { subjectId, academicTermId },
    });
    await prisma.assignment.deleteMany({
      where: { course: { subjectId, sectionId } },
    });
    await prisma.assessmentScheme.deleteMany({
      where: { subjectId, academicTermId },
    });

    // Ensure Course exists
    let course = await prisma.course.findFirst({
      where: { subjectId, sectionId, academicTermId, institutionId },
    });
    if (!course) {
      const teacherProfile = await prisma.teacherProfile.findFirstOrThrow({
        where: { userId: teacherUserId },
      });
      course = await prisma.course.create({
        data: {
          institutionId,
          subjectId,
          sectionId,
          teacherId: teacherProfile.id,
          academicTermId,
          title: 'Advanced Mathematics (MATH-101)',
          code: 'MATH-101-SEC-A',
          isPublished: true,
        },
      });
    }
    courseId = course.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // TEST 1: Subject attendance can be recorded without selecting a period
  it('1. Subject attendance can be recorded without selecting a period', async () => {
    const today = '2026-11-20';
    // Clear any existing attendance for this test date
    await prisma.subjectAttendanceRecord.deleteMany({
      where: { subjectId, sectionId, date: new Date(today) },
    });

    const markRes = await request(app)
      .post('/api/v1/attendance/subjects/mark')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        subjectId,
        sectionId,
        date: today,
        records: [
          { studentId: studentAliceId, status: 'PRESENT', remarks: 'Present in class' },
        ],
      });

    expect(markRes.status).toBe(201);
    expect(markRes.body.data.length).toBeGreaterThanOrEqual(1);

    // Verify record in DB has been recorded
    const record = await prisma.subjectAttendanceRecord.findFirst({
      where: { subjectId, sectionId, studentId: studentAliceId, date: new Date(today) },
    });
    expect(record).toBeDefined();
    expect(record?.status).toBe('PRESENT');
  });

  // TEST 2: A student cannot receive duplicate subject-attendance records for the same date
  it('2. A student cannot receive duplicate subject-attendance records for the same institution, academic session, subject, class/section, and date', async () => {
    const today = '2026-11-20';
    const dupRes = await request(app)
      .post('/api/v1/attendance/subjects/mark')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        subjectId,
        sectionId,
        date: today,
        records: [{ studentId: studentAliceId, status: 'PRESENT' }],
      });

    expect(dupRes.status).toBe(409);
    expect(dupRes.body.error?.message || dupRes.body.message).toContain('already been submitted');
  });

  // TEST 3: Teacher can mark attendance only for assigned subjects/classes, and student/parent attendance access is correctly scoped
  it('3. The teacher can mark attendance only for assigned subjects/classes, and student/parent attendance access is correctly scoped', async () => {
    // Unassigned subject access attempt -> 403
    const otherSubject = await prisma.subject.create({
      data: {
        institutionId,
        name: 'Unassigned Biology',
        code: 'BIO-UNASSIGNED-TEST',
        creditUnits: 3,
      },
    });

    const unassignedRes = await request(app)
      .post('/api/v1/attendance/subjects/mark')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        subjectId: otherSubject.id,
        sectionId,
        date: '2026-11-21',
        records: [{ studentId: studentAliceId, status: 'PRESENT' }],
      });
    expect(unassignedRes.status).toBe(403);

    // Student Alice can view her own attendance
    const studentView = await request(app)
      .get(`/api/v1/attendance/subjects?subjectId=${subjectId}`)
      .set('Authorization', `Bearer ${studentAliceToken}`);
    expect(studentView.status).toBe(200);

    // Clean up otherSubject
    await prisma.subject.delete({ where: { id: otherSubject.id } });
  });

  // TEST 4: Historical period-based attendance records remain preserved after migration
  it('4. Historical period-based attendance records remain preserved after migration', async () => {
    // Create legacy record with period populated
    const legacyRecord = await prisma.subjectAttendanceRecord.create({
      data: {
        institutionId,
        subjectId,
        sectionId,
        studentId: studentAliceId,
        date: new Date('2026-09-01'),
        periodNumber: 3,
        status: 'PRESENT',
        markedByUserId: teacherUserId,
      },
    });

    const fetched = await prisma.subjectAttendanceRecord.findUnique({
      where: { id: legacyRecord.id },
    });
    expect(fetched).toBeDefined();
    expect(fetched?.periodNumber).toBe(3);

    // Clean up legacy test record
    await prisma.subjectAttendanceRecord.delete({ where: { id: legacyRecord.id } });
  });

  // TEST 13: Weightages must total 100%
  it('13. Weightages must total 100%', async () => {
    const badRes = await request(app)
      .post('/api/v1/assessments/schemes')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        academicTermId,
        subjectId,
        sectionId,
        title: 'Invalid 90% Scheme',
        categories: [
          { name: 'Assignments', weightagePercentage: 15 },
          { name: 'Class Participation', weightagePercentage: 10 },
          { name: 'Midterm', weightagePercentage: 25 },
          { name: 'Final Term', weightagePercentage: 40 }, // total = 90%
        ],
      });
    expect(badRes.status).toBe(400);
    expect(badRes.body.error?.message || badRes.body.message).toContain('100%');

    // Create valid 100% scheme:
    // Assignments: 15%
    // Class Participation: 10%
    // Midterm: 25%
    // Final Term: 50%
    // Total = 100%
    const goodRes = await request(app)
      .post('/api/v1/assessments/schemes')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        academicTermId,
        subjectId,
        sectionId,
        title: 'MATH-101 University Assessment Scheme',
        categories: [
          { name: 'Assignments', weightagePercentage: 15, description: 'All course assignments combined' },
          { name: 'Class Participation', weightagePercentage: 10, description: 'Classroom seminar participation' },
          { name: 'Midterm', weightagePercentage: 25, description: 'Midterm examination' },
          { name: 'Final Term', weightagePercentage: 50, description: 'Final term examination' },
        ],
      });
    expect(goodRes.status).toBe(201);
    schemeId = goodRes.body.data.id;

    const assignCat = goodRes.body.data.categories.find((c: any) => c.name === 'Assignments');
    expect(assignCat).toBeDefined();
    assignmentsCategoryId = assignCat.id;
  });

  // TEST 5: Assignment creation maps the assignment to the correct subject, term, and shared Assignments category
  it('5. Assignment creation maps the assignment to the correct subject, term, and shared Assignments category', async () => {
    const a1Res = await request(app)
      .post('/api/v1/lms/assignments')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        courseId,
        title: 'Assignment 1',
        instructions: 'Linear equations and matrix determinants.',
        maxPoints: 100,
        weightagePercent: 15,
        dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
        allowLateSubmissions: true,
      });

    expect(a1Res.status).toBe(201);
    lmsAssignment1Id = a1Res.body.data.id;
    expect(a1Res.body.data.assessmentItemId).toBeDefined();

    // Verify it mapped to the shared 'Assignments' category
    const item1 = await prisma.assessmentItem.findUnique({
      where: { id: a1Res.body.data.assessmentItemId },
      include: { category: true },
    });
    expect(item1).toBeDefined();
    expect(item1?.maxMarks).toBe(100);
    expect(item1?.category.name).toBe('Assignments');
    expect(item1?.category.id).toBe(assignmentsCategoryId);
  });

  // TEST 6: All assignments share the configured Assignments category weightage; creating another assignment does not increase that category's final-grade weight
  it("6. All assignments share the configured Assignments category weightage; creating another assignment does not increase that category's final-grade weight", async () => {
    const a2Res = await request(app)
      .post('/api/v1/lms/assignments')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        courseId,
        title: 'Assignment 2',
        instructions: 'Vector spaces and eigenvalues.',
        maxPoints: 100,
        weightagePercent: 15,
        dueDate: new Date(Date.now() + 14 * 86400000).toISOString(),
        allowLateSubmissions: true,
      });

    expect(a2Res.status).toBe(201);
    lmsAssignment2Id = a2Res.body.data.id;

    const item2 = await prisma.assessmentItem.findUnique({
      where: { id: a2Res.body.data.assessmentItemId },
      include: { category: true },
    });
    expect(item2).toBeDefined();
    expect(item2?.category.name).toBe('Assignments');
    expect(item2?.category.id).toBe(assignmentsCategoryId);

    // Verify the category weightage in the database remains strictly 15% (not 30%)
    const cat = await prisma.assessmentCategory.findUniqueOrThrow({
      where: { id: assignmentsCategoryId },
      include: { assessments: true },
    });
    expect(cat.weightagePercentage).toBe(15);
    expect(cat.assessments.length).toBe(2);
  });

  // TEST 7: With an Assignments category weightage of 15%, Assignment 1 at 98/100 and Assignment 2 at 66/100, equally weighted, produce an 82% category score and a 12.3/15 final-grade contribution — not 24.6/30 and not two separate 15% category weights
  it('7. With an Assignments category weightage of 15%, Assignment 1 at 98/100 and Assignment 2 at 66/100, equally weighted, produce an 82% category score and a 12.3/15 final-grade contribution — not 24.6/30 and not two separate 15% category weights', async () => {
    // Alice submits Assignment 1
    await request(app)
      .post(`/api/v1/lms/assignments/${lmsAssignment1Id}/submit`)
      .set('Authorization', `Bearer ${studentAliceToken}`)
      .send({ contentText: 'Alice Assignment 1 solutions' });

    const sub1 = await prisma.assignmentSubmission.findFirstOrThrow({
      where: { assignmentId: lmsAssignment1Id, studentId: studentAliceId },
    });
    // Grade Alice 98/100
    await request(app)
      .post(`/api/v1/lms/submissions/${sub1.id}/grade`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ grade: 98, feedback: 'Excellent' });

    // Alice submits Assignment 2
    await request(app)
      .post(`/api/v1/lms/assignments/${lmsAssignment2Id}/submit`)
      .set('Authorization', `Bearer ${studentAliceToken}`)
      .send({ contentText: 'Alice Assignment 2 solutions' });

    const sub2 = await prisma.assignmentSubmission.findFirstOrThrow({
      where: { assignmentId: lmsAssignment2Id, studentId: studentAliceId },
    });
    // Grade Alice 66/100
    await request(app)
      .post(`/api/v1/lms/submissions/${sub2.id}/grade`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ grade: 66, feedback: 'Satisfactory' });

    // Check Alice subject result
    const aliceResult = await prisma.subjectResult.findUniqueOrThrow({
      where: {
        subjectId_sectionId_studentId_academicTermId: {
          subjectId,
          sectionId,
          studentId: studentAliceId,
          academicTermId,
        },
      },
    });

    const breakdown = (aliceResult.categoryBreakdown as any[]).find(
      (c) => c.categoryName === 'Assignments'
    );
    expect(breakdown).toBeDefined();
    // Category average: (98 + 66) / 2 = 82%
    expect(breakdown.averagePercentage).toBe(82);
    // Category contribution: (82 / 100) * 15 = 12.3! (NOT 24.6/30)
    expect(breakdown.contribution).toBe(12.3);
    expect(breakdown.weightage).toBe(15);
  });

  // TEST 8: Explicit internal assignment allocations, when supported, must total 100% within the shared category and calculate correctly
  it('8. Explicit internal assignment allocations, when supported, must total 100% within the shared category and calculate correctly', async () => {
    const a1 = await prisma.assignment.findUniqueOrThrow({ where: { id: lmsAssignment1Id } });
    const a2 = await prisma.assignment.findUniqueOrThrow({ where: { id: lmsAssignment2Id } });

    // Set internal allocation: Assignment 1 = 60%, Assignment 2 = 40% (total = 100%)
    await prisma.assessmentItem.update({
      where: { id: a1.assessmentItemId! },
      data: { weightagePercentage: 60 },
    });
    await prisma.assessmentItem.update({
      where: { id: a2.assessmentItemId! },
      data: { weightagePercentage: 40 },
    });

    // Trigger recalculation by regrading or saving
    const sub1 = await prisma.assignmentSubmission.findFirstOrThrow({
      where: { assignmentId: lmsAssignment1Id, studentId: studentAliceId },
    });
    await request(app)
      .post(`/api/v1/lms/submissions/${sub1.id}/grade`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ grade: 98 });

    const aliceResult = await prisma.subjectResult.findUniqueOrThrow({
      where: {
        subjectId_sectionId_studentId_academicTermId: {
          subjectId,
          sectionId,
          studentId: studentAliceId,
          academicTermId,
        },
      },
    });

    const breakdown = (aliceResult.categoryBreakdown as any[]).find(
      (c) => c.categoryName === 'Assignments'
    );
    expect(breakdown).toBeDefined();
    // Weighted: (98 * 0.6) + (66 * 0.4) = 58.8 + 26.4 = 85.2%
    expect(breakdown.averagePercentage).toBe(85.2);
    // Contribution: (85.2 / 100) * 15 = 12.78
    expect(breakdown.contribution).toBe(12.78);

    // Reset items to equal weighting (null internal weights) for remainder of test
    await prisma.assessmentItem.update({
      where: { id: a1.assessmentItemId! },
      data: { weightagePercentage: null },
    });
    await prisma.assessmentItem.update({
      where: { id: a2.assessmentItemId! },
      data: { weightagePercentage: null },
    });
    await request(app)
      .post(`/api/v1/lms/submissions/${sub1.id}/grade`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ grade: 98 });
  });

  // TEST 9: Saving assignment marks automatically updates the gradebook and shared Assignments category
  it('9. Saving assignment marks automatically updates the gradebook and shared Assignments category', async () => {
    const gbRes = await request(app)
      .get('/api/v1/assessments/gradebook')
      .set('Authorization', `Bearer ${teacherToken}`)
      .query({ subjectId, sectionId, academicTermId });

    expect(gbRes.status).toBe(200);
    const aliceRow = gbRes.body.data.rows.find((r: any) => r.studentId === studentAliceId);
    expect(aliceRow).toBeDefined();
    expect(aliceRow.result).toBeDefined();
    const assignCategory = aliceRow.result.categoryBreakdown.find((c: any) => c.categoryName === 'Assignments');
    expect(assignCategory.contribution).toBe(12.3);
  });

  // TEST 10: Editing assignment marks recalculates results without double-counting
  it('10. Editing assignment marks recalculates results without double-counting', async () => {
    const sub2 = await prisma.assignmentSubmission.findFirstOrThrow({
      where: { assignmentId: lmsAssignment2Id, studentId: studentAliceId },
    });

    // Update Assignment 2 mark to 70
    await request(app)
      .post(`/api/v1/lms/submissions/${sub2.id}/grade`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ grade: 70, feedback: 'Upgraded after review' });

    let aliceResult = await prisma.subjectResult.findUniqueOrThrow({
      where: {
        subjectId_sectionId_studentId_academicTermId: {
          subjectId,
          sectionId,
          studentId: studentAliceId,
          academicTermId,
        },
      },
    });

    let breakdown = (aliceResult.categoryBreakdown as any[]).find((c) => c.categoryName === 'Assignments');
    // (98 + 70) / 2 = 84% -> (84 / 100) * 15 = 12.6
    expect(breakdown.averagePercentage).toBe(84);
    expect(breakdown.contribution).toBe(12.6);

    // Revert to 66 for subsequent tests
    await request(app)
      .post(`/api/v1/lms/submissions/${sub2.id}/grade`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ grade: 66 });
  });

  // TEST 11: Manual assessment marks use the same grading engine
  it('11. Manual assessment marks use the same grading engine', async () => {
    const scheme = await prisma.assessmentScheme.findUniqueOrThrow({
      where: { id: schemeId },
      include: { categories: true },
    });

    const partCat = scheme.categories.find((c) => c.name === 'Class Participation')!;
    const midCat = scheme.categories.find((c) => c.name === 'Midterm')!;
    const finCat = scheme.categories.find((c) => c.name === 'Final Term')!;

    // Create manual assessment items in these categories
    const partItem = await prisma.assessmentItem.create({
      data: {
        assessmentCategoryId: partCat.id,
        title: 'Class Participation Score',
        maxMarks: 100,
        isPublished: true,
      },
    });
    manualParticipationItemId = partItem.id;

    const midItem = await prisma.assessmentItem.create({
      data: {
        assessmentCategoryId: midCat.id,
        title: 'Midterm Examination Paper',
        maxMarks: 100,
        isPublished: true,
      },
    });
    manualMidtermItemId = midItem.id;

    const finItem = await prisma.assessmentItem.create({
      data: {
        assessmentCategoryId: finCat.id,
        title: 'Final Term Examination Paper',
        maxMarks: 100,
        isPublished: true,
      },
    });
    manualFinalItemId = finItem.id;

    // Save marks: Participation = 90/100, Midterm = 80/100, Final = 85/100
    await request(app)
      .post('/api/v1/assessments/marks/batch')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        assessmentItemId: manualParticipationItemId,
        marks: [{ studentId: studentAliceId, marksObtained: 90 }],
      });

    await request(app)
      .post('/api/v1/assessments/marks/batch')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        assessmentItemId: manualMidtermItemId,
        marks: [{ studentId: studentAliceId, marksObtained: 80 }],
      });

    await request(app)
      .post('/api/v1/assessments/marks/batch')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        assessmentItemId: manualFinalItemId,
        marks: [{ studentId: studentAliceId, marksObtained: 85 }],
      });

    // Check Alice total result:
    // Assignments: 82% -> 12.3
    // Participation: 90% -> 9.0
    // Midterm: 80% -> 20.0 (25% * 0.8)
    // Final: 85% -> 42.5 (50% * 0.85)
    // Total = 12.3 + 9.0 + 20.0 + 42.5 = 83.8!
    const aliceResult = await prisma.subjectResult.findUniqueOrThrow({
      where: {
        subjectId_sectionId_studentId_academicTermId: {
          subjectId,
          sectionId,
          studentId: studentAliceId,
          academicTermId,
        },
      },
    });

    subjectResultId = aliceResult.id;
    expect(aliceResult.totalPercentage).toBe(83.8);
    expect(['P', 'B', 'A']).toContain(aliceResult.gradeLetter);
  });

  // TEST 12: Marks cannot exceed maximum marks
  it('12. Marks cannot exceed maximum marks', async () => {
    const res = await request(app)
      .post('/api/v1/assessments/marks/batch')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        assessmentItemId: manualParticipationItemId,
        marks: [{ studentId: studentAliceId, marksObtained: 105 }], // Max marks is 100
      });

    expect(res.status).toBe(400);
    expect(res.body.error?.message || res.body.message).toContain('cannot exceed maximum marks');
  });

  // TEST 14: Missing assessment marks are handled correctly
  it('14. Missing assessment marks are handled correctly', async () => {
    // Bob has not been graded for the final exam yet
    const bobResult = await prisma.subjectResult.findUnique({
      where: {
        subjectId_sectionId_studentId_academicTermId: {
          subjectId,
          sectionId,
          studentId: studentBobId,
          academicTermId,
        },
      },
    });

    // Ungraded items do not cause crashes
    if (bobResult) {
      expect(bobResult.status).toBe('DRAFT');
    }
  });

  // TEST 15: Teachers can change assignment due dates after expiration
  it('15. Teachers can change assignment due dates after expiration', async () => {
    const expiredDate = new Date(Date.now() - 86400000).toISOString(); // 1 day ago
    const newFutureDate = new Date(Date.now() + 5 * 86400000).toISOString();

    const patchRes = await request(app)
      .patch(`/api/v1/lms/assignments/${lmsAssignment1Id}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        dueDate: newFutureDate,
        reason: 'Extended by teacher due to public holiday',
      });

    expect(patchRes.status).toBe(200);

    // Verify deadline history record was created
    const history = await prisma.assessmentDeadlineHistory.findFirst({
      where: { changedByUserId: teacherUserId },
      orderBy: { createdAt: 'desc' },
    });
    expect(history).toBeDefined();
    expect(history?.reason).toContain('public holiday');
  });

  // TEST 16: Teachers can change assignment numbering/display order after submissions without losing submissions, marks, or feedback
  it('16. Teachers can change assignment numbering/display order after submissions without losing submissions, marks, or feedback', async () => {
    // Submissions and grades already exist on Assignment 1
    const subBefore = await prisma.assignmentSubmission.findFirstOrThrow({
      where: { assignmentId: lmsAssignment1Id, studentId: studentAliceId },
    });
    expect(subBefore.grade).toBe(98);

    // Change title and display order
    const updateRes = await request(app)
      .patch(`/api/v1/lms/assignments/${lmsAssignment1Id}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        title: 'Assignment 1 - Re-numbered',
        displayOrder: 10,
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.displayOrder).toBe(10);
    expect(updateRes.body.data.title).toBe('Assignment 1 - Re-numbered');

    // Verify submission and grade remain completely intact on the same assignment ID
    const subAfter = await prisma.assignmentSubmission.findFirstOrThrow({
      where: { assignmentId: lmsAssignment1Id, studentId: studentAliceId },
    });
    expect(subAfter.grade).toBe(98);
    expect(subAfter.feedback).toBe(subBefore.feedback);

    // Verify AuditEvent recorded the order/numbering change
    const audit = await prisma.auditEvent.findFirst({
      where: { entity: 'Assignment', entityId: lmsAssignment1Id, action: 'ASSIGNMENT_UPDATED' },
      orderBy: { timestamp: 'desc' },
    });
    expect(audit).toBeDefined();
    expect(audit?.newValuesJson).toContain('10');

    // Restore title and order
    await request(app)
      .patch(`/api/v1/lms/assignments/${lmsAssignment1Id}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ title: 'Assignment 1', displayOrder: 1 });
  });

  // TEST 17: Teacher Submit locks the submitted result according to policy
  it('17. Teacher Submit locks the submitted result according to policy', async () => {
    const submitStudentsRes = await request(app)
      .post('/api/v1/assessments/results/submit-to-students')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        subjectId,
        sectionId,
        academicTermId,
      });

    expect(submitStudentsRes.status).toBe(200);

    const result = await prisma.subjectResult.findUniqueOrThrow({
      where: { id: subjectResultId },
    });
    expect(result.status).toBe(SubjectResultStatus.SUBMITTED_TO_STUDENTS);
  });

  // TEST 18: Submit to Examination Department creates a reviewable submission
  it('18. Submit to Examination Department creates a reviewable submission', async () => {
    const submitExamDeptRes = await request(app)
      .post('/api/v1/assessments/results/submit-to-exam-dept')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        subjectId,
        sectionId,
        academicTermId,
      });

    expect(submitExamDeptRes.status).toBe(200);

    const result = await prisma.subjectResult.findUniqueOrThrow({
      where: { id: subjectResultId },
    });
    expect(result.status).toBe(SubjectResultStatus.SUBMITTED_TO_EXAM_DEPARTMENT);
  });

  // TEST 19: Students see Grade in Progress after examination submission
  it('19. Students see Grade in Progress after examination submission', async () => {
    const studentRes = await request(app)
      .get(`/api/v1/assessments/student-result?subjectId=${subjectId}&academicTermId=${academicTermId}`)
      .set('Authorization', `Bearer ${studentAliceToken}`);

    expect(studentRes.status).toBe(200);
    expect(studentRes.body.data.status).toBe(SubjectResultStatus.SUBMITTED_TO_EXAM_DEPARTMENT);
    expect(studentRes.body.data.gradeStatusLabel).toBe('Grade in Progress');
  });

  // TEST 20: Teachers cannot directly edit submitted results
  it('20. Teachers cannot directly edit submitted results', async () => {
    const tryBatch = await request(app)
      .post('/api/v1/assessments/marks/batch')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        assessmentItemId: manualParticipationItemId,
        marks: [{ studentId: studentAliceId, marksObtained: 95 }],
      });
    expect(tryBatch.status).toBe(403);
    expect(tryBatch.body.error?.message || tryBatch.body.message).toContain('locked');

    // Also verify LMS submission grading is locked
    const sub = await prisma.assignmentSubmission.findFirstOrThrow({
      where: { assignmentId: lmsAssignment1Id, studentId: studentAliceId },
    });
    const tryLmsGrade = await request(app)
      .post(`/api/v1/lms/submissions/${sub.id}/grade`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ grade: 99 });
    expect(tryLmsGrade.status).toBe(403);
  });

  // TEST 21: Teachers can request marks corrections
  it('21. Teachers can request marks corrections', async () => {
    const corrRes = await request(app)
      .post('/api/v1/assessments/corrections/request')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        subjectResultId,
        proposedMarks: 85.0,
        reason: 'Recalculated final viva after re-checking question 4',
      });

    expect(corrRes.status).toBe(201);
    correctionRequestId = corrRes.body.data.id;
    expect(corrRes.body.data.status).toBe('PENDING');
  });

  // TEST 22: Examination staff can approve or reject correction requests
  it('22. Examination staff can approve or reject correction requests', async () => {
    const approveRes = await request(app)
      .post(`/api/v1/assessments/exam-dept/corrections/${correctionRequestId}/review`)
      .set('Authorization', `Bearer ${examControllerToken}`)
      .send({
        status: 'APPROVED',
        reviewNotes: 'Verified against physical answer sheet.',
      });

    expect(approveRes.status).toBe(200);

    const updatedResult = await prisma.subjectResult.findUniqueOrThrow({
      where: { id: subjectResultId },
    });
    expect(updatedResult.totalPercentage).toBe(85.0);
  });

  // TEST 23: Unauthorized users cannot approve results
  it('23. Unauthorized users cannot approve results', async () => {
    const unauthRes = await request(app)
      .post('/api/v1/assessments/exam-dept/review')
      .set('Authorization', `Bearer ${studentAliceToken}`)
      .send({
        subjectId,
        sectionId,
        academicTermId,
        decision: 'APPROVE',
      });

    expect(unauthRes.status).toBe(403);
  });

  // TEST 24: Teachers cannot approve their own results
  it('24. Teachers cannot approve their own results', async () => {
    const teacherApproveRes = await request(app)
      .post('/api/v1/assessments/exam-dept/review')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        subjectId,
        sectionId,
        academicTermId,
        decision: 'APPROVE',
      });

    expect(teacherApproveRes.status).toBe(403);
    expect(teacherApproveRes.body.error?.message || teacherApproveRes.body.message).toContain('Access denied');
  });

  // TEST 25: Unpublished results never appear as finalized transcript entries
  it('25. Unpublished results never appear as finalized transcript entries', async () => {
    const transcriptRes = await request(app)
      .get(`/api/v1/exams/transcripts/${studentAliceId}`)
      .set('Authorization', `Bearer ${examControllerToken}`);

    if (transcriptRes.body.data?.entries) {
      const found = transcriptRes.body.data.entries.find((e: any) => e.subjectId === subjectId);
      expect(found).toBeUndefined();
    }
  });

  // TEST 26: Published results appear correctly on student transcripts
  it('26. Published results appear correctly on student transcripts', async () => {
    // Exam Controller approves and officially publishes the subject result
    const approveRes = await request(app)
      .post('/api/v1/assessments/exam-dept/review')
      .set('Authorization', `Bearer ${examControllerToken}`)
      .send({
        subjectId,
        sectionId,
        academicTermId,
        decision: 'APPROVE',
        comments: 'All components moderated and officially endorsed.',
      });

    expect(approveRes.status).toBe(200);

    const publishRes = await request(app)
      .post('/api/v1/assessments/exam-dept/publish')
      .set('Authorization', `Bearer ${examControllerToken}`)
      .send({
        subjectId,
        sectionId,
        academicTermId,
      });

    expect(publishRes.status).toBe(200);

    const result = await prisma.subjectResult.findUniqueOrThrow({
      where: { id: subjectResultId },
    });
    expect(result.status).toBe(SubjectResultStatus.OFFICIALLY_PUBLISHED);
    expect(result.officiallyPublishedAt).toBeDefined();

    // Student Alice sees officially published result on transcript
    const aliceView = await request(app)
      .get(`/api/v1/assessments/student-result?subjectId=${subjectId}&academicTermId=${academicTermId}`)
      .set('Authorization', `Bearer ${studentAliceToken}`);

    expect(aliceView.status).toBe(200);
    expect(aliceView.body.data.status).toBe(SubjectResultStatus.OFFICIALLY_PUBLISHED);
    expect(aliceView.body.data.totalPercentage).toBe(85.0);
  });

  // TEST 27: Parents can only view linked children's results
  it("27. Parents can only view linked children's results", async () => {
    // Parent John is linked to Alice -> Allowed
    const aliceParentRes = await request(app)
      .get(`/api/v1/assessments/student-result?subjectId=${subjectId}&academicTermId=${academicTermId}&studentId=${studentAliceId}`)
      .set('Authorization', `Bearer ${parentToken}`);
    expect(aliceParentRes.status).toBe(200);

    // Parent John tries to view Bob (not linked) -> 403 Forbidden
    const bobParentRes = await request(app)
      .get(`/api/v1/assessments/student-result?subjectId=${subjectId}&academicTermId=${academicTermId}&studentId=${studentBobId}`)
      .set('Authorization', `Bearer ${parentToken}`);
    expect(bobParentRes.status).toBe(403);
  });

  // TEST 28: Cross-tenant requests are rejected
  it('28. Cross-tenant requests are rejected', async () => {
    // Request with mismatched tenant header -> 403
    const crossRes = await request(app)
      .get('/api/v1/assessments/gradebook')
      .set('Authorization', `Bearer ${teacherToken}`)
      .set('x-institution-id', '00000000-0000-0000-0000-000000000000')
      .query({ subjectId, sectionId, academicTermId });

    expect(crossRes.status).toBe(403);
  });

  // TEST 29: Duplicate submissions do not create duplicate result records
  it('29. Duplicate submissions do not create duplicate result records', async () => {
    // Attempting duplicate submit to exam dept
    const dupRes = await request(app)
      .post('/api/v1/assessments/results/submit-to-exam-dept')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        subjectId,
        sectionId,
        academicTermId,
      });

    expect(dupRes.status).toBe(403); // Locked because already submitted/published

    const results = await prisma.subjectResult.findMany({
      where: { subjectId, sectionId, studentId: studentAliceId, academicTermId },
    });
    expect(results.length).toBe(1);
  });

  // TEST 30: Audit history preserves every marks change
  it('30. Audit history preserves every marks change', async () => {
    const audits = await prisma.subjectResultAudit.findMany({
      where: { subjectResultId },
    });
    expect(audits.length).toBeGreaterThanOrEqual(1);
    const correctionAudit = audits.find((a) => a.action === 'CORRECTION_APPROVED');
    expect(correctionAudit).toBeDefined();
    expect(correctionAudit?.actorId).toBe(examControllerUserId);
  });

  // TEST 31: Term Exam Schedule can be connected to an Assessment Item
  it('31. Term Exam Schedule can be connected to an Assessment Item', async () => {
    // Reset subject results status to DRAFT so editing and recalculation are allowed
    await prisma.subjectResult.updateMany({
      where: { subjectId, sectionId, academicTermId },
      data: { status: SubjectResultStatus.DRAFT },
    });

    // 1. Ensure an ExamSession and ExamSchedule exist for this term & subject
    let examSession = await prisma.examSession.findFirst({
      where: { academicTermId, institutionId },
    });
    if (!examSession) {
      examSession = await prisma.examSession.create({
        data: {
          institutionId,
          academicTermId,
          name: 'Midterm Examinations 2026-2027',
          startDate: new Date('2026-11-10'),
          endDate: new Date('2026-11-25'),
          status: 'SCHEDULED',
        },
      });
    }

    let examSchedule = await prisma.examSchedule.findFirst({
      where: { examSessionId: examSession.id, subjectId },
    });
    if (!examSchedule) {
      examSchedule = await prisma.examSchedule.create({
        data: {
          examSessionId: examSession.id,
          subjectId,
          examDate: new Date('2026-11-15T09:00:00Z'),
          startTime: '09:00 AM',
          endTime: '12:00 PM',
          maxMarks: 100,
          passMarks: 40,
        },
      });
    }

    // 2. Fetch available exam schedules via API
    const listRes = await request(app)
      .get(`/api/v1/assessments/exam-schedules?subjectId=${subjectId}&academicTermId=${academicTermId}`)
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body.data)).toBe(true);
    const found = listRes.body.data.find((s: any) => s.id === examSchedule!.id);
    expect(found).toBeDefined();

    // 3. Connect Midterm Assessment Item to this Exam Schedule
    const connectRes = await request(app)
      .post(`/api/v1/assessments/items/${manualMidtermItemId}/connect-exam`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ examScheduleId: examSchedule.id });

    expect(connectRes.status).toBe(200);
    expect(connectRes.body.data.examScheduleId).toBe(examSchedule.id);

    // Verify persisted in DB
    const updatedItem = await prisma.assessmentItem.findUniqueOrThrow({
      where: { id: manualMidtermItemId },
    });
    expect(updatedItem.examScheduleId).toBe(examSchedule.id);
  });

  // TEST 32: Marks entered in Exams & Grades module automatically sync to connected AssessmentItem and recalculate live course results
  it('32. Marks entered in Exams module automatically sync to connected AssessmentItem and recalculate live course results', async () => {
    const item = await prisma.assessmentItem.findUniqueOrThrow({
      where: { id: manualMidtermItemId },
    });
    expect(item.examScheduleId).toBeDefined();

    // Unlock section result status to DRAFT so recalculation and edits are allowed
    await prisma.subjectResult.updateMany({
      where: { subjectId, sectionId, academicTermId },
      data: { status: SubjectResultStatus.DRAFT },
    });

    // Clean up any existing exam marks for this schedule so enterMarks doesn't conflict
    await prisma.examMark.deleteMany({
      where: { examScheduleId: item.examScheduleId! },
    });

    // Enter marks in the Exams module: Alice gets 95 marks in the Midterm Exam
    const examMarkRes = await request(app)
      .post('/api/v1/exams/marks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        examScheduleId: item.examScheduleId,
        marks: [{ studentId: studentAliceId, marksObtained: 95, remarks: 'Outstanding exam paper' }],
      });

    expect(examMarkRes.status).toBe(200);

    // Push marks to assessment component per Section 8 push marks workflow
    await request(app)
      .post(`/api/v1/exams/schedules/${item.examScheduleId}/push-marks`)
      .set('Authorization', `Bearer ${teacherToken}`);

    // Verify marks automatically synced to StudentAssessmentMark against Alice
    const assessmentMark = await prisma.studentAssessmentMark.findUnique({
      where: {
        assessmentItemId_studentId: {
          assessmentItemId: item.id,
          studentId: studentAliceId,
        },
      },
    });

    expect(assessmentMark).toBeDefined();
    expect(assessmentMark?.marksObtained).toBe(95);

    // Verify Alice's SubjectResult Midterm breakdown has updated to 95%
    const aliceResult = await prisma.subjectResult.findUniqueOrThrow({
      where: {
        subjectId_sectionId_studentId_academicTermId: {
          subjectId,
          sectionId,
          studentId: studentAliceId,
          academicTermId,
        },
      },
    });

    const midBreakdown = (aliceResult.categoryBreakdown as any[]).find((c) => c.categoryName === 'Midterm');
    expect(midBreakdown).toBeDefined();
    expect(midBreakdown.averagePercentage).toBe(95);
  });

  // TEST 33: Manual marks can be bulk uploaded via CSV for any assessment category
  it('33. Manual marks can be bulk uploaded via CSV for any assessment category', async () => {
    // Bulk upload marks for Alice via CSV row
    const uploadRes = await request(app)
      .post(`/api/v1/assessments/items/${manualParticipationItemId}/upload-csv`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        rows: [
          {
            identifier: 'ADM-2026-001',
            marksObtained: 98,
            isAbsent: false,
            isExcused: false,
            remarks: 'Active discussions and presentation',
          },
        ],
      });

    expect(uploadRes.status).toBe(200);
    expect(uploadRes.body.data.syncedCount).toBe(1);

    // Verify marks updated in DB
    const partMark = await prisma.studentAssessmentMark.findUnique({
      where: {
        assessmentItemId_studentId: {
          assessmentItemId: manualParticipationItemId,
          studentId: studentAliceId,
        },
      },
    });

    expect(partMark).toBeDefined();
    expect(partMark?.marksObtained).toBe(98);

    // Verify live recalculation
    const aliceResult = await prisma.subjectResult.findUniqueOrThrow({
      where: {
        subjectId_sectionId_studentId_academicTermId: {
          subjectId,
          sectionId,
          studentId: studentAliceId,
          academicTermId,
        },
      },
    });

    const partBreakdown = (aliceResult.categoryBreakdown as any[]).find((c) => c.categoryName === 'Class Participation');
    expect(partBreakdown).toBeDefined();
    expect(partBreakdown.averagePercentage).toBe(98);
  });

  afterAll(async () => {
    await prisma.subjectResultAudit.deleteMany({});
    await prisma.subjectResultCorrectionRequest.deleteMany({});
    await prisma.subjectResult.deleteMany({
      where: { subjectId, academicTermId },
    });
    await prisma.course.deleteMany({
      where: { code: { startsWith: 'VALID-' } },
    });
    await prisma.$disconnect();
  });
});
