CREATE TABLE "exam_invigilators" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "examScheduleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedByUserId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "exam_invigilators_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "exam_invigilators_examScheduleId_userId_key" ON "exam_invigilators"("examScheduleId", "userId");
CREATE INDEX "exam_invigilators_institutionId_userId_isActive_idx" ON "exam_invigilators"("institutionId", "userId", "isActive");

ALTER TABLE "exam_invigilators" ADD CONSTRAINT "exam_invigilators_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_invigilators" ADD CONSTRAINT "exam_invigilators_examScheduleId_fkey" FOREIGN KEY ("examScheduleId") REFERENCES "exam_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_invigilators" ADD CONSTRAINT "exam_invigilators_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
