CREATE TABLE "staff_compensations" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "teacherProfileId" TEXT NOT NULL,
    "monthlySalary" DECIMAL(12,2) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "staff_compensations_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "payroll_runs" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "period" VARCHAR(7) NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL,
    "totalGross" DECIMAL(14,2) NOT NULL,
    "generatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "payroll_entries" (
    "id" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "teacherProfileId" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "staffName" TEXT NOT NULL,
    "monthlySalary" DECIMAL(12,2) NOT NULL,
    CONSTRAINT "payroll_entries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "staff_compensations_teacherProfileId_effectiveFrom_key" ON "staff_compensations"("teacherProfileId", "effectiveFrom");
CREATE INDEX "staff_compensations_institutionId_effectiveFrom_idx" ON "staff_compensations"("institutionId", "effectiveFrom");
CREATE UNIQUE INDEX "payroll_runs_institutionId_period_key" ON "payroll_runs"("institutionId", "period");
CREATE UNIQUE INDEX "payroll_entries_payrollRunId_teacherProfileId_key" ON "payroll_entries"("payrollRunId", "teacherProfileId");
ALTER TABLE "staff_compensations" ADD CONSTRAINT "staff_compensations_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_compensations" ADD CONSTRAINT "staff_compensations_teacherProfileId_fkey" FOREIGN KEY ("teacherProfileId") REFERENCES "teacher_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_teacherProfileId_fkey" FOREIGN KEY ("teacherProfileId") REFERENCES "teacher_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
