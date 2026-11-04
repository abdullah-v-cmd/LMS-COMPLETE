import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function auditAndRepair(applyFix: boolean = false) {
  console.log(`=== DATA REPAIR & AUDIT (applyFix = ${applyFix}) ===\n`);

  const report = {
    phantomItemsDetected: [] as any[],
    assignmentsWithoutItem: [] as any[],
    submissionsWithoutAssessmentRecord: [] as any[],
    gradedSubmissionsWithoutMarks: [] as any[],
    repairedCount: 0,
    skippedCount: 0,
    ambiguousCount: 0,
  };

  // 1. Inspect Assignments without AssessmentItem
  const unlinkedAssignments = await prisma.assignment.findMany({
    where: { assessmentItemId: null },
    include: { course: true },
  });
  console.log(`1. Unlinked assignments: ${unlinkedAssignments.length}`);
  for (const a of unlinkedAssignments) {
    report.assignmentsWithoutItem.push({
      id: a.id,
      title: a.title,
      courseId: a.courseId,
      courseTitle: a.course.title,
      subjectId: a.course.subjectId,
      sectionId: a.course.sectionId,
      academicTermId: a.course.academicTermId,
    });
  }

  // 2. Inspect Phantom Items in Assignments category
  // A phantom item is an AssessmentItem whose title matches the category name ("Assignments" or "Assignment"),
  // has NO linked Assignment (assignment == null), and has 0 marks and 0 submissions,
  // while other real assignment items exist in that category!
  const assignmentCategories = await prisma.assessmentCategory.findMany({
    where: {
      name: { in: ['Assignments', 'Assignment', 'assignments', 'assignment'] },
    },
    include: {
      assessments: {
        include: {
          assignment: true,
          _count: { select: { marks: true, submissions: true } },
        },
      },
      assessmentScheme: true,
    },
  });

  for (const cat of assignmentCategories) {
    const realItems = cat.assessments.filter((a) => a.assignment !== null);
    const phantomCandidates = cat.assessments.filter(
      (a) =>
        a.assignment === null &&
        (a.title.toLowerCase() === 'assignments' || a.title.toLowerCase() === 'assignment') &&
        a._count.marks === 0 &&
        a._count.submissions === 0
    );

    if (realItems.length > 0 && phantomCandidates.length > 0) {
      for (const p of phantomCandidates) {
        report.phantomItemsDetected.push({
          id: p.id,
          title: p.title,
          categoryId: cat.id,
          schemeId: cat.assessmentSchemeId,
          schemeTitle: cat.assessmentScheme.title,
          realItemsCount: realItems.length,
        });
      }
    }
  }
  console.log(`2. Phantom items in Assignments categories: ${report.phantomItemsDetected.length}`);

  // 3. Inspect Submissions without AssessmentSubmissionRecord or StudentAssessmentMark
  const lmsSubmissions = await prisma.assignmentSubmission.findMany({
    include: {
      assignment: {
        include: {
          assessmentItem: true,
          course: true,
        },
      },
    },
  });

  for (const sub of lmsSubmissions) {
    if (sub.assignment.assessmentItemId) {
      const assessmentSub = await prisma.assessmentSubmissionRecord.findUnique({
        where: {
          assessmentItemId_studentId: {
            assessmentItemId: sub.assignment.assessmentItemId,
            studentId: sub.studentId,
          },
        },
      });
      if (!assessmentSub) {
        report.submissionsWithoutAssessmentRecord.push({
          submissionId: sub.id,
          assignmentId: sub.assignmentId,
          assessmentItemId: sub.assignment.assessmentItemId,
          studentId: sub.studentId,
        });
      }

      if (sub.grade !== null && sub.grade !== undefined) {
        const mark = await prisma.studentAssessmentMark.findUnique({
          where: {
            assessmentItemId_studentId: {
              assessmentItemId: sub.assignment.assessmentItemId,
              studentId: sub.studentId,
            },
          },
        });
        if (!mark) {
          report.gradedSubmissionsWithoutMarks.push({
            submissionId: sub.id,
            grade: sub.grade,
            studentId: sub.studentId,
            assessmentItemId: sub.assignment.assessmentItemId,
          });
        }
      }
    }
  }

  console.log(`3. LMS submissions missing AssessmentSubmissionRecord: ${report.submissionsWithoutAssessmentRecord.length}`);
  console.log(`4. Graded LMS submissions missing StudentAssessmentMark: ${report.gradedSubmissionsWithoutMarks.length}`);

  if (applyFix) {
    console.log('\n--- Applying Safe Repairs ---');
    await prisma.$transaction(async (tx) => {
      // Clean up harmless phantom items that have 0 marks and 0 submissions where real items exist
      for (const p of report.phantomItemsDetected) {
        await tx.assessmentItem.delete({ where: { id: p.id } });
        report.repairedCount++;
        console.log(`  Removed phantom AssessmentItem: ${p.id} (${p.title}) in category ${p.categoryId}`);
      }

      // Backfill missing AssessmentSubmissionRecords
      for (const item of report.submissionsWithoutAssessmentRecord) {
        const sub = await tx.assignmentSubmission.findUniqueOrThrow({ where: { id: item.submissionId } });
        await tx.assessmentSubmissionRecord.create({
          data: {
            assessmentItemId: item.assessmentItemId,
            studentId: item.studentId,
            submittedAt: sub.submittedAt,
            contentText: sub.contentText,
            attachmentUrl: sub.attachmentUrl,
            status: sub.status as any,
            grade: sub.grade,
            feedback: sub.feedback,
            gradedByUserId: sub.gradedByUserId,
            gradedAt: sub.gradedAt,
          },
        });
        report.repairedCount++;
        console.log(`  Backfilled AssessmentSubmissionRecord for student ${item.studentId}`);
      }

      // Backfill missing StudentAssessmentMarks
      for (const g of report.gradedSubmissionsWithoutMarks) {
        const sub = await tx.assignmentSubmission.findUniqueOrThrow({ where: { id: g.submissionId } });
        await tx.studentAssessmentMark.create({
          data: {
            assessmentItemId: g.assessmentItemId,
            studentId: g.studentId,
            marksObtained: g.grade,
            remarks: sub.feedback,
            enteredByUserId: sub.gradedByUserId || 'system',
            status: 'PUBLISHED',
          },
        });
        report.repairedCount++;
        console.log(`  Backfilled StudentAssessmentMark for student ${g.studentId}`);
      }
    });
    console.log(`Repairs completed successfully: ${report.repairedCount} records repaired.`);
  }

  return report;
}

if (require.main === module) {
  auditAndRepair(process.argv.includes('--apply'))
    .then((r) => console.log('\nAudit summary:', r))
    .finally(() => prisma.$disconnect());
}

