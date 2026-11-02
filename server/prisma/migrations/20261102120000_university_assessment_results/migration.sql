-- Migration: University-Style Assessment, Weightage, and Automatic Result Management
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SubjectResultStatus') THEN
    CREATE TYPE "SubjectResultStatus" AS ENUM (
      'DRAFT',
      'SUBMITTED_TO_STUDENTS',
      'SUBMITTED_TO_EXAM_DEPARTMENT',
      'UNDER_EXAM_REVIEW',
      'APPROVED',
      'OFFICIALLY_PUBLISHED',
      'RETURNED_FOR_CORRECTION'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS "assessment_schemes" (
  "id" TEXT NOT NULL,
  "institutionId" TEXT NOT NULL,
  "academicTermId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "sectionId" TEXT,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "isPublished" BOOLEAN NOT NULL DEFAULT false,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "assessment_schemes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "assessment_schemes_subjectId_sectionId_academicTermId_key"
  ON "assessment_schemes"("subjectId", "sectionId", "academicTermId");
CREATE INDEX IF NOT EXISTS "assessment_schemes_institutionId_academicTermId_subjectId_idx"
  ON "assessment_schemes"("institutionId", "academicTermId", "subjectId");

CREATE TABLE IF NOT EXISTS "assessment_categories" (
  "id" TEXT NOT NULL,
  "assessmentSchemeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "weightagePercentage" DOUBLE PRECISION NOT NULL,
  "description" TEXT,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "assessment_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "assessment_items" (
  "id" TEXT NOT NULL,
  "assessmentCategoryId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "instructions" TEXT,
  "attachmentUrl" TEXT,
  "maxMarks" DOUBLE PRECISION NOT NULL DEFAULT 100,
  "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "assessmentDate" TIMESTAMP(3),
  "dueDate" TIMESTAMP(3),
  "isPublished" BOOLEAN NOT NULL DEFAULT false,
  "isLocked" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "assessment_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "assessment_deadline_histories" (
  "id" TEXT NOT NULL,
  "assessmentItemId" TEXT NOT NULL,
  "previousDueDate" TIMESTAMP(3),
  "newDueDate" TIMESTAMP(3) NOT NULL,
  "reason" TEXT NOT NULL,
  "changedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assessment_deadline_histories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "student_assessment_marks" (
  "id" TEXT NOT NULL,
  "assessmentItemId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "marksObtained" DOUBLE PRECISION,
  "isAbsent" BOOLEAN NOT NULL DEFAULT false,
  "isExcused" BOOLEAN NOT NULL DEFAULT false,
  "remarks" TEXT,
  "enteredByUserId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "student_assessment_marks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "student_assessment_marks_assessmentItemId_studentId_key"
  ON "student_assessment_marks"("assessmentItemId", "studentId");

CREATE TABLE IF NOT EXISTS "assessment_submission_records" (
  "id" TEXT NOT NULL,
  "assessmentItemId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "contentText" TEXT,
  "attachmentUrl" TEXT,
  "status" "SubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
  "feedback" TEXT,
  "grade" DOUBLE PRECISION,
  "gradedByUserId" TEXT,
  "gradedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "assessment_submission_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "assessment_submission_records_assessmentItemId_studentId_key"
  ON "assessment_submission_records"("assessmentItemId", "studentId");

CREATE TABLE IF NOT EXISTS "subject_results" (
  "id" TEXT NOT NULL,
  "institutionId" TEXT NOT NULL,
  "academicTermId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "sectionId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "assessmentSchemeId" TEXT NOT NULL,
  "categoryBreakdown" JSONB NOT NULL,
  "totalPercentage" DOUBLE PRECISION NOT NULL,
  "gradeLetter" TEXT NOT NULL,
  "gpa" DOUBLE PRECISION,
  "status" "SubjectResultStatus" NOT NULL DEFAULT 'DRAFT',
  "submittedToStudentsAt" TIMESTAMP(3),
  "submittedToExamDeptAt" TIMESTAMP(3),
  "approvedByUserId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "officiallyPublishedAt" TIMESTAMP(3),
  "teacherRemarks" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "subject_results_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "subject_results_subjectId_sectionId_studentId_academicTermId_key"
  ON "subject_results"("subjectId", "sectionId", "studentId", "academicTermId");
CREATE INDEX IF NOT EXISTS "subject_results_institutionId_academicTermId_subjectId_sectionId_idx"
  ON "subject_results"("institutionId", "academicTermId", "subjectId", "sectionId");
CREATE INDEX IF NOT EXISTS "subject_results_studentId_status_idx"
  ON "subject_results"("studentId", "status");

CREATE TABLE IF NOT EXISTS "subject_result_correction_requests" (
  "id" TEXT NOT NULL,
  "subjectResultId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "sectionId" TEXT NOT NULL,
  "currentMarks" DOUBLE PRECISION NOT NULL,
  "proposedMarks" DOUBLE PRECISION NOT NULL,
  "reason" TEXT NOT NULL,
  "supportingEvidence" TEXT,
  "requestedByUserId" TEXT NOT NULL,
  "reviewedByUserId" TEXT,
  "status" "CorrectionStatus" NOT NULL DEFAULT 'PENDING',
  "reviewNotes" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "previousSnapshot" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subject_result_correction_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "subject_result_audits" (
  "id" TEXT NOT NULL,
  "subjectResultId" TEXT,
  "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "previousState" JSONB,
  "newState" JSONB,
  "reason" TEXT,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subject_result_audits_pkey" PRIMARY KEY ("id")
);
