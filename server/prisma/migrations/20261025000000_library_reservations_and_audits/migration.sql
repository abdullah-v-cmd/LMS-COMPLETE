DROP INDEX IF EXISTS "book_borrow_records_copyId_key";
ALTER TABLE "book_borrow_records" ADD COLUMN "lostReportedAt" TIMESTAMP(3), ADD COLUMN "recoveredAt" TIMESTAMP(3);
CREATE TABLE "library_reservations" (
  "id" TEXT NOT NULL,
  "institutionId" TEXT NOT NULL,
  "bookId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "queuePosition" INTEGER NOT NULL,
  "assignedCopyId" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "fulfilledAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  CONSTRAINT "library_reservations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "library_reservations_assignedCopyId_key" ON "library_reservations"("assignedCopyId");
CREATE INDEX "library_reservations_institutionId_bookId_status_queuePosition_idx" ON "library_reservations"("institutionId", "bookId", "status", "queuePosition");
CREATE INDEX "library_reservations_studentId_bookId_status_idx" ON "library_reservations"("studentId", "bookId", "status");
CREATE UNIQUE INDEX "library_reservations_one_active_per_student_book_key" ON "library_reservations"("studentId", "bookId") WHERE "status" IN ('QUEUED', 'READY');
ALTER TABLE "library_reservations" ADD CONSTRAINT "library_reservations_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "library_reservations" ADD CONSTRAINT "library_reservations_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "book_catalogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "library_reservations" ADD CONSTRAINT "library_reservations_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "library_reservations" ADD CONSTRAINT "library_reservations_assignedCopyId_fkey" FOREIGN KEY ("assignedCopyId") REFERENCES "book_copies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE TABLE "library_inventory_audits" (
  "id" TEXT NOT NULL,
  "institutionId" TEXT NOT NULL,
  "bookId" TEXT NOT NULL,
  "performedByUserId" TEXT NOT NULL,
  "expectedCount" INTEGER NOT NULL,
  "scannedCount" INTEGER NOT NULL,
  "missingBarcodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "unexpectedBarcodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "library_inventory_audits_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "library_inventory_audits_institutionId_bookId_createdAt_idx" ON "library_inventory_audits"("institutionId", "bookId", "createdAt");
ALTER TABLE "library_inventory_audits" ADD CONSTRAINT "library_inventory_audits_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "library_inventory_audits" ADD CONSTRAINT "library_inventory_audits_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "book_catalogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
