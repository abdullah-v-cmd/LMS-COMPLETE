import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/utils/prisma';
import { Express } from 'express';
import { UserRole } from '../src/types';

describe('Automatic Parent Account Creation, Strict Student Isolation & User Role Assignment Tests', () => {
  let app: Express;
  let superAdminToken: string;
  let principalToken: string;
  let parentToken: string;
  let studentAliceToken: string;
  let sectionId: string;
  let institutionId: string;

  // Track created entities for isolation testing
  let student1Id: string;
  let student2Id: string; // second child for same parent
  let student3Id: string; // child for another parent
  let parentUserEmail1: string;
  let parentUserEmail2: string;
  let parent2Token: string;

  beforeAll(async () => {
    app = createApp();
    await prisma.$connect();

    // 1. Super Admin Login
    const saRes = await request(app).post('/api/v1/auth/login').send({
      usernameOrEmail: 'superadmin@alpha.edu',
      password: 'Password123!',
    });
    superAdminToken = saRes.body.data.accessToken;

    // 2. Institution Admin (Principal) Login
    const pRes = await request(app).post('/api/v1/auth/login').send({
      usernameOrEmail: 'principal@alpha.edu',
      password: 'Password123!',
    });
    principalToken = pRes.body.data.accessToken;

    // 3. Existing Parent Login
    const parentRes = await request(app).post('/api/v1/auth/login').send({
      usernameOrEmail: 'parent.john@alpha.edu',
      password: 'Password123!',
    });
    parentToken = parentRes.body.data.accessToken;

    // 4. Student Alice Login
    const sRes = await request(app).post('/api/v1/auth/login').send({
      usernameOrEmail: 'student.alice@alpha.edu',
      password: 'Password123!',
    });
    studentAliceToken = sRes.body.data.accessToken;

    // Retrieve Section A & Institution ID
    const section = await prisma.section.findFirst({
      where: { name: 'Section A' },
      include: { classGrade: true },
    });
    sectionId = section!.id;
    institutionId = section!.classGrade.institutionId;

    parentUserEmail1 = `auto.parent.${Date.now()}@example.com`;
    parentUserEmail2 = `auto.parent.b.${Date.now()}@example.com`;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // =========================================================================
  // 1. Automatic Parent Creation & Deduplication
  // =========================================================================
  describe('Student Admission with Automatic Parent Creation & Deduplication', () => {
    it('creates a student record and automatically provisions a new parent account (ROLE_PARENT) with explicit link', async () => {
      const res = await request(app)
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${principalToken}`)
        .send({
          firstName: 'ChildOne',
          lastName: 'Testing',
          email: `child.one.${Date.now()}@alpha.edu`,
          username: `child_one_${Date.now()}`,
          password: 'Password123!',
          admissionNumber: `ADM-AUTO-1-${Date.now().toString().slice(-4)}`,
          sectionId,
          dateOfBirth: '2012-05-10',
          gender: 'MALE',
          parent: {
            firstName: 'ParentA',
            lastName: 'Testing',
            email: parentUserEmail1,
            phone: '+1-555-0101',
            relationshipType: 'FATHER',
            occupation: 'Software Architect',
            isPrimaryContact: true,
          },
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      student1Id = res.body.data.id;
      expect(student1Id).toBeDefined();

      // Verify Parent was created with ROLE_PARENT
      const parentUser = await prisma.user.findUnique({
        where: { email: parentUserEmail1.toLowerCase() },
        include: { parentProfile: true },
      });
      expect(parentUser).not.toBeNull();
      expect(parentUser?.role).toBe(UserRole.ROLE_PARENT);
      expect(parentUser?.parentProfile).not.toBeNull();

      // Verify explicit StudentParentRelation
      const relation = await prisma.studentParentRelation.findUnique({
        where: {
          studentId_parentId: {
            studentId: student1Id,
            parentId: parentUser!.parentProfile!.id,
          },
        },
      });
      expect(relation).not.toBeNull();
      expect(relation?.relationshipType).toBe('FATHER');
      expect(relation?.isPrimaryContact).toBe(true);
    });

    it('admitting a second child for the SAME parent links to the existing parent user without creating a duplicate user', async () => {
      const res = await request(app)
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${principalToken}`)
        .send({
          firstName: 'ChildTwo',
          lastName: 'Testing',
          email: `child.two.${Date.now()}@alpha.edu`,
          username: `child_two_${Date.now()}`,
          password: 'Password123!',
          admissionNumber: `ADM-AUTO-2-${Date.now().toString().slice(-4)}`,
          sectionId,
          dateOfBirth: '2014-08-20',
          gender: 'FEMALE',
          parent: {
            firstName: 'ParentA',
            lastName: 'Testing',
            email: parentUserEmail1, // Same parent email!
            relationshipType: 'FATHER',
            isPrimaryContact: true,
          },
        });

      expect(res.status).toBe(201);
      student2Id = res.body.data.id;
      expect(student2Id).toBeDefined();

      // Verify that there is still only ONE user with this parent email
      const parentUsers = await prisma.user.findMany({
        where: { email: parentUserEmail1.toLowerCase() },
      });
      expect(parentUsers.length).toBe(1);

      // Verify that Parent has TWO linked children in StudentParentRelation
      const relations = await prisma.studentParentRelation.findMany({
        where: { parent: { userId: parentUsers[0].id } },
      });
      expect(relations.length).toBe(2);
      const linkedStudentIds = relations.map((r: { studentId: string }) => r.studentId);
      expect(linkedStudentIds).toContain(student1Id);
      expect(linkedStudentIds).toContain(student2Id);
    });

    it('admitting a third child for a DIFFERENT parent creates Parent B', async () => {
      const res = await request(app)
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${principalToken}`)
        .send({
          firstName: 'ChildThree',
          lastName: 'Johnson',
          email: `child.three.${Date.now()}@alpha.edu`,
          username: `child_three_${Date.now()}`,
          password: 'Password123!',
          admissionNumber: `ADM-AUTO-3-${Date.now().toString().slice(-4)}`,
          sectionId,
          dateOfBirth: '2013-03-12',
          gender: 'MALE',
          parent: {
            firstName: 'ParentB',
            lastName: 'Johnson',
            email: parentUserEmail2,
            relationshipType: 'MOTHER',
            isPrimaryContact: true,
          },
        });

      expect(res.status).toBe(201);
      student3Id = res.body.data.id;
      expect(student3Id).toBeDefined();

      const parentBUser = await prisma.user.findUnique({
        where: { email: parentUserEmail2.toLowerCase() },
      });
      expect(parentBUser).not.toBeNull();
      expect(parentBUser?.role).toBe(UserRole.ROLE_PARENT);

      // Reset password for Parent B so we can log in and test isolation
      await prisma.user.update({
        where: { id: parentBUser!.id },
        data: { passwordHash: await (await import('../src/utils/password')).hashPassword('Password123!') },
      });

      const p2Login = await request(app).post('/api/v1/auth/login').send({
        usernameOrEmail: parentUserEmail2,
        password: 'Password123!',
      });
      parent2Token = p2Login.body.data.accessToken;
      expect(parent2Token).toBeDefined();
    });

    it('prevents duplicate parent-student relationship records', async () => {
      const parent = await prisma.parentProfile.findFirst({
        where: { user: { email: parentUserEmail1.toLowerCase() } },
      });

      const res = await request(app)
        .post(`/api/v1/students/${student1Id}/parents`)
        .set('Authorization', `Bearer ${principalToken}`)
        .send({
          parentId: parent!.id,
          relationshipType: 'FATHER',
        });

      // Should return the existing relation safely without 500 error or duplicate insert
      expect([200, 201]).toContain(res.status);
    });
  });

  // =========================================================================
  // 2. Strict Parent Data Isolation (Critical Security Requirements)
  // =========================================================================
  describe('Strict Parent Data Isolation Across API Endpoints', () => {
    it('Parent B can access their own linked child profile', async () => {
      const res = await request(app)
        .get(`/api/v1/students/${student3Id}`)
        .set('Authorization', `Bearer ${parent2Token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(student3Id);
    });

    it('Parent B CANNOT access Parent A child profile (student1Id) - rejected with 403 Forbidden', async () => {
      const res = await request(app)
        .get(`/api/v1/students/${student1Id}`)
        .set('Authorization', `Bearer ${parent2Token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Access denied');
    });

    it('Parent B CANNOT access Parent A second child profile (student2Id) - rejected with 403 Forbidden', async () => {
      const res = await request(app)
        .get(`/api/v1/students/${student2Id}`)
        .set('Authorization', `Bearer ${parent2Token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('Parent B calling GET /api/v1/students only receives their own linked child', async () => {
      const res = await request(app)
        .get('/api/v1/students')
        .set('Authorization', `Bearer ${parent2Token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const returnedIds = res.body.data.map((s: any) => s.id);
      expect(returnedIds).toContain(student3Id);
      expect(returnedIds).not.toContain(student1Id);
      expect(returnedIds).not.toContain(student2Id);
    });

    it('Parent B attempting to view attendance for Parent A child (student1Id) is rejected with 403', async () => {
      const res = await request(app)
        .get(`/api/v1/attendance?studentId=${student1Id}`)
        .set('Authorization', `Bearer ${parent2Token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('Parent B attempting to view report cards for Parent A child (student1Id) is rejected with 403', async () => {
      const res = await request(app)
        .get(`/api/v1/exams/report-cards?studentId=${student1Id}`)
        .set('Authorization', `Bearer ${parent2Token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('Student Alice cannot access another student profile', async () => {
      const res = await request(app)
        .get(`/api/v1/students/${student1Id}`)
        .set('Authorization', `Bearer ${studentAliceToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  // =========================================================================
  // 3. User Management & Canonical Role Assignment
  // =========================================================================
  describe('Centralized User Management & Role Assignment (Phase 2 & 3)', () => {
    let createdTeacherId: string;

    it('Institution Admin can create a Teacher account and assign ROLE_SUBJECT_TEACHER with profile', async () => {
      const teacherEmail = `new.teacher.${Date.now()}@alpha.edu`;
      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${principalToken}`)
        .send({
          firstName: 'Robert',
          lastName: 'Oppenheimer',
          email: teacherEmail,
          username: `teacher_${Date.now()}`,
          password: 'Password123!',
          role: 'ROLE_SUBJECT_TEACHER',
          employeeCode: `EMP-PHYS-${Date.now().toString().slice(-4)}`,
          department: 'Physics',
          qualification: 'Ph.D Physics',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.role).toBe(UserRole.ROLE_SUBJECT_TEACHER);
      createdTeacherId = res.body.data.id;

      // Verify TeacherProfile created atomically in DB
      const profile = await prisma.teacherProfile.findUnique({
        where: { userId: createdTeacherId },
      });
      expect(profile).not.toBeNull();
      expect(profile?.department).toBe('Physics');
    });

    it('Institution Admin can create an Accountant account with ROLE_FINANCE_HEAD', async () => {
      const finEmail = `finance.head.${Date.now()}@alpha.edu`;
      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${principalToken}`)
        .send({
          firstName: 'Sarah',
          lastName: 'Accountant',
          email: finEmail,
          username: `fin_${Date.now()}`,
          password: 'Password123!',
          role: 'ROLE_FINANCE_HEAD',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.role).toBe(UserRole.ROLE_FINANCE_HEAD);
    });

    it('Institution Admin CANNOT create a Super Admin account - rejected with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${principalToken}`)
        .send({
          firstName: 'Illegal',
          lastName: 'SuperAdmin',
          email: `fake.sa.${Date.now()}@alpha.edu`,
          username: `fake_sa_${Date.now()}`,
          password: 'Password123!',
          role: 'ROLE_SUPER_ADMIN',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Super Administrator');
    });

    it('Non-admin user (Student) cannot provision users - rejected with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${studentAliceToken}`)
        .send({
          firstName: 'Hack',
          lastName: 'Attempt',
          email: `hack.${Date.now()}@alpha.edu`,
          username: `hacker_${Date.now()}`,
          password: 'Password123!',
          role: 'ROLE_SUBJECT_TEACHER',
        });

      expect(res.status).toBe(403);
    });

    it('Authorized administrator can update existing user role and status', async () => {
      const res = await request(app)
        .put(`/api/v1/users/${createdTeacherId}/role`)
        .set('Authorization', `Bearer ${principalToken}`)
        .send({
          role: 'ROLE_ACADEMIC_HEAD',
          isActive: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.role).toBe(UserRole.ROLE_ACADEMIC_HEAD);

      // Verify persisted in DB
      const updated = await prisma.user.findUnique({
        where: { id: createdTeacherId },
      });
      expect(updated?.role).toBe(UserRole.ROLE_ACADEMIC_HEAD);
    });

    it('Self-privilege escalation is forbidden (Institution Admin cannot promote themselves to Super Admin)', async () => {
      const principalUser = await prisma.user.findUnique({
        where: { email: 'principal@alpha.edu' },
      });

      const res = await request(app)
        .put(`/api/v1/users/${principalUser!.id}/role`)
        .set('Authorization', `Bearer ${principalToken}`)
        .send({
          role: 'ROLE_SUPER_ADMIN',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('Super Admin can change roles and view users in users list', async () => {
      const res = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(5);

      const foundTeacher = res.body.data.find((u: any) => u.id === createdTeacherId);
      expect(foundTeacher).toBeDefined();
      expect(foundTeacher.role).toBe(UserRole.ROLE_ACADEMIC_HEAD);
    });
  });
});
