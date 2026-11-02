-- AlterTable: Add columns to assignments and assessment_items
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "weightagePercent" DOUBLE PRECISION;
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "assessmentItemId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "assignments_assessmentItemId_key" ON "assignments"("assessmentItemId");

-- AlterTable
ALTER TABLE "assessment_items" ADD COLUMN IF NOT EXISTS "weightagePercentage" DOUBLE PRECISION;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assignments_assessmentItemId_fkey'
  ) THEN
    ALTER TABLE "assignments" ADD CONSTRAINT "assignments_assessmentItemId_fkey" FOREIGN KEY ("assessmentItemId") REFERENCES "assessment_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
