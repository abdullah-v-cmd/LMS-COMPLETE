import { InvoiceStatus, PaymentMethod, Prisma, RefundStatus, UserRole, WaiverStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuthenticatedUser } from '../../types';
import { prisma } from '../../utils/prisma';

const decimal = (value: number) => new Prisma.Decimal(value.toFixed(2));
const notFound = (message: string) => ({ status: 404, message });

export class FinanceService {
  static async getFeeStructures(institutionId: string) {
    return prisma.feeStructure.findMany({ where: { institutionId }, include: { classGrade: true, academicYear: true }, orderBy: { createdAt: 'desc' } });
  }

  static async createFeeStructure(institutionId: string, data: { academicYearId: string; classGradeId: string; name: string; amount: number; dueDate: string; frequency: string }) {
    const [year, grade] = await Promise.all([
      prisma.academicYear.findFirst({ where: { id: data.academicYearId, institutionId } }),
      prisma.classGrade.findFirst({ where: { id: data.classGradeId, institutionId } }),
    ]);
    if (!year || !grade) throw notFound('Academic year or class not found in this institution');
    return prisma.feeStructure.create({ data: { ...data, institutionId, amount: decimal(data.amount), dueDate: new Date(`${data.dueDate}T00:00:00.000Z`) } });
  }

  static async generateInvoices(institutionId: string, actorId: string, feeStructureId: string) {
    return prisma.$transaction(async (tx) => {
      const structure = await tx.feeStructure.findFirst({ where: { id: feeStructureId, institutionId } });
      if (!structure) throw notFound('Fee structure not found in this institution');
      const students = await tx.studentProfile.findMany({
        where: { institutionId, status: 'ENROLLED', section: { classGradeId: structure.classGradeId } },
        select: { id: true },
      });
      let created = 0;
      for (const student of students) {
        const existing = await tx.studentFeeInvoice.findFirst({ where: { institutionId, studentId: student.id, feeStructureId } });
        if (existing) continue;
        const invoice = await tx.studentFeeInvoice.create({
          data: {
            institutionId,
            studentId: student.id,
            feeStructureId,
            invoiceNumber: `INV-${randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase()}`,
            totalAmount: structure.amount,
            balanceAmount: structure.amount,
            dueDate: structure.dueDate,
          },
        });
        await tx.financialLedgerEntry.createMany({
          data: [
            { institutionId, accountCode: '1100-ACCOUNTS-RECEIVABLE', debitAmount: structure.amount, referenceType: 'INVOICE', referenceId: invoice.id, description: `Invoice ${invoice.invoiceNumber} receivable`, createdByUserId: actorId },
            { institutionId, accountCode: '4000-FEE-REVENUE', creditAmount: structure.amount, referenceType: 'INVOICE', referenceId: invoice.id, description: `Invoice ${invoice.invoiceNumber} revenue`, createdByUserId: actorId },
          ],
        });
        created += 1;
      }
      return { invoicesCreated: created, studentsSkipped: students.length - created };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  static async getInvoices(institutionId: string, user: AuthenticatedUser) {
    let studentIds: string[] | undefined;
    if (user.role === UserRole.ROLE_STUDENT) {
      const student = await prisma.studentProfile.findFirst({ where: { userId: user.id, institutionId }, select: { id: true } });
      studentIds = student ? [student.id] : [];
    } else if (user.role === UserRole.ROLE_PARENT) {
      const parent = await prisma.parentProfile.findFirst({ where: { userId: user.id, institutionId }, select: { id: true } });
      const links = parent ? await prisma.studentParentRelation.findMany({ where: { parentId: parent.id, student: { institutionId } }, select: { studentId: true } }) : [];
      studentIds = links.map((link) => link.studentId);
    }
    return prisma.studentFeeInvoice.findMany({
      where: { institutionId, ...(studentIds !== undefined && { studentId: { in: studentIds } }) },
      include: {
        student: { select: { id: true, admissionNumber: true, rollNumber: true, user: { select: { firstName: true, lastName: true } } } },
        feeStructure: true,
        payments: true,
        waivers: true,
        refunds: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    });
  }

  static async getWaivers(institutionId: string) {
    return prisma.feeWaiverRequest.findMany({ where: { institutionId }, include: { invoice: { select: { invoiceNumber: true, balanceAmount: true, student: { select: { admissionNumber: true, user: { select: { firstName: true, lastName: true } } } } } } }, orderBy: { createdAt: 'desc' } });
  }

  static async getRefunds(institutionId: string) {
    return prisma.feeRefundRequest.findMany({
      where: { institutionId },
      include: {
        payment: { select: { receiptNumber: true, paymentMethod: true, amountPaid: true } },
        invoice: { select: { invoiceNumber: true, student: { select: { admissionNumber: true, user: { select: { firstName: true, lastName: true } } } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async requestRefund(institutionId: string, makerId: string, data: { paymentId: string; amount: number; reason: string }) {
    const amount = decimal(data.amount);
    return prisma.$transaction(async (tx) => {
      const [maker, payment] = await Promise.all([
        tx.user.findFirst({ where: { id: makerId, institutionId }, select: { id: true } }),
        tx.feePayment.findFirst({ where: { id: data.paymentId, institutionId }, include: { invoice: true } }),
      ]);
      if (!maker) throw { status: 403, message: 'Refund requester is not a member of this institution' };
      if (!payment || payment.invoice.institutionId !== institutionId) throw notFound('Payment not found in this institution');
      if (payment.paymentMethod === PaymentMethod.ONLINE) throw { status: 409, message: 'Provider-processed refunds are unavailable until payment-provider integration is configured' };
      if (payment.invoice.status === InvoiceStatus.CANCELLED) throw { status: 409, message: 'Cancelled invoices cannot be refunded' };
      const reserved = await tx.feeRefundRequest.aggregate({ where: { paymentId: payment.id, status: { in: [RefundStatus.PENDING, RefundStatus.APPROVED] } }, _sum: { amount: true } });
      const remainingOnPayment = payment.amountPaid.sub(reserved._sum.amount ?? decimal(0));
      if (amount.gt(remainingOnPayment)) throw { status: 400, message: 'Refund requests cannot exceed the unrefunded payment amount' };
      return tx.feeRefundRequest.create({ data: { institutionId, paymentId: payment.id, invoiceId: payment.invoiceId, amount, reason: data.reason, requestedByUserId: makerId } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  static async reviewRefund(institutionId: string, requestId: string, reviewerId: string, status: 'APPROVED' | 'REJECTED') {
    return prisma.$transaction(async (tx) => {
      const reviewer = await tx.user.findFirst({ where: { id: reviewerId, institutionId }, select: { role: true } });
      const approverRoles: UserRole[] = [UserRole.ROLE_SUPER_ADMIN, UserRole.ROLE_INSTITUTION_ADMIN, UserRole.ROLE_FINANCE_HEAD];
      if (!reviewer || !approverRoles.includes(reviewer.role)) throw { status: 403, message: 'Only an authorized finance checker may review refunds' };
      const refund = await tx.feeRefundRequest.findFirst({ where: { id: requestId, institutionId }, include: { payment: true, invoice: true } });
      if (!refund) throw notFound('Refund request not found in this institution');
      if (refund.requestedByUserId === reviewerId) throw { status: 403, message: 'Maker-Checker violation: You cannot approve your own refund request' };
      if (refund.status !== RefundStatus.PENDING) throw { status: 409, message: 'Refund request has already been reviewed' };
      const claimed = await tx.feeRefundRequest.updateMany({ where: { id: requestId, institutionId, status: RefundStatus.PENDING }, data: { status: status as RefundStatus, approvedByUserId: reviewerId, reviewedAt: new Date() } });
      if (claimed.count !== 1) throw { status: 409, message: 'Refund request has already been reviewed' };
      if (status === 'APPROVED') {
        const paymentReservations = await tx.feeRefundRequest.aggregate({ where: { paymentId: refund.paymentId, status: RefundStatus.APPROVED, id: { not: refund.id } }, _sum: { amount: true } });
        const alreadyRefunded = paymentReservations._sum.amount ?? decimal(0);
        if (refund.amount.gt(refund.payment.amountPaid.sub(alreadyRefunded))) throw { status: 409, message: 'Payment amount is no longer sufficient for this refund' };
        const currentInvoice = await tx.studentFeeInvoice.findFirst({ where: { id: refund.invoiceId, institutionId } });
        if (!currentInvoice || currentInvoice.status === InvoiceStatus.CANCELLED) throw { status: 409, message: 'Invoice is no longer eligible for refund' };
        const nextPaid = currentInvoice.paidAmount.sub(refund.amount);
        const nextBalance = currentInvoice.balanceAmount.add(refund.amount);
        const netCharge = currentInvoice.totalAmount.sub(currentInvoice.discountAmount);
        if (currentInvoice.paidAmount.lt(refund.amount) || nextBalance.gt(netCharge)) throw { status: 409, message: 'Invoice totals changed; refund would make its balance inconsistent' };
        await tx.studentFeeInvoice.update({ where: { id: currentInvoice.id }, data: { paidAmount: { decrement: refund.amount }, balanceAmount: { increment: refund.amount }, status: nextPaid.isZero() ? InvoiceStatus.UNPAID : InvoiceStatus.PARTIAL } });
        const refundAccount = refund.payment.paymentMethod === PaymentMethod.CASH ? '1000-CASH' : refund.payment.paymentMethod === PaymentMethod.CHEQUE ? '1010-CHEQUE-CLEARING' : '1020-BANK';
        await tx.financialLedgerEntry.createMany({ data: [
          { institutionId, accountCode: '1100-ACCOUNTS-RECEIVABLE', debitAmount: refund.amount, referenceType: 'REFUND', referenceId: refund.id, description: `Approved refund for receipt ${refund.paymentId}`, createdByUserId: reviewerId },
          { institutionId, accountCode: refundAccount, creditAmount: refund.amount, referenceType: 'REFUND', referenceId: refund.id, description: `Refund of fee payment ${refund.paymentId}`, createdByUserId: reviewerId },
        ] });
      }
      await tx.notification.create({ data: { institutionId, userId: refund.requestedByUserId, title: `Fee refund ${status.toLowerCase()}`, message: `Your fee refund request has been ${status.toLowerCase()}.`, type: status === 'APPROVED' ? 'SUCCESS' : 'INFO' } });
      return tx.feeRefundRequest.findUniqueOrThrow({ where: { id: requestId } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  static async recordPayment(institutionId: string, actorId: string, data: { invoiceId: string; amount: number; paymentMethod: PaymentMethod; transactionRef?: string }) {
    if (data.paymentMethod === PaymentMethod.ONLINE) throw { status: 400, message: 'Online payments require verified payment-provider integration' };
    const amount = decimal(data.amount);
    return prisma.$transaction(async (tx) => {
      const invoice = await tx.studentFeeInvoice.findFirst({ where: { id: data.invoiceId, institutionId } });
      if (!invoice) throw notFound('Invoice not found in this institution');
      if (invoice.status === InvoiceStatus.CANCELLED) throw { status: 409, message: 'Cancelled invoices cannot accept payment' };
      if (amount.gt(invoice.balanceAmount)) throw { status: 400, message: 'Payment exceeds the current invoice balance' };
      const payment = await tx.feePayment.create({
        data: {
          institutionId,
          invoiceId: invoice.id,
          studentId: invoice.studentId,
          receiptNumber: `RCT-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`,
          amountPaid: amount,
          paymentMethod: data.paymentMethod,
          transactionRef: data.transactionRef,
          collectedByUserId: actorId,
        },
      });
      const balance = invoice.balanceAmount.sub(amount);
      await tx.studentFeeInvoice.update({
        where: { id: invoice.id },
        data: { paidAmount: { increment: amount }, balanceAmount: { decrement: amount }, status: balance.isZero() ? InvoiceStatus.PAID : InvoiceStatus.PARTIAL },
      });
      const cashAccount = data.paymentMethod === PaymentMethod.CASH ? '1000-CASH' : data.paymentMethod === PaymentMethod.CHEQUE ? '1010-CHEQUE-CLEARING' : '1020-BANK';
      await tx.financialLedgerEntry.createMany({
        data: [
          { institutionId, accountCode: cashAccount, debitAmount: amount, referenceType: 'PAYMENT', referenceId: payment.id, description: `Receipt ${payment.receiptNumber}`, createdByUserId: actorId },
          { institutionId, accountCode: '1100-ACCOUNTS-RECEIVABLE', creditAmount: amount, referenceType: 'PAYMENT', referenceId: payment.id, description: `Receipt ${payment.receiptNumber}`, createdByUserId: actorId },
        ],
      });
      return payment;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  static async requestWaiver(institutionId: string, makerId: string, data: { invoiceId: string; amount: number; reason: string }) {
    const invoice = await prisma.studentFeeInvoice.findFirst({ where: { id: data.invoiceId, institutionId } });
    if (!invoice) throw notFound('Invoice not found in this institution');
    const amount = decimal(data.amount);
    if (amount.gt(invoice.balanceAmount)) throw { status: 400, message: 'Waiver exceeds the outstanding invoice balance' };
    if (invoice.status === InvoiceStatus.CANCELLED || invoice.status === InvoiceStatus.PAID) throw { status: 409, message: 'This invoice cannot accept a waiver' };
    const pending = await prisma.feeWaiverRequest.findFirst({ where: { invoiceId: invoice.id, status: WaiverStatus.PENDING } });
    if (pending) throw { status: 409, message: 'A waiver request is already pending for this invoice' };
    return prisma.feeWaiverRequest.create({ data: { institutionId, invoiceId: invoice.id, waiverAmount: amount, reason: data.reason, requestedByUserId: makerId } });
  }

  static async reviewWaiver(institutionId: string, requestId: string, reviewerId: string, status: 'APPROVED' | 'REJECTED') {
    return prisma.$transaction(async (tx) => {
      const waiver = await tx.feeWaiverRequest.findFirst({ where: { id: requestId, institutionId }, include: { invoice: true } });
      if (!waiver) throw notFound('Waiver request not found');
      if (waiver.requestedByUserId === reviewerId) throw { status: 403, message: 'Maker-Checker violation: You cannot review your own waiver request' };
      if (waiver.status !== WaiverStatus.PENDING) throw { status: 409, message: 'Waiver request has already been reviewed' };
      const claimed = await tx.feeWaiverRequest.updateMany({ where: { id: requestId, institutionId, status: WaiverStatus.PENDING }, data: { status: status as WaiverStatus, approvedByUserId: reviewerId, reviewedAt: new Date() } });
      if (claimed.count !== 1) throw { status: 409, message: 'Waiver request has already been reviewed' };
      if (status === 'APPROVED') {
        const balance = waiver.invoice.balanceAmount.sub(waiver.waiverAmount);
        const remaining = waiver.invoice.totalAmount.sub(waiver.invoice.discountAmount).sub(waiver.waiverAmount).sub(waiver.invoice.paidAmount);
        const updated = await tx.studentFeeInvoice.updateMany({
          where: { id: waiver.invoiceId, institutionId, balanceAmount: { gte: waiver.waiverAmount } },
          data: {
            discountAmount: { increment: waiver.waiverAmount },
            balanceAmount: { decrement: waiver.waiverAmount },
            status: balance.isZero() || remaining.lte(0) ? InvoiceStatus.PAID : InvoiceStatus.PARTIAL,
          },
        });
        if (updated.count !== 1) throw { status: 409, message: 'Invoice balance changed; waiver could not be applied' };
        await tx.financialLedgerEntry.createMany({
          data: [
            { institutionId, accountCode: '5000-FEE-DISCOUNTS', debitAmount: waiver.waiverAmount, referenceType: 'WAIVER', referenceId: waiver.id, description: `Approved waiver ${waiver.id}`, createdByUserId: reviewerId },
            { institutionId, accountCode: '1100-ACCOUNTS-RECEIVABLE', creditAmount: waiver.waiverAmount, referenceType: 'WAIVER', referenceId: waiver.id, description: `Approved waiver ${waiver.id}`, createdByUserId: reviewerId },
          ],
        });
      }
      return tx.feeWaiverRequest.findUniqueOrThrow({ where: { id: requestId } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  static async getLedger(institutionId: string) {
    return prisma.financialLedgerEntry.findMany({ where: { institutionId }, orderBy: { transactionDate: 'desc' }, take: 500 });
  }
}
