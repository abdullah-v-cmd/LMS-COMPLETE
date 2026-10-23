CREATE TABLE "book_copies" (
  "id" TEXT NOT NULL,
  "bookId" TEXT NOT NULL,
  "barcode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "book_copies_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "book_borrow_records" ADD COLUMN "copyId" TEXT;
CREATE UNIQUE INDEX "book_copies_barcode_key" ON "book_copies"("barcode");
CREATE INDEX "book_copies_bookId_status_idx" ON "book_copies"("bookId", "status");
CREATE UNIQUE INDEX "book_borrow_records_copyId_key" ON "book_borrow_records"("copyId");
ALTER TABLE "book_copies" ADD CONSTRAINT "book_copies_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "book_catalogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "book_borrow_records" ADD CONSTRAINT "book_borrow_records_copyId_fkey" FOREIGN KEY ("copyId") REFERENCES "book_copies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- Backfill physical copy records without changing current inventory counts.
INSERT INTO "book_copies" ("id", "bookId", "barcode", "status")
SELECT ('copy_' || md5(random()::text || clock_timestamp()::text)), b."id", 'LIB-' || b."id" || '-' || n::text,
       CASE WHEN n <= b."availableCopies" THEN 'AVAILABLE' ELSE 'CHECKED_OUT' END
FROM "book_catalogs" b
CROSS JOIN LATERAL generate_series(1, b."totalCopies") AS n;
