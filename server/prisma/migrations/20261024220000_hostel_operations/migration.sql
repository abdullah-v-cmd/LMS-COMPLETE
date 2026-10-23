CREATE TYPE "HostelGatePassStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'DEPARTED', 'RETURNED');
CREATE TYPE "HostelChargeStatus" AS ENUM ('UNPAID', 'PAID', 'WAIVED');

CREATE UNIQUE INDEX "hostel_blocks_institutionId_name_key" ON "hostel_blocks"("institutionId", "name");
CREATE UNIQUE INDEX "hostel_bed_allocations_roomId_bedNumber_key" ON "hostel_bed_allocations"("roomId", "bedNumber");

CREATE TABLE "hostel_gate_passes" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "status" "HostelGatePassStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedReturnAt" TIMESTAMP(3) NOT NULL,
    "departedAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    CONSTRAINT "hostel_gate_passes_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "hostel_visitor_logs" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "studentId" TEXT,
    "visitorName" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exitedAt" TIMESTAMP(3),
    "loggedByUserId" TEXT NOT NULL,
    CONSTRAINT "hostel_visitor_logs_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "hostel_mess_charges" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "period" VARCHAR(7) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL,
    "status" "HostelChargeStatus" NOT NULL DEFAULT 'UNPAID',
    "createdByUserId" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "hostel_mess_charges_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "hostel_gate_passes_institutionId_status_requestedAt_idx" ON "hostel_gate_passes"("institutionId", "status", "requestedAt");
CREATE INDEX "hostel_visitor_logs_institutionId_enteredAt_idx" ON "hostel_visitor_logs"("institutionId", "enteredAt");
CREATE UNIQUE INDEX "hostel_mess_charges_studentId_period_key" ON "hostel_mess_charges"("studentId", "period");
CREATE INDEX "hostel_mess_charges_institutionId_period_status_idx" ON "hostel_mess_charges"("institutionId", "period", "status");
ALTER TABLE "hostel_gate_passes" ADD CONSTRAINT "hostel_gate_passes_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hostel_gate_passes" ADD CONSTRAINT "hostel_gate_passes_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hostel_visitor_logs" ADD CONSTRAINT "hostel_visitor_logs_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hostel_visitor_logs" ADD CONSTRAINT "hostel_visitor_logs_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "hostel_mess_charges" ADD CONSTRAINT "hostel_mess_charges_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hostel_mess_charges" ADD CONSTRAINT "hostel_mess_charges_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
