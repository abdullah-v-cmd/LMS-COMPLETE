import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/app';
import { prisma } from '../src/utils/prisma';

describe('Dynamic Assessment Categories ↔ Gradebook Synchronization Suite (Section 6)', () => {
  let app: Express;
  let teacherToken: string;
  let teacherUserId: string;
  let studentAliceId: string;
  let institutionId: string;
  let academicTermId: string;
  let term2Id: string;
  let mathSubjectId: string;
  let scienceSubjectId: string;
  let sectionAId: string;

  let schemeId: string;
  let presentationCategoryId: string;
  let initialItemId: string;

  beforeAll(async () => {
    app = createApp();
    await prisma.$connect();

    const tRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ usernameOrEmail: 'teacher.math@alpha.edu', password: 'Password123!' });
    expect(tRes.status).toBe(200);
    teacherToken = tRes.body.data.accessToken;
    teacherUserId = tRes.body.data.user.id;

    const teacherUser = await prisma.user.findUniqueOrThrow({
      where: { email: 'teacher.math@alpha.edu' },
      select: { institutionId: true },
    });
    institutionId = teacherUser.institutionId!;

    const terms = await prisma.academicTerm.findMany({
      where: { academicYear: { institutionId } },
      orderBy: { startDate: 'asc' },
    });
    academicTermId = terms[0].id;
    if (terms.length > 1) {
      term2Id = terms[1].id;
    } else {
      const createdTerm = await prisma.academicTerm.create({
        data: {
          academicYearId: terms[0].academicYearId,
          name: 'Spring Term 2027',
          startDate: new Date('2027-01-10'),
          endDate: new Date('2027-05-30'),
        },
      });
      term2Id = createdTerm.id;
    }

    const math = await prisma.subject.findFirstOrThrow({
      where: { institutionId, code: 'MATH-101' },
      select: { id: true },
    });
    mathSubjectId = math.id;

    let science = await prisma.subject.findFirst({
      where: { institutionId, code: 'SCI-101' },
      select: { id: true },
    });
    if (!science) {
      science = await prisma.subject.create({
        data: {
          institutionId,
          name: 'Science 101',
          code: 'SCI-101',
        },
      });
    }
    scienceSubjectId = science.id;

    const alice = await prisma.studentProfile.findFirstOrThrow({
      where: { admissionNumber: 'ADM-2026-001' },
      select: { id: true, sectionId: true },
    });
    studentAliceId = alice.id;
    sectionAId = alice.sectionId;

    // Clean up any existing records for fresh test run
    await prisma.subjectResultCorrectionRequest.deleteMany({
      where: { subjectResult: { institutionId, subjectId: mathSubjectId } },
    });
    await prisma.subjectResult.deleteMany({
      where: { institutionId, subjectId: mathSubjectId },
    });
    await prisma.assessmentScheme.deleteMany({
      where: { institutionId, subjectId: mathSubjectId, academicTermId },
    });
  });

  afterAll(async () => {
    await prisma.subjectResultCorrectionRequest.deleteMany({
      where: { subjectResult: { institutionId, subjectId: mathSubjectId } },
    });
    await prisma.subjectResult.deleteMany({
      where: { institutionId, subjectId: mathSubjectId },
    });
    await prisma.$disconnect();
  });

  it('1. Setting up initial scheme with Quizzes, Midterm, and Final (total 100%)', async () => {
    const res = await request(app)
      .post('/api/v1/assessments/schemes')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        academicTermId,
        subjectId: mathSubjectId,
        sectionId: sectionAId,
        title: 'Math Dynamic Scheme',
        categories: [
          { name: 'Quizzes', weightagePercentage: 20 },
          { name: 'Midterm', weightagePercentage: 30 },
          { name: 'Final', weightagePercentage: 50 },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    schemeId = res.body.data.id;
    expect(res.body.data.categories).toHaveLength(3);

    // Initial gradebook verify
    const gbRes = await request(app)
      .get('/api/v1/assessments/gradebook')
      .set('Authorization', `Bearer ${teacherToken}`)
      .query({ subjectId: mathSubjectId, sectionId: sectionAId, academicTermId });

    expect(gbRes.status).toBe(200);
    expect(gbRes.body.data.columns).toBeDefined();
    // Verify each category has a column ready in Gradebook
    const colNames = gbRes.body.data.columns.map((c: any) => c.categoryName);
    expect(colNames).toContain('Quizzes');
    expect(colNames).toContain('Midterm');
    expect(colNames).toContain('Final');

    // Save initial marks for Alice in Quizzes
    const quizCol = gbRes.body.data.columns.find((c: any) => c.categoryName === 'Quizzes');
    initialItemId = quizCol.id;
    const saveRes = await request(app)
      .post('/api/v1/assessments/gradebook/save')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        subjectId: mathSubjectId,
        sectionId: sectionAId,
        academicTermId,
        updates: [
          {
            assessmentItemId: initialItemId,
            studentId: studentAliceId,
            marksObtained: 85,
            isAbsent: false,
          },
        ],
      });
    expect(saveRes.status).toBe(200);
  });

  it('2. Adding Presentation automatically adds it to the correct Gradebook without separate manual config', async () => {
    // Add "Presentation" with 10%, reallocating weights to total 100%
    const currentScheme = await prisma.assessmentScheme.findUniqueOrThrow({
      where: { id: schemeId },
      include: { categories: true },
    });

    const quizzesCat = currentScheme.categories.find((c) => c.name === 'Quizzes')!;
    const midtermCat = currentScheme.categories.find((c) => c.name === 'Midterm')!;
    const finalCat = currentScheme.categories.find((c) => c.name === 'Final')!;

    const updateRes = await request(app)
      .put(`/api/v1/assessments/schemes/${schemeId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        title: 'Math Dynamic Scheme with Presentation',
        categories: [
          { id: quizzesCat.id, name: 'Quizzes', weightagePercentage: 15 },
          { id: midtermCat.id, name: 'Midterm', weightagePercentage: 25 },
          { id: finalCat.id, name: 'Final', weightagePercentage: 50 },
          { name: 'Presentation', weightagePercentage: 10, description: 'Oral presentations' },
        ],
      });

    expect(updateRes.status).toBe(200);
    const presCat = updateRes.body.data.categories.find((c: any) => c.name === 'Presentation');
    expect(presCat).toBeDefined();
    expect(presCat.weightagePercentage).toBe(10);
    presentationCategoryId = presCat.id;

    // Now query Gradebook: Presentation must appear automatically with configured weightage and marks column!
    const gbRes = await request(app)
      .get('/api/v1/assessments/gradebook')
      .set('Authorization', `Bearer ${teacherToken}`)
      .query({ subjectId: mathSubjectId, sectionId: sectionAId, academicTermId });

    expect(gbRes.status).toBe(200);
    const presCol = gbRes.body.data.columns.find((c: any) => c.categoryName === 'Presentation');
    expect(presCol).toBeDefined();
    expect(presCol.weightage).toBe(10);
    expect(presCol.maxMarks).toBe(100);
  });

  it('3. Changing Presentation weightage updates the Gradebook automatically', async () => {
    const currentScheme = await prisma.assessmentScheme.findUniqueOrThrow({
      where: { id: schemeId },
      include: { categories: true },
    });

    const quizzesCat = currentScheme.categories.find((c) => c.name === 'Quizzes')!;
    const midtermCat = currentScheme.categories.find((c) => c.name === 'Midterm')!;
    const finalCat = currentScheme.categories.find((c) => c.name === 'Final')!;
    const presCat = currentScheme.categories.find((c) => c.name === 'Presentation')!;

    // Change Presentation from 10% to 15%, reducing Final from 50% to 45%
    const updateRes = await request(app)
      .put(`/api/v1/assessments/schemes/${schemeId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        categories: [
          { id: quizzesCat.id, name: 'Quizzes', weightagePercentage: 15 },
          { id: midtermCat.id, name: 'Midterm', weightagePercentage: 25 },
          { id: finalCat.id, name: 'Final', weightagePercentage: 45 },
          { id: presCat.id, name: 'Presentation', weightagePercentage: 15 },
        ],
      });

    expect(updateRes.status).toBe(200);

    // Verify Gradebook reflects new weightage immediately
    const gbRes = await request(app)
      .get('/api/v1/assessments/gradebook')
      .set('Authorization', `Bearer ${teacherToken}`)
      .query({ subjectId: mathSubjectId, sectionId: sectionAId, academicTermId });

    expect(gbRes.status).toBe(200);
    const presCol = gbRes.body.data.columns.find((c: any) => c.categoryName === 'Presentation');
    expect(presCol).toBeDefined();
    expect(presCol.weightage).toBe(15);
  });

  it('4. Adding a category does not duplicate existing categories', async () => {
    const scheme = await prisma.assessmentScheme.findUniqueOrThrow({
      where: { id: schemeId },
      include: { categories: true },
    });

    const categoryNames = scheme.categories.map((c) => c.name.toLowerCase());
    const uniqueNames = new Set(categoryNames);
    expect(categoryNames.length).toBe(uniqueNames.size);
  });

  it('5. Categories from other subjects or terms do not appear in this Gradebook', async () => {
    // Create an assessment scheme in a different subject (Science 101)
    const otherScheme = await prisma.assessmentScheme.create({
      data: {
        institutionId,
        academicTermId,
        subjectId: scienceSubjectId,
        sectionId: sectionAId,
        title: 'Science Scheme',
        createdById: teacherUserId,
        status: 'DRAFT',
        categories: {
          create: [
            { name: 'Foreign Term Category', weightagePercentage: 100, displayOrder: 0 },
          ],
        },
      },
    });

    // Query Gradebook for term 1
    const gbRes = await request(app)
      .get('/api/v1/assessments/gradebook')
      .set('Authorization', `Bearer ${teacherToken}`)
      .query({ subjectId: mathSubjectId, sectionId: sectionAId, academicTermId });

    expect(gbRes.status).toBe(200);
    const colNames = gbRes.body.data.columns.map((c: any) => c.categoryName);
    expect(colNames).not.toContain('Foreign Term Category');

    // Clean up otherScheme
    await prisma.assessmentScheme.delete({ where: { id: otherScheme.id } });
  });

  it('6. Existing student marks remain completely preserved when adding or editing categories', async () => {
    // Query Alice's marks in Gradebook
    const gbRes = await request(app)
      .get('/api/v1/assessments/gradebook')
      .set('Authorization', `Bearer ${teacherToken}`)
      .query({ subjectId: mathSubjectId, sectionId: sectionAId, academicTermId });

    expect(gbRes.status).toBe(200);
    const aliceRow = gbRes.body.data.rows.find((r: any) => r.studentId === studentAliceId);
    expect(aliceRow).toBeDefined();

    // Alice's marks in Quizzes (initialItemId) must still be 85!
    expect(aliceRow.marks[initialItemId]).toBeDefined();
    expect(aliceRow.marks[initialItemId].marksObtained).toBe(85);
  });

  it('7. Invalid weightage totals (< 100% or > 100%) are rejected', async () => {
    const currentScheme = await prisma.assessmentScheme.findUniqueOrThrow({
      where: { id: schemeId },
      include: { categories: true },
    });

    // Exceeds 100% -> must be rejected with 400
    const overRes = await request(app)
      .put(`/api/v1/assessments/schemes/${schemeId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        categories: currentScheme.categories.map((c) => ({
          id: c.id,
          name: c.name,
          weightagePercentage: 35, // 4 * 35 = 140%
        })),
      });

    expect(overRes.status).toBe(400);

    // Below 100% -> must be rejected with 400
    const underRes = await request(app)
      .put(`/api/v1/assessments/schemes/${schemeId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        categories: currentScheme.categories.map((c) => ({
          id: c.id,
          name: c.name,
          weightagePercentage: 10, // 4 * 10 = 40%
        })),
      });

    expect(underRes.status).toBe(400);
  });

  it("8. Final grade calculations use each category's weight exactly once", async () => {
    // Enter marks for Alice across all categories:
    // Quizzes (15%): 80/100 -> 12.0
    // Presentation (15%): 90/100 -> 13.5
    // Midterm (25%): 70/100 -> 17.5
    // Final (45%): 80/100 -> 36.0
    // Expected total: 12.0 + 13.5 + 17.5 + 36.0 = 79.0%
    const gbRes = await request(app)
      .get('/api/v1/assessments/gradebook')
      .set('Authorization', `Bearer ${teacherToken}`)
      .query({ subjectId: mathSubjectId, sectionId: sectionAId, academicTermId });

    const cols = gbRes.body.data.columns;
    const quizCol = cols.find((c: any) => c.categoryName === 'Quizzes')!;
    const presCol = cols.find((c: any) => c.categoryName === 'Presentation')!;
    const midCol = cols.find((c: any) => c.categoryName === 'Midterm')!;
    const finalCol = cols.find((c: any) => c.categoryName === 'Final')!;

    await request(app)
      .post('/api/v1/assessments/gradebook/save')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        subjectId: mathSubjectId,
        sectionId: sectionAId,
        academicTermId,
        updates: [
          { assessmentItemId: quizCol.id, studentId: studentAliceId, marksObtained: 80 },
          { assessmentItemId: presCol.id, studentId: studentAliceId, marksObtained: 90 },
          { assessmentItemId: midCol.id, studentId: studentAliceId, marksObtained: 70 },
          { assessmentItemId: finalCol.id, studentId: studentAliceId, marksObtained: 80 },
        ],
      });

    // Check calculated section results
    const resultsRes = await request(app)
      .get('/api/v1/assessments/section-results')
      .set('Authorization', `Bearer ${teacherToken}`)
      .query({ subjectId: mathSubjectId, sectionId: sectionAId, academicTermId });

    expect(resultsRes.status).toBe(200);
    const aliceRes = resultsRes.body.data.results.find((r: any) => r.studentId === studentAliceId);
    expect(aliceRes).toBeDefined();
    expect(aliceRes.totalPercentage).toBeCloseTo(79.0, 1);

    // Verify category breakdown shows each category weighted once
    const breakdown = aliceRes.categoryBreakdown as any[];
    expect(breakdown).toHaveLength(4);
    const sumCategoryWeights = breakdown.reduce((sum, b) => sum + b.weightage, 0);
    expect(sumCategoryWeights).toBeCloseTo(100, 1);
  });

  it('9. Saving gradebook with "marks" payload or string marks succeeds without 400 validation error', async () => {
    const gbRes = await request(app)
      .get('/api/v1/assessments/gradebook')
      .set('Authorization', `Bearer ${teacherToken}`)
      .query({ subjectId: mathSubjectId, sectionId: sectionAId, academicTermId });

    const cols = gbRes.body.data.columns;
    const quizCol = cols.find((c: any) => c.categoryName === 'Quizzes')!;

    // Send payload formatted exactly as frontend batch save mutation (using 'marks' array and strings)
    const saveRes = await request(app)
      .post('/api/v1/assessments/gradebook/save')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        subjectId: mathSubjectId,
        sectionId: sectionAId,
        academicTermId,
        marks: [
          {
            assessmentItemId: quizCol.id,
            studentId: studentAliceId,
            marksObtained: '88', // string number from frontend input
            isAbsent: false,
            isExcused: false,
            remarks: 'Great improvement',
          },
        ],
      });

    expect(saveRes.status).toBe(200);
    expect(saveRes.body.success).toBe(true);

    // Verify marks were recorded
    const verifyGb = await request(app)
      .get('/api/v1/assessments/gradebook')
      .set('Authorization', `Bearer ${teacherToken}`)
      .query({ subjectId: mathSubjectId, sectionId: sectionAId, academicTermId });

    const aliceRow = verifyGb.body.data.rows.find((s: any) => s.studentId === studentAliceId);
    expect(aliceRow.marks[quizCol.id].marksObtained).toBe(88);
  });
});
