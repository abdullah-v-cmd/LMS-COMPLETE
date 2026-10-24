import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/app';
import { prisma } from '../src/utils/prisma';

describe('Phase 7 library copy workflow', () => {
  let app: Express;
  beforeAll(async () => { app = createApp(); await prisma.$connect(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('reserves in queue, checks out, reports/recover lost copy and persists an inventory reconciliation', async () => {
    const [librarianLogin, studentLogin, librarian] = await Promise.all([
      request(app).post('/api/v1/auth/login').send({ usernameOrEmail: 'librarian@alpha.edu', password: 'Password123!' }),
      request(app).post('/api/v1/auth/login').send({ usernameOrEmail: 'student.alice@alpha.edu', password: 'Password123!' }),
      prisma.user.findUniqueOrThrow({ where: { email: 'librarian@alpha.edu' }, select: { institutionId: true } }),
    ]);
    const librarianToken = librarianLogin.body.data.accessToken;
    const studentToken = studentLogin.body.data.accessToken;
    const student = await prisma.studentProfile.findFirstOrThrow({ where: { institutionId: librarian.institutionId!, admissionNumber: 'ADM-2026-001' }, select: { id: true } });
    const book = await request(app).post('/api/v1/library/books').set('Authorization', `Bearer ${librarianToken}`).send({ title: `Copy tracking ${Date.now()}`, author: 'Test Author', category: 'Testing', totalCopies: 2 });
    expect(book.status).toBe(201);
    expect(book.body.data.copies).toHaveLength(2);
    const barcode = book.body.data.copies[0].barcode;
    expect((await request(app).get(`/api/v1/library/copies/barcode/${barcode}`).set('Authorization', `Bearer ${librarianToken}`)).body.data.id).toBe(book.body.data.copies[0].id);
    const reservation = await request(app).post('/api/v1/library/reservations').set('Authorization', `Bearer ${studentToken}`).send({ bookId: book.body.data.id });
    expect(reservation.status).toBe(201);
    expect(reservation.body.data.status).toBe('READY');
    expect((await request(app).post('/api/v1/library/reservations').set('Authorization', `Bearer ${studentToken}`).send({ bookId: book.body.data.id })).status).toBe(409);
    const loan = await request(app).post('/api/v1/library/loans').set('Authorization', `Bearer ${librarianToken}`).send({ bookId: book.body.data.id, studentId: student.id, dueDate: '2026-12-01' });
    expect(loan.status).toBe(201);
    const borrowedCopy = await prisma.bookCopy.findFirstOrThrow({ where: { id: loan.body.data.copyId } });
    expect(borrowedCopy.status).toBe('CHECKED_OUT');
    expect((await prisma.libraryReservation.findUniqueOrThrow({ where: { id: reservation.body.data.id } })).status).toBe('FULFILLED');
    expect((await request(app).post(`/api/v1/library/loans/${loan.body.data.id}/lost`).set('Authorization', `Bearer ${librarianToken}`)).status).toBe(200);
    expect((await prisma.bookCopy.findUniqueOrThrow({ where: { id: borrowedCopy.id } })).status).toBe('LOST');
    expect((await prisma.bookCatalog.findUniqueOrThrow({ where: { id: book.body.data.id } })).totalCopies).toBe(1);
    expect((await request(app).post(`/api/v1/library/loans/${loan.body.data.id}/recover`).set('Authorization', `Bearer ${librarianToken}`)).status).toBe(200);
    expect((await prisma.bookCopy.findUniqueOrThrow({ where: { id: borrowedCopy.id } })).status).toBe('AVAILABLE');
    const audit = await request(app).post('/api/v1/library/inventory-audits').set('Authorization', `Bearer ${librarianToken}`).send({ bookId: book.body.data.id, barcodes: [barcode, 'UNKNOWN-COPY'] });
    expect(audit.status).toBe(201);
    expect(audit.body.data.missingBarcodes).toHaveLength(1);
    expect(audit.body.data.unexpectedBarcodes).toEqual(['UNKNOWN-COPY']);
    expect((await prisma.libraryInventoryAudit.findUniqueOrThrow({ where: { id: audit.body.data.id } })).expectedCount).toBe(2);
    expect((await request(app).post('/api/v1/library/books').set('Authorization', `Bearer ${studentToken}`).send({ title: 'Forbidden', author: 'Test', category: 'X', totalCopies: 1 })).status).toBe(403);
  });
});
