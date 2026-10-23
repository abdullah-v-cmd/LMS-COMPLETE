import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Starting Database Seeding ---');
  const passwordHash = await bcrypt.hash('Password123!', 10);

  // 1. Create Institutions
  const alphaInst = await prisma.institution.upsert({
    where: { code: 'ALPHA' },
    update: {},
    create: {
      name: 'Alpha Academy',
      code: 'ALPHA',
      slug: 'alpha-academy',
      currency: 'USD',
      address: '100 Innovation Way, Tech City',
      phone: '+1-555-0100',
      email: 'contact@alpha.edu',
    },
  });

  const betaInst = await prisma.institution.upsert({
    where: { code: 'BETA' },
    update: {},
    create: {
      name: 'Beta Institute',
      code: 'BETA',
      slug: 'beta-institute',
      currency: 'EUR',
      address: '200 Heritage Blvd, Metroville',
      phone: '+1-555-0200',
      email: 'info@beta.edu',
    },
  });

  console.log(`Created Institutions: ${alphaInst.name} (${alphaInst.id}), ${betaInst.name} (${betaInst.id})`);

  // 2. Campuses
  const alphaCampus = await prisma.campus.upsert({
    where: { institutionId_code: { institutionId: alphaInst.id, code: 'MAIN' } },
    update: {},
    create: {
      institutionId: alphaInst.id,
      name: 'Main Campus',
      code: 'MAIN',
      isMainCampus: true,
      address: '100 Innovation Way, Tech City',
    },
  });

  // 3. Academic Year & Term
  const academicYear = await prisma.academicYear.upsert({
    where: { institutionId_name: { institutionId: alphaInst.id, name: '2026-2027' } },
    update: {},
    create: {
      institutionId: alphaInst.id,
      name: '2026-2027',
      startDate: new Date('2026-08-01'),
      endDate: new Date('2027-06-30'),
      isCurrent: true,
    },
  });

  const academicTerm = await prisma.academicTerm.create({
    data: {
      academicYearId: academicYear.id,
      name: 'Fall Term 2026',
      startDate: new Date('2026-08-01'),
      endDate: new Date('2026-12-20'),
      isCurrent: true,
    },
  });

  // 4. Seed all 16 Roles in Alpha Academy
  const rolesData = [
    { email: 'superadmin@alpha.edu', username: 'superadmin', role: UserRole.ROLE_SUPER_ADMIN, first: 'Platform', last: 'Owner', instId: null },
    { email: 'principal@alpha.edu', username: 'principal', role: UserRole.ROLE_INSTITUTION_ADMIN, first: 'Arthur', last: 'Vance', instId: alphaInst.id },
    { email: 'hod.science@alpha.edu', username: 'hod_science', role: UserRole.ROLE_ACADEMIC_HEAD, first: 'Eleanor', last: 'Rigby', instId: alphaInst.id },
    { email: 'teacher.homeroom@alpha.edu', username: 'teacher_homeroom', role: UserRole.ROLE_CLASS_TEACHER, first: 'Sarah', last: 'Connor', instId: alphaInst.id },
    { email: 'teacher.math@alpha.edu', username: 'teacher_math', role: UserRole.ROLE_SUBJECT_TEACHER, first: 'Isaac', last: 'Newton', instId: alphaInst.id },
    { email: 'ta.physics@alpha.edu', username: 'ta_physics', role: UserRole.ROLE_TEACHING_ASSISTANT, first: 'Richard', last: 'Feynman', instId: alphaInst.id },
    { email: 'exam.controller@alpha.edu', username: 'exam_controller', role: UserRole.ROLE_EXAM_CONTROLLER, first: 'Minerva', last: 'McGonagall', instId: alphaInst.id },
    { email: 'finance.head@alpha.edu', username: 'finance_head', role: UserRole.ROLE_FINANCE_HEAD, first: 'Scrooge', last: 'McDuck', instId: alphaInst.id },
    { email: 'fee.clerk@alpha.edu', username: 'fee_clerk', role: UserRole.ROLE_FEE_CLERK, first: 'Bob', last: 'Cratchit', instId: alphaInst.id },
    { email: 'librarian@alpha.edu', username: 'librarian', role: UserRole.ROLE_LIBRARIAN, first: 'Giles', last: 'Rupert', instId: alphaInst.id },
    { email: 'transport@alpha.edu', username: 'transport_coord', role: UserRole.ROLE_TRANSPORT_COORDINATOR, first: 'Otto', last: 'Mann', instId: alphaInst.id },
    { email: 'hostel.warden@alpha.edu', username: 'hostel_warden', role: UserRole.ROLE_HOSTEL_WARDEN, first: 'Argus', last: 'Filch', instId: alphaInst.id },
    { email: 'counselor@alpha.edu', username: 'counselor', role: UserRole.ROLE_COUNSELOR, first: 'Sean', last: 'Maguire', instId: alphaInst.id },
    { email: 'parent.john@alpha.edu', username: 'parent_john', role: UserRole.ROLE_PARENT, first: 'John', last: 'Doe', instId: alphaInst.id },
    { email: 'student.alice@alpha.edu', username: 'student_alice', role: UserRole.ROLE_STUDENT, first: 'Alice', last: 'Doe', instId: alphaInst.id },
    { email: 'auditor@alpha.edu', username: 'auditor', role: UserRole.ROLE_AUDITOR, first: 'Charles', last: 'Babbage', instId: alphaInst.id },
  ];

  const createdUsers: Record<string, any> = {};

  for (const r of rolesData) {
    const user = await prisma.user.upsert({
      where: { email: r.email },
      update: {},
      create: {
        email: r.email,
        username: r.username,
        passwordHash,
        firstName: r.first,
        lastName: r.last,
        role: r.role,
        institutionId: r.instId,
      },
    });
    createdUsers[r.username] = user;
    console.log(`Seeded user: ${user.email} (${user.role})`);
  }

  // Cross-tenant user in Beta Institute for isolation testing
  const betaPrincipal = await prisma.user.upsert({
    where: { email: 'principal@beta.edu' },
    update: {},
    create: {
      email: 'principal@beta.edu',
      username: 'principal_beta',
      passwordHash,
      firstName: 'Albus',
      lastName: 'Dumbledore',
      role: UserRole.ROLE_INSTITUTION_ADMIN,
      institutionId: betaInst.id,
    },
  });
  console.log(`Seeded cross-tenant user: ${betaPrincipal.email}`);

  // 5. Academic Classes, Sections, Subjects
  const program = await prisma.program.upsert({
    where: { institutionId_code: { institutionId: alphaInst.id, code: 'HS' } },
    update: {},
    create: {
      institutionId: alphaInst.id,
      name: 'High School',
      code: 'HS',
    },
  });

  const classGrade = await prisma.classGrade.upsert({
    where: { institutionId_name: { institutionId: alphaInst.id, name: 'Grade 10' } },
    update: {},
    create: {
      institutionId: alphaInst.id,
      programId: program.id,
      name: 'Grade 10',
      level: 10,
    },
  });

  const section = await prisma.section.upsert({
    where: { classGradeId_name: { classGradeId: classGrade.id, name: 'Section A' } },
    update: {},
    create: {
      classGradeId: classGrade.id,
      name: 'Section A',
      roomNumber: '101',
    },
  });

  const subjectMath = await prisma.subject.upsert({
    where: { institutionId_code: { institutionId: alphaInst.id, code: 'MATH-101' } },
    update: {},
    create: {
      institutionId: alphaInst.id,
      name: 'Advanced Mathematics',
      code: 'MATH-101',
      creditUnits: 4,
    },
  });

  const subjectPhysics = await prisma.subject.upsert({
    where: { institutionId_code: { institutionId: alphaInst.id, code: 'PHYS-101' } },
    update: {},
    create: {
      institutionId: alphaInst.id,
      name: 'Physics I',
      code: 'PHYS-101',
      creditUnits: 3,
    },
  });

  // 6. Teacher Profile & Assignment
  const mathTeacher = createdUsers['teacher_math'];
  const teacherProfile = await prisma.teacherProfile.upsert({
    where: { userId: mathTeacher.id },
    update: {},
    create: {
      userId: mathTeacher.id,
      institutionId: alphaInst.id,
      employeeCode: 'EMP-MATH-01',
      qualification: 'Ph.D. in Applied Mathematics',
      department: 'Mathematics & Computing',
    },
  });

  await prisma.teacherAssignment.upsert({
    where: {
      teacherId_subjectId_sectionId_academicTermId: {
        teacherId: teacherProfile.id,
        subjectId: subjectMath.id,
        sectionId: section.id,
        academicTermId: academicTerm.id,
      },
    },
    update: {},
    create: {
      teacherId: teacherProfile.id,
      subjectId: subjectMath.id,
      sectionId: section.id,
      academicTermId: academicTerm.id,
      isPrimaryTeacher: true,
    },
  });

  // The homeroom teacher is assigned to the same section for daily attendance workflows.
  const homeroomUser = createdUsers['teacher_homeroom'];
  const homeroomProfile = await prisma.teacherProfile.upsert({
    where: { userId: homeroomUser.id },
    update: {},
    create: {
      userId: homeroomUser.id,
      institutionId: alphaInst.id,
      employeeCode: 'EMP-HOMEROOM-01',
      qualification: 'B.Ed.',
      department: 'Homeroom',
    },
  });
  await prisma.teacherAssignment.upsert({
    where: {
      teacherId_subjectId_sectionId_academicTermId: {
        teacherId: homeroomProfile.id,
        subjectId: subjectMath.id,
        sectionId: section.id,
        academicTermId: academicTerm.id,
      },
    },
    update: {},
    create: {
      teacherId: homeroomProfile.id,
      subjectId: subjectMath.id,
      sectionId: section.id,
      academicTermId: academicTerm.id,
      isPrimaryTeacher: false,
    },
  });

  // 7. Student Profile & Parent Profile
  const studentUser = createdUsers['student_alice'];
  const studentProfile = await prisma.studentProfile.upsert({
    where: { userId: studentUser.id },
    update: {},
    create: {
      userId: studentUser.id,
      institutionId: alphaInst.id,
      admissionNumber: 'ADM-2026-001',
      rollNumber: '1001',
      sectionId: section.id,
      dateOfBirth: new Date('2010-05-15'),
      gender: 'FEMALE',
      bloodGroup: 'O+',
    },
  });

  const parentUser = createdUsers['parent_john'];
  const parentProfile = await prisma.parentProfile.upsert({
    where: { userId: parentUser.id },
    update: {},
    create: {
      userId: parentUser.id,
      institutionId: alphaInst.id,
      occupation: 'Software Architect',
      emergencyContact: '+1-555-0199',
    },
  });

  await prisma.studentParentRelation.upsert({
    where: { studentId_parentId: { studentId: studentProfile.id, parentId: parentProfile.id } },
    update: {},
    create: {
      studentId: studentProfile.id,
      parentId: parentProfile.id,
      relationshipType: 'FATHER',
      isPrimaryContact: true,
    },
  });

  // 8. LMS Course, Modules, Lessons, Assignment
  const course = await prisma.course.create({
    data: {
      institutionId: alphaInst.id,
      subjectId: subjectMath.id,
      sectionId: section.id,
      teacherId: teacherProfile.id,
      academicTermId: academicTerm.id,
      title: 'Grade 10 Advanced Mathematics',
      code: 'MATH-10-A',
      description: 'Comprehensive study of polynomial algebra, trigonometry, and coordinate geometry.',
      isPublished: true,
    },
  });

  const module1 = await prisma.courseModule.create({
    data: {
      courseId: course.id,
      title: 'Module 1: Polynomial Functions & Factoring',
      sequenceOrder: 1,
      isPublished: true,
    },
  });

  await prisma.lesson.create({
    data: {
      moduleId: module1.id,
      title: 'Lesson 1.1: Quadratic Roots and Synthetic Division',
      contentRichText: '<h2>Synthetic Division</h2><p>Synthetic division is a shortcut method for dividing polynomials when the divisor is of the form (x - c).</p>',
      sequenceOrder: 1,
      isPublished: true,
    },
  });

  await prisma.assignment.create({
    data: {
      courseId: course.id,
      title: 'Assignment 1: Factoring Higher Degree Polynomials',
      instructions: 'Complete problem set 1-15 from Chapter 2. Show all work and submit your solution.',
      maxPoints: 100,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      allowLateSubmissions: true,
      latePenaltyPercent: 10,
    },
  });

  // 9. Fee Structure & Invoices
  const feeStructure = await prisma.feeStructure.create({
    data: {
      institutionId: alphaInst.id,
      academicYearId: academicYear.id,
      classGradeId: classGrade.id,
      name: 'Grade 10 Annual Tuition & Lab Fee',
      amount: 1200.0,
      dueDate: new Date('2026-09-01'),
      frequency: 'ANNUAL',
    },
  });

  await prisma.studentFeeInvoice.create({
    data: {
      institutionId: alphaInst.id,
      studentId: studentProfile.id,
      feeStructureId: feeStructure.id,
      invoiceNumber: 'INV-2026-0001',
      totalAmount: 1200.0,
      discountAmount: 0.0,
      paidAmount: 0.0,
      balanceAmount: 1200.0,
      status: 'UNPAID',
      dueDate: new Date('2026-09-01'),
    },
  });

  console.log('--- Database Seeding Complete ---');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
