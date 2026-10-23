CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "fee_refund_requests" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    CONSTRAINT "fee_refund_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "fee_refund_requests_institutionId_status_createdAt_idx"
    ON "fee_refund_requests"("institutionId", "status", "createdAt");

ALTER TABLE "fee_refund_requests" ADD CONSTRAINT "fee_refund_requests_institutionId_fkey"
    FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fee_refund_requests" ADD CONSTRAINT "fee_refund_requests_paymentId_fkey"
    FOREIGN KEY ("paymentId") REFERENCES "fee_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fee_refund_requests" ADD CONSTRAINT "fee_refund_requests_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "student_fee_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
