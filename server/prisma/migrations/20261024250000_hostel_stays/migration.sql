CREATE TABLE "hostel_stays" (
  "id" TEXT NOT NULL,
  "institutionId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "checkedInAt" TIMESTAMP(3) NOT NULL,
  "checkedOutAt" TIMESTAMP(3),
  "recordedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "hostel_stays_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "hostel_stays_institutionId_checkedInAt_idx" ON "hostel_stays"("institutionId", "checkedInAt");
CREATE INDEX "hostel_stays_studentId_checkedOutAt_idx" ON "hostel_stays"("studentId", "checkedOutAt");
ALTER TABLE "hostel_stays" ADD CONSTRAINT "hostel_stays_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hostel_stays" ADD CONSTRAINT "hostel_stays_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hostel_stays" ADD CONSTRAINT "hostel_stays_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "hostel_rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
