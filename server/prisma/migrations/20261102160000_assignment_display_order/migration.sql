-- AlterTable
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "displayOrder" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "assessment_items" ADD COLUMN IF NOT EXISTS "displayOrder" INTEGER NOT NULL DEFAULT 1;
