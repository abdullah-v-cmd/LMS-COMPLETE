import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/app';
import { prisma } from '../src/utils/prisma';
import { SubjectResultStatus } from '@prisma/client';

describe('Unified Gradebook, Assignment Mapping & Submission Sync (Critical Issues 1, 2, 3)', () => {
  let app: Express;
  let teacherToken: string;
  let teacherUserId: string;
  let teacherProfileId: string;
  let examControllerToken: string;
  let studentAliceToken: string;
  let studentAliceId: string;
  let institutionId: string;
  let academicTermId: string;
  let mathSubjectId: string;
  let sectionAId: string;
  let courseId: string;
  let schemeId: string;
  let assignmentsCategoryId: string;
  let lmsAssignmentId: string;
  let lmsAssessmentItemId: string;
  let manualAssessmentItemId: string;

  beforeAll(async () => {
    app = createApp();
    await prisma.$connect();

    // 1. Authenticate Subject Teacher (Math)
    const tRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ usernameOrEmail: 'teacher.math@alpha.edu', password: 'Password123!' });
    expect(tRes.status).toBe(200);
    teacherToken = tRes.body.data.accessToken;
    teacherUserId = tRes.body.data.user.id;

    const teacherUser = await prisma.user.findUniqueOrThrow({
      where: { email: 'teacher.math@alpha.edu' },
      select: { institutionId: true, teacherProfile: { select: { id: true } } },
    });
    institutionId = teacherUser.institutionId!;
    teacherProfileId = teacherUser.teacherProfile!.id;

    // 2. Authenticate Exam Controller
    const ecRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ usernameOrEmail: 'exam.controller@alpha.edu', password: 'Password123!' });
    expect(ecRes.status).toBe(200);
    examControllerToken = ecRes.body.data.accessToken;

    // 3. Authenticate Student Alice
    const aRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ usernameOrEmail: 'student.alice@alpha.edu', password: 'Password123!' });
    expect(aRes.status).toBe(200);
    studentAliceToken = aRes.body.data.accessToken;

    const alice = await prisma.studentProfile.findFirstOrThrow({
      where: { admissionNumber: 'ADM-2026-001' },
      select: { id: true, sectionId: true },
    });
    studentAliceId = alice.id;
    sectionAId = alice.sectionId;

    // 4. Setup Academic Term & Subject
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

    // Find or create course
    let course = await prisma.course.findFirst({
      where: { institutionId, subjectId: mathSubjectId, sectionId: sectionAId },
    });
    if (!course) {
      course = await prisma.course.create({
        data: {
          institutionId,
          subjectId: mathSubjectId,
          sectionId: sectionAId,
          academicTermId,
          teacherId: teacherProfileId,
          title: 'Mathematics Grade 10',
          code: 'MATH-10-TEST',
        },
      });
    }
    courseId = course.id;

    // Cleanup any lingering results or requests for a clean test run
    await prisma.subjectResultCorrectionRequest.deleteMany({
      where: { subjectResult: { institutionId, subjectId: mathSubjectId } },
    });
    await prisma.subjectResultAudit.deleteMany({
      where: { subjectResult: { institutionId, subjectId: mathSubjectId } },
    });
    await prisma.subjectResult.deleteMany({
      where: { institutionId, subjectId: mathSubjectId, sectionId: sectionAId },
    });

    // Reset or ensure Assessment Scheme with 15% Assignments category
    let scheme = await prisma.assessmentScheme.findFirst({
      where: { institutionId, subjectId: mathSubjectId, sectionId: sectionAId, academicTermId },
      include: { categories: true },
    });

    if (!scheme) {
      scheme = await prisma.assessmentScheme.create({
        data: {
          institutionId,
          subjectId: mathSubjectId,
          sectionId: sectionAId,
          academicTermId,
          title: 'Math Grade 10 Scheme',
          status: 'DRAFT',
          createdById: teacherUserId,
          categories: {
            create: [
              {
                name: 'Assignments',
                weightagePercentage: 15,
                description: 'Shared category for assignments (15% total)',
                displayOrder: 0,
              },
              {
                name: 'Quizzes',
                weightagePercentage: 15,
                description: 'Short quizzes',
                displayOrder: 1,
              },
              {
                name: 'Midterm Exam',
                weightagePercentage: 30,
                description: 'Midterm examination',
                displayOrder: 2,
              },
              {
                name: 'Final Exam',
                weightagePercentage: 40,
                description: 'Final examination',
                displayOrder: 3,
              },
            ],
          },
        },
        include: { categories: true },
      });
    }

    schemeId = scheme.id;
    const assignCat = scheme.categories.find((c) => c.name.toLowerCase().includes('assignment'));
    expect(assignCat).toBeDefined();
    assignmentsCategoryId = assignCat!.id;
  });

  afterAll(async () => {
    await prisma.subjectResultCorrectionRequest.deleteMany({
      where: { subjectResult: { institutionId, subjectId: mathSubjectId } },
    });
    await prisma.subjectResultAudit.deleteMany({
      where: { subjectResult: { institutionId, subjectId: mathSubjectId } },
    });
    await prisma.subjectResult.deleteMany({
      where: { institutionId, subjectId: mathSubjectId, sectionId: sectionAId },
    });
    await prisma.$disconnect();
  });

  describe('ISSUE 1: Shared Assignments Category (15%) for LMS and Assessment Items', () => {
    it('1.1. Fetching gradebook with empty category NEVER creates phantom assessment items', async () => {
      // Clear out all items in Assignments category first
      await prisma.assignmentSubmission.deleteMany({
        where: { assignment: { courseId } },
      });
      await prisma.assessmentSubmissionRecord.deleteMany({
        where: { assessmentItem: { assessmentCategoryId: assignmentsCategoryId } },
      });
      await prisma.studentAssessmentMark.deleteMany({
        where: { assessmentItem: { assessmentCategoryId: assignmentsCategoryId } },
      });
      await prisma.assignment.deleteMany({
        where: { courseId },
      });
      await prisma.assessmentItem.deleteMany({
        where: { assessmentCategoryId: assignmentsCategoryId },
      });

      const countBefore = await prisma.assessmentItem.count({
        where: { assessmentCategoryId: assignmentsCategoryId },
      });
      expect(countBefore).toBe(0);

      // GET /assessments/gradebook must be purely read-only
      const res = await request(app)
        .get('/api/v1/assessments/gradebook')
        .set('Authorization', `Bearer ${teacherToken}`)
        .query({ subjectId: mathSubjectId, sectionId: sectionAId, academicTermId });

      expect(res.status).toBe(200);

      // Confirm NO phantom items were inserted
      const countAfter = await prisma.assessmentItem.count({
        where: { assessmentCategoryId: assignmentsCategoryId },
      });
      expect(countAfter).toBe(0);
    });

    it('1.2. Creating an LMS Assignment attaches to Assignments category sharing the 15% weightage', async () => {
      const due = new Date();
      due.setDate(due.getDate() + 7);

      const res = await request(app)
        .post('/api/v1/lms/assignments')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          courseId,
          title: 'Calculus Assignment 1',
          instructions: 'Complete exercises 1 to 10',
          maxPoints: 100,
          dueDate: due.toISOString(),
          allowLateSubmissions: true,
          latePenaltyPercent: 5,
        });

      expect(res.status).toBe(201);
      lmsAssignmentId = res.body.data.id;
      lmsAssessmentItemId = res.body.data.assessmentItemId;
      expect(lmsAssessmentItemId).toBeDefined();

      const item = await prisma.assessmentItem.findUnique({
        where: { id: lmsAssessmentItemId },
        include: { category: true },
      });
      expect(item).not.toBeNull();
      expect(item!.assessmentCategoryId).toBe(assignmentsCategoryId);
      expect(item!.category.weightagePercentage).toBe(15);
    });

    it('1.3. Creating an Assessment-Only Assignment Item attaches to the same category without creating an LMS submission workflow', async () => {
      const res = await request(app)
        .post('/api/v1/assessments/items')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          assessmentCategoryId: assignmentsCategoryId,
          title: 'In-Class Paper Assignment',
          instructions: 'Handwritten assignment collected in class',
          maxMarks: 50,
          displayOrder: 2,
        });

      expect(res.status).toBe(201);
      manualAssessmentItemId = res.body.data.id;
      expect(manualAssessmentItemId).toBeDefined();

      // Verify no LMS Assignment was created for this assessment-only item
      const lmsMatch = await prisma.assignment.findFirst({
        where: { assessmentItemId: manualAssessmentItemId },
      });
      expect(lmsMatch).toBeNull();

      // Check scheme categories
      const schemeRes = await request(app)
        .get('/api/v1/assessments/schemes')
        .set('Authorization', `Bearer ${teacherToken}`)
        .query({ subjectId: mathSubjectId, sectionId: sectionAId, academicTermId });

      expect(schemeRes.status).toBe(200);
      const cat = schemeRes.body.data.categories.find((c: any) => c.id === assignmentsCategoryId);
      expect(cat.assessments.length).toBe(2);
      expect(cat.weightagePercentage).toBe(15);
    });

    it('1.4. Category contribution formula averages item percentages and strictly caps total category contribution at 15%', async () => {
      // Record marks for Student Alice:
      // Item 1 (LMS Assignment, max 100): 90 / 100 -> 90%
      // Item 2 (Manual Paper, max 50): 35 / 50 -> 70%
      // Average percentage = (90 + 70) / 2 = 80%
      // Category contribution = (80 / 100) * 15% = 12.0%
      await request(app)
        .post('/api/v1/assessments/gradebook/save')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          subjectId: mathSubjectId,
          sectionId: sectionAId,
          academicTermId,
          updates: [
            { assessmentItemId: lmsAssessmentItemId, studentId: studentAliceId, marksObtained: 90 },
            { assessmentItemId: manualAssessmentItemId, studentId: studentAliceId, marksObtained: 35 },
          ],
        });

      const res = await request(app)
        .get('/api/v1/assessments/section-results')
        .set('Authorization', `Bearer ${teacherToken}`)
        .query({ subjectId: mathSubjectId, sectionId: sectionAId, academicTermId });

      expect(res.status).toBe(200);
      const resultsList = res.body.data.results || res.body.data;
      const aliceResult = resultsList.find((r: any) => r.studentId === studentAliceId);
      expect(aliceResult).toBeDefined();

      const assignCatBreakdown = aliceResult.categoryBreakdown.find(
        (b: any) => b.categoryId === assignmentsCategoryId
      );
      expect(assignCatBreakdown).toBeDefined();
      expect(assignCatBreakdown.averagePercentage).toBeCloseTo(80, 1);
      expect(assignCatBreakdown.contribution).toBeCloseTo(12.0, 1);
      expect(assignCatBreakdown.contribution).toBeLessThanOrEqual(15.0);
    });
  });

  describe('ISSUE 2: Unified Gradebook Visibility & Lifecycle Workflow States', () => {
    it('2.1. (Problem A) Submitting to students publishes items and displays marks in student portal', async () => {
      const pubRes = await request(app)
        .post('/api/v1/assessments/results/submit-to-students')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          subjectId: mathSubjectId,
          sectionId: sectionAId,
          academicTermId,
          remarks: 'Provisional results published for student review',
        });

      expect(pubRes.status).toBe(200);

      // Verify assessment items have isPublished: true
      const items = await prisma.assessmentItem.findMany({
        where: { category: { assessmentSchemeId: schemeId } },
      });
      items.forEach((it) => {
        expect(it.isPublished).toBe(true);
      });

      // Verify Student Alice portal view displays her marks
      const studRes = await request(app)
        .get('/api/v1/assessments/student-result')
        .set('Authorization', `Bearer ${studentAliceToken}`)
        .query({ subjectId: mathSubjectId, academicTermId });

      expect(studRes.status).toBe(200);
      expect(studRes.body.data).not.toBeNull();
      expect(studRes.body.data.status).toBe(SubjectResultStatus.SUBMITTED_TO_STUDENTS);
      expect(studRes.body.data.totalPercentage).toBeGreaterThan(0);
      const studAssignCat = studRes.body.data.categoryBreakdown?.find((b: any) => b.categoryId === assignmentsCategoryId);
      if (studAssignCat) {
        expect(studAssignCat.contribution).toBeCloseTo(12.0, 1);
      }

      // Verify Gradebook columns show isPublished: true
      const gbRes = await request(app)
        .get('/api/v1/assessments/gradebook')
        .set('Authorization', `Bearer ${teacherToken}`)
        .query({ subjectId: mathSubjectId, sectionId: sectionAId, academicTermId });

      expect(gbRes.status).toBe(200);
      gbRes.body.data.columns.forEach((col: any) => {
        expect(col.isPublished).toBe(true);
      });
    });

    it('2.2. (Problem B) Submitting to Exam Dept locks teacher direct edits but PRESERVES all gradebook marks', async () => {
      const lockRes = await request(app)
        .post('/api/v1/assessments/results/submit-to-exam-dept')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          subjectId: mathSubjectId,
          sectionId: sectionAId,
          academicTermId,
          remarks: 'All marks finalized and submitted to Exam Dept',
        });

      expect(lockRes.status).toBe(200);

      // Teacher direct edits must now be rejected with 403
      const editAttempt = await request(app)
        .post('/api/v1/assessments/gradebook/save')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          subjectId: mathSubjectId,
          sectionId: sectionAId,
          academicTermId,
          updates: [{ assessmentItemId: lmsAssessmentItemId, studentId: studentAliceId, marksObtained: 99 }],
        });

      expect(editAttempt.status).toBe(403);
      const errMsg = editAttempt.body.message || editAttempt.body.error?.message || JSON.stringify(editAttempt.body);
      expect(errMsg).toContain('locked');

      // Gradebook must still render all students, columns, and marks without data disappearing!
      const gbRes = await request(app)
        .get('/api/v1/assessments/gradebook')
        .set('Authorization', `Bearer ${teacherToken}`)
        .query({ subjectId: mathSubjectId, sectionId: sectionAId, academicTermId });

      expect(gbRes.status).toBe(200);
      expect(gbRes.body.data.scheme.isLocked).toBe(true);
      expect(gbRes.body.data.scheme.subjectResultStatus).toBe(SubjectResultStatus.SUBMITTED_TO_EXAM_DEPARTMENT);
      expect(gbRes.body.data.rows.length).toBeGreaterThan(0);

      const aliceRow = gbRes.body.data.rows.find((r: any) => r.studentId === studentAliceId);
      expect(aliceRow).toBeDefined();
      expect(aliceRow.marks[lmsAssessmentItemId].marksObtained).toBe(90);
      expect(aliceRow.marks[manualAssessmentItemId].marksObtained).toBe(35);
      expect(aliceRow.result.totalPercentage).toBeGreaterThan(0);
      const rowAssignCat = aliceRow.result.categoryBreakdown?.find((b: any) => b.categoryId === assignmentsCategoryId);
      if (rowAssignCat) {
        expect(rowAssignCat.contribution).toBeCloseTo(12.0, 1);
      }
    });

    it('2.3. Exam Controller can access and review Gradebook without 403 errors', async () => {
      const ecGbRes = await request(app)
        .get('/api/v1/assessments/gradebook')
        .set('Authorization', `Bearer ${examControllerToken}`)
        .query({ subjectId: mathSubjectId, sectionId: sectionAId, academicTermId });

      expect(ecGbRes.status).toBe(200);
      expect(ecGbRes.body.data.scheme.isLocked).toBe(true);
      expect(ecGbRes.body.data.rows.length).toBeGreaterThan(0);

      // Exam Controller can also fetch institution assignments queue
      const tAssignRes = await request(app)
        .get('/api/v1/assessments/teacher/assignments')
        .set('Authorization', `Bearer ${examControllerToken}`);

      expect(tAssignRes.status).toBe(200);
      expect(tAssignRes.body.data.length).toBeGreaterThan(0);
    });

    it('2.4. Exam Controller officially approves and publishes results', async () => {
      const reviewRes = await request(app)
        .post('/api/v1/assessments/exam-dept/review')
        .set('Authorization', `Bearer ${examControllerToken}`)
        .send({
          subjectId: mathSubjectId,
          sectionId: sectionAId,
          academicTermId,
          status: 'OFFICIALLY_PUBLISHED',
          decision: 'OFFICIALLY_PUBLISH',
          notes: 'Officially published for academic transcript',
        });

      expect(reviewRes.status).toBe(200);

      // Verify student sees final published grade
      const studRes = await request(app)
        .get('/api/v1/assessments/student-result')
        .set('Authorization', `Bearer ${studentAliceToken}`)
        .query({ subjectId: mathSubjectId, academicTermId });

      expect(studRes.status).toBe(200);
      expect(studRes.body.data.status).toBe(SubjectResultStatus.OFFICIALLY_PUBLISHED);
      expect(studRes.body.data.isOfficiallyPublished).toBe(true);
    });
  });

  describe('ISSUE 3: Bi-directional Submission & Marks Integration Between LMS and Assessment', () => {
    let testAssignmentId: string;
    let testAssessmentItemId: string;

    beforeAll(async () => {
      // Re-open results to draft for Issue 3 tests
      await prisma.subjectResult.updateMany({
        where: { institutionId, subjectId: mathSubjectId, sectionId: sectionAId, academicTermId },
        data: { status: SubjectResultStatus.DRAFT },
      });

      const due = new Date();
      due.setDate(due.getDate() + 5);

      const assignRes = await request(app)
        .post('/api/v1/lms/assignments')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          courseId,
          title: 'Bi-directional Sync Project',
          instructions: 'Upload your research paper',
          maxPoints: 100,
          dueDate: due.toISOString(),
          allowLateSubmissions: true,
        });

      testAssignmentId = assignRes.body.data.id;
      testAssessmentItemId = assignRes.body.data.assessmentItemId;
    });

    it('3.1. Student submits via LMS and submission details appear in Assessment marks roster', async () => {
      const subRes = await request(app)
        .post(`/api/v1/lms/assignments/${testAssignmentId}/submit`)
        .set('Authorization', `Bearer ${studentAliceToken}`)
        .send({
          contentText: 'https://storage.googleapis.com/test-bucket/alice-paper.pdf',
          attachmentUrl: 'https://storage.googleapis.com/test-bucket/alice-paper.pdf',
        });

      expect(subRes.status).toBe(200);

      // Query Assessment Marks Roster (Tab 3 endpoint)
      const rosterRes = await request(app)
        .get(`/api/v1/assessments/items/${testAssessmentItemId}/roster`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .query({ sectionId: sectionAId });

      expect(rosterRes.status).toBe(200);
      const studentRow = rosterRes.body.data.students.find((s: any) => s.id === studentAliceId);
      expect(studentRow).toBeDefined();
      expect(studentRow.submission).not.toBeNull();
      expect(studentRow.submission.status).toBe('SUBMITTED');
      expect(studentRow.submission.contentText).toContain('alice-paper.pdf');
    });

    it('3.2. Teacher grades in Assessment Tab 3 and mark syncs back to LMS AssignmentSubmission', async () => {
      // Fetch submission ID from roster first
      const rosterRes = await request(app)
        .get(`/api/v1/assessments/items/${testAssessmentItemId}/roster`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .query({ sectionId: sectionAId });

      const studentRow = rosterRes.body.data.students.find((s: any) => s.id === studentAliceId);
      expect(studentRow?.submission).toBeDefined();

      const gradeRes = await request(app)
        .post(`/api/v1/assessments/submissions/${studentRow.submission.id}/grade`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          grade: 95,
          feedback: 'Excellent work and citations',
        });

      expect(gradeRes.status).toBe(200);

      // Also support batch saving from Assessment Tab 3
      const saveBatchRes = await request(app)
        .post('/api/v1/assessments/marks/batch')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          assessmentItemId: testAssessmentItemId,
          marks: [{ studentId: studentAliceId, marksObtained: 95, remarks: 'Excellent work and citations' }],
        });

      expect(saveBatchRes.status).toBe(200);

      // Check LMS AssignmentSubmission table
      const lmsSub = await prisma.assignmentSubmission.findUnique({
        where: {
          assignmentId_studentId: {
            assignmentId: testAssignmentId,
            studentId: studentAliceId,
          },
        },
      });

      expect(lmsSub).not.toBeNull();
      expect(lmsSub!.grade).toBe(95);
      expect(lmsSub!.feedback).toBe('Excellent work and citations');
      expect(lmsSub!.status).toBe('GRADED');
    });

    it('3.3. Teacher updates marks via Unified Gradebook matrix and LMS submission updates in tandem', async () => {
      const gbSaveRes = await request(app)
        .post('/api/v1/assessments/gradebook/save')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          subjectId: mathSubjectId,
          sectionId: sectionAId,
          academicTermId,
          updates: [
            {
              assessmentItemId: testAssessmentItemId,
              studentId: studentAliceId,
              marksObtained: 98,
              remarks: 'Upgraded to 98 after viva',
            },
          ],
        });

      expect(gbSaveRes.status).toBe(200);

      // Verify LMS record updated
      const lmsSub = await prisma.assignmentSubmission.findUnique({
        where: {
          assignmentId_studentId: {
            assignmentId: testAssignmentId,
            studentId: studentAliceId,
          },
        },
      });
      expect(lmsSub!.grade).toBe(98);
      expect(lmsSub!.feedback).toBe('Upgraded to 98 after viva');

      // Verify Assessment mark updated
      const mark = await prisma.studentAssessmentMark.findUnique({
        where: {
          assessmentItemId_studentId: {
            assessmentItemId: testAssessmentItemId,
            studentId: studentAliceId,
          },
        },
      });
      expect(mark!.marksObtained).toBe(98);
      expect(mark!.remarks).toBe('Upgraded to 98 after viva');
    });

    it('3.4. Assessment roster displays complete required metadata fields', async () => {
      const rosterRes = await request(app)
        .get(`/api/v1/assessments/items/${testAssessmentItemId}/roster`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .query({ sectionId: sectionAId });

      expect(rosterRes.status).toBe(200);
      const studentRow = rosterRes.body.data.students.find((s: any) => s.id === studentAliceId);
      expect(studentRow).toBeDefined();

      // Required fields inspection:
      expect(studentRow.admissionNumber).toBe('ADM-2026-001');
      expect(studentRow.user.firstName).toBeDefined();
      expect(studentRow.assignmentTitle).toBe('Bi-directional Sync Project');
      expect(studentRow.categoryName).toBe('Assignments');
      expect(studentRow.maxMarks).toBe(100);
      expect(studentRow.marksObtained).toBe(98);
      expect(studentRow.submissionStatus).toBe('GRADED');
      expect(studentRow.submittedAt).not.toBeNull();
      expect(studentRow.isLate).toBe(false);
      expect(studentRow.feedback).toBe('Upgraded to 98 after viva');
      expect(studentRow.weightedContribution).toBeGreaterThan(0);
    });
  });
});
