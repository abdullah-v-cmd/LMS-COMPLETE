import { z } from 'zod';

export const createAssessmentSchemeSchema = z.object({
  academicTermId: z.string().uuid(),
  subjectId: z.string().uuid(),
  sectionId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(150),
  categories: z.array(
    z.object({
      name: z.string().trim().min(1, 'Category name is required').max(100),
      weightagePercentage: z.number().min(0, 'Weightage cannot be negative').max(100, 'Weightage cannot exceed 100%'),
      description: z.string().trim().max(500).optional().nullable(),
      displayOrder: z.number().int().min(0).optional().nullable(),
    })
  ).min(1, 'At least one category is required'),
}).refine(
  (data) => {
    const total = data.categories.reduce((sum, cat) => sum + cat.weightagePercentage, 0);
    return Math.abs(total - 100) < 0.001;
  },
  {
    path: ['categories'],
    message: 'Total category weightage must equal exactly 100%',
  }
);

export const updateAssessmentSchemeSchema = z.object({
  title: z.string().trim().min(1).max(150).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  categories: z.array(
    z.object({
      id: z.preprocess((val) => {
        if (typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)) {
          return val;
        }
        return undefined;
      }, z.string().uuid().optional().nullable()),
      name: z.string().trim().min(1).max(100),
      weightagePercentage: z.coerce.number().min(0).max(100),
      description: z.string().trim().max(500).optional().nullable(),
      displayOrder: z.coerce.number().int().min(0).optional().nullable(),
    })
  ).min(1, 'At least one category is required'),
}).refine(
  (data) => {
    const total = data.categories.reduce((sum, cat) => sum + cat.weightagePercentage, 0);
    return Math.abs(total - 100) < 0.001;
  },
  {
    path: ['categories'],
    message: 'Total category weightage must equal exactly 100%',
  }
);

export const createAssessmentItemSchema = z.object({
  assessmentCategoryId: z.string().uuid(),
  title: z.string().trim().min(1, 'Title is required').max(150),
  description: z.string().trim().max(1000).optional().nullable(),
  instructions: z.string().trim().max(5000).optional().nullable(),
  attachmentUrl: z.string().trim().max(1000).optional().nullable(),
  maxMarks: z.coerce.number().positive('Maximum marks must be greater than 0').max(1000),
  weight: z.coerce.number().positive().default(1),
  assessmentDate: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  isPublished: z.boolean().default(false),
  examScheduleId: z.preprocess((val) => {
    if (typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)) {
      return val;
    }
    return null;
  }, z.string().uuid().nullable().optional()),
  displayOrder: z.coerce.number().int().min(0).optional(),
});

export const updateAssessmentItemSchema = z.object({
  assessmentCategoryId: z.string().min(1).optional(),
  title: z.string().trim().min(1, 'Title is required').max(150).optional(),
  description: z.string().trim().max(1000).optional().nullable(),
  instructions: z.string().trim().max(5000).optional().nullable(),
  attachmentUrl: z.string().trim().max(1000).optional().nullable(),
  maxMarks: z.coerce.number().positive('Maximum marks must be greater than 0').max(1000).optional(),
  weight: z.coerce.number().positive().optional(),
  assessmentDate: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  isPublished: z.boolean().optional(),
  examScheduleId: z.preprocess((val) => {
    if (typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)) {
      return val;
    }
    return null;
  }, z.string().uuid().nullable().optional()),
  displayOrder: z.coerce.number().int().min(0).optional(),
});

export const extendAssessmentDeadlineSchema = z.object({
  dueDate: z.string().min(1, 'New due date is required'),
  reason: z.string().trim().min(5, 'Reason must be at least 5 characters').max(1000),
});

export const saveMarksBatchSchema = z.object({
  assessmentItemId: z.string().uuid(),
  marks: z.array(
    z.object({
      studentId: z.string().uuid(),
      marksObtained: z.number().min(0, 'Marks cannot be negative').optional().nullable(),
      isAbsent: z.boolean().default(false),
      isExcused: z.boolean().default(false),
      remarks: z.string().trim().max(500).optional().nullable(),
    })
  ).min(1, 'At least one student mark must be provided'),
}).refine(
  (data) => new Set(data.marks.map((m) => m.studentId)).size === data.marks.length,
  {
    path: ['marks'],
    message: 'A student may appear only once in marks batch',
  }
);

export const submitAssignmentWorkSchema = z.object({
  contentText: z.string().trim().max(20000).optional(),
  attachmentUrl: z.string().trim().optional(),
}).refine((data) => Boolean(data.contentText?.trim()) || Boolean(data.attachmentUrl?.trim()), {
  message: 'Must provide either content text or attachment URL',
});

export const gradeAssignmentSubmissionSchema = z.object({
  grade: z.number().min(0, 'Grade cannot be negative'),
  feedback: z.string().trim().max(2000).optional(),
});

export const submitSubjectResultSchema = z.object({
  subjectId: z.string().uuid(),
  sectionId: z.string().uuid(),
  academicTermId: z.string().uuid(),
  remarks: z.string().trim().max(1000).optional(),
});

export const requestResultCorrectionSchema = z.object({
  subjectResultId: z.string().uuid(),
  studentId: z.string().uuid().optional(),
  proposedMarks: z.number().min(0).max(100),
  reason: z.string().trim().min(5, 'Reason must be at least 5 characters').max(1000),
  supportingEvidence: z.string().trim().max(2000).optional(),
});

export const reviewResultCorrectionSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  reviewNotes: z.string().trim().max(1000).optional(),
});

export const examDepartmentReviewSchema = z.object({
  subjectId: z.string().uuid().optional(),
  sectionId: z.string().uuid().optional(),
  academicTermId: z.string().uuid().optional(),
  status: z.enum(['APPROVED', 'OFFICIALLY_PUBLISHED', 'RETURNED_FOR_CORRECTION']).optional(),
  decision: z.enum(['APPROVE', 'OFFICIALLY_PUBLISH', 'RETURN_FOR_CORRECTION', 'REJECT']).optional(),
  notes: z.string().trim().max(1000).optional(),
  comments: z.string().trim().max(1000).optional(),
});

const gradebookItemUpdateSchema = z.object({
  assessmentItemId: z.string().min(1, 'Assessment Item ID is required'),
  studentId: z.string().min(1, 'Student ID is required'),
  marksObtained: z.preprocess((val) => {
    if (val === '' || val === null || val === undefined) return null;
    const num = Number(val);
    return isNaN(num) ? null : num;
  }, z.number().min(0, 'Marks cannot be negative').nullable().optional()),
  isAbsent: z.boolean().optional().default(false),
  isExcused: z.boolean().optional().default(false),
  remarks: z.preprocess((val) => {
    if (val === null || val === undefined) return null;
    return String(val).trim();
  }, z.string().max(500).optional().nullable()),
});

export const saveGradebookMarksSchema = z
  .object({
    subjectId: z.string().min(1, 'Subject ID is required'),
    sectionId: z.string().optional().nullable(),
    academicTermId: z.string().min(1, 'Academic Term ID is required'),
    updates: z.array(gradebookItemUpdateSchema).optional(),
    marks: z.array(gradebookItemUpdateSchema).optional(),
  })
  .transform((data) => {
    const list = data.updates || data.marks || [];
    return {
      ...data,
      updates: list,
      marks: list,
    };
  })
  .refine((data) => data.updates.length > 0, {
    message: 'At least one mark update is required',
    path: ['updates'],
  });

export const connectExamScheduleSchema = z.object({
  examScheduleId: z.string().uuid().nullable().optional(),
  syncNow: z.boolean().optional().default(true),
});

export const uploadManualMarksCsvSchema = z.object({
  rows: z.array(
    z.object({
      identifier: z.string().trim().min(1, 'Student identifier is required'),
      marksObtained: z.number().min(0, 'Marks cannot be negative').nullable().optional(),
      isAbsent: z.boolean().optional().default(false),
      isExcused: z.boolean().optional().default(false),
      remarks: z.string().trim().max(500).optional().nullable(),
    })
  ).min(1, 'At least one student row is required'),
});


