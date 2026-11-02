-- AlterTable
ALTER TABLE "assessment_items" ADD COLUMN IF NOT EXISTS "examScheduleId" TEXT;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assessment_items_examScheduleId_fkey'
  ) THEN
    ALTER TABLE "assessment_items" ADD CONSTRAINT "assessment_items_examScheduleId_fkey" FOREIGN KEY ("examScheduleId") REFERENCES "exam_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
