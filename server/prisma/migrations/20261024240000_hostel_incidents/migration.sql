CREATE TABLE "hostel_incidents" (
  "id" TEXT NOT NULL,
  "institutionId" TEXT NOT NULL,
  "studentId" TEXT,
  "category" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "recordedByUserId" TEXT NOT NULL,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "hostel_incidents_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "hostel_incidents_institutionId_status_occurredAt_idx" ON "hostel_incidents"("institutionId", "status", "occurredAt");
ALTER TABLE "hostel_incidents" ADD CONSTRAINT "hostel_incidents_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hostel_incidents" ADD CONSTRAINT "hostel_incidents_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
