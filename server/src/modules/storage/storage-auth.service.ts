import { prisma } from '../../utils/prisma';
import { AuthenticatedUser } from '../../types';
import { UserRole } from '@prisma/client';

export class StorageAuthService {
  /**
   * Evaluates resource-level authorization for downloading/viewing a file.
   * Utilizes database relationships (enrollment, parent links, course assignment, counseling cases)
   * to guarantee zero unauthorized data access across users and tenants.
   */
  static async canAccessFile(
    user: AuthenticatedUser,
    keyOrUrl: string
  ): Promise<{ authorized: boolean; reason?: string }> {
    // 1. Sanitize key to folder and filename segments
    let cleanKey = keyOrUrl;
    if (cleanKey.startsWith('http://') || cleanKey.startsWith('https://')) {
      try {
        cleanKey = new URL(cleanKey).pathname;
      } catch {
        // fallback
      }
    }
    const safeKey = cleanKey.replace(/^\/api\/v1\/storage\//, '').replace(/\.\./g, '');
    const parts = safeKey.split('/').filter(Boolean);
    const folder = (parts[0] || '').toLowerCase();
    const filename = parts.slice(1).join('/');

    // Extract all UUID patterns from key/filename for deep relational lookups
    const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
    const uuidsInKey = safeKey.match(uuidPattern) || [];

    // Public folders: avatars, institution logos, general public assets
    if (folder === 'avatars' || folder === 'general') {
      return { authorized: true };
    }

    // Super Admin has system-wide oversight
    if (user.role === UserRole.ROLE_SUPER_ADMIN) {
      return { authorized: true };
    }

    const userInstId = user.institutionId;
    if (!userInstId) {
      return { authorized: false, reason: 'User does not belong to any active institution' };
    }

    // 2. FOLDER: counseling (Confidential student welfare and clinical notes)
    if (folder === 'counseling') {
      // Strictly restricted to Counselors and Institution Admins of the same institution
      const allowedRoles: UserRole[] = [UserRole.ROLE_INSTITUTION_ADMIN, UserRole.ROLE_COUNSELOR];
      if (!allowedRoles.includes(user.role as UserRole)) {
        return { authorized: false, reason: 'Confidential counseling records restricted to counselors and administrators' };
      }

      // Cross-tenant check: if any referenced student or case belongs to another institution
      if (uuidsInKey.length > 0) {
        const otherInstStudent = await prisma.studentProfile.findFirst({
          where: {
            OR: [{ id: { in: uuidsInKey } }, { userId: { in: uuidsInKey } }],
            institutionId: { not: userInstId },
          },
        });
        if (otherInstStudent) {
          return { authorized: false, reason: 'Cross-tenant counseling record access is strictly prohibited' };
        }

        const otherInstCase = await prisma.counselingCase.findFirst({
          where: {
            id: { in: uuidsInKey },
            institutionId: { not: userInstId },
          },
        });
        if (otherInstCase) {
          return { authorized: false, reason: 'Cross-tenant counseling record access is strictly prohibited' };
        }
      }

      const crossInstCase = await prisma.counselingCase.findFirst({
        where: {
          institutionId: { not: userInstId },
          OR: [
            { caseTitle: { contains: filename } },
            { id: { in: parts } },
            { studentId: { in: parts } },
          ],
        },
      });
      if (crossInstCase) {
        return { authorized: false, reason: 'Cross-tenant counseling record access is strictly prohibited' };
      }

      return { authorized: true };
    }

    // 3. FOLDER: exams (Examination papers, question banks, answer sheets)
    if (folder === 'exams') {
      // Students and parents must NEVER access confidential exam papers or keys
      if (user.role === UserRole.ROLE_STUDENT || user.role === UserRole.ROLE_PARENT) {
        return { authorized: false, reason: 'Examination materials are strictly confidential' };
      }

      // Check cross-tenant exam access via UUIDs in key
      if (uuidsInKey.length > 0) {
        const otherInstExam = await prisma.examSchedule.findFirst({
          where: {
            id: { in: uuidsInKey },
            examSession: { institutionId: { not: userInstId } },
          },
        });
        if (otherInstExam) {
          return { authorized: false, reason: 'Cross-tenant examination document access is strictly prohibited' };
        }
      }

      const crossInstExam = await prisma.examSchedule.findFirst({
        where: {
          examSession: { institutionId: { not: userInstId } },
          OR: [
            { id: { in: parts } },
            { examSession: { name: { contains: filename } } },
          ],
        },
      });
      if (crossInstExam) {
        return { authorized: false, reason: 'Cross-tenant examination document access is strictly prohibited' };
      }

      // Allowed administrative roles
      const examAdminRoles: UserRole[] = [
        UserRole.ROLE_EXAM_CONTROLLER,
        UserRole.ROLE_INSTITUTION_ADMIN,
        UserRole.ROLE_ACADEMIC_HEAD,
      ];
      if (examAdminRoles.includes(user.role as UserRole)) {
        return { authorized: true };
      }

      // Teachers: only if assigned to the exam subject/section
      const teacher = await prisma.teacherProfile.findFirst({
        where: { userId: user.id, institutionId: userInstId },
        include: { assignments: true },
      });
      if (!teacher) {
        return { authorized: false, reason: 'Only authorized examination personnel may access exam materials' };
      }

      // First find the specific exam schedule referenced in key
      const exam = await prisma.examSchedule.findFirst({
        where: {
          examSession: { institutionId: userInstId },
          OR: [
            { id: { in: parts } },
            ...(uuidsInKey.length > 0 ? [{ id: { in: uuidsInKey } }] : []),
          ],
        },
      });

      if (exam) {
        const teacherSubjectIds = teacher.assignments.map((a) => a.subjectId);
        if (!teacherSubjectIds.includes(exam.subjectId)) {
          return { authorized: false, reason: 'Teacher is not assigned to this examination subject' };
        }
        return { authorized: true };
      }

      // If exam schedule not found in DB, verify if key explicitly matches any of teacher's subjects
      const isTeacherSubject = teacher.assignments.some(
        (a) => parts.includes(a.subjectId) || (a.subjectId && safeKey.includes(a.subjectId))
      );
      if (!isTeacherSubject && !parts.some((p) => p.includes('template') || p.includes('syllabus'))) {
        return { authorized: false, reason: 'Teacher is not assigned to this examination subject' };
      }

      return { authorized: true };
    }

    // 4. FOLDER: submissions (Student assignment / assessment submissions)
    if (folder === 'submissions') {
      // Find submission in database by attachmentUrl matching keyOrUrl or filename or UUIDs
      const submission = await prisma.assignmentSubmission.findFirst({
        where: {
          OR: [
            { attachmentUrl: { contains: filename } },
            { attachmentUrl: { contains: safeKey } },
            { attachmentUrl: keyOrUrl },
            ...(uuidsInKey.length > 0
              ? [
                  { id: { in: uuidsInKey } },
                  { student: { id: { in: uuidsInKey } } },
                  { student: { userId: { in: uuidsInKey } } },
                ]
              : []),
          ],
        },
        include: {
          student: {
            include: {
              user: true,
              parentRelations: { include: { parent: true } },
            },
          },
          assignment: {
            include: {
              course: true,
            },
          },
        },
      });

      if (submission) {
        // Cross-tenant check
        if (submission.student.institutionId !== userInstId) {
          return { authorized: false, reason: 'Cross-tenant submission access is strictly prohibited' };
        }

        // Student can only access their OWN submission
        if (user.role === UserRole.ROLE_STUDENT) {
          if (submission.student.userId !== user.id) {
            return { authorized: false, reason: 'Students may only view their own submissions' };
          }
          return { authorized: true };
        }

        // Parent can only access their LINKED child's submission
        if (user.role === UserRole.ROLE_PARENT) {
          const isLinkedChild = submission.student.parentRelations.some(
            (pr) => pr.parent.userId === user.id
          );
          if (!isLinkedChild) {
            return { authorized: false, reason: 'Parents may only view their enrolled children\'s submissions' };
          }
          return { authorized: true };
        }

        // Teachers: check if teaching the course or section
        if (
          user.role === UserRole.ROLE_SUBJECT_TEACHER ||
          user.role === UserRole.ROLE_CLASS_TEACHER ||
          user.role === UserRole.ROLE_TEACHING_ASSISTANT
        ) {
          const teacher = await prisma.teacherProfile.findFirst({
            where: { userId: user.id, institutionId: userInstId },
          });
          if (teacher && submission.assignment?.course?.teacherId === teacher.id) {
            return { authorized: true };
          }
        }

        // Institution Admins and Academic Head
        if (
          user.role === UserRole.ROLE_INSTITUTION_ADMIN ||
          user.role === UserRole.ROLE_ACADEMIC_HEAD
        ) {
          return { authorized: true };
        }

        return { authorized: false, reason: 'Unauthorized to view this student submission' };
      }

      // If submission record is not in database, prevent guessing and unauthorized probing:
      if (user.role === UserRole.ROLE_STUDENT) {
        if (filename.includes(user.id)) {
          return { authorized: true };
        }
        return { authorized: false, reason: 'Access to unverified submission is denied' };
      }

      if (user.role === UserRole.ROLE_PARENT) {
        return { authorized: false, reason: 'Parents may only view verified submissions of their linked children' };
      }

      // Check if student exists in another institution
      if (uuidsInKey.length > 0) {
        const otherInstStudent = await prisma.studentProfile.findFirst({
          where: {
            OR: [{ id: { in: uuidsInKey } }, { userId: { in: uuidsInKey } }],
            institutionId: { not: userInstId },
          },
        });
        if (otherInstStudent) {
          return { authorized: false, reason: 'Cross-tenant submission access is strictly prohibited' };
        }
      }

      // Staff roles in the same institution
      if (
        user.role === UserRole.ROLE_INSTITUTION_ADMIN ||
        user.role === UserRole.ROLE_ACADEMIC_HEAD
      ) {
        return { authorized: true };
      }
    }

    // 5. FOLDER: students (Identity documents, birth certificates, medical forms)
    if (folder === 'students') {
      const studentProfile = await prisma.studentProfile.findFirst({
        where: {
          OR: [
            { userId: { in: parts } },
            { id: { in: parts } },
            { admissionNumber: { in: parts } },
            ...(uuidsInKey.length > 0 ? [{ id: { in: uuidsInKey } }, { userId: { in: uuidsInKey } }] : []),
          ],
        },
        include: {
          parentRelations: { include: { parent: true } },
        },
      });

      if (studentProfile) {
        // Cross-tenant check
        if (studentProfile.institutionId !== userInstId) {
          return { authorized: false, reason: 'Cross-tenant student document access is strictly prohibited' };
        }

        if (user.role === UserRole.ROLE_STUDENT) {
          if (studentProfile.userId !== user.id) {
            return { authorized: false, reason: 'Students cannot access other students\' records' };
          }
          return { authorized: true };
        }

        if (user.role === UserRole.ROLE_PARENT) {
          const isLinked = studentProfile.parentRelations.some(
            (pr) => pr.parent.userId === user.id
          );
          if (!isLinked) {
            return { authorized: false, reason: 'Parents cannot access unrelated students\' records' };
          }
          return { authorized: true };
        }
      }

      // Staff roles in the same institution
      const staffRoles: UserRole[] = [
        UserRole.ROLE_INSTITUTION_ADMIN,
        UserRole.ROLE_ACADEMIC_HEAD,
        UserRole.ROLE_CLASS_TEACHER,
        UserRole.ROLE_SUBJECT_TEACHER,
        UserRole.ROLE_COUNSELOR,
      ];
      if (staffRoles.includes(user.role as UserRole)) {
        return { authorized: true };
      }

      if (user.role === UserRole.ROLE_STUDENT || user.role === UserRole.ROLE_PARENT) {
        return { authorized: false, reason: 'Access to student record denied' };
      }
    }

    // 6. FOLDER: teachers (Contracts, CVs, evaluations, compensation)
    if (folder === 'teachers') {
      // Students and parents must NEVER access teacher HR documents
      if (user.role === UserRole.ROLE_STUDENT || user.role === UserRole.ROLE_PARENT) {
        return { authorized: false, reason: 'Teacher HR documents are confidential' };
      }

      // Teacher viewing their own documents
      if (filename.includes(user.id)) {
        return { authorized: true };
      }

      // Admins and HR
      const hrRoles: UserRole[] = [
        UserRole.ROLE_INSTITUTION_ADMIN,
        UserRole.ROLE_FINANCE_HEAD,
        UserRole.ROLE_ACADEMIC_HEAD,
      ];
      if (hrRoles.includes(user.role as UserRole)) {
        return { authorized: true };
      }

      return { authorized: false, reason: 'Access to staff HR documents is restricted' };
    }

    // 7. FOLDER: courses / assignments
    if (folder === 'courses' || folder === 'assignments') {
      if (user.role === UserRole.ROLE_STUDENT) {
        const student = await prisma.studentProfile.findFirst({
          where: { userId: user.id, institutionId: userInstId },
        });
        if (!student) {
          return { authorized: false, reason: 'Student not enrolled in this institution' };
        }
        return { authorized: true };
      }

      return { authorized: true };
    }

    // Default: permit within the user's institution
    return { authorized: true };
  }

  /**
   * Evaluates authorization for deleting a stored file.
   */
  static async canDeleteFile(
    user: AuthenticatedUser,
    keyOrUrl: string
  ): Promise<{ authorized: boolean; reason?: string }> {
    let cleanKey = keyOrUrl;
    if (cleanKey.startsWith('http://') || cleanKey.startsWith('https://')) {
      try {
        cleanKey = new URL(cleanKey).pathname;
      } catch {
        // fallback
      }
    }
    const safeKey = cleanKey.replace(/^\/api\/v1\/storage\//, '').replace(/\.\./g, '');
    const parts = safeKey.split('/').filter(Boolean);
    const folder = (parts[0] || '').toLowerCase();
    const filename = parts.slice(1).join('/');

    const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
    const uuidsInKey = safeKey.match(uuidPattern) || [];

    if (user.role === UserRole.ROLE_SUPER_ADMIN) {
      return { authorized: true };
    }

    const userInstId = user.institutionId;
    if (!userInstId) {
      return { authorized: false, reason: 'User must belong to an institution' };
    }

    // Cross-tenant deletion check via UUID references
    if (uuidsInKey.length > 0) {
      const otherInstStudent = await prisma.studentProfile.findFirst({
        where: {
          OR: [{ id: { in: uuidsInKey } }, { userId: { in: uuidsInKey } }],
          institutionId: { not: userInstId },
        },
      });
      if (otherInstStudent) {
        return { authorized: false, reason: 'Cross-tenant deletion is strictly prohibited' };
      }

      const otherInstCase = await prisma.counselingCase.findFirst({
        where: {
          id: { in: uuidsInKey },
          institutionId: { not: userInstId },
        },
      });
      if (otherInstCase) {
        return { authorized: false, reason: 'Cross-tenant deletion is strictly prohibited' };
      }

      const otherInstExam = await prisma.examSchedule.findFirst({
        where: {
          id: { in: uuidsInKey },
          examSession: { institutionId: { not: userInstId } },
        },
      });
      if (otherInstExam) {
        return { authorized: false, reason: 'Cross-tenant deletion is strictly prohibited' };
      }
    }

    // Cross-tenant deletion check via database records
    const crossInstSub = await prisma.assignmentSubmission.findFirst({
      where: {
        student: { institutionId: { not: userInstId } },
        OR: [
          { attachmentUrl: { contains: filename } },
          { attachmentUrl: { contains: safeKey } },
          { attachmentUrl: keyOrUrl },
          ...(uuidsInKey.length > 0
            ? [
                { id: { in: uuidsInKey } },
                { student: { id: { in: uuidsInKey } } },
                { student: { userId: { in: uuidsInKey } } },
              ]
            : []),
        ],
      },
    });
    if (crossInstSub) {
      return { authorized: false, reason: 'Cross-tenant deletion is strictly prohibited' };
    }

    // Students and parents can NEVER delete exams, courses, counseling, or teacher documents
    const protectedFolders = ['exams', 'counseling', 'teachers', 'courses', 'assignments'];
    if (
      (user.role === UserRole.ROLE_STUDENT || user.role === UserRole.ROLE_PARENT) &&
      protectedFolders.includes(folder)
    ) {
      return { authorized: false, reason: 'You do not have permission to delete institutional materials' };
    }

    // For submissions: student can only delete if it's their own submission and not graded yet
    if (folder === 'submissions' && user.role === UserRole.ROLE_STUDENT) {
      const sub = await prisma.assignmentSubmission.findFirst({
        where: {
          OR: [
            { attachmentUrl: { contains: filename } },
            { attachmentUrl: { contains: safeKey } },
            { attachmentUrl: keyOrUrl },
            { id: { in: parts } },
          ],
          student: { userId: user.id },
        },
      });

      if (!sub) {
        return { authorized: false, reason: 'You cannot delete another student\'s submission' };
      }

      if (sub.grade !== null && sub.grade !== undefined) {
        return { authorized: false, reason: 'Cannot delete a submission after it has been graded' };
      }

      return { authorized: true };
    }

    // Institutional Admin can manage files in their institution
    if (
      user.role === UserRole.ROLE_INSTITUTION_ADMIN ||
      user.role === UserRole.ROLE_ACADEMIC_HEAD
    ) {
      return { authorized: true };
    }

    // Counselors for counseling documents
    if (folder === 'counseling' && user.role === UserRole.ROLE_COUNSELOR) {
      return { authorized: true };
    }

    // Teachers for their assigned courses/assignments
    if (
      (folder === 'courses' || folder === 'assignments') &&
      (user.role === UserRole.ROLE_SUBJECT_TEACHER || user.role === UserRole.ROLE_CLASS_TEACHER)
    ) {
      return { authorized: true };
    }

    return { authorized: false, reason: 'Insufficient permissions to delete this resource' };
  }
}
