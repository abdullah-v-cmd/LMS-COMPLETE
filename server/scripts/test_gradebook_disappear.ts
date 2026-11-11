import { PrismaClient, SubjectResultStatus } from '@prisma/client';
import { AssessmentService } from '../src/modules/assessment/assessment.service';
import { LmsService } from '../src/modules/lms/lms.service';

const prisma = new PrismaClient();

async function testFullLifecycle() {
  const teacherUser = await prisma.user.findFirstOrThrow({
    where: { email: 'teacher.math@alpha.edu' },
  });
  const institutionId = teacherUser.institutionId!;

  const math = await prisma.subject.findFirstOrThrow({
    where: { institutionId, code: 'MATH-101' },
  });
  const term = await prisma.academicTerm.findFirstOrThrow({
    where: { academicYear: { institutionId } },
  });
  const alice = await prisma.studentProfile.findFirstOrThrow({
    where: { admissionNumber: 'ADM-2026-001' },
    include: { user: true },
  });

  const authTeacher: any = {
    id: teacherUser.id,
    role: teacherUser.role,
    institutionId,
    email: teacherUser.email,
  };

  const authAlice: any = {
    id: alice.userId,
    role: 'ROLE_STUDENT',
    institutionId,
    email: alice.user.email,
  };

  // 1. Create Assessment Scheme for Math
  console.log('--- Step 1: Create Scheme ---');
  let scheme = await prisma.assessmentScheme.findFirst({
    where: { institutionId, subjectId: math.id, academicTermId: term.id, sectionId: alice.sectionId },
  });
  if (scheme) {
    await prisma.assessmentScheme.delete({ where: { id: scheme.id } });
  }

  scheme = await AssessmentService.createAssessmentScheme(institutionId, authTeacher, {
    academicTermId: term.id,
    subjectId: math.id,
    sectionId: alice.sectionId,
    title: 'Math Complete Scheme',
    categories: [
      { name: 'Assignments', weightagePercentage: 15 },
      { name: 'Quizzes', weightagePercentage: 15 },
      { name: 'Midterm', weightagePercentage: 30 },
      { name: 'Final', weightagePercentage: 40 },
    ],
  });
  console.log('Created scheme:', scheme.id, 'categories:', (scheme as any).categories?.map((c: any) => `${c.name}: ${c.weightagePercentage}%`));

  // Check initial gradebook
  console.log('\n--- Step 2: Initial Gradebook ---');
  let gb = await AssessmentService.getGradebook(institutionId, authTeacher, math.id, alice.sectionId, term.id);
  console.log('Columns count:', gb.columns.length);
  gb.columns.forEach((c: any) => console.log(`  Col: ${c.title} (Cat: ${c.categoryName}, Wt: ${c.weightage}%, Max: ${c.maxMarks}, AssignmentId: ${c.assignmentId})`));

  // 2. Create course if needed, then create LMS assignment
  console.log('\n--- Step 3: Create LMS Assignment ---');
  let course = await prisma.course.findFirst({
    where: { subjectId: math.id, sectionId: alice.sectionId, academicTermId: term.id },
  });
  if (!course) {
    const tp = await prisma.teacherProfile.findFirst({ where: { userId: teacherUser.id } });
    if (!tp) throw new Error('Teacher profile not found');
    course = await prisma.course.create({
      data: {
        institutionId,
        subjectId: math.id,
        sectionId: alice.sectionId,
        academicTermId: term.id,
        title: 'Math 101 Course',
        code: 'MATH101-' + Date.now(),
        teacherId: tp.id,
      },
    });
  }

  const assignment = await LmsService.createAssignment(institutionId, {
    courseId: course.id,
    title: 'Homework 1: Linear Algebra',
    instructions: 'Complete exercises 1 to 10',
    maxPoints: 100,
    dueDate: new Date(Date.now() + 86400000 * 7),
  }, authTeacher);
  console.log('Created assignment:', assignment.id, 'Linked AssessmentItemId:', assignment.assessmentItemId);

  // Check gradebook after assignment creation
  console.log('\n--- Step 4: Gradebook after assignment creation ---');
  gb = await AssessmentService.getGradebook(institutionId, authTeacher, math.id, alice.sectionId, term.id);
  console.log('Columns count:', gb.columns.length);
  gb.columns.forEach((c: any) => console.log(`  Col: ${c.title} (Cat: ${c.categoryName}, Wt: ${c.weightage}%, Max: ${c.maxMarks}, AssignmentId: ${c.assignmentId})`));

  // 3. Student submits assignment
  console.log('\n--- Step 5: Student Alice submits assignment ---');
  const sub = await LmsService.submitAssignment(assignment.id, authAlice, {
    contentText: 'Here is my Homework 1 solution.',
  }, institutionId);
  console.log('Submission ID:', sub.id, 'status:', sub.status);

  // 4. Teacher grades submission in LMS
  console.log('\n--- Step 6: Teacher grades submission ---');
  const graded = await LmsService.gradeSubmission(sub.id, teacherUser.id, {
    grade: 95,
    feedback: 'Excellent work Alice!',
  }, institutionId);
  console.log('Graded submission grade:', graded.grade, 'status:', graded.status);

  // Check gradebook marks
  console.log('\n--- Step 7: Gradebook marks after grading ---');
  gb = await AssessmentService.getGradebook(institutionId, authTeacher, math.id, alice.sectionId, term.id);
  const aliceRow = gb.rows.find((r: any) => r.studentId === alice.id);
  console.log('Alice marks in GB:', JSON.stringify(aliceRow?.marks));
  console.log('Alice result in GB:', aliceRow?.result);

  // Check student view before publish
  console.log('\n--- Step 8: Student View before publish ---');
  let stView = await AssessmentService.getStudentSubjectResult(institutionId, authAlice, math.id, term.id);
  console.log('Student view before publish (should be null):', stView);

  // 5. Teacher publishes to students (Button A)
  console.log('\n--- Step 9: Teacher publishes to students (Button A) ---');
  const pubRes = await AssessmentService.submitToStudents(institutionId, authTeacher, {
    subjectId: math.id,
    sectionId: alice.sectionId,
    academicTermId: term.id,
    remarks: 'Teacher published provisional marks',
  });
  console.log('Publish to students result:', pubRes);

  // Check gradebook after publish to students
  console.log('\n--- Step 10: Gradebook after Publish to Students ---');
  gb = await AssessmentService.getGradebook(institutionId, authTeacher, math.id, alice.sectionId, term.id);
  const aliceRowAfterPub = gb.rows.find((r: any) => r.studentId === alice.id);
  console.log('Alice marks in GB after publish:', JSON.stringify(aliceRowAfterPub?.marks));
  console.log('Alice result in GB after publish:', aliceRowAfterPub?.result);

  // Check student view after publish
  console.log('\n--- Step 11: Student View after publish ---');
  stView = await AssessmentService.getStudentSubjectResult(institutionId, authAlice, math.id, term.id);
  console.log('Student view after publish:', stView ? {
    displayGrade: stView.displayGrade,
    totalPercentage: stView.totalPercentage,
    categoriesCount: stView.assessmentScheme?.categories?.length,
    assessmentsInCategories: stView.assessmentScheme?.categories?.map((c: any) => `${c.name}: ${c.assessments?.length} items`),
  } : 'NULL!');

  // 6. Teacher submits to Exam Dept (Button B)
  console.log('\n--- Step 12: Teacher submits to Exam Dept (Button B) ---');
  const examDeptRes = await AssessmentService.submitToExamDepartment(institutionId, authTeacher, {
    subjectId: math.id,
    sectionId: alice.sectionId,
    academicTermId: term.id,
    remarks: 'Forwarded to Exam Dept',
  });
  console.log('Submit to exam dept result:', examDeptRes);

  // Check gradebook after Submit to Exam Dept
  console.log('\n--- Step 13: Gradebook after Submit to Exam Dept ---');
  gb = await AssessmentService.getGradebook(institutionId, authTeacher, math.id, alice.sectionId, term.id);
  const aliceRowAfterExamDept = gb.rows.find((r: any) => r.studentId === alice.id);
  console.log('Columns count:', gb.columns.length);
  console.log('Rows count:', gb.rows.length);
  console.log('Alice marks in GB after Exam Dept submission:', JSON.stringify(aliceRowAfterExamDept?.marks));
  console.log('Alice result in GB after Exam Dept submission:', aliceRowAfterExamDept?.result);
  console.log('Scheme isLocked:', gb.scheme?.isLocked, 'status:', gb.scheme?.subjectResultStatus);

  // Check student view after Submit to Exam Dept
  console.log('\n--- Step 14: Student View after Submit to Exam Dept ---');
  stView = await AssessmentService.getStudentSubjectResult(institutionId, authAlice, math.id, term.id);
  console.log('Student view after Exam Dept submission:', stView ? {
    displayGrade: stView.displayGrade,
    gradeInProgress: stView.gradeInProgress,
    totalPercentage: stView.totalPercentage,
    categoriesCount: stView.assessmentScheme?.categories?.length,
    assessmentsInCategories: stView.assessmentScheme?.categories?.map((c: any) => `${c.name}: ${c.assessments?.length} items`),
  } : 'NULL!');
}

testFullLifecycle().finally(() => prisma.$disconnect());
