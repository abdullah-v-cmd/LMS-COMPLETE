-- Remove period-based attendance constraint and make periodNumber optional with default
ALTER TABLE "subject_attendance_records" ALTER COLUMN "periodNumber" DROP NOT NULL;
ALTER TABLE "subject_attendance_records" ALTER COLUMN "periodNumber" SET DEFAULT 1;

DROP INDEX IF EXISTS "subject_attendance_records_studentId_date_subjectId_periodNumber_key";
CREATE UNIQUE INDEX IF NOT EXISTS "subject_attendance_records_studentId_date_subjectId_key"
    ON "subject_attendance_records"("studentId", "date", "subjectId");

DROP INDEX IF EXISTS "subject_attendance_records_institutionId_sectionId_date_subjectId_periodNumber_idx";
CREATE INDEX IF NOT EXISTS "subject_attendance_records_institutionId_sectionId_date_subjectId_idx"
    ON "subject_attendance_records"("institutionId", "sectionId", "date", "subjectId");
