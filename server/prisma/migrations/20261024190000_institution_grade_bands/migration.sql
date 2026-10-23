CREATE TABLE "institution_grade_bands" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "minimumPercentage" DOUBLE PRECISION NOT NULL,
    "gradeLetter" TEXT NOT NULL,
    "gpa" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "institution_grade_bands_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "institution_grade_bands_institutionId_minimumPercentage_key" ON "institution_grade_bands"("institutionId", "minimumPercentage");
CREATE UNIQUE INDEX "institution_grade_bands_institutionId_gradeLetter_key" ON "institution_grade_bands"("institutionId", "gradeLetter");
CREATE INDEX "institution_grade_bands_institutionId_minimumPercentage_idx" ON "institution_grade_bands"("institutionId", "minimumPercentage");
ALTER TABLE "institution_grade_bands" ADD CONSTRAINT "institution_grade_bands_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
