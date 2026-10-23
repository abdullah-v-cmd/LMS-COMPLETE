-- Subject and period attendance is stored separately so the existing
-- one-record-per-student-per-day homeroom constraint remains intact.
CREATE TABLE "subject_attendance_records" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "periodNumber" INTEGER NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "remarks" TEXT,
    "markedByUserId" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "subject_attendance_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subject_attendance_records_studentId_date_subjectId_periodNumber_key"
    ON "subject_attendance_records"("studentId", "date", "subjectId", "periodNumber");
CREATE INDEX "subject_attendance_records_institutionId_sectionId_date_subjectId_periodNumber_idx"
    ON "subject_attendance_records"("institutionId", "sectionId", "date", "subjectId", "periodNumber");

ALTER TABLE "subject_attendance_records" ADD CONSTRAINT "subject_attendance_records_institutionId_fkey"
    FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subject_attendance_records" ADD CONSTRAINT "subject_attendance_records_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subject_attendance_records" ADD CONSTRAINT "subject_attendance_records_sectionId_fkey"
    FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subject_attendance_records" ADD CONSTRAINT "subject_attendance_records_subjectId_fkey"
    FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attendance_corrections" ALTER COLUMN "attendanceRecordId" DROP NOT NULL;
ALTER TABLE "attendance_corrections" ADD COLUMN "subjectAttendanceRecordId" TEXT;
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_subjectAttendanceRecordId_fkey"
    FOREIGN KEY ("subjectAttendanceRecordId") REFERENCES "subject_attendance_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_exactly_one_record_check"
    CHECK (("attendanceRecordId" IS NULL) <> ("subjectAttendanceRecordId" IS NULL));
