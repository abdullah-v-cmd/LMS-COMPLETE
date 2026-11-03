-- AlterTable
ALTER TABLE "exam_schedules" ADD COLUMN IF NOT EXISTS "pushStatus" TEXT NOT NULL DEFAULT 'NOT_PUSHED';
ALTER TABLE "exam_schedules" ADD COLUMN IF NOT EXISTS "pushedAt" TIMESTAMP(3);
ALTER TABLE "exam_schedules" ADD COLUMN IF NOT EXISTS "pushedByUserId" TEXT;
ALTER TABLE "exam_schedules" ADD COLUMN IF NOT EXISTS "pushVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE IF NOT EXISTS "exam_push_records" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "examScheduleId" TEXT NOT NULL,
    "assessmentItemId" TEXT NOT NULL,
    "pushedByUserId" TEXT NOT NULL,
    "pushVersion" INTEGER NOT NULL,
    "studentCount" INTEGER NOT NULL,
    "syncedMarks" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_push_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "exam_push_records_institutionId_examScheduleId_idx" ON "exam_push_records"("institutionId", "examScheduleId");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_push_records_institutionId_fkey') THEN
        ALTER TABLE "exam_push_records" ADD CONSTRAINT "exam_push_records_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_push_records_examScheduleId_fkey') THEN
        ALTER TABLE "exam_push_records" ADD CONSTRAINT "exam_push_records_examScheduleId_fkey" FOREIGN KEY ("examScheduleId") REFERENCES "exam_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_push_records_assessmentItemId_fkey') THEN
        ALTER TABLE "exam_push_records" ADD CONSTRAINT "exam_push_records_assessmentItemId_fkey" FOREIGN KEY ("assessmentItemId") REFERENCES "assessment_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
