import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/app';
import { prisma } from '../src/utils/prisma';
import { SubjectResultStatus } from '@prisma/client';

describe('MASTER LMS ACADEMIC ASSESSMENT, GRADING & EXAMINATION INTEGRATION SUITE', () => {
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
  let subjectId: string;
  let sectionId: string;
  let courseId: string;

  let schemeId: string;
  let lmsAssignment1Id: string;
  let lmsAssignment2Id: string;
  let manualParticipationItemId: string;
  let manualMidtermItemId: string;
  let manualFinalItemId: string;

  let subjectResultId: string;
  let correctionRequestId: string;

  beforeAll(async () => {
    app = createApp();

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
      select: { id: true },
    });
    academicTermId = term.id;

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

    // Ensure a Course exists for this subject, section, and term
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

  // TEST 8: Weightages must total 100%
  it('8. Weightages must total exactly 100%', async () => {
    // Attempt scheme with 90% total -> must reject with 400
    const badRes = await request(app)
      .post('/api/v1/assessments/schemes')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        academicTermId,
        subjectId,
        sectionId,
        title: 'Invalid 90% Scheme',
        categories: [
          { name: 'Assignment 1', weightagePercentage: 15 },
          { name: 'Assignment 2', weightagePercentage: 15 },
          { name: 'Class Participation', weightagePercentage: 10 },
          { name: 'Midterm', weightagePercentage: 20 },
          { name: 'Final Term', weightagePercentage: 30 }, // total = 90%
        ],
      });
    expect(badRes.status).toBe(400);
    expect(badRes.body.error?.message || badRes.body.message).toContain('100%');

    // Create valid 100% scheme:
    // Assignment 1: 15%
    // Assignment 2: 15%
    // Class Participation: 10%
    // Midterm: 20%
    // Final Term: 40%
    // Total = 100%
    const goodRes = await request(app)
      .post('/api/v1/assessments/schemes')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        academicTermId,
        subjectId,
        sectionId,
        title: 'MATH-101 Unified University Scheme',
        categories: [
          { name: 'Assignment 1', weightagePercentage: 15, description: 'LMS Assignment 1' },
          { name: 'Assignment 2', weightagePercentage: 15, description: 'LMS Assignment 2' },
          { name: 'Class Participation', weightagePercentage: 10, description: 'Seminar discussion' },
          { name: 'Midterm', weightagePercentage: 20, description: 'Midterm examination' },
          { name: 'Final Term', weightagePercentage: 40, description: 'Terminal final examination' },
        ],
      });
    expect(goodRes.status).toBe(201);
    schemeId = goodRes.body.data.id;
  });

  // TEST 1: Assignment creation creates the correct assessment mapping
  it('1. Assignment creation creates the correct assessment mapping', async () => {
    const a1Res = await request(app)
      .post('/api/v1/lms/assignments')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        courseId,
        title: 'Assignment 1',
        instructions: 'Solve Linear Algebra problem sets 1-10.',
        maxPoints: 100,
        weightagePercent: 15,
        dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
        allowLateSubmissions: true,
      });

    expect(a1Res.status).toBe(201);
    lmsAssignment1Id = a1Res.body.data.id;
    expect(a1Res.body.data.assessmentItemId).toBeDefined();

    // Verify assessment item exists and is linked
    const linkedItem = await prisma.assessmentItem.findUnique({
      where: { id: a1Res.body.data.assessmentItemId },
      include: { category: true },
    });
    expect(linkedItem).toBeDefined();
    expect(linkedItem?.maxMarks).toBe(100);
    expect(linkedItem?.category.name).toBe('Assignment 1');
  });

  // TEST 2: Assignment weightage remains independent for each assignment
  it('2. Assignment weightage remains independent for each assignment', async () => {
    const a2Res = await request(app)
      .post('/api/v1/lms/assignments')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        courseId,
        title: 'Assignment 2',
        instructions: 'Vector space transformations and matrices.',
        maxPoints: 100,
        weightagePercent: 15,
        dueDate: new Date(Date.now() + 14 * 86400000).toISOString(),
        allowLateSubmissions: true,
      });

    expect(a2Res.status).toBe(201);
    lmsAssignment2Id = a2Res.body.data.id;
    expect(a2Res.body.data.assessmentItemId).toBeDefined();

    const a1 = await prisma.assignment.findUniqueOrThrow({ where: { id: lmsAssignment1Id } });
    const a2 = await prisma.assignment.findUniqueOrThrow({ where: { id: lmsAssignment2Id } });

    expect(a1.weightagePercent).toBe(15);
    expect(a2.weightagePercent).toBe(15);
    expect(a1.assessmentItemId).not.toBe(a2.assessmentItemId);
  });

  // TEST 4 & 5: Student submits on LMS, Teacher grades on LMS, automatically updates gradebook & results
  it('4. Saving assignment marks automatically updates the gradebook', async () => {
    // Alice submits Assignment 1 on LMS
    const subRes1 = await request(app)
      .post(`/api/v1/lms/assignments/${lmsAssignment1Id}/submit`)
      .set('Authorization', `Bearer ${studentAliceToken}`)
      .send({
        contentText: 'Alice completed Assignment 1 solutions.',
        attachmentUrl: 'https://example.edu/alice-a1.pdf',
      });
    expect(subRes1.status).toBe(200);

    // Teacher grades Alice on LMS with 98/100
    const submission1 = await prisma.assignmentSubmission.findFirstOrThrow({
      where: { assignmentId: lmsAssignment1Id, studentId: studentAliceId },
    });

    const gradeRes1 = await request(app)
      .post(`/api/v1/lms/submissions/${submission1.id}/grade`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        grade: 98,
        feedback: 'Superb matrix elimination proofs.',
      });
    expect(gradeRes1.status).toBe(200);

    // Check Gradebook API: shows Alice score 98/100 and contribution 14.7/15!
    const gbRes = await request(app)
      .get('/api/v1/assessments/gradebook')
      .set('Authorization', `Bearer ${teacherToken}`)
      .query({ subjectId, sectionId, academicTermId });

    expect(gbRes.status).toBe(200);
    const aliceRow = gbRes.body.data.rows.find((r: any) => r.studentId === studentAliceId);
    expect(aliceRow).toBeDefined();

    const a1Col = gbRes.body.data.columns.find((c: any) => c.title === 'Assignment 1');
    expect(a1Col).toBeDefined();

    const markData = aliceRow.marks[a1Col.id];
    expect(markData.marksObtained).toBe(98);
    expect(markData.contribution).toBe(14.7); // 98/100 * 15 = 14.7
  });

  // TEST 3: Assignment 1 (15%) and Assignment 2 (15%) produce total assignment contribution of 24.6 / 30
  it('3. Assignment 1 at 15% and Assignment 2 at 15% produce total assignment contribution of 24.6 out of 30', async () => {
    // Alice submits Assignment 2 on LMS
    await request(app)
      .post(`/api/v1/lms/assignments/${lmsAssignment2Id}/submit`)
      .set('Authorization', `Bearer ${studentAliceToken}`)
      .send({
        contentText: 'Alice completed Assignment 2 solutions.',
        attachmentUrl: 'https://example.edu/alice-a2.pdf',
      });

    const submission2 = await prisma.assignmentSubmission.findFirstOrThrow({
      where: { assignmentId: lmsAssignment2Id, studentId: studentAliceId },
    });

    // Teacher grades Alice with 66/100
    const gradeRes2 = await request(app)
      .post(`/api/v1/lms/submissions/${submission2.id}/grade`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        grade: 66,
        feedback: 'Good attempt, minor vector errors.',
      });
    expect(gradeRes2.status).toBe(200);

    // Gradebook shows: Assignment 1 = 14.7, Assignment 2 = 9.9
    // Total assignments contribution = 14.7 + 9.9 = 24.6 out of 30!
    const gbRes = await request(app)
      .get('/api/v1/assessments/gradebook')
      .set('Authorization', `Bearer ${teacherToken}`)
      .query({ subjectId, sectionId, academicTermId });

    const aliceRow = gbRes.body.data.rows.find((r: any) => r.studentId === studentAliceId);
    const a1Col = gbRes.body.data.columns.find((c: any) => c.title === 'Assignment 1');
    const a2Col = gbRes.body.data.columns.find((c: any) => c.title === 'Assignment 2');

    expect(aliceRow.marks[a1Col.id].contribution).toBe(14.7);
    expect(aliceRow.marks[a2Col.id].contribution).toBe(9.9);

    const totalAssignmentContribution = aliceRow.marks[a1Col.id].contribution + aliceRow.marks[a2Col.id].contribution;
    expect(totalAssignmentContribution).toBeCloseTo(24.6, 2);
  });

  // TEST 6: Manual assessment marks (Participation, Midterm, Final) use the same grading engine
  it('6. Manual assessment marks use the same grading engine and calculate overall score 83.6/100', async () => {
    const scheme = await prisma.assessmentScheme.findUniqueOrThrow({
      where: { id: schemeId },
      include: { categories: true },
    });

    const partCat = scheme.categories.find((c) => c.name === 'Class Participation')!;
    const midCat = scheme.categories.find((c) => c.name === 'Midterm')!;
    const finalCat = scheme.categories.find((c) => c.name === 'Final Term')!;

    // Create items for manual assessments
    const partItem = await prisma.assessmentItem.create({
      data: {
        assessmentCategoryId: partCat.id,
        title: 'Class Participation',
        maxMarks: 100,
        isPublished: true,
      },
    });
    manualParticipationItemId = partItem.id;

    const midItem = await prisma.assessmentItem.create({
      data: {
        assessmentCategoryId: midCat.id,
        title: 'Midterm Examination',
        maxMarks: 100,
        isPublished: true,
      },
    });
    manualMidtermItemId = midItem.id;

    const finalItem = await prisma.assessmentItem.create({
      data: {
        assessmentCategoryId: finalCat.id,
        title: 'Final Term Examination',
        maxMarks: 100,
        isPublished: true,
      },
    });
    manualFinalItemId = finalItem.id;

    // Enter marks via Unified Gradebook:
    // Participation: 90/100 (10% weight -> 9.0)
    // Midterm: 80/100 (20% weight -> 16.0)
    // Final: 85/100 (40% weight -> 34.0)
    const saveRes = await request(app)
      .post('/api/v1/assessments/gradebook/save')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        subjectId,
        sectionId,
        academicTermId,
        updates: [
          { assessmentItemId: manualParticipationItemId, studentId: studentAliceId, marksObtained: 90 },
          { assessmentItemId: manualMidtermItemId, studentId: studentAliceId, marksObtained: 80 },
          { assessmentItemId: manualFinalItemId, studentId: studentAliceId, marksObtained: 85 },
        ],
      });

    expect(saveRes.status).toBe(200);

    // Final subject score = 14.7 + 9.9 + 9.0 + 16.0 + 34.0 = 83.6!
    const subjectResult = await prisma.subjectResult.findUniqueOrThrow({
      where: {
        subjectId_sectionId_studentId_academicTermId: {
          subjectId,
          sectionId,
          studentId: studentAliceId,
          academicTermId,
        },
      },
    });
    subjectResultId = subjectResult.id;

    expect(subjectResult.totalPercentage).toBeCloseTo(83.6, 2);
  });

  // TEST 5: Editing assignment marks recalculates results
  it('5. Editing assignment marks recalculates results', async () => {
    const submission2 = await prisma.assignmentSubmission.findFirstOrThrow({
      where: { assignmentId: lmsAssignment2Id, studentId: studentAliceId },
    });

    // Edit Assignment 2 marks from 66 to 76 (76/100 * 15 = 11.4 -> total = 14.7 + 11.4 + 9 + 16 + 34 = 85.1)
    await request(app)
      .post(`/api/v1/lms/submissions/${submission2.id}/grade`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ grade: 76, feedback: 'Updated after grade review.' });

    const updatedResult = await prisma.subjectResult.findUniqueOrThrow({
      where: { id: subjectResultId },
    });
    expect(updatedResult.totalPercentage).toBeCloseTo(85.1, 2);

    // Revert to 66 for subsequent tests
    await request(app)
      .post(`/api/v1/lms/submissions/${submission2.id}/grade`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ grade: 66, feedback: 'Reverted to original score.' });
  });

  // TEST 7: Marks cannot exceed maximum marks
  it('7. Marks cannot exceed maximum marks', async () => {
    const overMarksRes = await request(app)
      .post('/api/v1/assessments/gradebook/save')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        subjectId,
        sectionId,
        academicTermId,
        updates: [{ assessmentItemId: manualParticipationItemId, studentId: studentAliceId, marksObtained: 150 }],
      });
    expect(overMarksRes.status).toBe(400);
    expect(overMarksRes.body.error?.message || overMarksRes.body.message).toContain('cannot exceed maximum marks');
  });

  // TEST 9: Missing assessment marks are handled correctly
  it('9. Missing assessment marks are handled correctly without corrupting student score', async () => {
    // Bob has no marks entered yet
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
    // Bob does not have false zeros corrupting his profile
    if (bobResult) {
      expect(bobResult.status).toBe('DRAFT');
    }
  });

  // TEST 10: Teachers can change assignment due dates after expiration
  it('10. Teachers can change assignment due dates after expiration', async () => {
    const expiredDate = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const newDueDate = new Date(Date.now() + 72 * 3600 * 1000).toISOString();

    // Set past due date first
    await prisma.assignment.update({
      where: { id: lmsAssignment1Id },
      data: { dueDate: new Date(expiredDate) },
    });

    // Teacher extends deadline via PATCH /lms/assignments/:id
    const extendRes = await request(app)
      .patch(`/api/v1/lms/assignments/${lmsAssignment1Id}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        dueDate: newDueDate,
        reason: 'Granted class-wide extension after review.',
      });

    expect(extendRes.status).toBe(200);
    expect(extendRes.body.data.dueDate).toBeDefined();

    // Check existing submissions and grades are preserved!
    const sub = await prisma.assignmentSubmission.findFirst({
      where: { assignmentId: lmsAssignment1Id, studentId: studentAliceId },
    });
    expect(sub).toBeDefined();
    expect(sub?.grade).toBe(98);
  });

  // TEST 11: Teacher Submit (Button A) locks according to policy and publishes provisional results
  it('11. Teacher Submit (Button A) publishes provisional results without official exam publication', async () => {
    const submitARes = await request(app)
      .post('/api/v1/assessments/results/submit-to-students')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        subjectId,
        sectionId,
        academicTermId,
        remarks: 'Teacher published provisional internal marks.',
      });

    expect(submitARes.status).toBe(200);

    const result = await prisma.subjectResult.findUniqueOrThrow({
      where: { id: subjectResultId },
    });
    expect(result.status).toBe(SubjectResultStatus.SUBMITTED_TO_STUDENTS);

    // Student Alice sees provisional results with note
    const aliceView = await request(app)
      .get('/api/v1/assessments/student-result')
      .set('Authorization', `Bearer ${studentAliceToken}`)
      .query({ subjectId, academicTermId });

    expect(aliceView.status).toBe(200);
    expect(aliceView.body.data.isOfficiallyPublished).toBe(false);
  });

  // TEST 12: Submit to Examination Department (Button B) creates reviewable submission
  it('12. Submit to Examination Department creates a reviewable submission', async () => {
    const submitBRes = await request(app)
      .post('/api/v1/assessments/results/submit-to-exam-dept')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        subjectId,
        sectionId,
        academicTermId,
        remarks: 'Official forwarding to Exam Department.',
      });

    expect(submitBRes.status).toBe(200);

    const result = await prisma.subjectResult.findUniqueOrThrow({
      where: { id: subjectResultId },
    });
    expect(result.status).toBe(SubjectResultStatus.SUBMITTED_TO_EXAM_DEPARTMENT);
  });

  // TEST 13: Students see Grade in Progress after examination submission
  it('13. Students see Grade in Progress after examination submission', async () => {
    const aliceView = await request(app)
      .get('/api/v1/assessments/student-result')
      .set('Authorization', `Bearer ${studentAliceToken}`)
      .query({ subjectId, academicTermId });

    expect(aliceView.status).toBe(200);
    expect(aliceView.body.data.gradeInProgress).toBe(true);
    expect(aliceView.body.data.displayGrade).toBe('GRADE IN PROGRESS');
    expect(aliceView.body.data.isOfficiallyPublished).toBe(false);
  });

  // TEST 14: Teachers cannot directly edit submitted results
  it('14. Teachers cannot directly edit submitted results (direct API blocked with 403)', async () => {
    const directEditRes = await request(app)
      .post('/api/v1/assessments/gradebook/save')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        subjectId,
        sectionId,
        academicTermId,
        updates: [{ assessmentItemId: manualMidtermItemId, studentId: studentAliceId, marksObtained: 99 }],
      });

    expect(directEditRes.status).toBe(403);
    expect(directEditRes.body.error?.message || directEditRes.body.message).toContain('locked');
  });

  // TEST 15: Teachers can request marks corrections
  it('15. Teachers can request marks corrections with mandatory reason', async () => {
    const correctionRes = await request(app)
      .post('/api/v1/assessments/results/request-correction')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        subjectResultId,
        studentId: studentAliceId,
        proposedMarks: 86.5,
        reason: 'Recount of Midterm question 4 was verified by course coordinator.',
      });

    expect(correctionRes.status).toBe(201);
    expect(correctionRes.body.data.status).toBe('PENDING');
    correctionRequestId = correctionRes.body.data.id;
  });

  // TEST 16: Examination staff can approve or reject correction requests
  it('16. Examination staff can approve or reject correction requests', async () => {
    const reviewRes = await request(app)
      .post(`/api/v1/assessments/exam-dept/corrections/${correctionRequestId}/review`)
      .set('Authorization', `Bearer ${examControllerToken}`)
      .send({
        status: 'APPROVED',
        reviewNotes: 'Verified midterm question 4 recount.',
      });

    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.data.status).toBe('APPROVED');

    const updatedResult = await prisma.subjectResult.findUniqueOrThrow({
      where: { id: subjectResultId },
    });
    expect(updatedResult.totalPercentage).toBe(86.5);
  });

  // TEST 17: Unauthorized users cannot approve results
  it('17. Unauthorized users cannot approve results', async () => {
    const unauthRes = await request(app)
      .post('/api/v1/assessments/exam-dept/review')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        subjectId,
        sectionId,
        academicTermId,
        status: 'OFFICIALLY_PUBLISHED',
      });

    expect(unauthRes.status).toBe(403);
  });

  // TEST 18: Teachers cannot approve their own results
  it('18. Teachers cannot approve their own results', async () => {
    const selfApproveRes = await request(app)
      .post(`/api/v1/assessments/exam-dept/corrections/${correctionRequestId}/review`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        status: 'APPROVED',
      });

    expect(selfApproveRes.status).toBe(403);
  });

  // TEST 19: Unpublished results never appear as finalized transcript entries
  it('19. Unpublished results never appear as finalized transcript entries', async () => {
    const reportCardRes = await request(app)
      .get('/api/v1/exams/report-cards')
      .set('Authorization', `Bearer ${studentAliceToken}`)
      .query({ studentId: studentAliceId });

    expect(reportCardRes.status).toBe(200);
    const cards = reportCardRes.body.data || [];
    if (cards.length > 0) {
      const assessmentResults = cards[0].assessmentSubjectResults || [];
      const mathResult = assessmentResults.find((ar: any) => ar.subjectId === subjectId);
      if (mathResult) {
        expect(mathResult.isOfficiallyPublished).toBe(false);
        expect(mathResult.gradeLetter).toBe('GRADE IN PROGRESS');
      }
    }
  });

  // TEST 20: Published results appear correctly on student transcripts
  it('20. Published results appear correctly on student transcripts after Exam Dept publication', async () => {
    const publishRes = await request(app)
      .post('/api/v1/assessments/exam-dept/review')
      .set('Authorization', `Bearer ${examControllerToken}`)
      .send({
        subjectId,
        sectionId,
        academicTermId,
        status: 'OFFICIALLY_PUBLISHED',
        notes: 'Officially published for university transcript records.',
      });

    expect(publishRes.status).toBe(200);

    const finalAliceView = await request(app)
      .get('/api/v1/assessments/student-result')
      .set('Authorization', `Bearer ${studentAliceToken}`)
      .query({ subjectId, academicTermId });

    expect(finalAliceView.status).toBe(200);
    expect(finalAliceView.body.data.gradeInProgress).toBe(false);
    expect(finalAliceView.body.data.isOfficiallyPublished).toBe(true);
    expect(finalAliceView.body.data.displayGrade).not.toBe('GRADE IN PROGRESS');
  });

  // TEST 21: Parents can only view linked children's results
  it('21. Parents can only view linked children results', async () => {
    // Parent John (Alice's parent) querying Bob's result -> 403
    const unlinkedRes = await request(app)
      .get('/api/v1/assessments/student-result')
      .set('Authorization', `Bearer ${parentToken}`)
      .query({ subjectId, academicTermId, studentId: studentBobId });

    expect(unlinkedRes.status).toBe(403);
  });

  // TEST 22: Cross-tenant requests are rejected
  it('22. Cross-tenant requests are rejected', async () => {
    const otherTenantHeader = '00000000-0000-0000-0000-000000000099';
    const crossRes = await request(app)
      .get('/api/v1/assessments/student-result')
      .set('Authorization', `Bearer ${studentAliceToken}`)
      .set('X-Institution-Id', otherTenantHeader)
      .query({ subjectId, academicTermId });

    expect([401, 403]).toContain(crossRes.status);
  });

  // TEST 23: Duplicate submissions do not create duplicate result records
  it('23. Duplicate submissions do not create duplicate result records', async () => {
    const dupRes = await request(app)
      .post('/api/v1/assessments/results/submit-to-exam-dept')
      .set('Authorization', `Bearer ${examControllerToken}`)
      .send({ subjectId, sectionId, academicTermId });

    expect([200, 400, 403]).toContain(dupRes.status);

    const count = await prisma.subjectResult.count({
      where: { subjectId, sectionId, studentId: studentAliceId, academicTermId },
    });
    expect(count).toBe(1);
  });

  // TEST 24: Audit history preserves every marks change
  it('24. Audit history preserves every marks change and review', async () => {
    const audits = await prisma.subjectResultAudit.findMany({
      where: { subjectResultId },
    });

    expect(audits.length).toBeGreaterThanOrEqual(1);
    const correctionAudit = audits.find((a) => a.action === 'CORRECTION_APPROVED');
    expect(correctionAudit).toBeDefined();
    expect(correctionAudit?.previousState).toBeDefined();
    expect(correctionAudit?.newState).toBeDefined();
  });
});
