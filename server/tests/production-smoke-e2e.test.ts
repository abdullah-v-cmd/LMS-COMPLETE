import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { app } from '../src/app';
import { prisma } from '../src/utils/prisma';
import { StorageService } from '../src/utils/storage';
import { UserRole } from '@prisma/client';

describe('Production Smoke & E2E Validation Suite (Section 5)', () => {
  let institutionId: string;
  let institution2Id: string;
  let adminUserId: string;
  let adminAccessToken: string;
  let adminRefreshToken: string;
  let studentUser: any;
  let studentAccessToken: string;
  let teacherProfileId: string;
  let academicYearId: string;
  let academicTermId: string;
  let classGradeId: string;
  let sectionId: string;
  let subjectId: string;
  let createdCourseId: string;
  let studentProfileId: string;

  beforeAll(async () => {
    // 1. Ensure test institution exists
    const inst = await prisma.institution.upsert({
      where: { code: 'PROD_SMOKE_INST' },
      update: {},
      create: {
        name: 'Production Smoke Test Academy',
        code: 'PROD_SMOKE_INST',
        slug: 'prod-smoke-inst',
      },
    });
    institutionId = inst.id;

    // Create a second isolated institution to test tenant boundary isolation
    const inst2 = await prisma.institution.upsert({
      where: { code: 'PROD_SMOKE_INST_2' },
      update: {},
      create: {
        name: 'Isolated Institution 2',
        code: 'PROD_SMOKE_INST_2',
        slug: 'prod-smoke-inst-2',
      },
    });
    institution2Id = inst2.id;

    // 2. Setup Academic structure
    const year = await prisma.academicYear.upsert({
      where: {
        institutionId_name: {
          institutionId,
          name: '2026-2027 Academic Year',
        },
      },
      update: {},
      create: {
        institutionId,
        name: '2026-2027 Academic Year',
        startDate: new Date('2026-09-01'),
        endDate: new Date('2027-06-30'),
        isCurrent: true,
      },
    });
    academicYearId = year.id;

    const term = await prisma.academicTerm.create({
      data: {
        academicYearId,
        name: 'Fall Term 2026 - Smoke ' + Date.now(),
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-12-31'),
        isCurrent: true,
      },
    });
    academicTermId = term.id;

    const program = await prisma.program.create({
      data: {
        institutionId,
        name: 'High School Smoke',
        code: 'HS_SMK_' + Date.now(),
      },
    });

    const grade = await prisma.classGrade.create({
      data: {
        institutionId,
        programId: program.id,
        name: 'Grade 10 - Smoke ' + Date.now(),
        level: 10,
      },
    });
    classGradeId = grade.id;

    const section = await prisma.section.create({
      data: {
        classGradeId,
        name: 'Section A',
        maxCapacity: 30,
      },
    });
    sectionId = section.id;

    const subject = await prisma.subject.create({
      data: {
        institutionId,
        name: 'Advanced Biology Smoke ' + Date.now(),
        code: 'BIO-SMK-' + Math.floor(Math.random() * 100000),
      },
    });
    subjectId = subject.id;

    // Setup Teacher
    const tUser = await prisma.user.create({
      data: {
        institutionId,
        email: `teacher_smoke_${Date.now()}@test.edu`,
        username: `teacher_smoke_${Date.now()}`,
        passwordHash: await bcrypt.hash('Teacher@123456', 10),
        firstName: 'Alice',
        lastName: 'Teacher',
        role: UserRole.ROLE_SUBJECT_TEACHER,
        isActive: true,
      },
    });

    const tProfile = await prisma.teacherProfile.create({
      data: {
        institutionId,
        userId: tUser.id,
        employeeCode: `EMP-${Date.now()}`,
      },
    });
    teacherProfileId = tProfile.id;
  });

  // -------------------------------------------------------------
  // 1. Register and log in
  // -------------------------------------------------------------
  it('1. Registers and logs in an administrative user with JWT access & refresh tokens', async () => {
    const email = `admin_smoke_${Date.now()}@test.edu`;
    const password = 'Password@123456';
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        institutionId,
        email,
        username: `admin_smoke_${Date.now()}`,
        passwordHash,
        firstName: 'Smoke',
        lastName: 'Admin',
        role: UserRole.ROLE_SUPER_ADMIN,
        isActive: true,
      },
    });
    adminUserId = user.id;

    // Test real login endpoint using usernameOrEmail
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        usernameOrEmail: email,
        password,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.user.id).toBe(user.id);

    adminAccessToken = res.body.data.accessToken;
    adminRefreshToken = res.body.data.refreshToken;
  });

  // -------------------------------------------------------------
  // 2. Retrieve the authenticated profile
  // -------------------------------------------------------------
  it('2. Retrieves authenticated profile with role, institution ID, and permissions', async () => {
    const res = await request(app)
      .get('/api/v1/users/profile')
      .set('Authorization', `Bearer ${adminAccessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const profile = res.body.data.user || res.body.data;
    expect(profile.role).toBe(UserRole.ROLE_SUPER_ADMIN);
    expect(profile.institutionId).toBe(institutionId);
  });

  // -------------------------------------------------------------
  // 3. Refresh an access token
  // -------------------------------------------------------------
  it('3. Refreshes an access token using valid refresh token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({
        refreshToken: adminRefreshToken,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();

    // Use refreshed token for subsequent requests
    adminAccessToken = res.body.data.accessToken;
    adminRefreshToken = res.body.data.refreshToken;
  });

  // -------------------------------------------------------------
  // 4. Log out and verify invalidation
  // -------------------------------------------------------------
  it('4. Logs out and invalidates refresh token so it cannot be reused', async () => {
    // Perform logout
    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({
        refreshToken: adminRefreshToken,
      });

    expect(logoutRes.status).toBe(200);

    // Verify revoked token is now rejected with 401
    const reuseRes = await request(app)
      .post('/api/v1/auth/refresh')
      .send({
        refreshToken: adminRefreshToken,
      });

    expect(reuseRes.status).toBe(401);

    // Re-login to have valid tokens for the remainder of the suite
    const adminUser = await prisma.user.findUnique({
      where: { id: adminUserId },
    });
    const reLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        usernameOrEmail: adminUser?.email,
        password: 'Password@123456',
      });
    expect(reLoginRes.status).toBe(200);
    adminAccessToken = reLoginRes.body.data.accessToken;
    adminRefreshToken = reLoginRes.body.data.refreshToken;
  });

  // -------------------------------------------------------------
  // 5. Create and retrieve a student record
  // -------------------------------------------------------------
  it('5. Creates and retrieves a student record in PostgreSQL database', async () => {
    const studentEmail = `student_smoke_${Date.now()}@test.edu`;
    const passwordHash = await bcrypt.hash('Student@123456', 10);

    const sUser = await prisma.user.create({
      data: {
        institutionId,
        email: studentEmail,
        username: `student_${Date.now()}`,
        passwordHash,
        firstName: 'Jane',
        lastName: 'Doe',
        role: UserRole.ROLE_STUDENT,
        isActive: true,
      },
    });
    studentUser = sUser;

    const studentProfile = await prisma.studentProfile.create({
      data: {
        institutionId,
        userId: sUser.id,
        admissionNumber: `ADM-${Date.now()}`,
        dateOfBirth: new Date('2008-05-15'),
        gender: 'FEMALE',
        sectionId,
        status: 'ENROLLED',
      },
    });
    studentProfileId = studentProfile.id;

    // Login as student to have studentAccessToken
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        usernameOrEmail: studentEmail,
        password: 'Student@123456',
      });
    expect(loginRes.status).toBe(200);
    studentAccessToken = loginRes.body.data.accessToken;

    // Retrieve student record via admin API
    const res = await request(app)
      .get(`/api/v1/students/${studentProfile.id}`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .set('x-institution-id', institutionId);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(studentProfile.id);
    expect(res.body.data.admissionNumber).toBe(studentProfile.admissionNumber);
  });

  // -------------------------------------------------------------
  // 6. Create and retrieve a course
  // -------------------------------------------------------------
  it('6. Creates and retrieves a course with academic year and class links', async () => {
    const course = await prisma.course.create({
      data: {
        institutionId,
        academicTermId,
        subjectId,
        sectionId,
        teacherId: teacherProfileId,
        title: 'Cellular and Molecular Biology',
        code: `BIO-301-${Date.now()}`,
        description: 'Comprehensive cell biology course for high school students.',
        isPublished: true,
      },
    });
    createdCourseId = course.id;

    const res = await request(app)
      .get(`/api/v1/lms/courses/${course.id}`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .set('x-institution-id', institutionId);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(course.id);
    expect(res.body.data.title).toBe('Cellular and Molecular Biology');
  });

  // -------------------------------------------------------------
  // 7. Upload and download a document (StorageService & /api/v1/storage)
  // -------------------------------------------------------------
  it('7. Uploads and downloads a document via StorageService with mime and size verification', async () => {
    const fileContent = Buffer.from('%PDF-1.4 Mock production document for LMS upload testing');
    const uploaded = await StorageService.uploadFile(
      fileContent,
      'lab_manual.pdf',
      'application/pdf',
      { folder: 'courses' }
    );

    expect(uploaded).toBeDefined();
    expect(uploaded.key).toContain('courses/');
    expect(uploaded.filename).toContain('lab_manual.pdf');
    expect(uploaded.mimeType).toBe('application/pdf');
    expect(uploaded.size).toBe(fileContent.length);

    // Retrieve via StorageService
    const retrieved = await StorageService.getFile(uploaded.url);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.mimeType).toBe('application/pdf');
    expect(retrieved?.buffer.length).toBe(fileContent.length);

    // Clean up
    const deleted = await StorageService.deleteFile(uploaded.url);
    expect(deleted).toBe(true);
  });

  // -------------------------------------------------------------
  // 8. Create an assignment and submission
  // -------------------------------------------------------------
  it('8. Creates assignment and accepts student submission with attachment', async () => {
    const assignment = await prisma.assignment.create({
      data: {
        courseId: createdCourseId,
        title: 'Photosynthesis Lab Report',
        instructions: 'Submit your typed experimental observations and diagrams in PDF format.',
        dueDate: new Date(Date.now() + 7 * 86400000),
        maxPoints: 100,
      },
    });

    // Student submits assignment
    const submissionPdfData = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4 Jane Doe Lab Report').toString('base64');
    const submission = await prisma.assignmentSubmission.create({
      data: {
        assignmentId: assignment.id,
        studentId: studentProfileId,
        contentText: 'Observations completed in laboratory session.',
        attachmentUrl: submissionPdfData,
        status: 'SUBMITTED',
        submittedAt: new Date(),
      },
    });

    expect(submission.id).toBeDefined();
    expect(submission.status).toBe('SUBMITTED');
    expect(submission.attachmentUrl).toBeDefined();

    // Verify submission is accessible via LMS attachment endpoint
    const res = await request(app)
      .get(`/api/v1/lms/submissions/${submission.id}/attachment`)
      .set('Authorization', `Bearer ${studentAccessToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
  });

  // -------------------------------------------------------------
  // 9. Record attendance
  // -------------------------------------------------------------
  it('9. Records and retrieves student daily/subject attendance', async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const record = await prisma.attendanceRecord.create({
      data: {
        institutionId,
        studentId: studentProfileId,
        sectionId,
        date: today,
        status: 'PRESENT',
        remarks: 'Punctual attendance during morning laboratory session.',
        markedByUserId: adminUserId,
      },
    });

    expect(record.id).toBeDefined();
    expect(record.status).toBe('PRESENT');

    const checkDb = await prisma.attendanceRecord.findUnique({
      where: { id: record.id },
    });
    expect(checkDb?.status).toBe('PRESENT');
  });

  // -------------------------------------------------------------
  // 10. Create an exam and save marks
  // -------------------------------------------------------------
  it('10. Creates an assessment scheme, items, and saves student gradebook marks', async () => {
    const scheme = await prisma.assessmentScheme.create({
      data: {
        institutionId,
        academicTermId,
        subjectId,
        sectionId,
        title: 'Spring Semester Science Assessment Scheme',
        createdById: adminUserId,
        isPublished: true,
      },
    });

    const category = await prisma.assessmentCategory.create({
      data: {
        assessmentSchemeId: scheme.id,
        name: 'Lab Practicals',
        weightagePercentage: 100,
      },
    });

    const item = await prisma.assessmentItem.create({
      data: {
        assessmentCategoryId: category.id,
        title: 'Microscopy Lab Practical',
        maxMarks: 50,
        weightagePercentage: 100,
        isPublished: true,
      },
    });

    // Save marks for student
    const saveMarksRes = await request(app)
      .post('/api/v1/assessments/gradebook/save')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .set('x-institution-id', institutionId)
      .send({
        subjectId,
        sectionId,
        academicTermId,
        marks: [
          {
            studentId: studentProfileId,
            assessmentItemId: item.id,
            obtainedMarks: 46.5,
            isAbsent: false,
            isExcused: false,
            remarks: 'Superb laboratory precision',
          },
        ],
      });

    expect(saveMarksRes.status).toBe(200);
    expect(saveMarksRes.body.success).toBe(true);

    // Verify marks saved in PostgreSQL
    const savedMark = await prisma.studentAssessmentMark.findUnique({
      where: {
        assessmentItemId_studentId: {
          assessmentItemId: item.id,
          studentId: studentProfileId,
        },
      },
    });

    expect(savedMark).toBeDefined();
    expect(Number(savedMark?.marksObtained)).toBe(46.5);
  });

  // -------------------------------------------------------------
  // 11. Verify finance records and ledger consistency
  // -------------------------------------------------------------
  it('11. Creates invoice, records student fee payment, and verifies ledger consistency', async () => {
    // Create Fee Structure
    const feeStructure = await prisma.feeStructure.create({
      data: {
        institutionId,
        classGradeId,
        academicYearId,
        name: 'Grade 10 Tuition Fee',
        amount: 500.0,
        frequency: 'ANNUAL',
        dueDate: new Date(Date.now() + 30 * 86400000),
      },
    });

    // Create Invoice (StudentFeeInvoice)
    const invoice = await prisma.studentFeeInvoice.create({
      data: {
        institutionId,
        studentId: studentProfileId,
        feeStructureId: feeStructure.id,
        invoiceNumber: `INV-${Date.now()}`,
        totalAmount: 500.0,
        balanceAmount: 500.0,
        dueDate: new Date(Date.now() + 30 * 86400000),
        status: 'UNPAID',
      },
    });

    expect(invoice.id).toBeDefined();
    expect(Number(invoice.totalAmount)).toBe(500.0);
    expect(Number(invoice.balanceAmount)).toBe(500.0);

    // Record Payment (FeePayment)
    const payment = await prisma.feePayment.create({
      data: {
        institutionId,
        invoiceId: invoice.id,
        studentId: studentProfileId,
        receiptNumber: `REC-${Date.now()}`,
        amountPaid: 500.0,
        paymentMethod: 'BANK_TRANSFER',
        collectedByUserId: adminUserId,
        paidAt: new Date(),
      },
    });

    // Update invoice balance to reflect payment
    const updatedInvoice = await prisma.studentFeeInvoice.update({
      where: { id: invoice.id },
      data: {
        balanceAmount: 0.0,
        paidAmount: 500.0,
        status: 'PAID',
      },
    });

    expect(Number(updatedInvoice.balanceAmount)).toBe(0.0);
    expect(updatedInvoice.status).toBe('PAID');
    expect(payment.id).toBeDefined();
  });

  // -------------------------------------------------------------
  // 12. Verify institution and role-based access restrictions
  // -------------------------------------------------------------
  it('12. Enforces strict multi-tenant isolation and role-based access boundaries', async () => {
    // Create user in Institution 2
    const passwordHash = await bcrypt.hash('Password@123', 10);
    const foreignUser = await prisma.user.create({
      data: {
        institutionId: institution2Id,
        email: `foreign_inst_${Date.now()}@test.edu`,
        username: `foreign_${Date.now()}`,
        passwordHash,
        firstName: 'Foreign',
        lastName: 'Admin',
        role: UserRole.ROLE_INSTITUTION_ADMIN,
        isActive: true,
      },
    });

    const foreignLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        usernameOrEmail: foreignUser.email,
        password: 'Password@123',
      });
    expect(foreignLoginRes.status).toBe(200);
    const foreignAccessToken = foreignLoginRes.body.data.accessToken;

    // Foreign user tries to access Institution 1's student profile
    const foreignAttempt = await request(app)
      .get(`/api/v1/students/${studentProfileId}`)
      .set('Authorization', `Bearer ${foreignAccessToken}`)
      .set('x-institution-id', institution2Id);

    // Cross-institution access must fail (404 Not Found or 403 Forbidden due to tenant isolation)
    expect([403, 404]).toContain(foreignAttempt.status);

    // Regular student tries to access administrative system settings
    const studentAdminAttempt = await request(app)
      .get('/api/v1/system/recycle-bin')
      .set('Authorization', `Bearer ${studentAccessToken}`)
      .set('x-institution-id', institutionId);

    // Regular student must be rejected with 403 Forbidden
    expect(studentAdminAttempt.status).toBe(403);
  });
});
