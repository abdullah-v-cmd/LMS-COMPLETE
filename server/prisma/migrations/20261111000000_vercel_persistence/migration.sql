-- CreateTable
CREATE TABLE IF NOT EXISTS "bank_integration_settings" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "bankName" TEXT NOT NULL DEFAULT 'National Education Bank',
    "accountTitle" TEXT NOT NULL DEFAULT 'EduFlow Institutional Tuition Reserve',
    "accountNumber" TEXT NOT NULL DEFAULT '0129-84729104-01',
    "ibanOrRoutingNumber" TEXT NOT NULL DEFAULT 'PK82NEBK01298472910401',
    "swiftBicCode" TEXT NOT NULL DEFAULT 'NEBKPKAXXX',
    "branchName" TEXT NOT NULL DEFAULT 'Main Campus Boulevard Branch',
    "branchCode" TEXT NOT NULL DEFAULT '0129',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "depositInstructions" TEXT NOT NULL DEFAULT 'Please specify the Student Admission Number and Invoice Number on your bank deposit slip or mobile bank transfer reference.',
    "gatewayProvider" TEXT NOT NULL DEFAULT 'MANUAL_DEPOSIT',
    "gatewayApiKeyEncrypted" TEXT,
    "gatewayMerchantId" TEXT,
    "isOnlinePaymentEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_integration_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "recycle_bin_records" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityTitle" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedBy" TEXT NOT NULL,
    "reason" TEXT,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recycle_bin_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "bank_integration_settings_institutionId_key" ON "bank_integration_settings"("institutionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "recycle_bin_records_institutionId_idx" ON "recycle_bin_records"("institutionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "recycle_bin_records_entityType_entityId_idx" ON "recycle_bin_records"("entityType", "entityId");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_integration_settings_institutionId_fkey') THEN
        ALTER TABLE "bank_integration_settings" ADD CONSTRAINT "bank_integration_settings_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recycle_bin_records_institutionId_fkey') THEN
        ALTER TABLE "recycle_bin_records" ADD CONSTRAINT "recycle_bin_records_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

