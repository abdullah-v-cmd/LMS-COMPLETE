import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app';
import { prisma } from '../src/utils/prisma';

describe('Phase 6: finance refund workflow integration', () => {
  let app: Express;
  beforeAll(async () => { app = createApp(); await prisma.$connect(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('requests, reviews, and posts an offline refund atomically to invoice and ledger', async () => {
    const [clerkLogin, headLogin, clerk] = await Promise.all([
      request(app).post('/api/v1/auth/login').send({ usernameOrEmail: 'fee_clerk', password: 'Password123!' }),
      request(app).post('/api/v1/auth/login').send({ usernameOrEmail: 'finance_head', password: 'Password123!' }),
      prisma.user.findUniqueOrThrow({ where: { username: 'fee_clerk' }, select: { id: true, institutionId: true } }),
    ]);
    const student = await prisma.studentProfile.findFirstOrThrow({ where: { institutionId: clerk.institutionId!, admissionNumber: 'ADM-2026-001' } });
    const structure = await prisma.feeStructure.findFirstOrThrow({ where: { institutionId: clerk.institutionId! } });
    const invoice = await prisma.studentFeeInvoice.create({ data: {
      institutionId: clerk.institutionId!, studentId: student.id, feeStructureId: structure.id,
      invoiceNumber: `TEST-REFUND-${randomUUID()}`, totalAmount: 100, paidAmount: 0, balanceAmount: 100, dueDate: new Date(),
    } });
    const clerkToken = clerkLogin.body.data.accessToken;
    const headToken = headLogin.body.data.accessToken;
    const paymentResponse = await request(app).post('/api/v1/finance/payments').set('Authorization', `Bearer ${clerkToken}`).send({ invoiceId: invoice.id, amount: 60, paymentMethod: 'CASH' });
    expect(paymentResponse.status).toBe(201);
    const refundResponse = await request(app).post('/api/v1/finance/refunds').set('Authorization', `Bearer ${clerkToken}`).send({ paymentId: paymentResponse.body.data.id, amount: 25, reason: 'Duplicate offline collection adjustment' });
    expect(refundResponse.status).toBe(201);
    expect((await prisma.studentFeeInvoice.findUniqueOrThrow({ where: { id: invoice.id } })).paidAmount.toNumber()).toBe(60);

    const selfReview = await request(app).post(`/api/v1/finance/refunds/${refundResponse.body.data.id}/review`).set('Authorization', `Bearer ${clerkToken}`).send({ status: 'APPROVED' });
    expect(selfReview.status).toBe(403);
    const approved = await request(app).post(`/api/v1/finance/refunds/${refundResponse.body.data.id}/review`).set('Authorization', `Bearer ${headToken}`).send({ status: 'APPROVED' });
    expect(approved.status).toBe(200);
    expect(approved.body.data.status).toBe('APPROVED');
    const updatedInvoice = await prisma.studentFeeInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(updatedInvoice.paidAmount.toNumber()).toBe(35);
    expect(updatedInvoice.balanceAmount.toNumber()).toBe(65);
    const ledger = await prisma.financialLedgerEntry.findMany({ where: { institutionId: clerk.institutionId!, referenceType: 'REFUND', referenceId: refundResponse.body.data.id } });
    expect(ledger).toHaveLength(2);
    expect(ledger.reduce((sum, row) => sum + row.debitAmount.toNumber(), 0)).toBe(25);
    expect(ledger.reduce((sum, row) => sum + row.creditAmount.toNumber(), 0)).toBe(25);
  });
});
