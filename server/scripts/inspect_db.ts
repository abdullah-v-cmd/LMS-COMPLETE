import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const schemes = await prisma.assessmentScheme.findMany({
    include: { categories: { include: { assessments: true } } },
  });
  console.log('Schemes count:', schemes.length);
  for (const s of schemes) {
    console.log(`Scheme: ${s.title} (ID: ${s.id}, Subject: ${s.subjectId}, Section: ${s.sectionId}, Term: ${s.academicTermId})`);
    for (const c of s.categories) {
      console.log(`  Category: ${c.name} (${c.weightagePercentage}%) - ${c.assessments.length} items`);
      for (const a of c.assessments) {
        console.log(`    Item: ${a.title} (ID: ${a.id}, Max: ${a.maxMarks}, Wt%: ${a.weightagePercentage}, ExamSched: ${a.examScheduleId})`);
      }
    }
  }

  const assignments = await prisma.assignment.findMany({
    include: { course: true, assessmentItem: true },
  });
  console.log('\nAssignments count:', assignments.length);
  for (const a of assignments) {
    console.log(`Assignment: ${a.title} (ID: ${a.id}, Course: ${a.course.title}, AssessmentItemId: ${a.assessmentItemId}, Linked: ${!!a.assessmentItem})`);
  }

  const marks = await prisma.studentAssessmentMark.findMany();
  console.log('\nStudentAssessmentMarks count:', marks.length);

  const subRecords = await prisma.assessmentSubmissionRecord.findMany();
  console.log('AssessmentSubmissionRecords count:', subRecords.length);

  const lmsSubs = await prisma.assignmentSubmission.findMany();
  console.log('AssignmentSubmissions count:', lmsSubs.length);

  const subjectResults = await prisma.subjectResult.findMany();
  console.log('SubjectResults count:', subjectResults.length);
  for (const sr of subjectResults) {
    console.log(`Result: Student: ${sr.studentId}, Status: ${sr.status}, TotalPct: ${sr.totalPercentage}, Grade: ${sr.gradeLetter}`);
  }
}

main().finally(() => prisma.$disconnect());

