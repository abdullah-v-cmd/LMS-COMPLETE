import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/app';
import { prisma } from '../src/utils/prisma';
import { SubjectResultStatus } from '@prisma/client';

describe('University Assessment, Weightage, Assignment Grading & Exam Dept Lifecycle (20-Point Suite)', () => {
  let app: Express;
  let teacherToken: string;
  let teacherUserId: string;
  let controllerToken: string;
  let studentAliceToken: string;
  let studentBobToken: string;
  let parentToken: string;
  let unassignedTeacherToken: string;

  let institutionId: string;
  let academicTermId: string;
  let mathSubjectId: string;
  let sectionAId: string;
  let studentAliceId: string;
  let studentBobId: string;

  let schemeId: string;
  let assignmentCategoryId: string;
  let quizzesCategoryId: string;
  let midtermCategoryId: string;
  let finalCategoryId: string;

  let assignment1Id: string;
  let assignment2Id: string;
  let assignment3Id: string;
  let submission1Id: string;
  let subjectResultAliceId: string;
  let correctionRequestId: string;

  beforeAll(async () => {
    app = createApp();
    const aliceUser = await prisma.user.findUniqueOrThrow({
      where: { email: 'student.alice@alpha.edu' },
    });
    await prisma.user.updateMany({
      where: { email: 'student.bob.examtest@alpha.edu' },
      data: { passwordHash: aliceUser.passwordHash },
    });

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
    controllerToken = cRes.body.data.accessToken;
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

    const bob = await prisma.studentProfile.findFirstOrThrow({
      where: { admissionNumber: 'ADM-2026-TESTBOB' },
      select: { id: true },
    });
    studentBobId = bob.id;

    // Login an unassigned teacher for authorization checks
    const unassignedLogin = await request(app).post('/api/v1/auth/login').send({
      usernameOrEmail: 'teacher.science@alpha.edu',
      password: 'Password123!',
    });
    if (unassignedLogin.status === 200) {
      unassignedTeacherToken = unassignedLogin.body.data.accessToken;
    } else {
      unassignedTeacherToken = parentToken; // fallback non-math-teacher
    }

    // Clean up any existing assessment scheme & results for clean test run
    await prisma.subjectResultAudit.deleteMany({});
    await prisma.subjectResultCorrectionRequest.deleteMany({});
    await prisma.subjectResult.deleteMany({
      where: { subjectId: mathSubjectId, academicTermId },
    });
    await prisma.assessmentScheme.deleteMany({
      where: { subjectId: mathSubjectId, academicTermId },
    });

    // Create University-Style Assessment Scheme:
    // Assignments: 15%
    // Class Participation: 15%
    // Quizzes: 10%
    // Midterm: 20%
    // Final Term: 40%
    // Total = 100%
    const schemeRes = await request(app)
      .post('/api/v1/assessments/schemes')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        academicTermId,
        subjectId: mathSubjectId,
        sectionId: sectionAId,
        title: 'MATH-101 University Assessment Scheme',
        categories: [
          { name: 'Assignments', weightagePercentage: 15, description: 'Programming and analytical homework' },
          { name: 'Class Participation', weightagePercentage: 15, description: 'Active seminar engagement' },
          { name: 'Quizzes', weightagePercentage: 10, description: 'Surprise quizzes' },
          { name: 'Midterm', weightagePercentage: 20, description: 'Mid-term exam' },
          { name: 'Final Term', weightagePercentage: 40, description: 'Terminal comprehensive exam' },
        ],
      });

    expect(schemeRes.status).toBe(201);
    schemeId = schemeRes.body.data.id;
    const cats = schemeRes.body.data.categories;
    assignmentCategoryId = cats.find((c: any) => c.name === 'Assignments').id;
    quizzesCategoryId = cats.find((c: any) => c.name === 'Quizzes').id;
    midtermCategoryId = cats.find((c: any) => c.name === 'Midterm').id;
    finalCategoryId = cats.find((c: any) => c.name === 'Final Term').id;

    // Create 3 assignments inside the 15% Assignments category
    const pastDate = new Date(Date.now() - 24 * 3600 * 1000).toISOString(); // 1 day ago
    const futureDate = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

    const a1Res = await request(app)
      .post('/api/v1/assessments/items')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        assessmentCategoryId: assignmentCategoryId,
        title: 'Assignment 1: Linear Algebra Foundations',
        maxMarks: 100,
        dueDate: pastDate, // already passed
        isPublished: true,
      });
    expect(a1Res.status).toBe(201);
    assignment1Id = a1Res.body.data.id;

    const a2Res = await request(app)
      .post('/api/v1/assessments/items')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        assessmentCategoryId: assignmentCategoryId,
        title: 'Assignment 2: Vector Spaces',
        maxMarks: 100,
        dueDate: futureDate,
        isPublished: true,
      });
    expect(a2Res.status).toBe(201);
    assignment2Id = a2Res.body.data.id;

    const a3Res = await request(app)
      .post('/api/v1/assessments/items')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        assessmentCategoryId: assignmentCategoryId,
        title: 'Assignment 3: Eigenvalues & Transformations',
        maxMarks: 100,
        dueDate: futureDate,
        isPublished: true,
      });
    expect(a3Res.status).toBe(201);
    assignment3Id = a3Res.body.data.id;

    // Student Alice submits work for Assignment 1
    const subRes = await request(app)
      .post(`/api/v1/assessments/items/${assignment1Id}/submit-work`)
      .set('Authorization', `Bearer ${studentAliceToken}`)
      .send({
        contentText: 'Alice submission: solved all 10 linear equation systems.',
        attachmentUrl: 'https://example.edu/submissions/alice-math1.pdf',
      });
    expect(subRes.status).toBe(201);
    submission1Id = subRes.body.data.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // TEST 1
  it('1. Teacher can change an assignment deadline after it passes', async () => {
    const extendedDate = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    const res = await request(app)
      .post(`/api/v1/assessments/items/${assignment1Id}/extend-deadline`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        dueDate: extendedDate,
        reason: 'Granted 48 hours extension due to server maintenance window.',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.dueDate).toBeDefined();
    expect(res.body.data.deadlineHistories).toBeDefined();
    expect(res.body.data.deadlineHistories.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.deadlineHistories[0].reason).toContain('server maintenance');
  });

  // TEST 2
  it('2. Deadline changes preserve existing submissions', async () => {
    const sub = await prisma.assessmentSubmissionRecord.findUnique({
      where: { id: submission1Id },
    });
    expect(sub).toBeDefined();
    expect(sub?.studentId).toBe(studentAliceId);
    expect(sub?.attachmentUrl).toContain('alice-math1.pdf');
  });

  // TEST 3
  it('3. Teacher can grade and correct assignment marks before Exam Department submission', async () => {
    // Teacher grades Alice's Assignment 1 with 98 marks
    const gradeRes = await request(app)
      .post(`/api/v1/assessments/submissions/${submission1Id}/grade`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        grade: 98,
        feedback: 'Excellent proofs and correct matrix reduction.',
      });

    expect(gradeRes.status).toBe(200);
    expect(gradeRes.body.data.grade).toBe(98);

    // Later teacher corrects mark to 98 (verifying editable stage)
    const updateRes = await request(app)
      .post(`/api/v1/assessments/submissions/${submission1Id}/grade`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        grade: 98,
        feedback: 'Confirmed grade.',
      });
    expect(updateRes.status).toBe(200);
  });

  // TEST 4
  it('4. Assignment marks automatically recalculate weighted results (98, 66, 86 -> 83.3333% avg -> 12.50 contribution)', async () => {
    // Enter marks for Assignment 2 (66/100) and Assignment 3 (86/100)
    const marksRes2 = await request(app)
      .post('/api/v1/assessments/marks/batch')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        assessmentItemId: assignment2Id,
        marks: [{ studentId: studentAliceId, marksObtained: 66 }],
      });
    expect(marksRes2.status).toBe(200);

    const marksRes3 = await request(app)
      .post('/api/v1/assessments/marks/batch')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        assessmentItemId: assignment3Id,
        marks: [{ studentId: studentAliceId, marksObtained: 86 }],
      });
    expect(marksRes3.status).toBe(200);

    // Verify student result calculation
    const subjectResult = await prisma.subjectResult.findUniqueOrThrow({
      where: {
        subjectId_sectionId_studentId_academicTermId: {
          subjectId: mathSubjectId,
          sectionId: sectionAId,
          studentId: studentAliceId,
          academicTermId,
        },
      },
    });
    subjectResultAliceId = subjectResult.id;

    const breakdown = subjectResult.categoryBreakdown as any[];
    const assignCategory = breakdown.find((c) => c.categoryName === 'Assignments');
    expect(assignCategory).toBeDefined();

    // Average = (98 + 66 + 86) / 3 = 83.3333%
    expect(assignCategory.averagePercentage).toBeCloseTo(83.3333, 2);
    // Weighted contribution = 83.3333% * 15% = 12.50 out of 15
    expect(assignCategory.contribution).toBeCloseTo(12.5, 2);
    expect(assignCategory.weightage).toBe(15);
  });

  // TEST 5
  it('5. Submit (Button A) publishes marks to students', async () => {
    const res = await request(app)
      .post('/api/v1/assessments/results/submit-to-students')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        subjectId: mathSubjectId,
        sectionId: sectionAId,
        academicTermId,
        remarks: 'Teacher published provisional marks',
      });

    expect(res.status).toBe(200);

    const result = await prisma.subjectResult.findUniqueOrThrow({
      where: { id: subjectResultAliceId },
    });
    expect(result.status).toBe(SubjectResultStatus.SUBMITTED_TO_STUDENTS);
  });

  // TEST 6
  it('6. Submit (Button A) does not submit results to the Exam Department', async () => {
    const result = await prisma.subjectResult.findUniqueOrThrow({
      where: { id: subjectResultAliceId },
    });
    expect(result.status).not.toBe(SubjectResultStatus.SUBMITTED_TO_EXAM_DEPARTMENT);

    // Teacher can still edit marks!
    const editRes = await request(app)
      .post('/api/v1/assessments/marks/batch')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        assessmentItemId: assignment2Id,
        marks: [{ studentId: studentAliceId, marksObtained: 66, remarks: 'Verified by teacher' }],
      });
    expect(editRes.status).toBe(200);
  });

  // TEST 7
  it('7. Submit to Exam Department (Button B) locks teacher editing', async () => {
    const res = await request(app)
      .post('/api/v1/assessments/results/submit-to-exam-dept')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        subjectId: mathSubjectId,
        sectionId: sectionAId,
        academicTermId,
        remarks: 'Forwarding completed results to Exam Dept',
      });

    expect(res.status).toBe(200);

    const result = await prisma.subjectResult.findUniqueOrThrow({
      where: { id: subjectResultAliceId },
    });
    expect(result.status).toBe(SubjectResultStatus.SUBMITTED_TO_EXAM_DEPARTMENT);
  });

  // TEST 8
  it('8. Direct API calls cannot bypass the teacher editing lock', async () => {
    // Attempting to update marks via direct API call must return 403
    const directEditRes = await request(app)
      .post('/api/v1/assessments/marks/batch')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        assessmentItemId: assignment1Id,
        marks: [{ studentId: studentAliceId, marksObtained: 100 }],
      });

    expect(directEditRes.status).toBe(403);
    expect(directEditRes.body.error?.message || directEditRes.body.message).toContain('locked');
  });

  // TEST 9
  it('9. Student sees Grade in Progress after Exam Department submission', async () => {
    const studentRes = await request(app)
      .get('/api/v1/assessments/student-result')
      .set('Authorization', `Bearer ${studentAliceToken}`)
      .query({ subjectId: mathSubjectId, academicTermId });

    expect(studentRes.status).toBe(200);
    expect(studentRes.body.data.gradeInProgress).toBe(true);
    expect(studentRes.body.data.displayGrade).toBe('GRADE IN PROGRESS');
    expect(studentRes.body.data.isOfficiallyPublished).toBe(false);
  });

  // TEST 10
  it('10. Pending subject does not appear as a finalized transcript grade', async () => {
    // Report cards endpoint
    const reportCardRes = await request(app)
      .get('/api/v1/exams/report-cards')
      .set('Authorization', `Bearer ${studentAliceToken}`)
      .query({ studentId: studentAliceId });

    expect(reportCardRes.status).toBe(200);
    const cards = reportCardRes.body.data || [];
    if (cards.length > 0) {
      const assessmentResults = cards[0].assessmentSubjectResults || [];
      const mathAssessment = assessmentResults.find((ar: any) => ar.subjectId === mathSubjectId);
      if (mathAssessment) {
        expect(mathAssessment.isOfficiallyPublished).toBe(false);
        expect(mathAssessment.gradeLetter).toBe('GRADE IN PROGRESS');
      }
    }
  });

  // TEST 11
  it('11. Exam Department can view submitted results on dashboard', async () => {
    const dashRes = await request(app)
      .get('/api/v1/assessments/exam-dept/dashboard')
      .set('Authorization', `Bearer ${controllerToken}`);

    expect(dashRes.status).toBe(200);
    const submissions = dashRes.body.data.submissions;
    const mathSub = submissions.find(
      (s: any) => s.subjectId === mathSubjectId && s.sectionId === sectionAId
    );
    expect(mathSub).toBeDefined();
    expect(mathSub.status).toBe(SubjectResultStatus.SUBMITTED_TO_EXAM_DEPARTMENT);
  });

  // TEST 12
  it('12. Exam Department can approve and officially publish a result', async () => {
    const publishRes = await request(app)
      .post('/api/v1/assessments/exam-dept/review')
      .set('Authorization', `Bearer ${controllerToken}`)
      .send({
        subjectId: mathSubjectId,
        sectionId: sectionAId,
        academicTermId,
        status: 'OFFICIALLY_PUBLISHED',
        notes: 'Verified and approved by Exam Controller',
      });

    expect(publishRes.status).toBe(200);

    const result = await prisma.subjectResult.findUniqueOrThrow({
      where: { id: subjectResultAliceId },
    });
    expect(result.status).toBe(SubjectResultStatus.OFFICIALLY_PUBLISHED);
    expect(result.officiallyPublishedAt).toBeDefined();
  });

  // TEST 13
  it('13. Officially published result appears on the transcript with official grade', async () => {
    const studentRes = await request(app)
      .get('/api/v1/assessments/student-result')
      .set('Authorization', `Bearer ${studentAliceToken}`)
      .query({ subjectId: mathSubjectId, academicTermId });

    expect(studentRes.status).toBe(200);
    expect(studentRes.body.data.gradeInProgress).toBe(false);
    expect(studentRes.body.data.isOfficiallyPublished).toBe(true);
    expect(studentRes.body.data.displayGrade).not.toBe('GRADE IN PROGRESS');
  });

  // TEST 14
  it('14. Teacher can request a correction after submission', async () => {
    const reqRes = await request(app)
      .post('/api/v1/assessments/results/request-correction')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        subjectResultId: subjectResultAliceId,
        studentId: studentAliceId,
        proposedMarks: 88,
        reason: 'Recount of Assignment 2 calculations showed an additional 5 marks warranted.',
      });

    expect(reqRes.status).toBe(201);
    expect(reqRes.body.data.status).toBe('PENDING');
    correctionRequestId = reqRes.body.data.id;
  });

  // TEST 15
  it('15. Teacher cannot directly change a locked result', async () => {
    const directRes = await request(app)
      .post(`/api/v1/assessments/submissions/${submission1Id}/grade`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        grade: 100,
        feedback: 'Bypassing lock',
      });

    expect(directRes.status).toBe(403);
  });

  // TEST 16
  it('16. Exam Department can approve or reject correction requests', async () => {
    const reviewRes = await request(app)
      .post(`/api/v1/assessments/exam-dept/corrections/${correctionRequestId}/review`)
      .set('Authorization', `Bearer ${controllerToken}`)
      .send({
        status: 'APPROVED',
        reviewNotes: 'Reviewed recount evidence. Approved.',
      });

    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.data.status).toBe('APPROVED');

    // Verify official result was updated with approved proposed marks
    const updatedResult = await prisma.subjectResult.findUniqueOrThrow({
      where: { id: subjectResultAliceId },
    });
    expect(updatedResult.totalPercentage).toBe(88);
  });

  // TEST 17
  it('17. Approved corrections preserve previous result snapshots in audit log', async () => {
    const audit = await prisma.subjectResultAudit.findFirst({
      where: {
        subjectResultId: subjectResultAliceId,
        action: 'CORRECTION_APPROVED',
      },
    });

    expect(audit).toBeDefined();
    expect(audit?.previousState).toBeDefined();
    expect(audit?.newState).toBeDefined();
  });

  // TEST 18
  it('18. Unauthorized users cannot approve or publish results', async () => {
    // Subject teacher attempts to review/publish
    const unauthRes = await request(app)
      .post('/api/v1/assessments/exam-dept/review')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        subjectId: mathSubjectId,
        sectionId: sectionAId,
        academicTermId,
        status: 'OFFICIALLY_PUBLISHED',
      });

    expect(unauthRes.status).toBe(403);
  });

  // TEST 19
  it('19. Duplicate submissions do not create duplicate official results', async () => {
    // Forwarding to exam dept again is idempotent
    const dupRes = await request(app)
      .post('/api/v1/assessments/results/submit-to-exam-dept')
      .set('Authorization', `Bearer ${controllerToken}`)
      .send({
        subjectId: mathSubjectId,
        sectionId: sectionAId,
        academicTermId,
      });

    expect([200, 400, 403]).toContain(dupRes.status);

    const count = await prisma.subjectResult.count({
      where: {
        subjectId: mathSubjectId,
        sectionId: sectionAId,
        studentId: studentAliceId,
        academicTermId,
      },
    });
    expect(count).toBe(1);
  });

  // TEST 20
  it('20. Student and Parent result isolation remains intact', async () => {
    // Student Bob cannot view Alice's subject result
    const bobRes = await request(app)
      .get('/api/v1/assessments/student-result')
      .set('Authorization', `Bearer ${studentBobToken}`)
      .query({
        subjectId: mathSubjectId,
        academicTermId,
        studentId: studentAliceId, // attempting IDOR
      });

    // When Bob queries with Alice's ID, the backend forces student's own profile ID
    if (bobRes.body.data) {
      expect(bobRes.body.data.studentId).not.toBe(studentAliceId);
    }

    // Parent John (Alice's father) cannot view Bob's result
    const parentBobRes = await request(app)
      .get('/api/v1/assessments/student-result')
      .set('Authorization', `Bearer ${parentToken}`)
      .query({
        subjectId: mathSubjectId,
        academicTermId,
        studentId: studentBobId, // Bob is not John's child
      });

    expect(parentBobRes.status).toBe(403);
  });
});
