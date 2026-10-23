CREATE TABLE "library_fine_policies" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "dailyFine" DECIMAL(10,2) NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL DEFAULT 'PKR',
    "updatedByUserId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "library_fine_policies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "library_fine_policies_institutionId_key" ON "library_fine_policies"("institutionId");
ALTER TABLE "library_fine_policies" ADD CONSTRAINT "library_fine_policies_institutionId_fkey"
    FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;