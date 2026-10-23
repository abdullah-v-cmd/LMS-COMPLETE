CREATE TYPE "CounselingReferralStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');
ALTER TABLE "counseling_notes" ADD COLUMN "encryptedActionPlan" TEXT;
ALTER TABLE "counseling_cases" ALTER COLUMN "caseTitle" DROP NOT NULL;
ALTER TABLE "counseling_cases" ADD COLUMN "encryptedCaseTitle" TEXT;

CREATE TABLE "counseling_support_plans" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "title" TEXT,
    "goal" TEXT,
    "actions" TEXT,
    "encryptedTitle" TEXT,
    "encryptedGoal" TEXT,
    "encryptedActions" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "counseling_support_plans_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "counseling_follow_ups" (
    "id" TEXT NOT NULL,
    "supportPlanId" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "encryptedNotes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "counseling_follow_ups_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "counseling_referrals" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "referredByUserId" TEXT NOT NULL,
    "reason" TEXT,
    "encryptedReason" TEXT,
    "status" "CounselingReferralStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "counseling_referrals_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "counseling_at_risk_rules" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minimumAbsences" INTEGER NOT NULL,
    "lookbackDays" INTEGER NOT NULL,
    "minimumGradePercent" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "counseling_at_risk_rules_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "counseling_support_plans_institutionId_status_idx" ON "counseling_support_plans"("institutionId", "status");
CREATE INDEX "counseling_follow_ups_supportPlanId_dueAt_idx" ON "counseling_follow_ups"("supportPlanId", "dueAt");
CREATE INDEX "counseling_referrals_institutionId_status_createdAt_idx" ON "counseling_referrals"("institutionId", "status", "createdAt");
CREATE UNIQUE INDEX "counseling_at_risk_rules_institutionId_name_key" ON "counseling_at_risk_rules"("institutionId", "name");
ALTER TABLE "counseling_support_plans" ADD CONSTRAINT "counseling_support_plans_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "counseling_support_plans" ADD CONSTRAINT "counseling_support_plans_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "counseling_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "counseling_follow_ups" ADD CONSTRAINT "counseling_follow_ups_supportPlanId_fkey" FOREIGN KEY ("supportPlanId") REFERENCES "counseling_support_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "counseling_referrals" ADD CONSTRAINT "counseling_referrals_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "counseling_referrals" ADD CONSTRAINT "counseling_referrals_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "counseling_at_risk_rules" ADD CONSTRAINT "counseling_at_risk_rules_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
