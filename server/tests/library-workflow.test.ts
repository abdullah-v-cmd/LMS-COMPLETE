import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/app';
import { prisma } from '../src/utils/prisma';

describe('Phase 7 library copy workflow', () => {
  let app: Express;
  beforeAll(async () => { app = createApp(); await prisma.$connect(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('creates identifiable copies, checks one out by inventory, resolves barcode and checks it back in', async () => {
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
    const loan = await request(app).post('/api/v1/library/loans').set('Authorization', `Bearer ${librarianToken}`).send({ bookId: book.body.data.id, studentId: student.id, dueDate: '2026-12-01' });
    expect(loan.status).toBe(201);
    const borrowedCopy = await prisma.bookCopy.findFirstOrThrow({ where: { id: loan.body.data.copyId } });
    expect(borrowedCopy.status).toBe('CHECKED_OUT');
    expect((await request(app).post(`/api/v1/library/loans/${loan.body.data.id}/checkin`).set('Authorization', `Bearer ${librarianToken}`)).status).toBe(200);
    expect((await prisma.bookCopy.findUniqueOrThrow({ where: { id: borrowedCopy.id } })).status).toBe('AVAILABLE');
    expect((await request(app).post('/api/v1/library/books').set('Authorization', `Bearer ${studentToken}`).send({ title: 'Forbidden', author: 'Test', category: 'X', totalCopies: 1 })).status).toBe(403);
  });
});
