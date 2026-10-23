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
      const copy = await tx.bookCopy.findFirst({ where: { bookId: book.id, status: 'AVAILABLE' }, select: { id: true } });
      if (copy) { const copyClaimed = await tx.bookCopy.updateMany({ where: { id: copy.id, status: 'AVAILABLE' }, data: { status: 'CHECKED_OUT' } }); if (copyClaimed.count !== 1) throw { status: 409, message: 'Copy is no longer available' }; }
      const claimed = await tx.bookCatalog.updateMany({ where: { id: book.id, institutionId, availableCopies: { gt: 0 } }, data: { availableCopies: { decrement: 1 } } });
      if (claimed.count !== 1) throw { status: 409, message: 'No available copies remain' };
      return tx.bookBorrowRecord.create({ data: { bookId: book.id, copyId: copy?.id, studentId: student.id, issuedByUserId: issuerId, dueDate: new Date(`${data.dueDate}T23:59:59.999Z`) } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  static async checkin(institutionId: string, recordId: string) {
    return prisma.$transaction(async (tx) => {
      const loan = await tx.bookBorrowRecord.findFirst({ where: { id: recordId, book: { institutionId } }, select: { id: true, bookId: true, copyId: true, status: true, returnedAt: true, dueDate: true } });
      if (!loan) throw { status: 404, message: 'Loan not found in this institution' };
      if (loan.returnedAt || loan.status === BorrowStatus.RETURNED) throw { status: 409, message: 'Book has already been returned' };
      if (loan.status === BorrowStatus.LOST) throw { status: 409, message: 'Lost books require a separate recovery and inventory workflow' };
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
      if (loan.copyId) await tx.bookCopy.update({ where: { id: loan.copyId }, data: { status: 'AVAILABLE' } });
      else { const unlinkedCopy = await tx.bookCopy.findFirst({ where: { bookId: loan.bookId, status: 'CHECKED_OUT', loan: { is: null } }, select: { id: true } }); if (unlinkedCopy) await tx.bookCopy.update({ where: { id: unlinkedCopy.id }, data: { status: 'AVAILABLE' } }); }
      await tx.bookCatalog.update({ where: { id: loan.bookId }, data: { availableCopies: { increment: 1 } } });
      return tx.bookBorrowRecord.findUniqueOrThrow({ where: { id: loan.id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
