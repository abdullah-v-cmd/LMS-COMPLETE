import { BorrowStatus, Prisma, UserRole } from '@prisma/client';
import { prisma } from '../../utils/prisma';

export class LibraryService {
  static getFinePolicy(institutionId: string) { return prisma.libraryFinePolicy.findUnique({ where: { institutionId } }); }

  static saveFinePolicy(institutionId: string, userId: string, data: { dailyFine: number; currencyCode: string }) {
    return prisma.libraryFinePolicy.upsert({ where: { institutionId }, create: { institutionId, updatedByUserId: userId, dailyFine: new Prisma.Decimal(data.dailyFine.toFixed(2)), currencyCode: data.currencyCode }, update: { updatedByUserId: userId, dailyFine: new Prisma.Decimal(data.dailyFine.toFixed(2)), currencyCode: data.currencyCode } });
  }

  static listBooks(institutionId: string) {
    return prisma.bookCatalog.findMany({ where: { institutionId }, include: { copies: { orderBy: { barcode: 'asc' } } }, orderBy: [{ title: 'asc' }] });
  }

  static async createBook(institutionId: string, data: { title: string; author: string; isbn?: string; category: string; totalCopies: number }) {
    if (data.isbn && await prisma.bookCatalog.findFirst({ where: { institutionId, isbn: data.isbn } })) throw { status: 409, message: 'This ISBN is already in the institution catalog' };
    return prisma.$transaction(async (tx) => {
      const book = await tx.bookCatalog.create({ data: { ...data, institutionId, availableCopies: data.totalCopies } });
      await tx.bookCopy.createMany({ data: Array.from({ length: data.totalCopies }, (_, index) => ({ bookId: book.id, barcode: `LIB-${book.id}-${index + 1}` })) });
      return tx.bookCatalog.findUniqueOrThrow({ where: { id: book.id }, include: { copies: true } });
    });
  }

  static async findCopyByBarcode(institutionId: string, barcode: string) {
    const copy = await prisma.bookCopy.findFirst({ where: { barcode, book: { institutionId } }, include: { book: { select: { id: true, title: true, author: true, isbn: true, category: true } } } });
    if (!copy) throw { status: 404, message: 'Barcode not found in this institution' };
    return copy;
  }

  static async listLoans(institutionId: string, userId: string, role: UserRole) {
    const student = role === UserRole.ROLE_STUDENT ? await prisma.studentProfile.findFirst({ where: { institutionId, userId }, select: { id: true } }) : null;
    if (role === UserRole.ROLE_STUDENT && !student) return [];
    return prisma.bookBorrowRecord.findMany({
      where: { book: { institutionId }, ...(student ? { studentId: student.id } : {}) },
      include: { book: true, student: { select: { id: true, admissionNumber: true, user: { select: { firstName: true, lastName: true } } } } },
      orderBy: { borrowedAt: 'desc' },
    });
  }

  static async checkout(institutionId: string, issuerId: string, data: { bookId: string; studentId: string; dueDate: string }) {
    return prisma.$transaction(async (tx) => {
      const [book, student, openLoan] = await Promise.all([
        tx.bookCatalog.findFirst({ where: { id: data.bookId, institutionId }, select: { id: true } }),
        tx.studentProfile.findFirst({ where: { id: data.studentId, institutionId, status: 'ENROLLED' }, select: { id: true } }),
        tx.bookBorrowRecord.findFirst({ where: { bookId: data.bookId, studentId: data.studentId, returnedAt: null } }),
      ]);
      if (!book || !student) throw { status: 404, message: 'Book or enrolled student not found in this institution' };
      if (openLoan) throw { status: 409, message: 'Student already has an open loan for this book' };
      const ready = await tx.libraryReservation.findFirst({ where: { institutionId, bookId: book.id, studentId: student.id, status: 'READY' }, select: { id: true, assignedCopyId: true } });
      let copyId: string | undefined;
      if (ready?.assignedCopyId) {
        const copyClaimed = await tx.bookCopy.updateMany({ where: { id: ready.assignedCopyId, bookId: book.id, status: 'RESERVED' }, data: { status: 'CHECKED_OUT' } });
        if (copyClaimed.count !== 1) throw { status: 409, message: 'Reserved copy is no longer available' };
        copyId = ready.assignedCopyId;
        await tx.libraryReservation.update({ where: { id: ready.id }, data: { status: 'FULFILLED', fulfilledAt: new Date(), assignedCopyId: null } });
      } else {
        const copy = await tx.bookCopy.findFirst({ where: { bookId: book.id, status: 'AVAILABLE' }, select: { id: true } });
        if (!copy) throw { status: 409, message: 'No available copies remain; join the reservation queue' };
        const copyClaimed = await tx.bookCopy.updateMany({ where: { id: copy.id, status: 'AVAILABLE' }, data: { status: 'CHECKED_OUT' } });
        if (copyClaimed.count !== 1) throw { status: 409, message: 'Copy is no longer available' };
        const claimed = await tx.bookCatalog.updateMany({ where: { id: book.id, institutionId, availableCopies: { gt: 0 } }, data: { availableCopies: { decrement: 1 } } });
        if (claimed.count !== 1) throw { status: 409, message: 'No available copies remain' };
        copyId = copy.id;
      }
      return tx.bookBorrowRecord.create({ data: { bookId: book.id, copyId, studentId: student.id, issuedByUserId: issuerId, dueDate: new Date(`${data.dueDate}T23:59:59.999Z`) } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  static async checkin(institutionId: string, recordId: string) {
    return prisma.$transaction(async (tx) => {
      const loan = await tx.bookBorrowRecord.findFirst({ where: { id: recordId, book: { institutionId } }, select: { id: true, bookId: true, copyId: true, status: true, returnedAt: true, dueDate: true } });
      if (!loan) throw { status: 404, message: 'Loan not found in this institution' };
      if (loan.returnedAt || loan.status === BorrowStatus.RETURNED) throw { status: 409, message: 'Book has already been returned' };
      if (loan.status === BorrowStatus.LOST) throw { status: 409, message: 'Use the lost-item recovery workflow for a lost book' };
      const changed = await tx.bookBorrowRecord.updateMany({ where: { id: loan.id, returnedAt: null }, data: { returnedAt: new Date(), status: BorrowStatus.RETURNED } });
      if (changed.count !== 1) throw { status: 409, message: 'Loan was already checked in' };
      const finePolicy = await tx.libraryFinePolicy.findUnique({ where: { institutionId } });
      const dueDay = new Date(loan.dueDate);
      dueDay.setUTCHours(0, 0, 0, 0);
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const overdueDays = Math.max(0, Math.floor((today.getTime() - dueDay.getTime()) / 86400000));
      const fine = finePolicy ? finePolicy.dailyFine.mul(overdueDays) : new Prisma.Decimal(0);
      await tx.bookBorrowRecord.update({ where: { id: loan.id }, data: { fineAmount: fine } });
      let returnedCopyId = loan.copyId ?? undefined;
      if (loan.copyId) await tx.bookCopy.update({ where: { id: loan.copyId }, data: { status: 'AVAILABLE' } });
      else { const unlinkedCopy = await tx.bookCopy.findFirst({ where: { bookId: loan.bookId, status: 'CHECKED_OUT', loans: { none: {} } }, select: { id: true } }); if (unlinkedCopy) { returnedCopyId = unlinkedCopy.id; await tx.bookCopy.update({ where: { id: unlinkedCopy.id }, data: { status: 'AVAILABLE' } }); } }
      const waiting = await tx.libraryReservation.findFirst({ where: { institutionId, bookId: loan.bookId, status: 'QUEUED' }, orderBy: [{ queuePosition: 'asc' }, { requestedAt: 'asc' }] });
      if (waiting && returnedCopyId) {
        await tx.bookCopy.update({ where: { id: returnedCopyId }, data: { status: 'RESERVED' } });
        await tx.libraryReservation.update({ where: { id: waiting.id }, data: { status: 'READY', assignedCopyId: returnedCopyId } });
      } else {
        await tx.bookCatalog.update({ where: { id: loan.bookId }, data: { availableCopies: { increment: 1 } } });
      }
      return tx.bookBorrowRecord.findUniqueOrThrow({ where: { id: loan.id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  static async renew(institutionId: string, recordId: string, dueDateValue: string) {
    return prisma.$transaction(async (tx) => {
      const loan = await tx.bookBorrowRecord.findFirst({
        where: { id: recordId, book: { institutionId } },
        select: { id: true, bookId: true, studentId: true, dueDate: true, returnedAt: true, status: true, renewalCount: true },
      });
      if (!loan) throw { status: 404, message: 'Loan not found in this institution' };
      if (loan.returnedAt || loan.status !== BorrowStatus.BORROWED) throw { status: 409, message: 'Only an active borrowed item can be renewed' };
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      if (loan.dueDate < today) throw { status: 409, message: 'Overdue loans must be checked in before they can be renewed' };
      if (loan.renewalCount >= 2) throw { status: 409, message: 'This loan has reached its renewal limit' };
      const queuedReservation = await tx.libraryReservation.findFirst({
        where: { institutionId, bookId: loan.bookId, studentId: { not: loan.studentId }, status: { in: ['QUEUED', 'READY'] } },
        select: { id: true },
      });
      if (queuedReservation) throw { status: 409, message: 'This book is reserved for another student and cannot be renewed' };
      const dueDate = new Date(`${dueDateValue}T23:59:59.999Z`);
      if (dueDate <= loan.dueDate || dueDate <= today) throw { status: 400, message: 'Renewal due date must be after the current due date' };
      const changed = await tx.bookBorrowRecord.updateMany({
        where: { id: loan.id, returnedAt: null, status: BorrowStatus.BORROWED, renewalCount: loan.renewalCount },
        data: { dueDate, renewalCount: { increment: 1 } },
      });
      if (changed.count !== 1) throw { status: 409, message: 'Loan changed while it was being renewed' };
      return tx.bookBorrowRecord.findUniqueOrThrow({ where: { id: loan.id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  static async circulationReport(institutionId: string, filters: { from?: string; to?: string }) {
    const borrowedAt: Prisma.DateTimeFilter | undefined = filters.from || filters.to
      ? { ...(filters.from ? { gte: new Date(`${filters.from}T00:00:00.000Z`) } : {}), ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59.999Z`) } : {}) }
      : undefined;
    const where = { book: { institutionId }, ...(borrowedAt ? { borrowedAt } : {}) };
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const [issued, returned, active, overdue, lost, fineTotals, popularBooks] = await Promise.all([
      prisma.bookBorrowRecord.count({ where }),
      prisma.bookBorrowRecord.count({ where: { ...where, returnedAt: { not: null } } }),
      prisma.bookBorrowRecord.count({ where: { ...where, returnedAt: null, status: BorrowStatus.BORROWED } }),
      prisma.bookBorrowRecord.count({ where: { ...where, returnedAt: null, status: BorrowStatus.BORROWED, dueDate: { lt: today } } }),
      prisma.bookBorrowRecord.count({ where: { ...where, status: BorrowStatus.LOST } }),
      prisma.bookBorrowRecord.aggregate({ where, _sum: { fineAmount: true } }),
      prisma.bookBorrowRecord.groupBy({ by: ['bookId'], where, _count: { _all: true }, orderBy: { _count: { bookId: 'desc' } }, take: 10 }),
    ]);
    const books = popularBooks.length ? await prisma.bookCatalog.findMany({ where: { institutionId, id: { in: popularBooks.map((row) => row.bookId) } }, select: { id: true, title: true, author: true } }) : [];
    const bookById = new Map(books.map((book) => [book.id, book]));
    return { period: filters, issued, returned, active, overdue, lost, totalFines: fineTotals._sum.fineAmount ?? new Prisma.Decimal(0), popularBooks: popularBooks.map((row) => ({ ...bookById.get(row.bookId), borrowCount: row._count._all })) };
  }

  static reservations(institutionId: string, studentId?: string) {
    return prisma.libraryReservation.findMany({ where: { institutionId, ...(studentId ? { studentId } : {}) }, include: { book: { select: { id: true, title: true, author: true } }, student: { select: { id: true, admissionNumber: true, user: { select: { firstName: true, lastName: true } } } } }, orderBy: [{ bookId: 'asc' }, { queuePosition: 'asc' }] });
  }

  static async createReservation(institutionId: string, studentId: string, bookId: string) {
    return prisma.$transaction(async (tx) => {
      const [book, student, existing, queueTail] = await Promise.all([
        tx.bookCatalog.findFirst({ where: { id: bookId, institutionId }, select: { id: true } }),
        tx.studentProfile.findFirst({ where: { id: studentId, institutionId, status: 'ENROLLED' }, select: { id: true } }),
        tx.libraryReservation.findFirst({ where: { institutionId, bookId, studentId, status: { in: ['QUEUED', 'READY'] } }, select: { id: true } }),
        tx.libraryReservation.aggregate({ where: { institutionId, bookId, status: { in: ['QUEUED', 'READY'] } }, _max: { queuePosition: true } }),
      ]);
      if (!book || !student) throw { status: 404, message: 'Book or enrolled student not found in this institution' };
      if (existing) throw { status: 409, message: 'An active reservation already exists for this book' };
      const queuePosition = (queueTail._max.queuePosition ?? 0) + 1;
      const copy = await tx.bookCopy.findFirst({ where: { bookId, status: 'AVAILABLE' }, orderBy: { barcode: 'asc' }, select: { id: true } });
      if (copy) {
        const claimed = await tx.bookCopy.updateMany({ where: { id: copy.id, status: 'AVAILABLE' }, data: { status: 'RESERVED' } });
        if (claimed.count !== 1) throw { status: 409, message: 'Copy is no longer available' };
        await tx.bookCatalog.update({ where: { id: bookId }, data: { availableCopies: { decrement: 1 } } });
      }
      return tx.libraryReservation.create({ data: { institutionId, bookId, studentId, queuePosition, status: copy ? 'READY' : 'QUEUED', assignedCopyId: copy?.id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  static async cancelReservation(institutionId: string, reservationId: string, studentId?: string) {
    return prisma.$transaction(async (tx) => {
      const reservation = await tx.libraryReservation.findFirst({ where: { id: reservationId, institutionId, ...(studentId ? { studentId } : {}), status: { in: ['QUEUED', 'READY'] } } });
      if (!reservation) throw { status: 404, message: 'Active reservation not found in this institution' };
      await tx.libraryReservation.update({ where: { id: reservation.id }, data: { status: 'CANCELLED', cancelledAt: new Date(), assignedCopyId: null } });
      if (reservation.assignedCopyId) {
        const next = await tx.libraryReservation.findFirst({ where: { institutionId, bookId: reservation.bookId, status: 'QUEUED', id: { not: reservation.id } }, orderBy: [{ queuePosition: 'asc' }, { requestedAt: 'asc' }] });
        if (next) await tx.libraryReservation.update({ where: { id: next.id }, data: { status: 'READY', assignedCopyId: reservation.assignedCopyId } });
        else {
          await tx.bookCopy.update({ where: { id: reservation.assignedCopyId }, data: { status: 'AVAILABLE' } });
          await tx.bookCatalog.update({ where: { id: reservation.bookId }, data: { availableCopies: { increment: 1 } } });
        }
      }
      return tx.libraryReservation.findUniqueOrThrow({ where: { id: reservation.id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  static async reportLost(institutionId: string, loanId: string) {
    return prisma.$transaction(async (tx) => {
      const loan = await tx.bookBorrowRecord.findFirst({ where: { id: loanId, book: { institutionId } }, select: { id: true, bookId: true, copyId: true, returnedAt: true, status: true } });
      if (!loan) throw { status: 404, message: 'Loan not found in this institution' };
      if (loan.returnedAt || loan.status !== BorrowStatus.BORROWED) throw { status: 409, message: 'Only an open borrowed item can be reported lost' };
      await tx.bookBorrowRecord.update({ where: { id: loan.id }, data: { status: BorrowStatus.LOST, lostReportedAt: new Date() } });
      if (loan.copyId) await tx.bookCopy.update({ where: { id: loan.copyId }, data: { status: 'LOST' } });
      await tx.bookCatalog.update({ where: { id: loan.bookId }, data: { totalCopies: { decrement: 1 } } });
      return tx.bookBorrowRecord.findUniqueOrThrow({ where: { id: loan.id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  static async recoverLost(institutionId: string, loanId: string) {
    return prisma.$transaction(async (tx) => {
      const loan = await tx.bookBorrowRecord.findFirst({ where: { id: loanId, book: { institutionId } }, select: { id: true, bookId: true, copyId: true, status: true, returnedAt: true } });
      if (!loan) throw { status: 404, message: 'Loan not found in this institution' };
      if (loan.status !== BorrowStatus.LOST || loan.returnedAt) throw { status: 409, message: 'Only an unrecovered lost item can be recovered' };
      if (!loan.copyId) throw { status: 409, message: 'Legacy lost loan has no copy identity to recover' };
      await tx.bookCopy.update({ where: { id: loan.copyId }, data: { status: 'AVAILABLE' } });
      await tx.bookBorrowRecord.update({ where: { id: loan.id }, data: { status: BorrowStatus.RETURNED, returnedAt: new Date(), recoveredAt: new Date() } });
      const waiting = await tx.libraryReservation.findFirst({ where: { institutionId, bookId: loan.bookId, status: 'QUEUED' }, orderBy: [{ queuePosition: 'asc' }, { requestedAt: 'asc' }] });
      if (waiting) {
        await tx.bookCopy.update({ where: { id: loan.copyId }, data: { status: 'RESERVED' } });
        await tx.libraryReservation.update({ where: { id: waiting.id }, data: { status: 'READY', assignedCopyId: loan.copyId } });
      } else await tx.bookCatalog.update({ where: { id: loan.bookId }, data: { totalCopies: { increment: 1 }, availableCopies: { increment: 1 } } });
      if (waiting) await tx.bookCatalog.update({ where: { id: loan.bookId }, data: { totalCopies: { increment: 1 } } });
      return tx.bookBorrowRecord.findUniqueOrThrow({ where: { id: loan.id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  static async createInventoryAudit(institutionId: string, performedByUserId: string, bookId: string, barcodes: string[]) {
    const book = await prisma.bookCatalog.findFirst({ where: { id: bookId, institutionId }, include: { copies: { select: { barcode: true, status: true } } } });
    if (!book) throw { status: 404, message: 'Book not found in this institution' };
      // Only copies physically expected on-site belong in the shelf scan baseline.
      const expected = new Set(book.copies.filter((copy) => ['AVAILABLE', 'RESERVED'].includes(copy.status)).map((copy) => copy.barcode));
    const scanned = new Set(barcodes);
    const missingBarcodes = [...expected].filter((barcode) => !scanned.has(barcode));
    const unexpectedBarcodes = [...scanned].filter((barcode) => !expected.has(barcode));
    return prisma.libraryInventoryAudit.create({ data: { institutionId, bookId, performedByUserId, expectedCount: expected.size, scannedCount: scanned.size, missingBarcodes, unexpectedBarcodes } });
  }

  static inventoryAudits(institutionId: string) { return prisma.libraryInventoryAudit.findMany({ where: { institutionId }, include: { book: { select: { title: true, isbn: true } } }, orderBy: { createdAt: 'desc' }, take: 200 }); }
}
