import { prisma } from '../../utils/prisma';
import { CorrectionStatus, SubjectResultStatus, SubmissionStatus, UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../../types';
import { calculateGrade, DEFAULT_GRADE_BANDS } from '../exams/grading';

const SAFE_USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  username: true,
  role: true,
};

export class AssessmentService {
  /**
   * Returns subjects and sections assigned to the teacher (or all for Admin/Exam Controller)
   */
  static async getTeacherAssignments(institutionId: string, user: AuthenticatedUser) {
    const isTeacher = ([
      UserRole.ROLE_SUBJECT_TEACHER,
      UserRole.ROLE_CLASS_TEACHER,
      UserRole.ROLE_TEACHING_ASSISTANT,
    ] as string[]).includes(user.role);

    if (isTeacher) {
      const teacher = await prisma.teacherProfile.findFirst({
        where: { userId: user.id, institutionId },
      });
      if (!teacher) return [];

      const assignments = await prisma.teacherAssignment.findMany({
        where: { teacherId: teacher.id },
        include: {
          subject: true,
          section: { include: { classGrade: true } },
          academicTerm: { include: { academicYear: true } },
        },
      });

      // Deduplicate by sectionId + subjectId
      const seen = new Set<string>();
      return assignments.filter((a) => {
        const key = `${a.sectionId}:${a.subjectId}:${a.academicTermId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    // Admins / Exam Controllers: return all teacher assignments in the institution
    const allAssignments = await prisma.teacherAssignment.findMany({
      where: { subject: { institutionId } },
      include: {
        subject: true,
        section: { include: { classGrade: true } },
        academicTerm: { include: { academicYear: true } },
        teacher: { include: { user: { select: SAFE_USER_SELECT } } },
      },
    });

    const seen = new Set<string>();
    return allAssignments.filter((a) => {
      const key = `${a.sectionId}:${a.subjectId}:${a.academicTermId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Helper: verify teacher is authorized to manage the subject and section
   */
  private static async assertTeacherAuthorized(
    institutionId: string,
    user: AuthenticatedUser,
    subjectId: string,
    sectionId?: string | null
  ) {
    const isAdminOrController = ([
      UserRole.ROLE_SUPER_ADMIN,
      UserRole.ROLE_INSTITUTION_ADMIN,
      UserRole.ROLE_ACADEMIC_HEAD,
      UserRole.ROLE_EXAM_CONTROLLER,
    ] as string[]).includes(user.role);

    if (isAdminOrController) return;

    const teacher = await prisma.teacherProfile.findFirst({
      where: { userId: user.id, institutionId },
    });
    if (!teacher) {
      throw { status: 403, message: 'You are not an active teacher in this institution' };
    }

    const whereClause: any = {
      teacherId: teacher.id,
      subjectId,
    };
    if (sectionId) {
      whereClause.sectionId = sectionId;
    }

    const assignment = await prisma.teacherAssignment.findFirst({
      where: whereClause,
    });

    if (!assignment) {
      throw { status: 403, message: 'You are not assigned to teach this subject and section' };
    }
  }

  /**
   * Helper: verify assessment scheme is not locked for teacher edits
   */
  private static async assertSchemeNotLockedForTeacher(
    subjectId: string,
    academicTermId: string,
    sectionId?: string | null
  ) {
    const where: any = {
      subjectId,
      academicTermId,
      status: {
        in: [
          SubjectResultStatus.SUBMITTED_TO_EXAM_DEPARTMENT,
          SubjectResultStatus.UNDER_EXAM_REVIEW,
          SubjectResultStatus.APPROVED,
          SubjectResultStatus.OFFICIALLY_PUBLISHED,
        ],
      },
    };
    if (sectionId) where.sectionId = sectionId;

    const lockedResult = await prisma.subjectResult.findFirst({ where });
    if (lockedResult) {
      throw {
        status: 403,
        message: 'Teacher editing is locked. Results have been submitted to Exam Department.',
      };
    }
  }

  /**
   * Fetch assessment scheme for subject, term, and section
   */
  static async getAssessmentScheme(
    institutionId: string,
    user: AuthenticatedUser,
    subjectId: string,
    academicTermId: string,
    sectionId?: string
  ) {
    let scheme = await prisma.assessmentScheme.findFirst({
      where: {
        institutionId,
        subjectId,
        academicTermId,
        ...(sectionId ? { sectionId } : {}),
      },
      include: {
        categories: {
          orderBy: { displayOrder: 'asc' },
          include: {
            assessments: {
              orderBy: { createdAt: 'asc' },
              include: {
                _count: { select: { marks: true, submissions: true } },
                deadlineHistories: { orderBy: { createdAt: 'desc' } },
              },
            },
          },
        },
        subject: true,
        section: true,
        academicTerm: true,
      },
    });

    // If not found section-specifically, check shared scheme (sectionId is null)
    if (!scheme && sectionId) {
      scheme = await prisma.assessmentScheme.findFirst({
        where: {
          institutionId,
          subjectId,
          academicTermId,
          sectionId: null,
        },
        include: {
          categories: {
            orderBy: { displayOrder: 'asc' },
            include: {
              assessments: {
                orderBy: { createdAt: 'asc' },
                include: {
                  _count: { select: { marks: true, submissions: true } },
                  deadlineHistories: { orderBy: { createdAt: 'desc' } },
                },
              },
            },
          },
          subject: true,
          section: true,
          academicTerm: true,
        },
      });
    }

    return scheme;
  }

  /**
   * Create a new assessment scheme with categories (must total 100%)
   */
  static async createAssessmentScheme(
    institutionId: string,
    user: AuthenticatedUser,
    data: {
      academicTermId: string;
      subjectId: string;
      sectionId?: string;
      title: string;
      categories: Array<{
        name: string;
        weightagePercentage: number;
        description?: string;
        displayOrder?: number;
      }>;
    }
  ) {
    await this.assertTeacherAuthorized(institutionId, user, data.subjectId, data.sectionId);

    const totalWeight = data.categories.reduce((s, c) => s + c.weightagePercentage, 0);
    if (Math.abs(totalWeight - 100) > 0.001) {
      throw { status: 400, message: 'Total category weightage must equal exactly 100%' };
    }

    // Check if scheme already exists
    const existing = await prisma.assessmentScheme.findFirst({
      where: {
        subjectId: data.subjectId,
        academicTermId: data.academicTermId,
        sectionId: data.sectionId ?? null,
      },
    });
    if (existing) {
      throw {
        status: 409,
        message: 'An assessment scheme already exists for this subject, term, and section',
      };
    }

    return prisma.$transaction(async (tx) => {
      const scheme = await tx.assessmentScheme.create({
        data: {
          institutionId,
          academicTermId: data.academicTermId,
          subjectId: data.subjectId,
          sectionId: data.sectionId ?? null,
          title: data.title,
          createdById: user.id,
          status: 'DRAFT',
          categories: {
            create: data.categories.map((cat, idx) => ({
              name: cat.name,
              weightagePercentage: cat.weightagePercentage,
              description: cat.description,
              displayOrder: cat.displayOrder ?? idx,
            })),
          },
        },
        include: {
          categories: { include: { assessments: true } },
          subject: true,
          section: true,
        },
      });

      return scheme;
    });
  }

  /**
   * Update assessment scheme and categories (must total 100%)
   */
  static async updateAssessmentScheme(
    institutionId: string,
    user: AuthenticatedUser,
    schemeId: string,
    data: {
      title?: string;
      categories: Array<{
        id?: string;
        name: string;
        weightagePercentage: number;
        description?: string;
        displayOrder?: number;
      }>;
    }
  ) {
    const scheme = await prisma.assessmentScheme.findFirst({
      where: { id: schemeId, institutionId },
    });
    if (!scheme) throw { status: 404, message: 'Assessment scheme not found' };

    await this.assertTeacherAuthorized(institutionId, user, scheme.subjectId, scheme.sectionId);
    await this.assertSchemeNotLockedForTeacher(scheme.subjectId, scheme.academicTermId, scheme.sectionId);

    const totalWeight = data.categories.reduce((s, c) => s + c.weightagePercentage, 0);
    if (Math.abs(totalWeight - 100) > 0.001) {
      throw { status: 400, message: 'Total category weightage must equal exactly 100%' };
    }

    return prisma.$transaction(async (tx) => {
      // Delete removed categories
      const providedIds = data.categories.map((c) => c.id).filter(Boolean) as string[];
      await tx.assessmentCategory.deleteMany({
        where: { assessmentSchemeId: schemeId, id: { notIn: providedIds } },
      });

      // Update or create categories
      for (let idx = 0; idx < data.categories.length; idx++) {
        const cat = data.categories[idx];
        if (cat.id) {
          await tx.assessmentCategory.update({
            where: { id: cat.id },
            data: {
              name: cat.name,
              weightagePercentage: cat.weightagePercentage,
              description: cat.description,
              displayOrder: cat.displayOrder ?? idx,
            },
          });
        } else {
          await tx.assessmentCategory.create({
            data: {
              assessmentSchemeId: schemeId,
              name: cat.name,
              weightagePercentage: cat.weightagePercentage,
              description: cat.description,
              displayOrder: cat.displayOrder ?? idx,
            },
          });
        }
      }

      if (data.title) {
        await tx.assessmentScheme.update({
          where: { id: schemeId },
          data: { title: data.title },
        });
      }

      return tx.assessmentScheme.findUnique({
        where: { id: schemeId },
        include: {
          categories: {
            orderBy: { displayOrder: 'asc' },
            include: { assessments: true },
          },
          subject: true,
          section: true,
        },
      });
    });
  }

  /**
   * Create an individual assessment item within a category
   */
  static async createAssessmentItem(
    institutionId: string,
    user: AuthenticatedUser,
    data: {
      assessmentCategoryId: string;
      title: string;
      description?: string;
      instructions?: string;
      attachmentUrl?: string;
      maxMarks: number;
      weight?: number;
      assessmentDate?: string;
      dueDate?: string;
      isPublished?: boolean;
    }
  ) {
    const category = await prisma.assessmentCategory.findFirst({
      where: { id: data.assessmentCategoryId, assessmentScheme: { institutionId } },
      include: { assessmentScheme: true },
    });
    if (!category) throw { status: 404, message: 'Assessment category not found' };

    await this.assertTeacherAuthorized(
      institutionId,
      user,
      category.assessmentScheme.subjectId,
      category.assessmentScheme.sectionId
    );
    await this.assertSchemeNotLockedForTeacher(
      category.assessmentScheme.subjectId,
      category.assessmentScheme.academicTermId,
      category.assessmentScheme.sectionId
    );

    return prisma.assessmentItem.create({
      data: {
        assessmentCategoryId: data.assessmentCategoryId,
        title: data.title,
        description: data.description,
        instructions: data.instructions,
        attachmentUrl: data.attachmentUrl,
        maxMarks: data.maxMarks,
        weight: data.weight ?? 1,
        assessmentDate: data.assessmentDate ? new Date(data.assessmentDate) : null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        isPublished: data.isPublished ?? false,
      },
      include: { category: true },
    });
  }

  /**
   * Extend / Change assessment deadline (even after passing) with audit history
   */
  static async extendAssessmentDeadline(
    institutionId: string,
    user: AuthenticatedUser,
    assessmentItemId: string,
    data: { dueDate: string; reason: string }
  ) {
    const item = await prisma.assessmentItem.findFirst({
      where: { id: assessmentItemId, category: { assessmentScheme: { institutionId } } },
      include: { category: { include: { assessmentScheme: true } } },
    });
    if (!item) throw { status: 404, message: 'Assessment item not found' };

    await this.assertTeacherAuthorized(
      institutionId,
      user,
      item.category.assessmentScheme.subjectId,
      item.category.assessmentScheme.sectionId
    );
    await this.assertSchemeNotLockedForTeacher(
      item.category.assessmentScheme.subjectId,
      item.category.assessmentScheme.academicTermId,
      item.category.assessmentScheme.sectionId
    );

    const previousDueDate = item.dueDate;
    const newDueDate = new Date(data.dueDate);

    return prisma.$transaction(async (tx) => {
      await tx.assessmentDeadlineHistory.create({
        data: {
          assessmentItemId,
          previousDueDate,
          newDueDate,
          reason: data.reason,
          changedByUserId: user.id,
        },
      });

      const updated = await tx.assessmentItem.update({
        where: { id: assessmentItemId },
        data: { dueDate: newDueDate },
        include: {
          deadlineHistories: { orderBy: { createdAt: 'desc' } },
          category: true,
        },
      });

      return updated;
    });
  }

  /**
   * Get marks roster for an individual assessment item
   */
  static async getAssessmentMarksRoster(
    institutionId: string,
    user: AuthenticatedUser,
    assessmentItemId: string,
    sectionId: string
  ) {
    const item = await prisma.assessmentItem.findFirst({
      where: { id: assessmentItemId, category: { assessmentScheme: { institutionId } } },
      include: { category: { include: { assessmentScheme: true } } },
    });
    if (!item) throw { status: 404, message: 'Assessment item not found' };

    await this.assertTeacherAuthorized(
      institutionId,
      user,
      item.category.assessmentScheme.subjectId,
      sectionId
    );

    const students = await prisma.studentProfile.findMany({
      where: {
        sectionId,
        institutionId,
        status: 'ENROLLED',
        admissionNumber: { not: { startsWith: 'ADM-AUTO' } },
        user: { firstName: { not: { startsWith: 'Child' } } },
      },
      include: {
        user: { select: SAFE_USER_SELECT },
        assessmentMarks: { where: { assessmentItemId } },
        assessmentSubmissions: { where: { assessmentItemId } },
      },
      orderBy: [{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }],
    });

    return {
      assessment: item,
      students: students.map((s) => ({
        id: s.id,
        admissionNumber: s.admissionNumber,
        rollNumber: s.rollNumber,
        user: s.user,
        mark: s.assessmentMarks[0] || null,
        submission: s.assessmentSubmissions[0] || null,
      })),
    };
  }

  /**
   * Save student marks batch for an assessment item and trigger live result recalculation
   */
  static async saveMarksBatch(
    institutionId: string,
    user: AuthenticatedUser,
    data: {
      assessmentItemId: string;
      marks: Array<{
        studentId: string;
        marksObtained?: number | null;
        isAbsent?: boolean;
        isExcused?: boolean;
        remarks?: string | null;
      }>;
    }
  ) {
    const item = await prisma.assessmentItem.findFirst({
      where: { id: data.assessmentItemId, category: { assessmentScheme: { institutionId } } },
      include: {
        category: { include: { assessmentScheme: true } },
        assignment: true,
      },
    });
    if (!item) throw { status: 404, message: 'Assessment item not found' };

    const { subjectId, academicTermId, sectionId } = item.category.assessmentScheme;

    await this.assertTeacherAuthorized(institutionId, user, subjectId, sectionId);
    await this.assertSchemeNotLockedForTeacher(subjectId, academicTermId, sectionId);

    // Validate marks limits
    for (const m of data.marks) {
      if (m.marksObtained !== undefined && m.marksObtained !== null) {
        if (m.marksObtained < 0) {
          throw { status: 400, message: 'Marks obtained cannot be negative' };
        }
        if (m.marksObtained > item.maxMarks) {
          throw {
            status: 400,
            message: `Marks obtained (${m.marksObtained}) cannot exceed maximum marks (${item.maxMarks})`,
          };
        }
      }
    }

    const savedMarks = await prisma.$transaction(async (tx) => {
      const records = [];
      for (const m of data.marks) {
        const record = await tx.studentAssessmentMark.upsert({
          where: {
            assessmentItemId_studentId: {
              assessmentItemId: data.assessmentItemId,
              studentId: m.studentId,
            },
          },
          update: {
            marksObtained: m.marksObtained,
            isAbsent: m.isAbsent ?? false,
            isExcused: m.isExcused ?? false,
            remarks: m.remarks,
            enteredByUserId: user.id,
          },
          create: {
            assessmentItemId: data.assessmentItemId,
            studentId: m.studentId,
            marksObtained: m.marksObtained,
            isAbsent: m.isAbsent ?? false,
            isExcused: m.isExcused ?? false,
            remarks: m.remarks,
            enteredByUserId: user.id,
          },
        });
        records.push(record);

        // If this assessment item is linked to an LMS assignment, synchronize the gradebook entry!
        if (item.assignment && m.marksObtained !== null && m.marksObtained !== undefined) {
          await tx.assignmentSubmission.upsert({
            where: {
              assignmentId_studentId: {
                assignmentId: item.assignment.id,
                studentId: m.studentId,
              },
            },
            update: {
              grade: m.marksObtained,
              feedback: m.remarks,
              gradedByUserId: user.id,
              gradedAt: new Date(),
              status: 'GRADED',
            },
            create: {
              assignmentId: item.assignment.id,
              studentId: m.studentId,
              grade: m.marksObtained,
              feedback: m.remarks,
              gradedByUserId: user.id,
              gradedAt: new Date(),
              status: 'GRADED',
            },
          });

          await tx.assessmentSubmissionRecord.upsert({
            where: {
              assessmentItemId_studentId: {
                assessmentItemId: data.assessmentItemId,
                studentId: m.studentId,
              },
            },
            update: {
              grade: m.marksObtained,
              feedback: m.remarks,
              gradedByUserId: user.id,
              gradedAt: new Date(),
              status: SubmissionStatus.GRADED,
            },
            create: {
              assessmentItemId: data.assessmentItemId,
              studentId: m.studentId,
              grade: m.marksObtained,
              feedback: m.remarks,
              gradedByUserId: user.id,
              gradedAt: new Date(),
              status: SubmissionStatus.GRADED,
            },
          });
        }
      }
      return records;
    });

    // Automatically recalculate subject results for all affected students
    for (const m of data.marks) {
      const student = await prisma.studentProfile.findUnique({
        where: { id: m.studentId },
        select: { sectionId: true },
      });
      if (student) {
        await this.recalculateStudentSubjectResult(
          institutionId,
          m.studentId,
          subjectId,
          student.sectionId,
          academicTermId,
          item.category.assessmentSchemeId
        );
      }
    }

    return savedMarks;
  }

  /**
   * Student submits work for an assessment item
   */
  static async submitAssignmentWork(
    institutionId: string,
    user: AuthenticatedUser,
    assessmentItemId: string,
    data: { contentText?: string; attachmentUrl?: string }
  ) {
    const student = await prisma.studentProfile.findFirst({
      where: { userId: user.id, institutionId },
    });
    if (!student) {
      throw { status: 403, message: 'Only enrolled students can submit assignments' };
    }

    const item = await prisma.assessmentItem.findFirst({
      where: { id: assessmentItemId, category: { assessmentScheme: { institutionId } } },
    });
    if (!item) throw { status: 404, message: 'Assessment not found' };

    const isLate = Boolean(item.dueDate && new Date() > item.dueDate);

    return prisma.assessmentSubmissionRecord.upsert({
      where: {
        assessmentItemId_studentId: {
          assessmentItemId,
          studentId: student.id,
        },
      },
      update: {
        submittedAt: new Date(),
        contentText: data.contentText,
        attachmentUrl: data.attachmentUrl,
        status: isLate ? SubmissionStatus.LATE : SubmissionStatus.RESUBMITTED,
      },
      create: {
        assessmentItemId,
        studentId: student.id,
        submittedAt: new Date(),
        contentText: data.contentText,
        attachmentUrl: data.attachmentUrl,
        status: isLate ? SubmissionStatus.LATE : SubmissionStatus.SUBMITTED,
      },
    });
  }

  /**
   * Teacher grades a student's submission and automatically recalculates student's result
   */
  static async gradeAssignmentSubmission(
    institutionId: string,
    user: AuthenticatedUser,
    submissionId: string,
    data: { grade: number; feedback?: string }
  ) {
    const submission = await prisma.assessmentSubmissionRecord.findFirst({
      where: { id: submissionId, assessmentItem: { category: { assessmentScheme: { institutionId } } } },
      include: {
        assessmentItem: { include: { category: { include: { assessmentScheme: true } } } },
        student: true,
      },
    });
    if (!submission) throw { status: 404, message: 'Submission not found' };

    const { subjectId, academicTermId, sectionId } = submission.assessmentItem.category.assessmentScheme;

    await this.assertTeacherAuthorized(institutionId, user, subjectId, sectionId);
    await this.assertSchemeNotLockedForTeacher(subjectId, academicTermId, sectionId);

    if (data.grade < 0 || data.grade > submission.assessmentItem.maxMarks) {
      throw {
        status: 400,
        message: `Grade (${data.grade}) must be between 0 and maximum marks (${submission.assessmentItem.maxMarks})`,
      };
    }

    const updated = await prisma.$transaction(async (tx) => {
      const gradedSubmission = await tx.assessmentSubmissionRecord.update({
        where: { id: submissionId },
        data: {
          grade: data.grade,
          feedback: data.feedback,
          gradedByUserId: user.id,
          gradedAt: new Date(),
          status: SubmissionStatus.GRADED,
        },
      });

      // Synchronize to student assessment marks
      await tx.studentAssessmentMark.upsert({
        where: {
          assessmentItemId_studentId: {
            assessmentItemId: submission.assessmentItemId,
            studentId: submission.studentId,
          },
        },
        update: {
          marksObtained: data.grade,
          isAbsent: false,
          isExcused: false,
          remarks: data.feedback,
          enteredByUserId: user.id,
          status: 'PUBLISHED',
        },
        create: {
          assessmentItemId: submission.assessmentItemId,
          studentId: submission.studentId,
          marksObtained: data.grade,
          isAbsent: false,
          isExcused: false,
          remarks: data.feedback,
          enteredByUserId: user.id,
          status: 'PUBLISHED',
        },
      });

      return gradedSubmission;
    });

    // Automatically recalculate student's category average and subject result!
    await this.recalculateStudentSubjectResult(
      institutionId,
      submission.studentId,
      subjectId,
      submission.student.sectionId,
      academicTermId,
      submission.assessmentItem.category.assessmentSchemeId
    );

    return updated;
  }

  /**
   * Recalculates category breakdown, percentage, and letter grade for a single student
   */
  static async recalculateStudentSubjectResult(
    institutionId: string,
    studentId: string,
    subjectId: string,
    sectionId: string,
    academicTermId: string,
    schemeId: string
  ) {
    const scheme = await prisma.assessmentScheme.findUnique({
      where: { id: schemeId },
      include: {
        categories: {
          include: {
            assessments: {
              include: {
                marks: { where: { studentId } },
              },
            },
          },
        },
      },
    });
    if (!scheme) return null;

    const scale = await prisma.institutionGradeBand.findMany({
      where: { institutionId },
      orderBy: { minimumPercentage: 'desc' },
    });
    const bands = scale.length > 0 ? scale : DEFAULT_GRADE_BANDS;

    const categoryBreakdown: Array<{
      categoryId: string;
      categoryName: string;
      weightage: number;
      assessmentsCount: number;
      gradedCount: number;
      totalObtained: number;
      totalMax: number;
      averagePercentage: number;
      contribution: number;
    }> = [];

    let totalPercentage = 0;

    for (const cat of scheme.categories) {
      let catObtained = 0;
      let catMax = 0;
      const validAssessments = cat.assessments;

      // Filter graded items for this student
      const gradedItems = validAssessments.filter((item) => {
        const mark = item.marks[0];
        return mark && !mark.isExcused;
      });

      for (const item of gradedItems) {
        const mark = item.marks[0];
        const obtained = mark.isAbsent ? 0 : mark.marksObtained ?? 0;
        catObtained += obtained;
        catMax += item.maxMarks;
      }

      // Check for explicit internal allocation: items have internal weights summing to 100% of category
      const weights = gradedItems
        .map((i) => i.weightagePercentage)
        .filter((w): w is number => w !== null && w !== undefined);

      const hasExplicit100PercentWeights =
        weights.length === gradedItems.length &&
        weights.length > 0 &&
        Math.abs(weights.reduce((a, b) => a + b, 0) - 100) < 0.01;

      let categoryPercentage = 0;

      if (hasExplicit100PercentWeights) {
        // Explicit internal allocation: sum of (item % * internal allocation %)
        categoryPercentage = gradedItems.reduce((acc, item) => {
          const mark = item.marks[0];
          const obtained = mark.isAbsent ? 0 : mark.marksObtained ?? 0;
          const itemPct = item.maxMarks > 0 ? (obtained / item.maxMarks) * 100 : 0;
          const internalWeight = item.weightagePercentage! / 100;
          return acc + itemPct * internalWeight;
        }, 0);
      } else if (gradedItems.length > 0) {
        // Default: Equal weighting across all graded items in the category
        const sumItemPercentages = gradedItems.reduce((acc, item) => {
          const mark = item.marks[0];
          const obtained = mark.isAbsent ? 0 : mark.marksObtained ?? 0;
          const itemPct = item.maxMarks > 0 ? (obtained / item.maxMarks) * 100 : 0;
          return acc + itemPct;
        }, 0);
        categoryPercentage = sumItemPercentages / gradedItems.length;
      } else {
        categoryPercentage = 0;
      }

      // Category Contribution = (Category Percentage / 100) * Category Weightage %
      const contribution = (categoryPercentage / 100) * cat.weightagePercentage;
      totalPercentage += contribution;

      categoryBreakdown.push({
        categoryId: cat.id,
        categoryName: cat.name,
        weightage: cat.weightagePercentage,
        assessmentsCount: validAssessments.length,
        gradedCount: gradedItems.length,
        totalObtained: Number(catObtained.toFixed(2)),
        totalMax: Number(catMax.toFixed(2)),
        averagePercentage: Number(categoryPercentage.toFixed(4)),
        contribution: Number(contribution.toFixed(4)),
      });
    }

    totalPercentage = Number(totalPercentage.toFixed(4));
    const { gradeLetter, gpa } = calculateGrade(totalPercentage, bands);

    // Upsert SubjectResult
    const existingResult = await prisma.subjectResult.findUnique({
      where: {
        subjectId_sectionId_studentId_academicTermId: {
          subjectId,
          sectionId,
          studentId,
          academicTermId,
        },
      },
    });

    const status = existingResult ? existingResult.status : SubjectResultStatus.DRAFT;

    return prisma.subjectResult.upsert({
      where: {
        subjectId_sectionId_studentId_academicTermId: {
          subjectId,
          sectionId,
          studentId,
          academicTermId,
        },
      },
      update: {
        categoryBreakdown,
        totalPercentage: Number(totalPercentage.toFixed(2)),
        gradeLetter,
        gpa,
      },
      create: {
        institutionId,
        academicTermId,
        subjectId,
        sectionId,
        studentId,
        assessmentSchemeId: schemeId,
        categoryBreakdown,
        totalPercentage: Number(totalPercentage.toFixed(2)),
        gradeLetter,
        gpa,
        status,
      },
    });
  }

  /**
   * Recalculates all enrolled students for a subject, section, and term
   */
  static async recalculateAllSectionResults(
    institutionId: string,
    subjectId: string,
    sectionId: string,
    academicTermId: string
  ) {
    const scheme = await this.getAssessmentScheme(
      institutionId,
      { id: '', role: 'ROLE_INSTITUTION_ADMIN' } as any,
      subjectId,
      academicTermId,
      sectionId
    );
    if (!scheme) throw { status: 404, message: 'No assessment scheme configured for this subject' };

    const students = await prisma.studentProfile.findMany({
      where: { sectionId, institutionId, status: 'ENROLLED' },
      select: { id: true },
    });

    const results = [];
    for (const student of students) {
      const res = await this.recalculateStudentSubjectResult(
        institutionId,
        student.id,
        subjectId,
        sectionId,
        academicTermId,
        scheme.id
      );
      if (res) results.push(res);
    }
    return results;
  }

  /**
   * Get all student subject results for a section and term (used by teachers to review results)
   */
  static async getSectionSubjectResults(
    institutionId: string,
    user: AuthenticatedUser,
    subjectId: string,
    sectionId: string,
    academicTermId: string
  ) {
    await this.assertTeacherAuthorized(institutionId, user, subjectId, sectionId);

    const scheme = await this.getAssessmentScheme(
      institutionId,
      user,
      subjectId,
      academicTermId,
      sectionId
    );
    if (!scheme) return { scheme: null, results: [] };

    // Fetch existing results
    let results = await prisma.subjectResult.findMany({
      where: {
        institutionId,
        subjectId,
        sectionId,
        academicTermId,
      },
      include: {
        student: {
          include: {
            user: { select: SAFE_USER_SELECT },
          },
        },
      },
      orderBy: [
        { student: { user: { lastName: 'asc' } } },
        { student: { user: { firstName: 'asc' } } },
      ],
    });

    if (results.length === 0) {
      await this.recalculateAllSectionResults(institutionId, subjectId, sectionId, academicTermId);
      results = await prisma.subjectResult.findMany({
        where: {
          institutionId,
          subjectId,
          sectionId,
          academicTermId,
        },
        include: {
          student: {
            include: {
              user: { select: SAFE_USER_SELECT },
            },
          },
        },
        orderBy: [
          { student: { user: { lastName: 'asc' } } },
          { student: { user: { firstName: 'asc' } } },
        ],
      });
    }

    return { scheme, results };
  }

  /**
   * BUTTON A: Submit (Publish to Students)
   * Changes status to SUBMITTED_TO_STUDENTS.
   * Visible to students/parents. Teacher can still edit marks.
   */
  static async submitToStudents(
    institutionId: string,
    user: AuthenticatedUser,
    data: { subjectId: string; sectionId: string; academicTermId: string; remarks?: string }
  ) {
    await this.assertTeacherAuthorized(institutionId, user, data.subjectId, data.sectionId);
    await this.assertSchemeNotLockedForTeacher(data.subjectId, data.academicTermId, data.sectionId);

    // Recalculate all section results
    const results = await this.recalculateAllSectionResults(
      institutionId,
      data.subjectId,
      data.sectionId,
      data.academicTermId
    );

    // Update status to SUBMITTED_TO_STUDENTS
    await prisma.$transaction(async (tx) => {
      await tx.subjectResult.updateMany({
        where: {
          institutionId,
          subjectId: data.subjectId,
          sectionId: data.sectionId,
          academicTermId: data.academicTermId,
          status: { in: [SubjectResultStatus.DRAFT, SubjectResultStatus.RETURNED_FOR_CORRECTION] },
        },
        data: {
          status: SubjectResultStatus.SUBMITTED_TO_STUDENTS,
          submittedToStudentsAt: new Date(),
          teacherRemarks: data.remarks,
        },
      });

      await tx.subjectResultAudit.create({
        data: {
          actorId: user.id,
          action: 'SUBMITTED_TO_STUDENTS',
          reason: data.remarks ?? 'Teacher published provisional marks to students',
          newState: {
            subjectId: data.subjectId,
            sectionId: data.sectionId,
            studentsCount: results.length,
          },
        },
      });
    });

    return {
      message: 'Subject marks published to students successfully. Teacher may still make adjustments.',
      studentsCount: results.length,
    };
  }

  /**
   * BUTTON B: Submit to Exam Department
   * Changes status to SUBMITTED_TO_EXAM_DEPARTMENT.
   * Locks teacher editing. Students see GRADE IN PROGRESS. Not yet official transcript grade.
   */
  static async submitToExamDepartment(
    institutionId: string,
    user: AuthenticatedUser,
    data: { subjectId: string; sectionId: string; academicTermId: string; remarks?: string }
  ) {
    await this.assertTeacherAuthorized(institutionId, user, data.subjectId, data.sectionId);
    await this.assertSchemeNotLockedForTeacher(data.subjectId, data.academicTermId, data.sectionId);

    // Validate scheme exists and totals 100%
    const scheme = await this.getAssessmentScheme(
      institutionId,
      user,
      data.subjectId,
      data.academicTermId,
      data.sectionId
    );
    if (!scheme) throw { status: 400, message: 'Assessment scheme not configured' };
    const totalWeight = scheme.categories.reduce((s, c) => s + c.weightagePercentage, 0);
    if (Math.abs(totalWeight - 100) > 0.001) {
      throw { status: 400, message: 'Assessment scheme categories do not sum to 100%' };
    }

    // Recalculate full results snapshot
    const results = await this.recalculateAllSectionResults(
      institutionId,
      data.subjectId,
      data.sectionId,
      data.academicTermId
    );

    if (results.length === 0) {
      throw { status: 400, message: 'No student results found for this subject and section' };
    }

    // Atomic submission to exam department
    await prisma.$transaction(async (tx) => {
      await tx.subjectResult.updateMany({
        where: {
          institutionId,
          subjectId: data.subjectId,
          sectionId: data.sectionId,
          academicTermId: data.academicTermId,
        },
        data: {
          status: SubjectResultStatus.SUBMITTED_TO_EXAM_DEPARTMENT,
          submittedToExamDeptAt: new Date(),
          teacherRemarks: data.remarks,
        },
      });

      await tx.subjectResultAudit.create({
        data: {
          actorId: user.id,
          action: 'SUBMITTED_TO_EXAM_DEPARTMENT',
          reason: data.remarks ?? 'Forwarded subject results to Exam Department for official review',
          newState: {
            subjectId: data.subjectId,
            sectionId: data.sectionId,
            studentsCount: results.length,
          },
        },
      });
    });

    return {
      message: 'Subject results forwarded to Exam Department. Direct teacher editing is now locked.',
      studentsCount: results.length,
    };
  }

  /**
   * Request a result correction after submission to Exam Department
   */
  static async requestResultCorrection(
    institutionId: string,
    user: AuthenticatedUser,
    data: {
      subjectResultId: string;
      studentId: string;
      proposedMarks: number;
      reason: string;
      supportingEvidence?: string;
    }
  ) {
    const result = await prisma.subjectResult.findFirst({
      where: { id: data.subjectResultId, institutionId },
      include: { student: true, subject: true, section: true },
    });
    if (!result) throw { status: 404, message: 'Subject result not found' };

    await this.assertTeacherAuthorized(institutionId, user, result.subjectId, result.sectionId);

    const targetStudentId = data.studentId || result.studentId;

    // Existing pending check
    const pending = await prisma.subjectResultCorrectionRequest.findFirst({
      where: {
        subjectResultId: data.subjectResultId,
        studentId: targetStudentId,
        status: CorrectionStatus.PENDING,
      },
    });
    if (pending) {
      throw { status: 409, message: 'A correction request is already pending review for this student' };
    }

    return prisma.subjectResultCorrectionRequest.create({
      data: {
        subjectResultId: data.subjectResultId,
        studentId: targetStudentId,
        subjectId: result.subjectId,
        sectionId: result.sectionId,
        currentMarks: result.totalPercentage,
        proposedMarks: data.proposedMarks,
        reason: data.reason,
        supportingEvidence: data.supportingEvidence,
        requestedByUserId: user.id,
        previousSnapshot: (result.categoryBreakdown ?? undefined) as any,
      },
    });
  }

  /**
   * Exam Department reviews and takes action on a submitted section result
   * (APPROVED, OFFICIALLY_PUBLISHED, RETURNED_FOR_CORRECTION)
   */
  static async reviewSectionResultByExamDept(
    institutionId: string,
    user: AuthenticatedUser,
    data: {
      subjectId?: string;
      sectionId?: string;
      academicTermId?: string;
      status?: 'APPROVED' | 'OFFICIALLY_PUBLISHED' | 'RETURNED_FOR_CORRECTION';
      decision?: 'APPROVE' | 'OFFICIALLY_PUBLISH' | 'RETURN_FOR_CORRECTION' | 'REJECT';
      notes?: string;
      comments?: string;
    }
  ) {
    const canReview = ([
      UserRole.ROLE_SUPER_ADMIN,
      UserRole.ROLE_INSTITUTION_ADMIN,
      UserRole.ROLE_EXAM_CONTROLLER,
      UserRole.ROLE_ACADEMIC_HEAD,
    ] as string[]).includes(user.role);

    if (!canReview) {
      throw { status: 403, message: 'Access denied: Only Exam Department or Administrators can approve or publish results' };
    }

    const where: any = { institutionId };
    if (data.subjectId) where.subjectId = data.subjectId;
    if (data.sectionId) where.sectionId = data.sectionId;
    if (data.academicTermId) where.academicTermId = data.academicTermId;

    const results = await prisma.subjectResult.findMany({ where });
    if (results.length === 0) {
      throw { status: 404, message: 'No subject results found for this section' };
    }

    const resolvedStatus =
      data.status ||
      (data.decision === 'APPROVE'
        ? 'APPROVED'
        : data.decision === 'OFFICIALLY_PUBLISH'
        ? 'OFFICIALLY_PUBLISHED'
        : 'RETURNED_FOR_CORRECTION');

    const targetStatus =
      resolvedStatus === 'APPROVED'
        ? SubjectResultStatus.APPROVED
        : resolvedStatus === 'OFFICIALLY_PUBLISHED'
        ? SubjectResultStatus.OFFICIALLY_PUBLISHED
        : SubjectResultStatus.RETURNED_FOR_CORRECTION;

    const noteText = data.notes || data.comments || `Exam Department set status to ${targetStatus}`;

    return prisma.$transaction(async (tx) => {
      await tx.subjectResult.updateMany({
        where,
        data: {
          status: targetStatus,
          approvedByUserId: user.id,
          approvedAt: new Date(),
          ...(resolvedStatus === 'OFFICIALLY_PUBLISHED' ? { officiallyPublishedAt: new Date() } : {}),
        },
      });

      await tx.subjectResultAudit.create({
        data: {
          actorId: user.id,
          action: targetStatus,
          reason: noteText,
          newState: {
            subjectId: data.subjectId,
            sectionId: data.sectionId,
            status: targetStatus,
          },
        },
      });

      return {
        message: `Results ${resolvedStatus.toLowerCase()} successfully`,
        status: targetStatus,
        affectedCount: results.length,
      };
    });
  }

  /**
   * Officially publish section results to student transcripts
   */
  static async publishSectionResultByExamDept(
    institutionId: string,
    user: AuthenticatedUser,
    data: { subjectId: string; sectionId: string; academicTermId: string; notes?: string }
  ) {
    return this.reviewSectionResultByExamDept(institutionId, user, {
      ...data,
      status: 'OFFICIALLY_PUBLISHED',
    });
  }

  /**
   * Exam Department reviews an individual teacher correction request
   */
  static async reviewCorrectionRequest(
    institutionId: string,
    user: AuthenticatedUser,
    correctionId: string,
    data: { status: 'APPROVED' | 'REJECTED'; reviewNotes?: string }
  ) {
    const canReview = ([
      UserRole.ROLE_SUPER_ADMIN,
      UserRole.ROLE_INSTITUTION_ADMIN,
      UserRole.ROLE_EXAM_CONTROLLER,
      UserRole.ROLE_ACADEMIC_HEAD,
    ] as string[]).includes(user.role);

    if (!canReview) {
      throw { status: 403, message: 'Access denied: Only Exam Department or Administrators can review corrections' };
    }

    const req = await prisma.subjectResultCorrectionRequest.findFirst({
      where: { id: correctionId, subject: { institutionId } },
      include: { subjectResult: true },
    });
    if (!req) throw { status: 404, message: 'Correction request not found' };
    if (req.status !== CorrectionStatus.PENDING) {
      throw { status: 400, message: 'This correction request has already been reviewed' };
    }

    return prisma.$transaction(async (tx) => {
      const updatedReq = await tx.subjectResultCorrectionRequest.update({
        where: { id: correctionId },
        data: {
          status: data.status,
          reviewedByUserId: user.id,
          reviewedAt: new Date(),
          reviewNotes: data.reviewNotes,
        },
      });

      if (data.status === 'APPROVED') {
        const scale = await tx.institutionGradeBand.findMany({
          where: { institutionId },
          orderBy: { minimumPercentage: 'desc' },
        });
        const bands = scale.length > 0 ? scale : DEFAULT_GRADE_BANDS;
        const { gradeLetter, gpa } = calculateGrade(req.proposedMarks, bands);

        await tx.subjectResult.update({
          where: { id: req.subjectResultId },
          data: {
            totalPercentage: req.proposedMarks,
            gradeLetter,
            gpa,
          },
        });

        await tx.subjectResultAudit.create({
          data: {
            subjectResultId: req.subjectResultId,
            actorId: user.id,
            action: 'CORRECTION_APPROVED',
            reason: data.reviewNotes ?? req.reason,
            previousState: { percentage: req.currentMarks },
            newState: { percentage: req.proposedMarks, gradeLetter },
          },
        });
      }

      return updatedReq;
    });
  }

  /**
   * Exam Department Dashboard: List all submitted section results
   */
  static async getExamDepartmentDashboard(
    institutionId: string,
    user: AuthenticatedUser,
    academicTermId?: string
  ) {
    const canAccess = ([
      UserRole.ROLE_SUPER_ADMIN,
      UserRole.ROLE_INSTITUTION_ADMIN,
      UserRole.ROLE_EXAM_CONTROLLER,
      UserRole.ROLE_ACADEMIC_HEAD,
      UserRole.ROLE_AUDITOR,
    ] as string[]).includes(user.role);

    if (!canAccess) {
      throw { status: 403, message: 'Access denied to Exam Department Dashboard' };
    }

    const results = await prisma.subjectResult.findMany({
      where: {
        institutionId,
        ...(academicTermId ? { academicTermId } : {}),
      },
      include: {
        subject: true,
        section: { include: { classGrade: true } },
        academicTerm: { include: { academicYear: true } },
        student: { include: { user: { select: SAFE_USER_SELECT } } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Group by subjectId + sectionId + academicTermId
    const groups: Record<
      string,
      {
        subjectId: string;
        subjectName: string;
        subjectCode: string;
        sectionId: string;
        sectionName: string;
        className: string;
        academicTermId: string;
        termName: string;
        status: SubjectResultStatus;
        submittedToExamDeptAt: Date | null;
        officiallyPublishedAt: Date | null;
        studentsCount: number;
        results: any[];
      }
    > = {};

    for (const r of results) {
      const key = `${r.subjectId}:${r.sectionId}:${r.academicTermId}`;
      if (!groups[key]) {
        groups[key] = {
          subjectId: r.subjectId,
          subjectName: r.subject.name,
          subjectCode: r.subject.code,
          sectionId: r.sectionId,
          sectionName: r.section.name,
          className: r.section.classGrade.name,
          academicTermId: r.academicTermId,
          termName: r.academicTerm.name,
          status: r.status,
          submittedToExamDeptAt: r.submittedToExamDeptAt,
          officiallyPublishedAt: r.officiallyPublishedAt,
          studentsCount: 0,
          results: [],
        };
      }
      groups[key].studentsCount++;
      groups[key].results.push(r);
    }

    // Pending correction requests count
    const pendingCorrections = await prisma.subjectResultCorrectionRequest.findMany({
      where: { subject: { institutionId }, status: CorrectionStatus.PENDING },
      include: {
        student: { include: { user: { select: SAFE_USER_SELECT } } },
        subject: true,
        section: true,
        requestedByUser: { select: SAFE_USER_SELECT },
      },
    });

    return {
      submissions: Object.values(groups),
      pendingCorrections,
    };
  }

  /**
   * Student / Parent portal view of subject assessment and result
   */
  static async getStudentSubjectResult(
    institutionId: string,
    user: AuthenticatedUser,
    subjectId: string,
    academicTermId: string,
    targetStudentId?: string
  ) {
    let studentId = targetStudentId;

    if (user.role === UserRole.ROLE_STUDENT) {
      const profile = await prisma.studentProfile.findFirst({
        where: { userId: user.id, institutionId },
      });
      if (!profile) return null;
      studentId = profile.id;
    } else if (user.role === UserRole.ROLE_PARENT) {
      const parent = await prisma.parentProfile.findFirst({
        where: { userId: user.id },
      });
      if (!parent) return null;

      const relations = await prisma.studentParentRelation.findMany({
        where: { parentId: parent.id, student: { institutionId } },
      });
      const allowedStudentIds = relations.map((r) => r.studentId);
      if (!targetStudentId || !allowedStudentIds.includes(targetStudentId)) {
        throw { status: 403, message: 'You can only view results for your linked children' };
      }
      studentId = targetStudentId;
    }

    if (!studentId) return null;

    const result = await prisma.subjectResult.findFirst({
      where: {
        institutionId,
        subjectId,
        academicTermId,
        studentId,
      },
      include: {
        subject: true,
        academicTerm: { include: { academicYear: true } },
        assessmentScheme: {
          include: {
            categories: {
              include: {
                assessments: {
                  where: { isPublished: true },
                  include: {
                    marks: { where: { studentId } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!result) return null;

    // Visibility rules:
    // 1. DRAFT: Not visible to students/parents
    if (result.status === SubjectResultStatus.DRAFT) {
      return null;
    }

    // 2. SUBMITTED_TO_EXAM_DEPARTMENT / UNDER_EXAM_REVIEW / APPROVED:
    // Visible as "GRADE IN PROGRESS", provisional marks shown but not official final
    if (
      ([
        SubjectResultStatus.SUBMITTED_TO_EXAM_DEPARTMENT,
        SubjectResultStatus.UNDER_EXAM_REVIEW,
        SubjectResultStatus.APPROVED,
      ] as string[]).includes(result.status)
    ) {
      return {
        ...result,
        gradeInProgress: true,
        gradeStatusLabel: 'Grade in Progress',
        displayGrade: 'GRADE IN PROGRESS',
        isOfficiallyPublished: false,
        notice: 'Subject result is under examination processing and moderation. Not yet finalized.',
      };
    }

    // 3. OFFICIALLY_PUBLISHED: Official finalized grade for transcript
    if (result.status === SubjectResultStatus.OFFICIALLY_PUBLISHED) {
      return {
        ...result,
        gradeInProgress: false,
        displayGrade: result.gradeLetter,
        isOfficiallyPublished: true,
      };
    }

    // 4. SUBMITTED_TO_STUDENTS: Teacher published provisional
    return {
      ...result,
      gradeInProgress: false,
      displayGrade: result.gradeLetter,
      isOfficiallyPublished: false,
      notice: 'Provisional marks published by subject teacher. Awaiting exam department submission.',
    };
  }

  /**
   * Get Unified Gradebook for a subject, section, and term
   */
  static async getGradebook(
    institutionId: string,
    user: AuthenticatedUser,
    subjectId: string,
    sectionId: string,
    academicTermId: string
  ) {
    await this.assertTeacherAuthorized(institutionId, user, subjectId, sectionId);

    const scheme = await this.getAssessmentScheme(
      institutionId,
      user,
      subjectId,
      academicTermId,
      sectionId
    );
    if (!scheme) return { scheme: null, columns: [], rows: [], summary: null };

    // Collect all assessment columns across all categories
    const columns: Array<{
      id: string;
      categoryId: string;
      categoryName: string;
      title: string;
      maxMarks: number;
      weightage: number;
      dueDate: Date | null;
      isPublished: boolean;
      assignmentId: string | null;
    }> = [];

    for (const cat of scheme.categories) {
      for (const item of cat.assessments) {
        columns.push({
          id: item.id,
          categoryId: cat.id,
          categoryName: cat.name,
          title: item.title,
          maxMarks: item.maxMarks,
          weightage:
            item.weightagePercentage ??
            (cat.assessments.length > 0 ? cat.weightagePercentage / cat.assessments.length : cat.weightagePercentage),
          dueDate: item.dueDate,
          isPublished: item.isPublished,
          assignmentId: (item as any).assignment?.id ?? null,
        });
      }
    }

    // Fetch enrolled students
    const students = await prisma.studentProfile.findMany({
      where: { sectionId, institutionId, status: 'ENROLLED' },
      include: {
        user: { select: SAFE_USER_SELECT },
        assessmentMarks: {
          where: { assessmentItem: { category: { assessmentSchemeId: scheme.id } } },
        },
        assessmentSubmissions: {
          where: { assessmentItem: { category: { assessmentSchemeId: scheme.id } } },
        },
      },
      orderBy: [{ rollNumber: 'asc' }, { admissionNumber: 'asc' }],
    });

    // Fetch subject results
    const subjectResults = await prisma.subjectResult.findMany({
      where: {
        institutionId,
        subjectId,
        sectionId,
        academicTermId,
      },
    });
    const resultMap = new Map(subjectResults.map((r) => [r.studentId, r]));

    const rows = students.map((s) => {
      const marksMap: Record<
        string,
        {
          marksObtained: number | null;
          isAbsent: boolean;
          isExcused: boolean;
          remarks?: string | null;
          submissionStatus?: string | null;
          submittedAt?: Date | null;
          contribution?: number | null;
        }
      > = {};

      for (const col of columns) {
        const mark = s.assessmentMarks.find((m) => m.assessmentItemId === col.id);
        const sub = s.assessmentSubmissions.find((sb) => sb.assessmentItemId === col.id);

        let contribution: number | null = null;
        if (
          mark &&
          mark.marksObtained !== null &&
          mark.marksObtained !== undefined &&
          !mark.isAbsent &&
          !mark.isExcused
        ) {
          contribution = Number(((mark.marksObtained / col.maxMarks) * col.weightage).toFixed(2));
        }

        marksMap[col.id] = {
          marksObtained: mark ? mark.marksObtained : null,
          isAbsent: mark ? mark.isAbsent : false,
          isExcused: mark ? mark.isExcused : false,
          remarks: mark?.remarks,
          submissionStatus: sub?.status ?? null,
          submittedAt: sub?.submittedAt ?? null,
          contribution,
        };
      }

      const res = resultMap.get(s.id);

      return {
        studentId: s.id,
        rollNumber: s.rollNumber,
        admissionNumber: s.admissionNumber,
        firstName: s.user.firstName,
        lastName: s.user.lastName,
        email: s.user.email,
        marks: marksMap,
        result: res
          ? {
              totalPercentage: res.totalPercentage,
              gradeLetter: res.gradeLetter,
              gpa: res.gpa,
              status: res.status,
              categoryBreakdown: res.categoryBreakdown,
            }
          : null,
      };
    });

    const percentages = rows
      .map((r) => r.result?.totalPercentage)
      .filter((p): p is number => p !== undefined && p !== null);
    const summary = {
      totalStudents: students.length,
      gradedCount: percentages.length,
      averagePercentage:
        percentages.length > 0
          ? Number((percentages.reduce((a, b) => a + b, 0) / percentages.length).toFixed(2))
          : 0,
      highestPercentage: percentages.length > 0 ? Math.max(...percentages) : 0,
      lowestPercentage: percentages.length > 0 ? Math.min(...percentages) : 0,
    };

    return {
      scheme: {
        id: scheme.id,
        title: scheme.title,
        status: scheme.status,
        isLocked: [
          SubjectResultStatus.SUBMITTED_TO_EXAM_DEPARTMENT,
          SubjectResultStatus.UNDER_EXAM_REVIEW,
          SubjectResultStatus.APPROVED,
          SubjectResultStatus.OFFICIALLY_PUBLISHED,
        ].includes(subjectResults[0]?.status as any),
        subjectResultStatus: subjectResults[0]?.status ?? 'DRAFT',
      },
      columns,
      rows,
      summary,
    };
  }

  /**
   * Save marks from unified gradebook (with automatic sync to LMS Assignment and recalculation)
   */
  static async saveGradebookMarks(
    institutionId: string,
    user: AuthenticatedUser,
    data: {
      subjectId: string;
      sectionId: string;
      academicTermId: string;
      updates: Array<{
        assessmentItemId: string;
        studentId: string;
        marksObtained?: number | null;
        isAbsent?: boolean;
        isExcused?: boolean;
        remarks?: string;
      }>;
    }
  ) {
    await this.assertTeacherAuthorized(institutionId, user, data.subjectId, data.sectionId);
    await this.assertSchemeNotLockedForTeacher(data.subjectId, data.academicTermId, data.sectionId);

    const scheme = await prisma.assessmentScheme.findFirst({
      where: {
        institutionId,
        subjectId: data.subjectId,
        sectionId: data.sectionId,
        academicTermId: data.academicTermId,
      },
      include: {
        categories: {
          include: {
            assessments: {
              include: { assignment: true },
            },
          },
        },
      },
    });
    if (!scheme) throw { status: 404, message: 'Assessment scheme not found' };

    const itemsMap = new Map();
    for (const cat of scheme.categories) {
      for (const item of cat.assessments) {
        itemsMap.set(item.id, item);
      }
    }

    // Validate marks
    for (const u of data.updates) {
      const item = itemsMap.get(u.assessmentItemId);
      if (!item) throw { status: 404, message: `Assessment item ${u.assessmentItemId} not found in scheme` };
      if (u.marksObtained !== null && u.marksObtained !== undefined) {
        if (u.marksObtained < 0) throw { status: 400, message: 'Marks obtained cannot be negative' };
        if (u.marksObtained > item.maxMarks) {
          throw {
            status: 400,
            message: `Marks obtained (${u.marksObtained}) cannot exceed maximum marks (${item.maxMarks}) for ${item.title}`,
          };
        }
      }
    }

    // Transactionally update marks and sync with LMS assignments
    await prisma.$transaction(async (tx) => {
      for (const u of data.updates) {
        const item = itemsMap.get(u.assessmentItemId);

        await tx.studentAssessmentMark.upsert({
          where: {
            assessmentItemId_studentId: {
              assessmentItemId: u.assessmentItemId,
              studentId: u.studentId,
            },
          },
          update: {
            marksObtained: u.marksObtained,
            isAbsent: u.isAbsent ?? false,
            isExcused: u.isExcused ?? false,
            remarks: u.remarks,
            enteredByUserId: user.id,
          },
          create: {
            assessmentItemId: u.assessmentItemId,
            studentId: u.studentId,
            marksObtained: u.marksObtained,
            isAbsent: u.isAbsent ?? false,
            isExcused: u.isExcused ?? false,
            remarks: u.remarks,
            enteredByUserId: user.id,
          },
        });

        if (item.assignment && u.marksObtained !== null && u.marksObtained !== undefined) {
          await tx.assignmentSubmission.upsert({
            where: {
              assignmentId_studentId: {
                assignmentId: item.assignment.id,
                studentId: u.studentId,
              },
            },
            update: {
              grade: u.marksObtained,
              feedback: u.remarks,
              gradedByUserId: user.id,
              gradedAt: new Date(),
              status: 'GRADED',
            },
            create: {
              assignmentId: item.assignment.id,
              studentId: u.studentId,
              grade: u.marksObtained,
              feedback: u.remarks,
              gradedByUserId: user.id,
              gradedAt: new Date(),
              status: 'GRADED',
            },
          });

          await tx.assessmentSubmissionRecord.upsert({
            where: {
              assessmentItemId_studentId: {
                assessmentItemId: u.assessmentItemId,
                studentId: u.studentId,
              },
            },
            update: {
              grade: u.marksObtained,
              feedback: u.remarks,
              gradedByUserId: user.id,
              gradedAt: new Date(),
              status: SubmissionStatus.GRADED,
            },
            create: {
              assessmentItemId: u.assessmentItemId,
              studentId: u.studentId,
              grade: u.marksObtained,
              feedback: u.remarks,
              gradedByUserId: user.id,
              gradedAt: new Date(),
              status: SubmissionStatus.GRADED,
            },
          });
        }
      }
    });

    // Recalculate distinct affected students
    const affectedStudentIds = [...new Set(data.updates.map((u) => u.studentId))];
    for (const sid of affectedStudentIds) {
      await this.recalculateStudentSubjectResult(
        institutionId,
        sid,
        data.subjectId,
        data.sectionId,
        data.academicTermId,
        scheme.id
      );
    }

    return this.getGradebook(institutionId, user, data.subjectId, data.sectionId, data.academicTermId);
  }
}

