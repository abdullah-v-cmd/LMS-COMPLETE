import { z } from 'zod';

export const createAssessmentSchemeSchema = z.object({
  academicTermId: z.string().uuid(),
  subjectId: z.string().uuid(),
  sectionId: z.string().uuid().optional(),
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(150),
  categories: z.array(
    z.object({
      name: z.string().trim().min(1, 'Category name is required').max(100),
      weightagePercentage: z.number().min(0, 'Weightage cannot be negative').max(100, 'Weightage cannot exceed 100%'),
      description: z.string().trim().max(500).optional(),
      displayOrder: z.number().int().min(0).optional(),
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
  title: z.string().trim().min(3).max(150).optional(),
  categories: z.array(
    z.object({
      id: z.string().uuid().optional(),
      name: z.string().trim().min(1).max(100),
      weightagePercentage: z.number().min(0).max(100),
      description: z.string().trim().max(500).optional(),
      displayOrder: z.number().int().min(0).optional(),
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
  description: z.string().trim().max(1000).optional(),
  instructions: z.string().trim().max(5000).optional(),
  attachmentUrl: z.string().trim().url().optional().or(z.literal('')),
  maxMarks: z.number().positive('Maximum marks must be greater than 0').max(1000),
  weight: z.number().positive().default(1),
  assessmentDate: z.string().optional(),
  dueDate: z.string().optional(),
  isPublished: z.boolean().default(false),
});

export const updateAssessmentItemSchema = z.object({
  title: z.string().trim().min(1).max(150).optional(),
  description: z.string().trim().max(1000).optional(),
  instructions: z.string().trim().max(5000).optional(),
  attachmentUrl: z.string().trim().optional(),
  maxMarks: z.number().positive().max(1000).optional(),
  weight: z.number().positive().optional(),
  assessmentDate: z.string().optional(),
  dueDate: z.string().optional(),
  isPublished: z.boolean().optional(),
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

export const saveGradebookMarksSchema = z.object({
  subjectId: z.string().uuid(),
  sectionId: z.string().uuid(),
  academicTermId: z.string().uuid(),
  updates: z.array(
    z.object({
      assessmentItemId: z.string().uuid(),
      studentId: z.string().uuid(),
      marksObtained: z.number().min(0, 'Marks cannot be negative').optional().nullable(),
      isAbsent: z.boolean().optional(),
      isExcused: z.boolean().optional(),
      remarks: z.string().trim().max(500).optional().nullable(),
    })
  ).min(1, 'At least one mark update is required'),
});

