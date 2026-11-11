import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/utils/prisma';
import { signAccessToken } from '../src/utils/jwt';
import { StorageService } from '../src/utils/storage';
import { UserRole } from '@prisma/client';
import crypto from 'crypto';

describe('LMS Storage Authorization & Privacy Attack Audit Suite', () => {
  let inst1Id: string;
  let inst2Id: string;

  // Institution 1 Users
  let admin1Token: string;
  let admin1User: any;
  let counselor1Token: string;
  let counselor1User: any;
  let teacher1Token: string; // Math teacher
  let teacher1User: any;
  let teacher2Token: string; // History teacher
  let teacher2User: any;
  let student1Token: string;
  let student1User: any;
  let student1Profile: any;
  let student2Token: string;
  let student2User: any;
  let student2Profile: any;
  let parent1Token: string; // Parent of student 1
  let parent1User: any;
  let parent2Token: string; // Parent of student 2
  let parent2User: any;

  // Institution 2 Users (Cross-Tenant Attackers)
  let admin2Token: string;
  let admin2User: any;
  let counselor2Token: string;
  let counselor2User: any;

  // Created storage files and records
  let student1SubmissionFile: any;
  let student2SubmissionFile: any;
  let examSchedule1File: any;
  let counseling1File: any;
  let publicAvatarFile: any;

  let academicYearId: string;
  let termId: string;
  let mathSubjectId: string;
  let historySubjectId: string;
  let examSchedule1Id: string;

  beforeAll(async () => {
    const runSuffix = Date.now().toString().slice(-6);

    // 1. Create Institution 1 (Alpha) and Institution 2 (Beta)
    const inst1 = await prisma.institution.create({
      data: {
        name: `Storage Audit Inst Alpha ${runSuffix}`,
        code: `ALPHA_${runSuffix}`,
        slug: `alpha-${runSuffix}`,
      },
    });
    inst1Id = inst1.id;

    const inst2 = await prisma.institution.create({
      data: {
        name: `Storage Audit Inst Beta ${runSuffix}`,
        code: `BETA_${runSuffix}`,
        slug: `beta-${runSuffix}`,
      },
    });
    inst2Id = inst2.id;

    // 2. Create Users for Inst 1
    const passHash = 'hash_' + crypto.randomUUID();

    // Admin 1
    admin1User = await prisma.user.create({
      data: {
        institutionId: inst1Id,
        email: `admin1_${runSuffix}@alpha.edu`,
        username: `admin1_${runSuffix}`,
        passwordHash: passHash,
        firstName: 'Admin',
        lastName: 'Alpha',
        role: UserRole.ROLE_INSTITUTION_ADMIN,
      },
    });
    admin1Token = signAccessToken({
      id: admin1User.id,
      email: admin1User.email,
      username: admin1User.username,
      role: admin1User.role,
      institutionId: inst1Id,
      permissions: ['*'],
    });

    // Counselor 1
    counselor1User = await prisma.user.create({
      data: {
        institutionId: inst1Id,
        email: `counselor1_${runSuffix}@alpha.edu`,
        username: `counselor1_${runSuffix}`,
        passwordHash: passHash,
        firstName: 'Counselor',
        lastName: 'Alpha',
        role: UserRole.ROLE_COUNSELOR,
      },
    });
    counselor1Token = signAccessToken({
      id: counselor1User.id,
      email: counselor1User.email,
      username: counselor1User.username,
      role: counselor1User.role,
      institutionId: inst1Id,
      permissions: [],
    });

    // Teacher 1 (Math)
    teacher1User = await prisma.user.create({
      data: {
        institutionId: inst1Id,
        email: `teacher_math_${runSuffix}@alpha.edu`,
        username: `teacher_math_${runSuffix}`,
        passwordHash: passHash,
        firstName: 'Math',
        lastName: 'Teacher',
        role: UserRole.ROLE_SUBJECT_TEACHER,
      },
    });
    teacher1Token = signAccessToken({
      id: teacher1User.id,
      email: teacher1User.email,
      username: teacher1User.username,
      role: teacher1User.role,
      institutionId: inst1Id,
      permissions: [],
    });

    // Teacher 2 (History)
    teacher2User = await prisma.user.create({
      data: {
        institutionId: inst1Id,
        email: `teacher_history_${runSuffix}@alpha.edu`,
        username: `teacher_history_${runSuffix}`,
        passwordHash: passHash,
        firstName: 'History',
        lastName: 'Teacher',
        role: UserRole.ROLE_SUBJECT_TEACHER,
      },
    });
    teacher2Token = signAccessToken({
      id: teacher2User.id,
      email: teacher2User.email,
      username: teacher2User.username,
      role: teacher2User.role,
      institutionId: inst1Id,
      permissions: [],
    });

    // Setup Academic structure in Inst 1 (Program, Grade, Section)
    const program = await prisma.program.create({
      data: {
        institutionId: inst1Id,
        name: `High School ${runSuffix}`,
        code: `HS_${runSuffix}`,
      },
    });

    const classGrade = await prisma.classGrade.create({
      data: {
        institutionId: inst1Id,
        programId: program.id,
        name: `Grade 10 ${runSuffix}`,
        level: 10,
      },
    });

    const section = await prisma.section.create({
      data: {
        classGradeId: classGrade.id,
        name: `Section A ${runSuffix}`,
        maxCapacity: 30,
      },
    });

    // Student 1
    student1User = await prisma.user.create({
      data: {
        institutionId: inst1Id,
        email: `student1_${runSuffix}@alpha.edu`,
        username: `student1_${runSuffix}`,
        passwordHash: passHash,
        firstName: 'Alice',
        lastName: 'Student',
        role: UserRole.ROLE_STUDENT,
      },
    });
    student1Profile = await prisma.studentProfile.create({
      data: {
        institutionId: inst1Id,
        userId: student1User.id,
        admissionNumber: `ADM1-${runSuffix}`,
        dateOfBirth: new Date('2008-01-01'),
        gender: 'FEMALE',
        sectionId: section.id,
        status: 'ENROLLED',
      },
    });
    student1Token = signAccessToken({
      id: student1User.id,
      email: student1User.email,
      username: student1User.username,
      role: student1User.role,
      institutionId: inst1Id,
      permissions: [],
    });

    // Student 2
    student2User = await prisma.user.create({
      data: {
        institutionId: inst1Id,
        email: `student2_${runSuffix}@alpha.edu`,
        username: `student2_${runSuffix}`,
        passwordHash: passHash,
        firstName: 'Bob',
        lastName: 'Student',
        role: UserRole.ROLE_STUDENT,
      },
    });
    student2Profile = await prisma.studentProfile.create({
      data: {
        institutionId: inst1Id,
        userId: student2User.id,
        admissionNumber: `ADM2-${runSuffix}`,
        dateOfBirth: new Date('2008-02-02'),
        gender: 'MALE',
        sectionId: section.id,
        status: 'ENROLLED',
      },
    });
    student2Token = signAccessToken({
      id: student2User.id,
      email: student2User.email,
      username: student2User.username,
      role: student2User.role,
      institutionId: inst1Id,
      permissions: [],
    });

    // Parent 1 (linked to Student 1)
    parent1User = await prisma.user.create({
      data: {
        institutionId: inst1Id,
        email: `parent1_${runSuffix}@alpha.edu`,
        username: `parent1_${runSuffix}`,
        passwordHash: passHash,
        firstName: 'Parent',
        lastName: 'One',
        role: UserRole.ROLE_PARENT,
      },
    });
    const parent1Profile = await prisma.parentProfile.create({
      data: {
        institutionId: inst1Id,
        userId: parent1User.id,
      },
    });
    await prisma.studentParentRelation.create({
      data: {
        parentId: parent1Profile.id,
        studentId: student1Profile.id,
        relationshipType: 'MOTHER',
      },
    });
    parent1Token = signAccessToken({
      id: parent1User.id,
      email: parent1User.email,
      username: parent1User.username,
      role: parent1User.role,
      institutionId: inst1Id,
      permissions: [],
    });

    // Parent 2 (linked to Student 2)
    parent2User = await prisma.user.create({
      data: {
        institutionId: inst1Id,
        email: `parent2_${runSuffix}@alpha.edu`,
        username: `parent2_${runSuffix}`,
        passwordHash: passHash,
        firstName: 'Parent',
        lastName: 'Two',
        role: UserRole.ROLE_PARENT,
      },
    });
    const parent2Profile = await prisma.parentProfile.create({
      data: {
        institutionId: inst1Id,
        userId: parent2User.id,
      },
    });
    await prisma.studentParentRelation.create({
      data: {
        parentId: parent2Profile.id,
        studentId: student2Profile.id,
        relationshipType: 'FATHER',
      },
    });
    parent2Token = signAccessToken({
      id: parent2User.id,
      email: parent2User.email,
      username: parent2User.username,
      role: parent2User.role,
      institutionId: inst1Id,
      permissions: [],
    });

    // 3. Create Users for Inst 2 (Beta)
    admin2User = await prisma.user.create({
      data: {
        institutionId: inst2Id,
        email: `admin2_${runSuffix}@beta.edu`,
        username: `admin2_${runSuffix}`,
        passwordHash: passHash,
        firstName: 'Admin',
        lastName: 'Beta',
        role: UserRole.ROLE_INSTITUTION_ADMIN,
      },
    });
    admin2Token = signAccessToken({
      id: admin2User.id,
      email: admin2User.email,
      username: admin2User.username,
      role: admin2User.role,
      institutionId: inst2Id,
      permissions: ['*'],
    });

    counselor2User = await prisma.user.create({
      data: {
        institutionId: inst2Id,
        email: `counselor2_${runSuffix}@beta.edu`,
        username: `counselor2_${runSuffix}`,
        passwordHash: passHash,
        firstName: 'Counselor',
        lastName: 'Beta',
        role: UserRole.ROLE_COUNSELOR,
      },
    });
    counselor2Token = signAccessToken({
      id: counselor2User.id,
      email: counselor2User.email,
      username: counselor2User.username,
      role: counselor2User.role,
      institutionId: inst2Id,
      permissions: [],
    });

    // 4. Setup Academic entities in Inst 1
    const ay = await prisma.academicYear.create({
      data: {
        institutionId: inst1Id,
        name: `AY ${runSuffix}`,
        startDate: new Date(),
        endDate: new Date(Date.now() + 365 * 86400000),
      },
    });
    academicYearId = ay.id;

    const term = await prisma.academicTerm.create({
      data: {
        academicYearId,
        name: `Term 1 ${runSuffix}`,
        startDate: new Date(),
        endDate: new Date(Date.now() + 180 * 86400000),
      },
    });
    termId = term.id;

    const mathSub = await prisma.subject.create({
      data: {
        institutionId: inst1Id,
        name: `Mathematics ${runSuffix}`,
        code: `MATH_${runSuffix}`,
      },
    });
    mathSubjectId = mathSub.id;

    const histSub = await prisma.subject.create({
      data: {
        institutionId: inst1Id,
        name: `World History ${runSuffix}`,
        code: `HIST_${runSuffix}`,
      },
    });
    historySubjectId = histSub.id;

    // Create Teacher Profiles and Subject Assignments
    const t1Prof = await prisma.teacherProfile.create({
      data: {
        institutionId: inst1Id,
        userId: teacher1User.id,
        employeeCode: `T1-${runSuffix}`,
      },
    });
    await prisma.teacherAssignment.create({
      data: {
        teacherId: t1Prof.id,
        subjectId: mathSubjectId,
        sectionId: section.id,
        academicTermId: termId,
      },
    });

    const t2Prof = await prisma.teacherProfile.create({
      data: {
        institutionId: inst1Id,
        userId: teacher2User.id,
        employeeCode: `T2-${runSuffix}`,
      },
    });
    await prisma.teacherAssignment.create({
      data: {
        teacherId: t2Prof.id,
        subjectId: historySubjectId,
        sectionId: section.id,
        academicTermId: termId,
      },
    });

    // 5. Create Exam in Inst 1 (Math Exam)
    const examSession = await prisma.examSession.create({
      data: {
        institutionId: inst1Id,
        academicTermId: termId,
        name: `Final Exams ${runSuffix}`,
        startDate: new Date(),
        endDate: new Date(Date.now() + 14 * 86400000),
      },
    });

    const examSched = await prisma.examSchedule.create({
      data: {
        examSessionId: examSession.id,
        subjectId: mathSubjectId,
        examDate: new Date(),
        startTime: '09:00 AM',
        endTime: '12:00 PM',
        maxMarks: 100,
        passMarks: 40,
      },
    });
    examSchedule1Id = examSched.id;

    // 6. Create Course, Assignment, and Submissions in Inst 1
    const course = await prisma.course.create({
      data: {
        institutionId: inst1Id,
        subjectId: mathSubjectId,
        sectionId: section.id,
        teacherId: t1Prof.id,
        academicTermId: termId,
        title: `Advanced Math ${runSuffix}`,
        code: `MATH101_${runSuffix}`,
      },
    });

    const assignment = await prisma.assignment.create({
      data: {
        courseId: course.id,
        title: `Calculus HW 1 ${runSuffix}`,
        instructions: 'Solve all calculus problems',
        dueDate: new Date(Date.now() + 7 * 86400000),
      },
    });

    // 7. Upload Real Stored Files
    // Alice's submission
    student1SubmissionFile = await StorageService.uploadFile(
      Buffer.from(`%PDF-1.4 Alice Calculus Submission Content ${runSuffix}`),
      `alice_calc_${student1User.id}.pdf`,
      'application/pdf',
      { folder: 'submissions' }
    );
    await prisma.assignmentSubmission.create({
      data: {
        assignmentId: assignment.id,
        studentId: student1Profile.id,
        attachmentUrl: student1SubmissionFile.url,
        contentText: 'My solutions to calculus problems',
      },
    });

    // Bob's submission
    student2SubmissionFile = await StorageService.uploadFile(
      Buffer.from(`%PDF-1.4 Bob Calculus Submission Content ${runSuffix}`),
      `bob_calc_${student2User.id}.pdf`,
      'application/pdf',
      { folder: 'submissions' }
    );
    await prisma.assignmentSubmission.create({
      data: {
        assignmentId: assignment.id,
        studentId: student2Profile.id,
        attachmentUrl: student2SubmissionFile.url,
        contentText: 'Bob answers',
      },
    });

    // Exam question paper (associated with examSchedule1Id)
    examSchedule1File = await StorageService.uploadFile(
      Buffer.from(`%PDF-1.4 Confidential Math Final Exam Paper 2026 ${runSuffix}`),
      `math_exam_paper_${examSchedule1Id}.pdf`,
      'application/pdf',
      { folder: 'exams' }
    );

    // Counseling Case in Inst 1
    counseling1File = await StorageService.uploadFile(
      Buffer.from(`%PDF-1.4 Confidential Psychological Assessment Report ${runSuffix}`),
      `case_clinical_${student1Profile.id}.pdf`,
      'application/pdf',
      { folder: 'counseling' }
    );
    await prisma.counselingCase.create({
      data: {
        institutionId: inst1Id,
        studentId: student1Profile.id,
        counselorId: counselor1User.id,
        caseTitle: `Case Clinical Report ${runSuffix}`,
      },
    });

    // Public Avatar
    publicAvatarFile = await StorageService.uploadFile(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]),
      `public_avatar_${runSuffix}.png`,
      'image/png',
      { folder: 'avatars' }
    );
  });

  afterAll(async () => {
    // Clean up uploaded files
    if (student1SubmissionFile) await StorageService.deleteFile(student1SubmissionFile.url);
    if (student2SubmissionFile) await StorageService.deleteFile(student2SubmissionFile.url);
    if (examSchedule1File) await StorageService.deleteFile(examSchedule1File.url);
    if (counseling1File) await StorageService.deleteFile(counseling1File.url);
    if (publicAvatarFile) await StorageService.deleteFile(publicAvatarFile.url);
  });

  // =========================================================================
  // 1. UNAUTHENTICATED ACCESS (MUST RETURN 401)
  // =========================================================================
  describe('1. Unauthenticated Storage Access Defense', () => {
    it('rejects unauthenticated access to student submission with 401', async () => {
      const res = await request(app).get(`/api/v1/storage/${student1SubmissionFile.key}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects unauthenticated access to examination paper with 401', async () => {
      const res = await request(app).get(`/api/v1/storage/${examSchedule1File.key}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects unauthenticated access to counseling case with 401', async () => {
      const res = await request(app).get(`/api/v1/storage/${counseling1File.key}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects unauthenticated access via query parameter ?key= with 401', async () => {
      const res = await request(app).get(
        `/api/v1/storage/file?key=${encodeURIComponent(student1SubmissionFile.key)}`
      );
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  // =========================================================================
  // 2. CROSS-STUDENT AUTHORIZATION ATTACKS (MUST RETURN 403)
  // =========================================================================
  describe('2. Student-to-Student Data Access Defense', () => {
    it('blocks Student 2 from accessing Student 1 submission file with 403', async () => {
      const res = await request(app)
        .get(`/api/v1/storage/${student1SubmissionFile.key}`)
        .set('Authorization', `Bearer ${student2Token}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('blocks Student 1 from accessing Student 2 submission file with 403', async () => {
      const res = await request(app)
        .get(`/api/v1/storage/${student2SubmissionFile.key}`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('blocks Student 1 from deleting Student 2 submission file with 403', async () => {
      const res = await request(app)
        .delete('/api/v1/storage/file')
        .set('Authorization', `Bearer ${student1Token}`)
        .send({ key: student2SubmissionFile.key });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  // =========================================================================
  // 3. PARENT-TO-UNRELATED-STUDENT ACCESS (MUST RETURN 403)
  // =========================================================================
  describe('3. Parent-to-Unrelated-Student Access Defense', () => {
    it('blocks Parent 2 from accessing Student 1 submission file with 403', async () => {
      const res = await request(app)
        .get(`/api/v1/storage/${student1SubmissionFile.key}`)
        .set('Authorization', `Bearer ${parent2Token}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('blocks Parent 1 from accessing Student 2 submission file with 403', async () => {
      const res = await request(app)
        .get(`/api/v1/storage/${student2SubmissionFile.key}`)
        .set('Authorization', `Bearer ${parent1Token}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  // =========================================================================
  // 4. TEACHER-TO-UNAUTHORIZED-EXAM ACCESS (MUST RETURN 403)
  // =========================================================================
  describe('4. Teacher Exam Subject Authorization Defense', () => {
    it('blocks History Teacher from accessing Math Exam confidential paper with 403', async () => {
      const res = await request(app)
        .get(`/api/v1/storage/${examSchedule1File.key}`)
        .set('Authorization', `Bearer ${teacher2Token}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('blocks Student from accessing confidential exam paper with 403', async () => {
      const res = await request(app)
        .get(`/api/v1/storage/${examSchedule1File.key}`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('blocks Parent from accessing confidential exam paper with 403', async () => {
      const res = await request(app)
        .get(`/api/v1/storage/${examSchedule1File.key}`)
        .set('Authorization', `Bearer ${parent1Token}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  // =========================================================================
  // 5. CROSS-TENANT / CROSS-INSTITUTION ATTACKS (MUST RETURN 403)
  // =========================================================================
  describe('5. Cross-Tenant Isolation Defense', () => {
    it('blocks Admin from Beta Institution from accessing Alpha Institution submission with 403', async () => {
      const res = await request(app)
        .get(`/api/v1/storage/${student1SubmissionFile.key}`)
        .set('Authorization', `Bearer ${admin2Token}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('blocks Counselor from Beta Institution from accessing Alpha Institution counseling record with 403', async () => {
      const res = await request(app)
        .get(`/api/v1/storage/${counseling1File.key}`)
        .set('Authorization', `Bearer ${counselor2Token}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('blocks Admin from Beta Institution from deleting Alpha Institution file with 403', async () => {
      const res = await request(app)
        .delete('/api/v1/storage/file')
        .set('Authorization', `Bearer ${admin2Token}`)
        .send({ key: student1SubmissionFile.key });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  // =========================================================================
  // 6. GUESSED STORAGE KEYS & PROBING ATTACKS (MUST RETURN 403)
  // =========================================================================
  describe('6. Guessed Storage Keys Defense', () => {
    it('blocks Student from guessing arbitrary UUIDs in submissions/ with 403', async () => {
      const guessedKey = `submissions/${crypto.randomUUID()}-unlinked_secret_document.pdf`;
      const res = await request(app)
        .get(`/api/v1/storage/${guessedKey}`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('blocks Parent from probing arbitrary UUIDs in submissions/ with 403', async () => {
      const guessedKey = `submissions/${crypto.randomUUID()}-random_submission.pdf`;
      const res = await request(app)
        .get(`/api/v1/storage/${guessedKey}`)
        .set('Authorization', `Bearer ${parent1Token}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  // =========================================================================
  // 7. UNAUTHORIZED ROLE UPLOADS & RESTRICTED FOLDERS (MUST RETURN 403)
  // =========================================================================
  describe('7. Restricted Folder Upload Defense', () => {
    it('blocks Student from uploading directly into exams folder with 403', async () => {
      const res = await request(app)
        .post('/api/v1/storage/upload')
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          dataUrl: 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4 hacked exam').toString('base64'),
          filename: 'hacked_exam.pdf',
          folder: 'exams',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('blocks Teacher from uploading directly into counseling folder with 403', async () => {
      const res = await request(app)
        .post('/api/v1/storage/upload')
        .set('Authorization', `Bearer ${teacher1Token}`)
        .send({
          dataUrl: 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4 illegal counseling note').toString('base64'),
          filename: 'illegal_note.pdf',
          folder: 'counseling',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  // =========================================================================
  // 8. MALICIOUS FILE SIGNATURE / POLYGLOT ATTACKS (MUST RETURN 400)
  // =========================================================================
  describe('8. Magic Bytes & File Signature Validation Defense', () => {
    it('rejects Windows PE executable disguised as PDF (MZ header) with 400', async () => {
      // 0x4D 0x5A ('MZ') executable disguised as .pdf
      const peBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
      const res = await request(app)
        .post('/api/v1/storage/upload')
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          dataUrl: 'data:application/pdf;base64,' + peBuffer.toString('base64'),
          filename: 'malware.pdf',
          folder: 'submissions',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_FILE');
      expect(res.body.error.message).toContain('Windows PE/MZ');
    });

    it('rejects Linux ELF executable disguised as PDF (\\x7fELF header) with 400', async () => {
      const elfBuffer = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);
      const res = await request(app)
        .post('/api/v1/storage/upload')
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          dataUrl: 'data:application/pdf;base64,' + elfBuffer.toString('base64'),
          filename: 'rootkit.pdf',
          folder: 'submissions',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_FILE');
      expect(res.body.error.message).toContain('Linux ELF');
    });

    it('rejects Shell script disguised as PDF (#! header) with 400', async () => {
      const scriptBuffer = Buffer.from('#!/bin/bash\nrm -rf /');
      const res = await request(app)
        .post('/api/v1/storage/upload')
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          dataUrl: 'data:application/pdf;base64,' + scriptBuffer.toString('base64'),
          filename: 'exploit.pdf',
          folder: 'submissions',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_FILE');
      expect(res.body.error.message).toContain('shebang');
    });

    it('rejects invalid PDF missing %PDF- header with 400', async () => {
      const corruptedBuffer = Buffer.from('NOT_A_PDF_FILE_HEADER_DATA');
      const res = await request(app)
        .post('/api/v1/storage/upload')
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          dataUrl: 'data:application/pdf;base64,' + corruptedBuffer.toString('base64'),
          filename: 'fake.pdf',
          folder: 'submissions',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_FILE');
      expect(res.body.error.message).toContain('%PDF-');
    });

    it('rejects executable file extensions (.exe, .sh, .bat) with 400', async () => {
      const res = await request(app)
        .post('/api/v1/storage/upload')
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          dataUrl: 'data:application/octet-stream;base64,' + Buffer.from('payload').toString('base64'),
          filename: 'payload.exe',
          folder: 'submissions',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_FILE');
    });
  });

  // =========================================================================
  // 9. AUTHORIZED ACCESS VERIFICATION (MUST RETURN 200 WITH HEADERS)
  // =========================================================================
  describe('9. Legitimate Authorized Access & Privacy Headers', () => {
    it('allows Student 1 to access their OWN submission attachment with security headers', async () => {
      const res = await request(app)
        .get(`/api/v1/storage/${student1SubmissionFile.key}`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['cache-control']).toContain('no-store');
      expect(res.headers['cache-control']).toContain('private');
      expect(res.body.toString()).toContain('Alice Calculus Submission Content');
    });

    it('allows Parent 1 to access their LINKED child Student 1 submission', async () => {
      const res = await request(app)
        .get(`/api/v1/storage/${student1SubmissionFile.key}`)
        .set('Authorization', `Bearer ${parent1Token}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['cache-control']).toContain('private');
      expect(res.body.toString()).toContain('Alice Calculus Submission Content');
    });

    it('allows Math Teacher to access Math Exam paper', async () => {
      const res = await request(app)
        .get(`/api/v1/storage/${examSchedule1File.key}`)
        .set('Authorization', `Bearer ${teacher1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.toString()).toContain('Confidential Math Final Exam Paper');
    });

    it('allows Counselor 1 to access counseling record in their institution', async () => {
      const res = await request(app)
        .get(`/api/v1/storage/${counseling1File.key}`)
        .set('Authorization', `Bearer ${counselor1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.toString()).toContain('Confidential Psychological Assessment');
    });

    it('serves public avatars without authentication and with public cache-control', async () => {
      const res = await request(app).get(`/api/v1/storage/${publicAvatarFile.key}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/png');
      expect(res.headers['cache-control']).toContain('public');
    });
  });
});
