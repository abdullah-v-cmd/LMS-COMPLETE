import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Layers,
  Award,
  CheckCircle2,
  AlertCircle,
  Clock,
  Send,
  FileCheck,
  RotateCcw,
  Plus,
  Trash2,
  Edit,
  Save,
  HelpCircle,
  Calendar,
  Lock,
  Unlock,
  Eye,
  FileText,
  Upload,
  ArrowRight,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Table,
  Calculator,
  TrendingUp,
  BarChart2,
  Link2,
  Unlink,
  RefreshCw,
  Download,
  Pencil,
  ShieldAlert,
  Info,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';

type TeacherAssignment = {
  sectionId: string;
  subjectId: string;
  academicTermId: string;
  subject: { id: string; name: string; code: string };
  section: { id: string; name: string; classGrade: { name: string } };
  academicTerm: { id: string; name: string; academicYear: { name: string } };
};

type AssessmentCategory = {
  id?: string;
  name: string;
  weightagePercentage: number;
  description?: string;
  displayOrder?: number;
  assessments?: AssessmentItem[];
};

type AssessmentItem = {
  id: string;
  assessmentCategoryId: string;
  title: string;
  description?: string;
  instructions?: string;
  attachmentUrl?: string;
  maxMarks: number;
  weight: number;
  assessmentDate?: string;
  dueDate?: string;
  isPublished: boolean;
  isLocked: boolean;
  examScheduleId?: string | null;
  examSchedule?: {
    id: string;
    examSessionId: string;
    subjectId: string;
    maxMarks: number;
    passingMarks: number;
    examDate: string;
    examSession: {
      id: string;
      name: string;
      startDate: string;
      endDate: string;
      status: string;
    };
  } | null;
  category?: AssessmentCategory;
  _count?: { marks: number; submissions: number };
  deadlineHistories?: Array<{
    id: string;
    previousDueDate?: string;
    newDueDate: string;
    reason: string;
    createdAt: string;
  }>;
};

type ExamScheduleOption = {
  id: string;
  examSessionId: string;
  sessionName: string;
  examDate: string;
  startTime?: string | null;
  endTime?: string | null;
  maxMarks: number;
  passMarks: number;
  passingMarks?: number;
  roomNumber?: string | null;
  sessionStatus: string;
  marksCount: number;
  examSession?: {
    id: string;
    name: string;
    startDate?: string;
    endDate?: string;
    status: string;
  };
};

type AssessmentScheme = {
  id: string;
  title: string;
  subjectId: string;
  sectionId?: string;
  academicTermId: string;
  status: string;
  categories: AssessmentCategory[];
  subject: { name: string; code: string };
  section?: { name: string };
  academicTerm: { name: string };
};

type SectionSubjectResult = {
  id: string;
  studentId: string;
  subjectId: string;
  sectionId: string;
  academicTermId: string;
  totalPercentage: number;
  gradeLetter: string;
  gpa: number | null;
  status: string;
  categoryBreakdown: Array<{
    categoryId: string;
    categoryName: string;
    weightage: number;
    assessmentsCount: number;
    gradedCount: number;
    totalObtained: number;
    totalMax: number;
    averagePercentage: number;
    contribution: number;
  }>;
  student: {
    id: string;
    admissionNumber: string;
    rollNumber: string | null;
    user: { firstName: string; lastName: string; email: string };
  };
};

type GradebookColumn = {
  id: string;
  title: string;
  categoryId?: string;
  categoryName: string;
  maxMarks: number;
  weightage?: number;
  weightagePercentage?: number;
  categoryWeightage?: number;
  isPublished?: boolean;
  isLmsAssignment?: boolean;
  assignmentId?: string | null;
  examScheduleId?: string | null;
  examSessionName?: string | null;
};

type GradebookStudent = {
  studentId: string;
  admissionNumber: string;
  rollNumber: string | null;
  firstName?: string;
  lastName?: string;
  studentName?: string;
  email?: string;
  marks: Record<
    string,
    {
      marksObtained: number | null;
      isAbsent: boolean;
      isExcused: boolean;
      weightedContribution?: number;
      contribution?: number;
      remarks?: string | null;
      submissionStatus?: string | null;
      submittedAt?: string | null;
    }
  >;
  totalObtainedWeighted?: number;
  gradeLetter?: string;
  gpa?: number | null;
  status?: string;
  result?: {
    totalPercentage: number;
    gradeLetter: string;
    gpa: number | null;
    status: string;
  };
};

type GradebookData = {
  scheme: any;
  columns: GradebookColumn[];
  rows?: GradebookStudent[];
  students?: GradebookStudent[];
  summary?: {
    totalStudents: number;
    gradedCount?: number;
    averagePercentage?: number;
    highestPercentage?: number;
    lowestPercentage?: number;
  };
  summaryStatistics?: {
    totalStudents: number;
    classAverageTotal: number;
    highestTotal: number;
    lowestTotal: number;
    passCount?: number;
    failCount?: number;
    passRatePercent?: number;
    columnAverages?: Record<string, number>;
  };
  isLocked?: boolean;
};

export const AssessmentsPage: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');

  const roleUpper = String(user?.role || '').toUpperCase();
  const isTeacher =
    roleUpper.includes('TEACHER') || roleUpper.includes('ASSISTANT');
  const isStudent = roleUpper.includes('STUDENT');
  const isParent = roleUpper.includes('PARENT');
  const isExamDept =
    roleUpper.includes('EXAM') ||
    roleUpper.includes('ADMIN') ||
    roleUpper.includes('HEAD') ||
    roleUpper.includes('AUDITOR');
  const isStaff = isTeacher || isExamDept;

  // Navigation tabs
  const [activeTab, setActiveTab] = useState<
    'scheme' | 'items' | 'marks' | 'gradebook' | 'results' | 'student_view'
  >(() => {
    if (isStudent || isParent) return 'student_view';
    if (tabParam === 'gradebook') return 'gradebook';
    return 'gradebook';
  });

  // Notifications
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  // Selected assignment context for teacher / exam dept / admin
  const [selectedAssignmentIndex, setSelectedAssignmentIndex] = useState(0);

  // Selected enrolled subject for student / parent
  const [selectedStudentSubjectIndex, setSelectedStudentSubjectIndex] = useState(0);

  // Queries
  const assignmentsQuery = useQuery({
    queryKey: ['teacher-assignments'],
    queryFn: async () => {
      const res = await apiClient.get('/assessments/teacher/assignments');
      return (res.data.data as TeacherAssignment[]) || [];
    },
    enabled: isStaff,
  });

  const currentAssignment = assignmentsQuery.data?.[selectedAssignmentIndex] || null;

  // Student Enrolled Subjects Query
  const studentSubjectsQuery = useQuery({
    queryKey: ['student-enrolled-subjects'],
    queryFn: async () => {
      const res = await apiClient.get('/assessments/student/subjects');
      return (
        (res.data.data as Array<{
          subjectId: string;
          subjectName: string;
          subjectCode: string;
          sectionId: string;
          sectionName: string;
          className: string;
          academicTermId: string;
          termName: string;
          status: string;
          isPublished: boolean;
        }>) || []
      );
    },
    enabled: isStudent || isParent,
  });

  const currentStudentSubject = studentSubjectsQuery.data?.[selectedStudentSubjectIndex] || null;

  // Scheme Query
  const schemeQuery = useQuery({
    queryKey: [
      'assessment-scheme',
      currentAssignment?.subjectId,
      currentAssignment?.academicTermId,
      currentAssignment?.sectionId,
    ],
    queryFn: async () => {
      if (!currentAssignment) return null;
      const res = await apiClient.get('/assessments/schemes', {
        params: {
          subjectId: currentAssignment.subjectId,
          academicTermId: currentAssignment.academicTermId,
          sectionId: currentAssignment.sectionId,
        },
      });
      return (res.data.data as AssessmentScheme) || null;
    },
    enabled: Boolean(currentAssignment),
  });

  // Section Results Query
  const resultsQuery = useQuery({
    queryKey: [
      'assessment-section-results',
      currentAssignment?.subjectId,
      currentAssignment?.academicTermId,
      currentAssignment?.sectionId,
    ],
    queryFn: async () => {
      if (!currentAssignment) return { scheme: null, results: [] };
      const res = await apiClient.get('/assessments/section-results', {
        params: {
          subjectId: currentAssignment.subjectId,
          sectionId: currentAssignment.sectionId,
          academicTermId: currentAssignment.academicTermId,
        },
      });
      return res.data.data as { scheme: AssessmentScheme; results: SectionSubjectResult[] };
    },
    enabled: Boolean(currentAssignment) && (activeTab === 'results' || activeTab === 'marks' || activeTab === 'gradebook'),
  });

  // Gradebook Matrix Query
  const gradebookQuery = useQuery({
    queryKey: [
      'assessment-gradebook',
      currentAssignment?.subjectId,
      currentAssignment?.sectionId,
      currentAssignment?.academicTermId,
    ],
    queryFn: async () => {
      if (!currentAssignment) return null;
      const res = await apiClient.get('/assessments/gradebook', {
        params: {
          subjectId: currentAssignment.subjectId,
          sectionId: currentAssignment.sectionId,
          academicTermId: currentAssignment.academicTermId,
        },
      });
      return res.data.data as GradebookData;
    },
    enabled: Boolean(currentAssignment) && (activeTab === 'gradebook' || activeTab === 'results'),
  });

  // Exam Dept Dashboard Query
  const examDeptQuery = useQuery({
    queryKey: ['exam-dept-dashboard'],
    queryFn: async () => {
      const res = await apiClient.get('/assessments/exam-dept/dashboard');
      return res.data.data as {
        submissions: Array<{
          subjectId: string;
          subjectName: string;
          subjectCode: string;
          sectionId: string;
          sectionName: string;
          className: string;
          academicTermId: string;
          termName: string;
          status: string;
          submittedToExamDeptAt: string | null;
          officiallyPublishedAt: string | null;
          studentsCount: number;
          results: SectionSubjectResult[];
        }>;
        pendingCorrections: Array<{
          id: string;
          subjectId: string;
          sectionId: string;
          currentMarks: number;
          proposedMarks: number;
          reason: string;
          student: { admissionNumber: string; user: { firstName: string; lastName: string } };
          subject: { name: string; code: string };
          section: { name: string };
          requestedByUser: { firstName: string; lastName: string };
        }>;
      };
    },
    enabled: isExamDept,
  });

  // Student Result Query
  const studentResultQuery = useQuery({
    queryKey: [
      'student-subject-result',
      currentStudentSubject?.subjectId || currentAssignment?.subjectId,
      currentStudentSubject?.academicTermId || currentAssignment?.academicTermId,
    ],
    queryFn: async () => {
      const subId = currentStudentSubject?.subjectId || currentAssignment?.subjectId;
      const termId = currentStudentSubject?.academicTermId || currentAssignment?.academicTermId;
      if (!subId || !termId) return null;
      const res = await apiClient.get('/assessments/student-result', {
        params: {
          subjectId: subId,
          academicTermId: termId,
        },
      });
      return res.data.data;
    },
    enabled: isStudent || isParent,
  });

  // Available Exam Schedules Query for Term & Subject
  const examSchedulesQuery = useQuery({
    queryKey: [
      'available-exam-schedules',
      currentAssignment?.subjectId,
      currentAssignment?.academicTermId,
    ],
    queryFn: async () => {
      if (!currentAssignment) return [];
      const res = await apiClient.get('/assessments/exam-schedules', {
        params: {
          subjectId: currentAssignment.subjectId,
          academicTermId: currentAssignment.academicTermId,
        },
      });
      return (res.data.data as ExamScheduleOption[]) || [];
    },
    enabled: Boolean(currentAssignment) && isTeacher,
  });

  // Scheme Builder State
  const [schemeTitle, setSchemeTitle] = useState('Standard Course Assessment Scheme');
  const [categoriesDraft, setCategoriesDraft] = useState<
    Array<{ id?: string; name: string; weightagePercentage: number; description?: string }>
  >([
    { name: 'Assignments', weightagePercentage: 15, description: 'Continuous homework & programming tasks' },
    { name: 'Class Participation', weightagePercentage: 15, description: 'In-class questions and engagement' },
    { name: 'Quizzes', weightagePercentage: 10, description: 'Surprise & scheduled quizzes' },
    { name: 'Midterm Examination', weightagePercentage: 20, description: 'Mid-semester written exam' },
    { name: 'Final Term Examination', weightagePercentage: 40, description: 'Comprehensive terminal examination' },
  ]);

  // Sync draft from loaded scheme
  React.useEffect(() => {
    if (schemeQuery.data) {
      setSchemeTitle(schemeQuery.data.title);
      if (schemeQuery.data.categories?.length > 0) {
        setCategoriesDraft(
          schemeQuery.data.categories.map((c) => ({
            id: c.id,
            name: c.name,
            weightagePercentage: c.weightagePercentage,
            description: c.description || '',
          }))
        );
      }
    }
  }, [schemeQuery.data]);


  const totalWeight = useMemo(() => {
    return categoriesDraft.reduce((s, c) => s + (Number(c.weightagePercentage) || 0), 0);
  }, [categoriesDraft]);

  const isSchemeValid = Math.abs(totalWeight - 100) < 0.001;

  // Selected assessment item for marks roster or grading
  const [selectedItemId, setSelectedItemId] = useState<string>('');

  // Auto-select first assessment item for Tab 3 (Student Marks & Submissions)
  React.useEffect(() => {
    if (schemeQuery.data?.categories) {
      const allItems = schemeQuery.data.categories.flatMap((cat: any) => cat.assessments || []);
      if (allItems.length > 0) {
        if (!selectedItemId || !allItems.some((item: any) => item.id === selectedItemId)) {
          setSelectedItemId(allItems[0].id);
        }
      }
    }
  }, [schemeQuery.data, selectedItemId]);


  const marksRosterQuery = useQuery({
    queryKey: ['assessment-marks-roster', selectedItemId, currentAssignment?.sectionId],
    queryFn: async () => {
      if (!selectedItemId || !currentAssignment) return null;
      const res = await apiClient.get(`/assessments/items/${selectedItemId}/roster`, {
        params: { sectionId: currentAssignment.sectionId },
      });
      return res.data.data as {
        assessment: AssessmentItem;
        students: Array<{
          id: string;
          admissionNumber: string;
          rollNumber: string | null;
          user: { firstName: string; lastName: string };
          mark: { marksObtained: number | null; isAbsent: boolean; isExcused: boolean; remarks: string | null } | null;
          submission: { id: string; submittedAt: string; contentText?: string; attachmentUrl?: string; status: string; grade?: number; feedback?: string } | null;
          marksObtained?: number | null;
          submissionStatus?: string | null;
          submittedAt?: string | Date | null;
          feedback?: string | null;
          weightedContribution?: number;
          isLate?: boolean;
          assignmentTitle?: string;
          categoryName?: string;
          maxMarks?: number;
        }>;
      };
    },
    enabled: Boolean(selectedItemId && currentAssignment),
  });

  // Marks draft for batch save
  const [marksDrafts, setMarksDrafts] = useState<
    Record<string, { marksObtained?: number | null; isAbsent: boolean; isExcused: boolean; remarks?: string }>
  >({});

  // Sync marks draft when roster loads
  React.useEffect(() => {
    if (marksRosterQuery.data?.students) {
      const drafts: Record<string, any> = {};
      marksRosterQuery.data.students.forEach((s) => {
        drafts[s.id] = {
          marksObtained: s.mark?.marksObtained ?? s.marksObtained ?? s.submission?.grade ?? null,
          isAbsent: s.mark?.isAbsent ?? false,
          isExcused: s.mark?.isExcused ?? false,
          remarks: s.mark?.remarks ?? s.feedback ?? s.submission?.feedback ?? '',
        };
      });
      setMarksDrafts(drafts);
    }
  }, [marksRosterQuery.data]);

  // Gradebook live drafts & recalculation state
  const [gradebookDrafts, setGradebookDrafts] = useState<
    Record<
      string,
      {
        marksObtained: number | null;
        isAbsent: boolean;
        isExcused: boolean;
        remarks: string;
      }
    >
  >({});

  const unsavedGradebookCount = useMemo(() => {
    return Object.keys(gradebookDrafts).length;
  }, [gradebookDrafts]);

  const getStudentItemMark = (studentId: string, colId: string, serverMark?: any) => {
    const key = `${studentId}:${colId}`;
    if (gradebookDrafts[key] !== undefined) {
      return gradebookDrafts[key];
    }
    return {
      marksObtained: serverMark?.marksObtained ?? null,
      isAbsent: serverMark?.isAbsent ?? false,
      isExcused: serverMark?.isExcused ?? false,
      remarks: serverMark?.remarks ?? '',
    };
  };

  const computeCellContribution = (
    marksObtained: number | null,
    maxMarks: number,
    weightage: number,
    isAbsent: boolean,
    isExcused: boolean
  ) => {
    if (isAbsent || isExcused || marksObtained === null || marksObtained === undefined) return 0;
    const ratio = Math.min(Math.max(Number(marksObtained), 0), maxMarks) / (maxMarks || 1);
    return Number((ratio * weightage).toFixed(2));
  };

  const calculateStudentLiveStats = (student: GradebookStudent, columns: GradebookColumn[]) => {
    // If no draft edits exist for this student and student already has a computed result from backend, use it directly
    const hasAnyDraft = columns.some((col) => gradebookDrafts[`${student.studentId}:${col.id}`] !== undefined);
    if (!hasAnyDraft && student.result && student.result.totalPercentage !== undefined && student.result.totalPercentage !== null) {
      return {
        totalWeighted: Number(student.result.totalPercentage.toFixed(2)),
        letter: student.result.gradeLetter || '—',
        gpa: student.result.gpa ?? 0.0,
      };
    }

    // Otherwise calculate grouped by category (supporting shared category weight, e.g. 15% Assignments)
    const categoryGroups = new Map<string, { weightage: number; items: Array<{ mark: any; maxMarks: number; weightage: number }> }>();
    for (const col of columns) {
      const catId = col.categoryId || 'default';
      const catWeight = Number(col.categoryWeightage ?? col.weightagePercentage ?? col.weightage ?? 0);
      if (!categoryGroups.has(catId)) {
        categoryGroups.set(catId, { weightage: catWeight, items: [] });
      }
      const d = getStudentItemMark(student.studentId, col.id, student.marks[col.id]);
      categoryGroups.get(catId)!.items.push({
        mark: d,
        maxMarks: col.maxMarks,
        weightage: Number(col.weightagePercentage || col.weightage || 0),
      });
    }

    let totalWeighted = 0;
    categoryGroups.forEach((group) => {
      const graded = group.items.filter(
        (i) => i.mark.marksObtained !== null && i.mark.marksObtained !== undefined && !i.mark.isExcused
      );
      if (graded.length === 0) return;

      const sumPcts = graded.reduce((sum, i) => {
        const obtained = i.mark.isAbsent ? 0 : Number(i.mark.marksObtained);
        const itemPct = i.maxMarks > 0 ? (obtained / i.maxMarks) * 100 : 0;
        return sum + itemPct;
      }, 0);
      const avgPct = sumPcts / graded.length;
      totalWeighted += (avgPct / 100) * group.weightage;
    });

    const score = Number(totalWeighted.toFixed(2));
    let letter = 'F';
    let gpa = 0.0;
    if (score >= 90) { letter = 'A+'; gpa = 4.0; }
    else if (score >= 85) { letter = 'A'; gpa = 4.0; }
    else if (score >= 80) { letter = 'A-'; gpa = 3.7; }
    else if (score >= 75) { letter = 'B+'; gpa = 3.3; }
    else if (score >= 70) { letter = 'B'; gpa = 3.0; }
    else if (score >= 65) { letter = 'B-'; gpa = 2.7; }
    else if (score >= 60) { letter = 'C+'; gpa = 2.3; }
    else if (score >= 55) { letter = 'C'; gpa = 2.0; }
    else if (score >= 50) { letter = 'C-'; gpa = 1.7; }
    else if (score >= 45) { letter = 'D'; gpa = 1.0; }
    else { letter = 'F'; gpa = 0.0; }

    return { totalWeighted: score, letter, gpa };
  };

  const gradebookStudents = useMemo(() => {
    const list = gradebookQuery.data?.rows || gradebookQuery.data?.students || [];
    return list.map((st) => ({
      ...st,
      studentName:
        st.studentName ||
        `${st.firstName || ''} ${st.lastName || ''}`.trim() ||
        'Student',
      status: st.status || st.result?.status || 'DRAFT',
      totalObtainedWeighted:
        st.totalObtainedWeighted ?? st.result?.totalPercentage ?? 0,
      gradeLetter: st.gradeLetter || st.result?.gradeLetter || '—',
      gpa: st.gpa ?? st.result?.gpa ?? 0,
    }));
  }, [gradebookQuery.data]);

  const gradebookColumns = useMemo(() => {
    return (gradebookQuery.data?.columns || []).map((col) => ({
      ...col,
      weightagePercentage: col.weightagePercentage ?? col.weightage ?? 0,
      isLmsAssignment: col.isLmsAssignment ?? Boolean(col.assignmentId),
    }));
  }, [gradebookQuery.data]);

  const gradebookStats = useMemo(() => {
    const sum =
      gradebookQuery.data?.summaryStatistics || gradebookQuery.data?.summary;
    const totalStudents = sum?.totalStudents ?? gradebookStudents.length;
    const avg =
      (sum as any)?.classAverageTotal ??
      (sum as any)?.averagePercentage ??
      0;
    const high =
      (sum as any)?.highestTotal ??
      (sum as any)?.highestPercentage ??
      0;
    const low =
      (sum as any)?.lowestTotal ??
      (sum as any)?.lowestPercentage ??
      0;
    const passRate =
      (sum as any)?.passRatePercent ?? (avg >= 50 ? 100 : 0);
    return {
      totalStudents,
      classAverageTotal: avg,
      highestTotal: high,
      lowestTotal: low,
      passRatePercent: passRate,
      columnAverages: (sum as any)?.columnAverages || {},
    };
  }, [gradebookQuery.data, gradebookStudents]);

  // Modal states - Create Item
  const [showItemModal, setShowItemModal] = useState(false);
  const [newItemCategoryId, setNewItemCategoryId] = useState('');
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemMaxMarks, setNewItemMaxMarks] = useState(100);
  const [newItemDueDate, setNewItemDueDate] = useState('');
  const [newItemInstructions, setNewItemInstructions] = useState('');
  const [newItemAttachmentUrl, setNewItemAttachmentUrl] = useState('');
  const [newItemExamScheduleId, setNewItemExamScheduleId] = useState('');

  // Modal states - Edit Item
  const [showEditItemModal, setShowEditItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<AssessmentItem | null>(null);
  const [editItemTitle, setEditItemTitle] = useState('');
  const [editItemCategoryId, setEditItemCategoryId] = useState('');
  const [editItemMaxMarks, setEditItemMaxMarks] = useState(100);
  const [editItemDueDate, setEditItemDueDate] = useState('');
  const [editItemInstructions, setEditItemInstructions] = useState('');
  const [editItemAttachmentUrl, setEditItemAttachmentUrl] = useState('');
  const [editItemExamScheduleId, setEditItemExamScheduleId] = useState('');

  // Modal states - Delete Item
  const [showDeleteItemModal, setShowDeleteItemModal] = useState(false);
  const [deletingItem, setDeletingItem] = useState<AssessmentItem | null>(null);

  // Deadline extension modal
  const [showDeadlineModal, setShowDeadlineModal] = useState(false);
  const [deadlineItem, setDeadlineItem] = useState<AssessmentItem | null>(null);
  const [newDueDateValue, setNewDueDateValue] = useState('');
  const [deadlineReason, setDeadlineReason] = useState('');

  // Submission grading modal
  const [gradingSubmission, setGradingSubmission] = useState<{
    id: string;
    studentName: string;
    admissionNumber: string;
    contentText?: string;
    attachmentUrl?: string;
    currentGrade?: number;
    currentFeedback?: string;
    maxMarks: number;
  } | null>(null);
  const [gradeInput, setGradeInput] = useState<number>(0);
  const [feedbackInput, setFeedbackInput] = useState<string>('');

  // Confirm Exam Dept submission modal
  const [showExamDeptConfirmModal, setShowExamDeptConfirmModal] = useState(false);
  const [examDeptRemarks, setExamDeptRemarks] = useState('');

  // Correction request modal
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [correctionTarget, setCorrectionTarget] = useState<SectionSubjectResult | null>(null);
  const [proposedMarks, setProposedMarks] = useState<number>(0);
  const [correctionReason, setCorrectionReason] = useState<string>('');

  // Connect Exam Schedule modal
  const [showConnectExamModal, setShowConnectExamModal] = useState(false);
  const [targetAssessmentForExam, setTargetAssessmentForExam] = useState<AssessmentItem | null>(null);
  const [selectedExamScheduleId, setSelectedExamScheduleId] = useState('');

  // Upload Manual Marks (CSV / Paste) modal
  const [showUploadCsvModal, setShowUploadCsvModal] = useState(false);
  const [targetAssessmentForCsv, setTargetAssessmentForCsv] = useState<AssessmentItem | null>(null);
  const [csvRawText, setCsvRawText] = useState('');
  const [csvParsedRows, setCsvParsedRows] = useState<
    Array<{
      identifier: string;
      marksObtained?: number | null;
      isAbsent?: boolean;
      isExcused?: boolean;
      remarks?: string | null;
      studentName?: string;
      rollNumber?: string;
      matched: boolean;
      warning?: string;
    }>
  >([]);
  const [csvError, setCsvError] = useState('');

  // Parse CSV helper for any category
  const parseCsvText = (text: string, maxMarks: number) => {
    setCsvError('');
    if (!text.trim()) {
      setCsvParsedRows([]);
      return;
    }

    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      setCsvParsedRows([]);
      return;
    }

    const firstLine = lines[0];
    const delimiter = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ',';

    const parsed: Array<{
      identifier: string;
      marksObtained?: number | null;
      isAbsent?: boolean;
      isExcused?: boolean;
      remarks?: string | null;
      studentName?: string;
      rollNumber?: string;
      matched: boolean;
      warning?: string;
    }> = [];

    const enrolledList = marksRosterQuery.data?.students || [];
    const gradebookList = gradebookStudents || [];

    const studentMap = new Map<string, { id: string; name: string; roll: string; admission: string }>();
    enrolledList.forEach((s) => {
      const info = {
        id: s.id,
        name: `${s.user?.firstName || ''} ${s.user?.lastName || ''}`.trim(),
        roll: s.rollNumber || '',
        admission: s.admissionNumber,
      };
      studentMap.set(s.id.toLowerCase(), info);
      studentMap.set(s.admissionNumber.toLowerCase(), info);
      if (s.rollNumber) studentMap.set(s.rollNumber.toLowerCase(), info);
    });
    gradebookList.forEach((s) => {
      const info = {
        id: s.studentId,
        name: s.studentName || `${s.firstName || ''} ${s.lastName || ''}`.trim(),
        roll: s.rollNumber || '',
        admission: s.admissionNumber,
      };
      studentMap.set(s.studentId.toLowerCase(), info);
      studentMap.set(s.admissionNumber.toLowerCase(), info);
      if (s.rollNumber) studentMap.set(s.rollNumber.toLowerCase(), info);
    });

    let startIndex = 0;
    const lowerFirst = firstLine.toLowerCase();
    if (
      lowerFirst.includes('admission') ||
      lowerFirst.includes('roll') ||
      lowerFirst.includes('student') ||
      lowerFirst.includes('identifier') ||
      lowerFirst.includes('mark')
    ) {
      startIndex = 1;
    }

    for (let i = startIndex; i < lines.length; i++) {
      const rawCols = lines[i].split(delimiter).map((c) => c.replace(/^["']|["']$/g, '').trim());
      if (rawCols.length === 0 || !rawCols[0]) continue;

      const identifier = rawCols[0];
      const marksStr = rawCols[1] ?? '';
      const isAbsentStr = rawCols[2] ?? '';
      const isExcusedStr = rawCols[3] ?? '';
      const remarks = rawCols.slice(4).join(' ').trim() || undefined;

      const isAbsent = ['yes', 'true', '1', 'a', 'absent'].includes(isAbsentStr.toLowerCase());
      const isExcused = ['yes', 'true', '1', 'e', 'excused'].includes(isExcusedStr.toLowerCase());

      let marksObtained: number | null = null;
      let warning: string | undefined;

      if (!isAbsent && !isExcused && marksStr !== '') {
        const num = Number(marksStr);
        if (isNaN(num)) {
          warning = `Invalid marks: "${marksStr}"`;
        } else if (num < 0) {
          warning = `Negative marks (${num})`;
        } else if (num > maxMarks) {
          warning = `Marks (${num}) exceed max (${maxMarks})`;
        } else {
          marksObtained = num;
        }
      }

      const match = studentMap.get(identifier.toLowerCase());
      if (!match) {
        warning = warning ? `${warning}; Student not found` : 'Student identifier not found in this section';
      }

      parsed.push({
        identifier,
        marksObtained,
        isAbsent,
        isExcused,
        remarks,
        studentName: match?.name,
        rollNumber: match?.roll,
        matched: Boolean(match),
        warning,
      });
    }

    setCsvParsedRows(parsed);
  };

  // Download CSV Template helper
  const handleDownloadCsvTemplate = (item: AssessmentItem) => {
    const enrolledList = marksRosterQuery.data?.students || [];
    const gradebookList = gradebookStudents || [];

    const rows: Array<{ adm: string; roll: string; name: string }> = [];
    if (enrolledList.length > 0) {
      enrolledList.forEach((s) => {
        rows.push({
          adm: s.admissionNumber,
          roll: s.rollNumber || '',
          name: `${s.user?.firstName || ''} ${s.user?.lastName || ''}`.trim(),
        });
      });
    } else {
      gradebookList.forEach((s) => {
        rows.push({
          adm: s.admissionNumber,
          roll: s.rollNumber || '',
          name: s.studentName || `${s.firstName || ''} ${s.lastName || ''}`.trim(),
        });
      });
    }

    let csv = 'AdmissionNumber,MarksObtained,IsAbsent,IsExcused,Remarks,StudentName,RollNumber\n';
    rows.forEach((r) => {
      csv += `"${r.adm}","","","","","${r.name}","${r.roll}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${item.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_template.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Checking lock state: is section result submitted to exam dept?
  const isSectionLocked = useMemo(() => {
    const results = resultsQuery.data?.results || [];
    if (results.length === 0) return false;
    return [
      'SUBMITTED_TO_EXAM_DEPARTMENT',
      'UNDER_EXAM_REVIEW',
      'APPROVED',
      'OFFICIALLY_PUBLISHED',
    ].includes(results[0].status);
  }, [resultsQuery.data]);

  const sectionStatus = resultsQuery.data?.results?.[0]?.status || 'DRAFT';

  // MUTATIONS

  // Save / Update Scheme
  const saveSchemeMutation = useMutation({
    mutationFn: async () => {
      if (!currentAssignment) throw new Error('Please select an assigned subject and section');
      if (!isSchemeValid) throw new Error('Category percentages must total exactly 100%');

      const cleanedCategories = categoriesDraft.map((c, idx) => ({
        id: c.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c.id) ? c.id : undefined,
        name: c.name.trim(),
        weightagePercentage: Number(c.weightagePercentage),
        description: c.description ? c.description.trim() : '',
        displayOrder: idx,
      }));

      if (schemeQuery.data?.id) {
        return (
          await apiClient.put(`/assessments/schemes/${schemeQuery.data.id}`, {
            title: schemeTitle.trim(),
            categories: cleanedCategories,
          })
        ).data;
      } else {
        return (
          await apiClient.post('/assessments/schemes', {
            subjectId: currentAssignment.subjectId,
            academicTermId: currentAssignment.academicTermId,
            sectionId: currentAssignment.sectionId || undefined,
            title: schemeTitle.trim(),
            categories: cleanedCategories,
          })
        ).data;
      }
    },
    onSuccess: () => {
      setNotice('Assessment scheme and 100% category weightages saved successfully.');
      setError('');
      queryClient.invalidateQueries({ queryKey: ['assessment-scheme'] });
    },
    onError: (err: any) => {
      const errMsg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        (Array.isArray(err?.response?.data?.errors) ? err.response.data.errors.map((e: any) => e.message).join(', ') : null) ||
        err.message ||
        'Failed to save scheme';
      setError(errMsg);
      setNotice('');
    },
  });

  // Create Assessment Item
  const createItemMutation = useMutation({
    mutationFn: async () => {
      const maxMarksNum = Number(newItemMaxMarks);
      const res = await apiClient.post('/assessments/items', {
        assessmentCategoryId: newItemCategoryId,
        title: newItemTitle.trim(),
        maxMarks: !isNaN(maxMarksNum) && maxMarksNum > 0 ? maxMarksNum : 100,
        dueDate: newItemDueDate && !isNaN(new Date(newItemDueDate).getTime()) ? new Date(newItemDueDate).toISOString() : undefined,
        instructions: newItemInstructions?.trim() || undefined,
        attachmentUrl: newItemAttachmentUrl?.trim() || undefined,
        examScheduleId: newItemExamScheduleId && newItemExamScheduleId.trim() ? newItemExamScheduleId.trim() : undefined,
        isPublished: true,
      });
      return res.data;
    },
    onSuccess: () => {
      setNotice('Assessment item created and published successfully.');
      setError('');
      setShowItemModal(false);
      setNewItemTitle('');
      setNewItemInstructions('');
      setNewItemAttachmentUrl('');
      setNewItemExamScheduleId('');
      queryClient.invalidateQueries({ queryKey: ['assessment-scheme'] });
      queryClient.invalidateQueries({ queryKey: ['assessment-gradebook'] });
      queryClient.invalidateQueries({ queryKey: ['assessment-section-results'] });
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        (Array.isArray(err?.response?.data?.errors) ? err.response.data.errors.map((e: any) => e.message).join(', ') : null) ||
        err.message ||
        'Failed to create item';
      setError(msg);
      setNotice('');
    },
  });

  // Update Assessment Item
  const updateItemMutation = useMutation({
    mutationFn: async () => {
      if (!editingItem) return;
      const maxMarksNum = Number(editItemMaxMarks);
      const res = await apiClient.put(`/assessments/items/${editingItem.id}`, {
        assessmentCategoryId: editItemCategoryId || undefined,
        title: editItemTitle?.trim(),
        maxMarks: !isNaN(maxMarksNum) && maxMarksNum > 0 ? maxMarksNum : undefined,
        dueDate: editItemDueDate && !isNaN(new Date(editItemDueDate).getTime()) ? new Date(editItemDueDate).toISOString() : null,
        instructions: editItemInstructions?.trim() || null,
        attachmentUrl: editItemAttachmentUrl?.trim() || null,
        examScheduleId: editItemExamScheduleId && editItemExamScheduleId.trim() ? editItemExamScheduleId.trim() : null,
      });
      return res.data;
    },
    onSuccess: () => {
      setNotice('Assessment item updated successfully.');
      setError('');
      setShowEditItemModal(false);
      setEditingItem(null);
      queryClient.invalidateQueries({ queryKey: ['assessment-scheme'] });
      queryClient.invalidateQueries({ queryKey: ['assessment-gradebook'] });
      queryClient.invalidateQueries({ queryKey: ['assessment-section-results'] });
      queryClient.invalidateQueries({ queryKey: ['assessment-marks-roster'] });
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        (Array.isArray(err?.response?.data?.errors) ? err.response.data.errors.map((e: any) => e.message).join(', ') : null) ||
        err.message ||
        'Failed to update item';
      setError(msg);
      setNotice('');
    },
  });

  // Delete Assessment Item
  const deleteItemMutation = useMutation({
    mutationFn: async () => {
      if (!deletingItem) return;
      const res = await apiClient.delete(`/assessments/items/${deletingItem.id}`);
      return res.data;
    },
    onSuccess: () => {
      setNotice('Assessment item and associated marks deleted successfully.');
      setError('');
      setShowDeleteItemModal(false);
      setDeletingItem(null);
      if (selectedItemId === deletingItem?.id) {
        setSelectedItemId('');
      }
      queryClient.invalidateQueries({ queryKey: ['assessment-scheme'] });
      queryClient.invalidateQueries({ queryKey: ['assessment-gradebook'] });
      queryClient.invalidateQueries({ queryKey: ['assessment-section-results'] });
      queryClient.invalidateQueries({ queryKey: ['assessment-marks-roster'] });
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message || err.message || 'Failed to delete item');
      setNotice('');
    },
  });

  // Extend Deadline
  const extendDeadlineMutation = useMutation({
    mutationFn: async () => {
      if (!deadlineItem) return;
      const res = await apiClient.post(`/assessments/items/${deadlineItem.id}/extend-deadline`, {
        dueDate: new Date(newDueDateValue).toISOString(),
        reason: deadlineReason,
      });
      return res.data;
    },
    onSuccess: () => {
      setNotice('Assignment deadline extended and recorded in audit history.');
      setError('');
      setShowDeadlineModal(false);
      setDeadlineReason('');
      queryClient.invalidateQueries({ queryKey: ['assessment-scheme'] });
      queryClient.invalidateQueries({ queryKey: ['assessment-marks-roster'] });
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message || err.message || 'Failed to extend deadline');
      setNotice('');
    },
  });

  // Save Marks Batch
  const saveMarksBatchMutation = useMutation({
    mutationFn: async () => {
      if (!selectedItemId) throw new Error('No assessment selected');
      const payloadMarks = Object.entries(marksDrafts).map(([studentId, data]) => ({
        studentId,
        marksObtained: data.marksObtained !== null && data.marksObtained !== undefined ? Number(data.marksObtained) : null,
        isAbsent: Boolean(data.isAbsent),
        isExcused: Boolean(data.isExcused),
        remarks: data.remarks || null,
      }));

      const res = await apiClient.post('/assessments/marks/batch', {
        assessmentItemId: selectedItemId,
        marks: payloadMarks,
      });
      return res.data;
    },
    onSuccess: () => {
      setNotice('Student marks recorded. Automatic weighted results recalculated live.');
      setError('');
      queryClient.invalidateQueries({ queryKey: ['assessment-marks-roster'] });
      queryClient.invalidateQueries({ queryKey: ['assessment-section-results'] });
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message || err.message || 'Failed to save marks');
      setNotice('');
    },
  });

  // Batch Save Unified Gradebook Marks
  const saveGradebookMutation = useMutation({
    mutationFn: async () => {
      if (!currentAssignment) throw new Error('No assigned subject selected');
      const payload: Array<{
        studentId: string;
        assessmentItemId: string;
        marksObtained?: number | null;
        isAbsent?: boolean;
        isExcused?: boolean;
        remarks?: string | null;
      }> = [];

      gradebookStudents.forEach((st) => {
        gradebookColumns.forEach((col) => {
          const key = `${st.studentId}:${col.id}`;
          const draft = gradebookDrafts[key];
          if (draft !== undefined) {
            const raw = draft.marksObtained;
            const marksObtained =
              raw === null || raw === undefined || isNaN(Number(raw))
                ? null
                : Number(raw);

            payload.push({
              studentId: st.studentId,
              assessmentItemId: col.id,
              marksObtained,
              isAbsent: Boolean(draft.isAbsent),
              isExcused: Boolean(draft.isExcused),
              remarks: draft.remarks ? draft.remarks.trim() : null,
            });
          }
        });
      });

      if (payload.length === 0) {
        throw new Error('No modified marks to save.');
      }

      const res = await apiClient.post('/assessments/gradebook/save', {
        subjectId: currentAssignment.subjectId,
        sectionId: currentAssignment.sectionId,
        academicTermId: currentAssignment.academicTermId,
        updates: payload,
        marks: payload,
      });
      return res.data;
    },
    onSuccess: (data: any) => {
      setNotice(data?.data?.message || 'Gradebook saved and weighted contributions recalculated successfully.');
      setError('');
      setGradebookDrafts({});
      queryClient.invalidateQueries({ queryKey: ['assessment-gradebook'] });
      queryClient.invalidateQueries({ queryKey: ['assessment-section-results'] });
      queryClient.invalidateQueries({ queryKey: ['assessment-marks-roster'] });
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        (Array.isArray(err?.response?.data?.errors)
          ? err.response.data.errors.map((e: any) => e.message).join(', ')
          : null) ||
        err.message ||
        'Failed to save gradebook marks';
      setError(msg);
      setNotice('');
    },
  });

  // Connect / Disconnect Assessment Item to Exam Schedule
  const connectExamScheduleMutation = useMutation({
    mutationFn: async (data: { itemId: string; examScheduleId: string | null }) => {
      const res = await apiClient.post(`/assessments/items/${data.itemId}/connect-exam`, {
        examScheduleId: data.examScheduleId,
      });
      return res.data;
    },
    onSuccess: (res: any) => {
      setNotice(res?.data?.message || 'Exam schedule connection updated successfully.');
      setError('');
      setShowConnectExamModal(false);
      setTargetAssessmentForExam(null);
      queryClient.invalidateQueries({ queryKey: ['assessment-scheme'] });
      queryClient.invalidateQueries({ queryKey: ['assessment-gradebook'] });
      queryClient.invalidateQueries({ queryKey: ['assessment-marks-roster'] });
      queryClient.invalidateQueries({ queryKey: ['available-exam-schedules'] });
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message || err.message || 'Failed to update exam connection');
      setNotice('');
    },
  });

  // Synchronize Marks from Connected Exam Schedule
  const syncExamMarksMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const res = await apiClient.post(`/assessments/items/${itemId}/sync-exam`);
      return res.data;
    },
    onSuccess: (res: any) => {
      setNotice(res?.data?.message || 'Marks synchronized from exam schedule successfully.');
      setError('');
      queryClient.invalidateQueries({ queryKey: ['assessment-scheme'] });
      queryClient.invalidateQueries({ queryKey: ['assessment-gradebook'] });
      queryClient.invalidateQueries({ queryKey: ['assessment-marks-roster'] });
      queryClient.invalidateQueries({ queryKey: ['assessment-section-results'] });
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message || err.message || 'Failed to sync exam marks');
      setNotice('');
    },
  });

  // Bulk / Manual Marks CSV Upload
  const uploadCsvMarksMutation = useMutation({
    mutationFn: async (data: {
      itemId: string;
      rows: Array<{
        identifier: string;
        marksObtained?: number | null;
        isAbsent?: boolean;
        isExcused?: boolean;
        remarks?: string | null;
      }>;
    }) => {
      const res = await apiClient.post(`/assessments/items/${data.itemId}/upload-csv`, {
        rows: data.rows,
      });
      return res.data;
    },
    onSuccess: (res: any) => {
      setNotice(res?.data?.message || 'Marks uploaded and course results recalculated successfully.');
      setError('');
      setShowUploadCsvModal(false);
      setTargetAssessmentForCsv(null);
      setCsvRawText('');
      setCsvParsedRows([]);
      queryClient.invalidateQueries({ queryKey: ['assessment-marks-roster'] });
      queryClient.invalidateQueries({ queryKey: ['assessment-gradebook'] });
      queryClient.invalidateQueries({ queryKey: ['assessment-section-results'] });
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message || err.message || 'Failed to upload CSV marks');
      setNotice('');
    },
  });

  // Grade Assignment Submission
  const gradeSubmissionMutation = useMutation({
    mutationFn: async () => {
      if (!gradingSubmission) return;
      const res = await apiClient.post(`/assessments/submissions/${gradingSubmission.id}/grade`, {
        grade: Number(gradeInput),
        feedback: feedbackInput,
      });
      return res.data;
    },
    onSuccess: () => {
      setNotice('Assignment graded. Category average and final course result updated automatically.');
      setError('');
      setGradingSubmission(null);
      queryClient.invalidateQueries({ queryKey: ['assessment-marks-roster'] });
      queryClient.invalidateQueries({ queryKey: ['assessment-section-results'] });
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message || err.message || 'Failed to grade submission');
      setNotice('');
    },
  });

  // BUTTON A: Submit (Publish to Students)
  const submitToStudentsMutation = useMutation({
    mutationFn: async () => {
      if (!currentAssignment) throw new Error('No assignment selected');
      const res = await apiClient.post('/assessments/results/submit-to-students', {
        subjectId: currentAssignment.subjectId,
        sectionId: currentAssignment.sectionId,
        academicTermId: currentAssignment.academicTermId,
        remarks: 'Teacher published provisional marks to students',
      });
      return res.data;
    },
    onSuccess: (data: any) => {
      setNotice(data?.data?.message || 'Marks published to students. You may still make adjustments.');
      setError('');
      queryClient.invalidateQueries({ queryKey: ['assessment-section-results'] });
      queryClient.invalidateQueries({ queryKey: ['assessment-gradebook'] });
      queryClient.invalidateQueries({ queryKey: ['student-subject-result'] });
      queryClient.invalidateQueries({ queryKey: ['student-enrolled-subjects'] });
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message || err.message || 'Failed to submit marks to students');
      setNotice('');
    },
  });

  // BUTTON B: Submit to Exam Department
  const submitToExamDeptMutation = useMutation({
    mutationFn: async () => {
      if (!currentAssignment) throw new Error('No assignment selected');
      const res = await apiClient.post('/assessments/results/submit-to-exam-dept', {
        subjectId: currentAssignment.subjectId,
        sectionId: currentAssignment.sectionId,
        academicTermId: currentAssignment.academicTermId,
        remarks: examDeptRemarks,
      });
      return res.data;
    },
    onSuccess: (data: any) => {
      setNotice(
        data?.data?.message ||
        'Subject results forwarded to Exam Department. Direct teacher editing is now locked.'
      );
      setError('');
      setShowExamDeptConfirmModal(false);
      queryClient.invalidateQueries({ queryKey: ['assessment-section-results'] });
      queryClient.invalidateQueries({ queryKey: ['assessment-gradebook'] });
      queryClient.invalidateQueries({ queryKey: ['student-subject-result'] });
      queryClient.invalidateQueries({ queryKey: ['exam-dept-dashboard'] });
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message || err.message || 'Failed to forward to Exam Department');
      setNotice('');
    },
  });

  // Request Result Correction
  const requestCorrectionMutation = useMutation({
    mutationFn: async () => {
      if (!correctionTarget) throw new Error('No student result selected');
      const res = await apiClient.post('/assessments/results/request-correction', {
        subjectResultId: correctionTarget.id,
        studentId: correctionTarget.studentId,
        proposedMarks: Number(proposedMarks),
        reason: correctionReason,
      });
      return res.data;
    },
    onSuccess: () => {
      setNotice('Correction request submitted to Exam Department for official review.');
      setError('');
      setShowCorrectionModal(false);
      setCorrectionReason('');
      queryClient.invalidateQueries({ queryKey: ['assessment-section-results'] });
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message || err.message || 'Failed to request correction');
      setNotice('');
    },
  });

  // Exam Dept: Review Section Result (Approve / Publish / Return)
  const examDeptReviewMutation = useMutation({
    mutationFn: async (payload: {
      subjectId: string;
      sectionId: string;
      academicTermId: string;
      status: 'APPROVED' | 'OFFICIALLY_PUBLISHED' | 'RETURNED_FOR_CORRECTION';
      notes?: string;
    }) => {
      const res = await apiClient.post('/assessments/exam-dept/review', payload);
      return res.data;
    },
    onSuccess: (data: any) => {
      setNotice(data?.data?.message || 'Section result status updated.');
      setError('');
      queryClient.invalidateQueries({ queryKey: ['exam-dept-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['assessment-section-results'] });
      queryClient.invalidateQueries({ queryKey: ['assessment-gradebook'] });
      queryClient.invalidateQueries({ queryKey: ['student-subject-result'] });
      queryClient.invalidateQueries({ queryKey: ['student-enrolled-subjects'] });
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message || err.message || 'Action failed');
      setNotice('');
    },
  });

  // Exam Dept: Review Correction Request
  const reviewCorrectionMutation = useMutation({
    mutationFn: async (payload: {
      id: string;
      status: 'APPROVED' | 'REJECTED';
      reviewNotes?: string;
    }) => {
      const res = await apiClient.post(`/assessments/exam-dept/corrections/${payload.id}/review`, {
        status: payload.status,
        reviewNotes: payload.reviewNotes,
      });
      return res.data;
    },
    onSuccess: () => {
      setNotice('Correction request reviewed and official record updated.');
      setError('');
      queryClient.invalidateQueries({ queryKey: ['exam-dept-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['assessment-section-results'] });
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message || err.message || 'Review failed');
      setNotice('');
    },
  });

  // Student submission upload
  const [submissionContentText, setSubmissionContentText] = useState('');
  const [submissionAttachmentUrl, setSubmissionAttachmentUrl] = useState('');

  const submitStudentWorkMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const res = await apiClient.post(`/assessments/items/${itemId}/submit-work`, {
        contentText: submissionContentText,
        attachmentUrl: submissionAttachmentUrl,
      });
      return res.data;
    },
    onSuccess: () => {
      setNotice('Assignment submitted successfully.');
      setError('');
      setSubmissionContentText('');
      setSubmissionAttachmentUrl('');
      queryClient.invalidateQueries({ queryKey: ['student-subject-result'] });
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message || err.message || 'Submission failed');
      setNotice('');
    },
  });

  if (!isStaff && !isStudent && !isParent) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-8 text-center shadow-sm">
          <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-rose-900">Access Restricted</h2>
          <p className="mt-2 text-sm text-rose-700 max-w-md mx-auto">
            You do not have permission to access the assessment portal.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md">
            UNIVERSITY-STYLE ASSESSMENT & RESULTS
          </span>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">
            Assessment Schemes & Weighted Results
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Configure assessment categories, define weightages (100%), grade assignments, and forward official results through the academic lifecycle.
          </p>
        </div>

        {/* Teacher Assigned Subject Selector */}
        {assignmentsQuery.data && assignmentsQuery.data.length > 0 && (
          <div className="flex items-center gap-3 bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">{isExamDept ? 'Selected Subject / Section:' : 'Assigned Subject:'}</span>
            <select
              value={selectedAssignmentIndex}
              onChange={(e) => setSelectedAssignmentIndex(Number(e.target.value))}
              className="text-sm font-semibold text-slate-800 bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {assignmentsQuery.data.map((a, idx) => (
                <option key={`${a.subjectId}-${a.sectionId}-${a.academicTermId}`} value={idx}>
                  {a.subject.name} ({a.subject.code}) — {a.section.classGrade.name} ({a.section.name}) · {a.academicTerm.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Notifications */}
      {notice && (
        <div role="status" className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800">
          <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
          <span>{notice}</span>
        </div>
      )}
      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 p-4 text-sm text-rose-800">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Section Lock Status Banner for Teacher */}
      {isSectionLocked && (
        <div className="flex items-center justify-between rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">
          <div className="flex items-center gap-3">
            <Lock className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <p className="font-semibold">Teacher Editing is Locked</p>
              <p className="text-xs text-amber-700">
                This subject result has been submitted to the Exam Department (Status: <span className="font-bold">{sectionStatus}</span>). Direct edits are rejected. You may submit an authorized correction request.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (resultsQuery.data?.results?.[0]) {
                setCorrectionTarget(resultsQuery.data.results[0]);
                setProposedMarks(resultsQuery.data.results[0].totalPercentage);
                setShowCorrectionModal(true);
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Request Correction
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        {!isStudent && !isParent && (
          <>
            <button
              type="button"
              onClick={() => setActiveTab('scheme')}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${activeTab === 'scheme'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
            >
              <Layers className="w-4 h-4" />
              1. Assessment Scheme & Categories
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('items')}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${activeTab === 'items'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
            >
              <FileCheck className="w-4 h-4" />
              2. Individual Assessments & Assignments
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('marks')}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${activeTab === 'marks'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
            >
              <Edit className="w-4 h-4" />
              3. Student Marks & Submissions
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('gradebook')}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${activeTab === 'gradebook'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
            >
              <Table className="w-4 h-4" />
              4. Unified Gradebook Matrix
              {unsavedGradebookCount > 0 && (
                <span className="ml-1.5 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-extrabold text-slate-900">
                  {unsavedGradebookCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('results')}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${activeTab === 'results'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
            >
              <Award className="w-4 h-4" />
              5. Final Results & Review
            </button>
          </>
        )}

        {(isStudent || isParent) && (
          <button
            type="button"
            onClick={() => setActiveTab('student_view')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${activeTab === 'student_view'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
          >
            <Award className="w-4 h-4" />
            My Course Assessment Results
          </button>
        )}
      </div>

      {/* ============================================================== */}
      {/* TAB 1: ASSESSMENT SCHEME & CATEGORIES BUILDER                   */}
      {/* ============================================================== */}
      {activeTab === 'scheme' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-5">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Configure Assessment Scheme</h2>
                <p className="text-sm text-slate-500">
                  Define assessment categories and percentages. Total weightage must sum to exactly <span className="font-bold text-indigo-600">100%</span>.
                </p>
              </div>

              {/* Total Percentage Gauge */}
              <div className="flex items-center gap-3">
                <div
                  className={`px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 border ${isSchemeValid
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : 'bg-rose-50 text-rose-800 border-rose-300'
                    }`}
                >
                  {isSchemeValid ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      Total Weightage: 100% (Balanced)
                    </>
                  ) : totalWeight < 100 ? (
                    <>
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                      <span>Total: {totalWeight.toFixed(1)}% — <strong className="underline">{(100 - totalWeight).toFixed(1)}% unallocated</strong></span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-4 h-4 text-rose-600" />
                      <span>Total: {totalWeight.toFixed(1)}% — <strong className="underline">Exceeds 100% by {(totalWeight - 100).toFixed(1)}%</strong></span>
                    </>
                  )}
                </div>

                <button
                  type="button"
                  disabled={!isSchemeValid || isSectionLocked || saveSchemeMutation.isPending}
                  onClick={() => saveSchemeMutation.mutate()}
                  className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-sm transition"
                >
                  <Save className="w-4 h-4" />
                  {saveSchemeMutation.isPending ? 'Saving...' : 'Save Assessment Scheme'}
                </button>
              </div>
            </div>

            {/* Title Input */}
            <div className="mb-6">
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Scheme Title
              </label>
              <input
                type="text"
                disabled={isSectionLocked}
                value={schemeTitle}
                onChange={(e) => setSchemeTitle(e.target.value)}
                className="w-full max-w-xl text-sm font-medium text-slate-900 bg-white border border-slate-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Categories Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-sm text-slate-700">
                <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Category Name</th>
                    <th className="px-4 py-3 w-40">Weightage (%)</th>
                    <th className="px-4 py-3">Description / Learning Policy</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {categoriesDraft.map((cat, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/60 transition">
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          disabled={isSectionLocked}
                          value={cat.name}
                          onChange={(e) => {
                            const updated = [...categoriesDraft];
                            updated[idx].name = e.target.value;
                            setCategoriesDraft(updated);
                          }}
                          placeholder="e.g. Assignments, Quizzes, Midterm"
                          className="w-full text-sm font-semibold text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.5"
                            disabled={isSectionLocked}
                            value={cat.weightagePercentage}
                            onChange={(e) => {
                              const updated = [...categoriesDraft];
                              updated[idx].weightagePercentage = Number(e.target.value) || 0;
                              setCategoriesDraft(updated);
                            }}
                            className="w-24 text-sm font-bold text-slate-900 bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <span className="text-slate-500 font-bold">%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          disabled={isSectionLocked}
                          value={cat.description || ''}
                          onChange={(e) => {
                            const updated = [...categoriesDraft];
                            updated[idx].description = e.target.value;
                            setCategoriesDraft(updated);
                          }}
                          placeholder="Optional notes or instructions"
                          className="w-full text-xs text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          disabled={isSectionLocked || categoriesDraft.length <= 1}
                          onClick={() => {
                            setCategoriesDraft(categoriesDraft.filter((_, i) => i !== idx));
                          }}
                          className="text-slate-400 hover:text-rose-600 disabled:opacity-30 disabled:hover:text-slate-400 p-1.5 rounded-lg hover:bg-rose-50 transition"
                          title="Remove Category"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Add Category Button */}
            {!isSectionLocked && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setCategoriesDraft([
                      ...categoriesDraft,
                      { name: 'New Assessment Category', weightagePercentage: 0, description: '' },
                    ]);
                  }}
                  className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3.5 py-2 rounded-xl transition"
                >
                  <Plus className="w-4 h-4" />
                  Add Custom Category
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: INDIVIDUAL ASSESSMENTS & ASSIGNMENTS                    */}
      {/* ============================================================== */}
      {activeTab === 'items' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Course Assessment Items</h2>
              <p className="text-sm text-slate-500">
                Create multiple assessments inside categories (e.g., Assignment 1, 2, 3 in Assignments category).
              </p>
            </div>
          </div>

          {/* Categories Grid with their Assessments */}
          {schemeQuery.data?.categories?.map((cat) => (
            <div key={cat.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-8 bg-indigo-600 rounded-full" />
                  <div>
                    <h3 className="text-base font-bold text-slate-900">{cat.name}</h3>
                    <p className="text-xs text-slate-500">
                      Category Total Weightage: <span className="font-bold text-indigo-600">{cat.weightagePercentage}%</span> of Course Grade
                    </p>
                  </div>
                </div>

                {!isSectionLocked && (
                  <button
                    type="button"
                    onClick={() => {
                      setNewItemCategoryId(cat.id!);
                      setShowItemModal(true);
                    }}
                    className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Create Assessment in {cat.name}
                  </button>
                )}
              </div>

              {/* Assessment items under this category */}
              {cat.assessments && cat.assessments.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {cat.assessments.map((item) => (
                    <div
                      key={item.id}
                      className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 hover:bg-slate-50 transition flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-bold text-slate-900 text-sm">{item.title}</h4>
                          <span className="text-xs font-extrabold text-indigo-700 bg-indigo-100/80 px-2 py-0.5 rounded-md">
                            {item.maxMarks} Marks
                          </span>
                        </div>

                        {item.instructions && (
                          <p className="text-xs text-slate-600 mt-2 line-clamp-2">{item.instructions}</p>
                        )}

                        {/* Connected Exam Schedule Badge & Actions */}
                        {item.examSchedule ? (
                          <div className="mt-2.5 rounded-lg bg-purple-50/80 border border-purple-200 p-2 text-xs flex items-center justify-between gap-2">
                            <div
                              onClick={() => {
                                setTargetAssessmentForExam(item);
                                setSelectedExamScheduleId(item.examScheduleId || '');
                                setShowConnectExamModal(true);
                              }}
                              className="flex items-center gap-1.5 text-purple-900 font-bold truncate cursor-pointer hover:underline"
                              title="Click to view or change connected Exam Schedule"
                            >
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                              <span className="truncate" title={item.examSchedule.examSession?.name || 'Exam'}>
                                Exam: {item.examSchedule.examSession?.name || 'Exam Schedule'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                title="Sync marks now from Exam Schedule"
                                disabled={syncExamMarksMutation.isPending}
                                onClick={() => syncExamMarksMutation.mutate(item.id)}
                                className="p-1 text-purple-700 hover:bg-purple-100 rounded transition"
                              >
                                <RefreshCw className={`w-3.5 h-3.5 ${syncExamMarksMutation.isPending ? 'animate-spin' : ''}`} />
                              </button>
                              {!isSectionLocked && (
                                <button
                                  type="button"
                                  title="Disconnect from Exam Schedule"
                                  disabled={connectExamScheduleMutation.isPending}
                                  onClick={() => connectExamScheduleMutation.mutate({ itemId: item.id, examScheduleId: null })}
                                  className="p-1 text-slate-400 hover:text-rose-600 rounded transition"
                                >
                                  <Unlink className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        ) : (
                          !isSectionLocked && (
                            <button
                              type="button"
                              onClick={() => {
                                setTargetAssessmentForExam(item);
                                setSelectedExamScheduleId(item.examScheduleId || '');
                                setShowConnectExamModal(true);
                              }}
                              className="mt-2.5 w-full flex items-center justify-center gap-1 text-[11px] font-bold text-purple-700 bg-purple-50/90 hover:bg-purple-100 border border-purple-200/80 rounded-lg py-1.5 transition"
                              title="Connect this assessment (e.g. Midterm or Final) to an Exam Schedule for automatic marks synchronization"
                            >
                              <Link2 className="w-3 h-3" />
                              Connect to Term Exam Schedule
                            </button>
                          )
                        )}

                        <div className="mt-3 text-xs text-slate-500 space-y-1">
                          {item.dueDate && (
                            <div className="flex items-center gap-1 text-slate-700 font-medium">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" />
                              Due: {new Date(item.dueDate).toLocaleDateString()} {new Date(item.dueDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          )}
                          <div className="text-slate-500">
                            Submissions: {item._count?.submissions || 0} | Marks Recorded: {item._count?.marks || 0}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {!isSectionLocked && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingItem(item);
                                setEditItemTitle(item.title);
                                setEditItemCategoryId(item.assessmentCategoryId || cat.id!);
                                setEditItemMaxMarks(item.maxMarks);
                                setEditItemDueDate(item.dueDate ? new Date(item.dueDate).toISOString().slice(0, 16) : '');
                                setEditItemInstructions(item.instructions || '');
                                setEditItemAttachmentUrl(item.attachmentUrl || '');
                                setEditItemExamScheduleId(item.examScheduleId || '');
                                setShowEditItemModal(true);
                              }}
                              className="flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-amber-600"
                              title="Edit assessment item details, max marks, and exam link"
                            >
                              <Pencil className="w-3.5 h-3.5 text-amber-500" />
                              Edit
                            </button>
                          )}

                          {!isSectionLocked && (
                            <button
                              type="button"
                              onClick={() => {
                                setDeletingItem(item);
                                setShowDeleteItemModal(true);
                              }}
                              className="flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-rose-600"
                              title="Delete assessment item and clean up marks"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                              Delete
                            </button>
                          )}

                          {!isSectionLocked && (
                            <button
                              type="button"
                              onClick={() => {
                                setDeadlineItem(item);
                                setNewDueDateValue(
                                  item.dueDate ? new Date(item.dueDate).toISOString().slice(0, 16) : ''
                                );
                                setShowDeadlineModal(true);
                              }}
                              className="flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-indigo-600"
                            >
                              <Clock className="w-3.5 h-3.5" />
                              Deadline
                            </button>
                          )}

                          {!isSectionLocked && (
                            <button
                              type="button"
                              onClick={() => {
                                setTargetAssessmentForCsv(item);
                                setCsvRawText('');
                                setCsvParsedRows([]);
                                setCsvError('');
                                setShowUploadCsvModal(true);
                              }}
                              className="flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-indigo-600"
                              title="Upload CSV or paste marks manually for this assessment"
                            >
                              <Upload className="w-3.5 h-3.5" />
                              Upload CSV
                            </button>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedItemId(item.id);
                            setActiveTab('marks');
                          }}
                          className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700 ml-auto"
                        >
                          Grade / Enter Marks
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                  No individual assessments created in {cat.name} yet.
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 3: STUDENT MARKS ENTRY & SUBMISSION GRADING                 */}
      {/* ============================================================== */}
      {activeTab === 'marks' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Student Marks & Submissions Entry</h2>
                <p className="text-xs text-slate-500">
                  Select an assessment item to record marks or review student assignment submissions.
                </p>
              </div>
            </div>

            {/* Explanation box: What this tab is and why it was created */}
            <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-3.5 text-xs text-indigo-950 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="font-bold text-indigo-900">
                  Detailed Item Grading Desk
                </p>
                <p className="text-slate-600">
                  This tab lets you evaluate <strong>one specific assessment item</strong> at a time (e.g. an Assignment, Quiz, or Exam). You can inspect student submitted files/text, record scores, mark Absent or Excused, and write qualitative teacher feedback.
                </p>
                <p className="text-slate-600">
                  <strong>Looking for overall subject grades?</strong> Switch to <strong>Tab 4: Unified Gradebook Matrix</strong> to see all categories and student weighted contributions side-by-side in a master spreadsheet.
                </p>
              </div>

              {/* Assessment Item Selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500">Assessment:</span>
                <select
                  value={selectedItemId}
                  onChange={(e) => setSelectedItemId(e.target.value)}
                  className="text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">-- Choose Assessment Item --</option>
                  {schemeQuery.data?.categories?.flatMap((c) =>
                    (c.assessments || []).map((item) => (
                      <option key={item.id} value={item.id}>
                        [{c.name}] {item.title} ({item.maxMarks} marks)
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>

            {selectedItemId && marksRosterQuery.data ? (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-indigo-50/60 border border-indigo-100 rounded-xl p-3 text-xs text-indigo-900">
                  <div className="space-y-1">
                    <div>
                      <span className="font-bold">{marksRosterQuery.data.assessment.title}</span> · Maximum Marks:{' '}
                      <span className="font-extrabold">{marksRosterQuery.data.assessment.maxMarks}</span> · Category:{' '}
                      <span className="font-bold">{marksRosterQuery.data.assessment.category?.name}</span>
                    </div>
                    {marksRosterQuery.data.assessment.examSchedule && (
                      <div className="flex items-center gap-2 text-purple-900 font-bold">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                        <span>Connected to Exam: {marksRosterQuery.data.assessment.examSchedule.examSession.name} (Live auto-sync active)</span>
                        <button
                          type="button"
                          title="Sync marks now from Exam Schedule"
                          disabled={syncExamMarksMutation.isPending}
                          onClick={() => syncExamMarksMutation.mutate(marksRosterQuery.data!.assessment.id)}
                          className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold text-purple-700 bg-purple-100 hover:bg-purple-200 rounded transition"
                        >
                          <RefreshCw className={`w-3 h-3 ${syncExamMarksMutation.isPending ? 'animate-spin' : ''}`} />
                          {syncExamMarksMutation.isPending ? 'Syncing...' : 'Sync from Exam Now'}
                        </button>
                      </div>
                    )}
                  </div>

                  {!isSectionLocked && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setTargetAssessmentForCsv(marksRosterQuery.data!.assessment);
                          setCsvRawText('');
                          setCsvParsedRows([]);
                          setCsvError('');
                          setShowUploadCsvModal(true);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-sm transition"
                        title="Upload CSV or paste marks manually"
                      >
                        <Upload className="w-3.5 h-3.5 text-indigo-600" />
                        Upload CSV / Bulk Marks
                      </button>

                      <button
                        type="button"
                        disabled={saveMarksBatchMutation.isPending}
                        onClick={() => saveMarksBatchMutation.mutate()}
                        className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition"
                      >
                        <Save className="w-3.5 h-3.5" />
                        {saveMarksBatchMutation.isPending ? 'Saving...' : 'Save All Marks (Auto-Recalculate)'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Student Roster Table */}
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-50 font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2.5">Roll No</th>
                        <th className="px-3 py-2.5">Admission No</th>
                        <th className="px-3 py-2.5">Student Name</th>
                        <th className="px-3 py-2.5">Submission Details</th>
                        <th className="px-3 py-2.5 w-32">Marks Obtained</th>
                        <th className="px-3 py-2.5 w-24 text-center">Absent</th>
                        <th className="px-3 py-2.5 w-24 text-center">Excused</th>
                        <th className="px-3 py-2.5 w-28 text-center">Weighted Wt.</th>
                        <th className="px-3 py-2.5">Teacher Remarks / Feedback</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {marksRosterQuery.data.students.map((st) => {
                        const draft = marksDrafts[st.id] || {
                          marksObtained: null,
                          isAbsent: false,
                          isExcused: false,
                          remarks: '',
                        };

                        return (
                          <tr key={st.id} className="hover:bg-slate-50/70 transition">
                            <td className="px-3 py-2.5 font-bold text-slate-800">{st.rollNumber || '—'}</td>
                            <td className="px-3 py-2.5 font-mono text-slate-500">{st.admissionNumber}</td>
                            <td className="px-3 py-2.5 font-semibold text-slate-900">
                              {st.user.firstName} {st.user.lastName}
                            </td>

                            {/* Submission status & grading button */}
                            <td className="px-3 py-2.5">
                              {st.submission ? (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${st.submission.status === 'LATE'
                                          ? 'bg-rose-100 text-rose-800'
                                          : st.submission.status === 'GRADED'
                                            ? 'bg-blue-100 text-blue-800'
                                            : 'bg-emerald-100 text-emerald-800'
                                        }`}
                                    >
                                      {st.submission.status}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setGradingSubmission({
                                          id: st.submission!.id,
                                          studentName: `${st.user.firstName} ${st.user.lastName}`,
                                          admissionNumber: st.admissionNumber,
                                          contentText: st.submission?.contentText,
                                          attachmentUrl: st.submission?.attachmentUrl,
                                          currentGrade: st.submission?.grade ?? (draft.marksObtained !== null ? draft.marksObtained : undefined),
                                          currentFeedback: st.submission?.feedback ?? draft.remarks,
                                          maxMarks: marksRosterQuery.data?.assessment.maxMarks ?? 100,
                                        });
                                        setGradeInput(st.submission?.grade ?? draft.marksObtained ?? 0);
                                        setFeedbackInput(st.submission?.feedback ?? draft.remarks ?? '');
                                      }}
                                      className="text-xs text-indigo-600 font-bold hover:underline"
                                    >
                                      Grade Work
                                    </button>
                                  </div>
                                  {st.submittedAt && (
                                    <div className="text-[10px] text-slate-400">
                                      {new Date(st.submittedAt).toLocaleDateString()}{' '}
                                      {new Date(st.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-400 italic">No submission</span>
                              )}
                            </td>

                            {/* Marks input */}
                            <td className="px-3 py-2.5">
                              <input
                                type="number"
                                min="0"
                                max={marksRosterQuery.data?.assessment.maxMarks ?? 100}
                                step="0.5"
                                disabled={isSectionLocked || draft.isAbsent || draft.isExcused}
                                value={draft.marksObtained ?? ''}
                                onChange={(e) => {
                                  const val = e.target.value === '' ? null : Number(e.target.value);
                                  setMarksDrafts((prev) => ({
                                    ...prev,
                                    [st.id]: { ...prev[st.id], marksObtained: val },
                                  }));
                                }}
                                placeholder="Marks"
                                className="w-24 text-xs font-bold text-slate-900 bg-white border border-slate-300 rounded px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-40"
                              />
                            </td>

                            {/* Absent toggle */}
                            <td className="px-3 py-2.5 text-center">
                              <input
                                type="checkbox"
                                disabled={isSectionLocked || draft.isExcused}
                                checked={draft.isAbsent}
                                onChange={(e) => {
                                  setMarksDrafts((prev) => ({
                                    ...prev,
                                    [st.id]: {
                                      ...prev[st.id],
                                      isAbsent: e.target.checked,
                                      marksObtained: e.target.checked ? 0 : prev[st.id]?.marksObtained,
                                    },
                                  }));
                                }}
                                className="rounded text-rose-600 focus:ring-rose-500"
                              />
                            </td>

                            {/* Excused toggle */}
                            <td className="px-3 py-2.5 text-center">
                              <input
                                type="checkbox"
                                disabled={isSectionLocked || draft.isAbsent}
                                checked={draft.isExcused}
                                onChange={(e) => {
                                  setMarksDrafts((prev) => ({
                                    ...prev,
                                    [st.id]: {
                                      ...prev[st.id],
                                      isExcused: e.target.checked,
                                      marksObtained: e.target.checked ? null : prev[st.id]?.marksObtained,
                                    },
                                  }));
                                }}
                                className="rounded text-amber-600 focus:ring-amber-500"
                              />
                            </td>

                            {/* Weighted Contribution */}
                            <td className="px-3 py-2.5 text-center font-semibold text-indigo-700">
                              {st.weightedContribution !== undefined && st.weightedContribution !== null
                                ? `${st.weightedContribution}%`
                                : '—'}
                            </td>

                            {/* Remarks */}
                            <td className="px-3 py-2.5">
                              <input
                                type="text"
                                disabled={isSectionLocked}
                                value={draft.remarks || ''}
                                onChange={(e) => {
                                  setMarksDrafts((prev) => ({
                                    ...prev,
                                    [st.id]: { ...prev[st.id], remarks: e.target.value },
                                  }));
                                }}
                                placeholder="Remarks"
                                className="w-full text-xs text-slate-600 bg-white border border-slate-200 rounded px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-slate-500 space-y-3">
                <AlertCircle className="w-8 h-8 text-indigo-400 mx-auto" />
                <p className="font-semibold text-slate-700">No Assessment Item Selected</p>
                <p className="max-w-md mx-auto text-slate-500">
                  Please select an assessment item from the dropdown above to record marks, or add a new assessment item under your scheme in Tab 2.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (schemeQuery.data?.categories?.[0]) {
                      setNewItemCategoryId(schemeQuery.data.categories[0].id || "");
                    }
                    setShowItemModal(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition"
                >
                  <Plus className="w-4 h-4" />
                  Create Assessment Item
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 4: UNIFIED TEACHER GRADEBOOK MATRIX (LIVE WEIGHTED ENGINE) */}
      {/* ============================================================== */}
      {activeTab === 'gradebook' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
            {/* Toolbar & Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-5">
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="flex items-center gap-2">
                    <Table className="w-5 h-5 text-indigo-600" />
                    <h2 className="text-lg font-black text-slate-900 tracking-tight">
                      Unified Teacher Gradebook Matrix
                    </h2>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${sectionStatus === 'OFFICIALLY_PUBLISHED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : sectionStatus === 'SUBMITTED_TO_EXAM_DEPARTMENT'
                          ? 'bg-amber-100 text-amber-800'
                          : sectionStatus === 'SUBMITTED_TO_STUDENTS'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-slate-100 text-slate-800'
                      }`}
                  >
                    Status: {sectionStatus}
                  </span>
                  {isSectionLocked && (
                    <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900">
                      <Lock className="w-3 h-3 text-amber-700" />
                      Locked
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Single authoritative academic gradebook: Live weighted contributions <code className="font-mono text-indigo-700 bg-indigo-50 px-1 py-0.5 rounded">(Obtained / Max) × Weightage</code> across LMS assignments and exams.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Bulk Upload Marks CSV Button */}
                {!isSectionLocked && (
                  <button
                    type="button"
                    onClick={() => {
                      setTargetAssessmentForCsv(null);
                      setCsvRawText('');
                      setCsvParsedRows([]);
                      setCsvError('');
                      setShowUploadCsvModal(true);
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition shadow-sm"
                    title="Upload marks via CSV or paste format for any assessment item"
                  >
                    <Upload className="w-4 h-4 text-indigo-600" />
                    Bulk Upload Marks (CSV)
                  </button>
                )}

                {/* Save All Changes Button */}
                {!isSectionLocked && (
                  <button
                    type="button"
                    disabled={unsavedGradebookCount === 0 || saveGradebookMutation.isPending}
                    onClick={() => saveGradebookMutation.mutate()}
                    className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition shadow-sm ${unsavedGradebookCount > 0
                        ? 'bg-indigo-600 hover:bg-indigo-700 text-white animate-pulse'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      }`}
                  >
                    <Save className="w-4 h-4" />
                    {saveGradebookMutation.isPending
                      ? 'Saving...'
                      : unsavedGradebookCount > 0
                        ? `Save Changes (${unsavedGradebookCount})`
                        : 'All Saved'}
                  </button>
                )}

                {/* Two-Button Submissions */}
                {!isSectionLocked && (
                  <>
                    {/* BUTTON A */}
                    <button
                      type="button"
                      disabled={submitToStudentsMutation.isPending}
                      onClick={() => submitToStudentsMutation.mutate()}
                      className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition shadow-sm"
                      title="Publish provisional marks to students (Status: GRADE IN PROGRESS). Teacher editing remains unlocked."
                    >
                      <Send className="w-4 h-4" />
                      {submitToStudentsMutation.isPending ? 'Publishing...' : 'Button A: Submit (To Students)'}
                    </button>

                    {/* BUTTON B */}
                    <button
                      type="button"
                      onClick={() => setShowExamDeptConfirmModal(true)}
                      className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition shadow-sm"
                      title="Forward to Examination Department for official review. Locks teacher editing."
                    >
                      <Lock className="w-4 h-4" />
                      Button B: Submit to Exam Dept
                    </button>
                  </>
                )}

                {/* If locked, Request Correction button */}
                {isSectionLocked && (
                  <button
                    type="button"
                    onClick={() => {
                      if (resultsQuery.data?.results?.[0]) {
                        setCorrectionTarget(resultsQuery.data.results[0]);
                        setProposedMarks(resultsQuery.data.results[0].totalPercentage);
                        setShowCorrectionModal(true);
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-xl transition shadow-sm"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Request Official Correction
                  </button>
                )}
              </div>
            </div>

            {/* Matrix Table */}
            {gradebookQuery.isLoading ? (
              <div className="py-16 text-center text-xs text-slate-400">
                Loading unified gradebook matrix and weighted contributions...
              </div>
            ) : !gradebookQuery.data || gradebookColumns.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500 space-y-2">
                <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
                <p className="font-semibold text-slate-700">No assessment components configured yet.</p>
                <p>Configure assessment scheme categories and items in Tabs 1 and 2 to view the gradebook.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-inner">
                  <table className="w-full text-left text-xs text-slate-700 border-collapse">
                    <thead className="bg-slate-50 font-bold uppercase tracking-wider text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-3 w-14 text-center sticky left-0 bg-slate-50 z-10 border-r border-slate-200">
                          Roll #
                        </th>
                        <th className="px-3 py-3 min-w-[180px] sticky left-14 bg-slate-50 z-10 border-r border-slate-200">
                          Student Name
                        </th>
                        {gradebookColumns.map((col) => (
                          <th key={col.id} className="px-3 py-3 min-w-[150px] text-center border-r border-slate-200">
                            <div className="flex flex-wrap items-center justify-center gap-1">
                              <span className="font-extrabold text-slate-900">{col.title}</span>
                              {col.isLmsAssignment && (
                                <span className="inline-block bg-indigo-100 text-indigo-700 text-[9px] font-black px-1.5 py-0.5 rounded uppercase" title="LMS Assignment">
                                  LMS
                                </span>
                              )}
                              {col.examScheduleId && (
                                <span className="inline-block bg-purple-100 text-purple-800 text-[9px] font-black px-1.5 py-0.5 rounded uppercase" title={`Auto-synced with Exam Schedule: ${col.examSessionName || 'Exam'}`}>
                                  Exam Sync
                                </span>
                              )}
                              {col.isPublished ? (
                                <span className="inline-block bg-emerald-100 text-emerald-800 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase" title="Published to students">
                                  Published
                                </span>
                              ) : (
                                <span className="inline-block bg-slate-100 text-slate-600 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase" title="Draft / Unpublished">
                                  Draft
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-indigo-600 font-extrabold mt-0.5">
                              {col.weightagePercentage}% Wt · Max {col.maxMarks}
                            </div>
                            <div className="text-[9px] text-slate-400 lowercase font-normal flex items-center justify-center gap-1 mt-0.5">
                              <span>{col.categoryName}</span>
                              {!isSectionLocked && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const item = schemeQuery.data?.categories
                                      ?.flatMap((c) => c.assessments || [])
                                      ?.find((a) => a.id === col.id);
                                    setTargetAssessmentForCsv(
                                      item ||
                                      ({
                                        id: col.id,
                                        title: col.title,
                                        maxMarks: col.maxMarks,
                                        category: { name: col.categoryName },
                                      } as any)
                                    );
                                    setCsvRawText('');
                                    setCsvParsedRows([]);
                                    setCsvError('');
                                    setShowUploadCsvModal(true);
                                  }}
                                  className="text-slate-400 hover:text-indigo-600 p-0.5 rounded hover:bg-slate-200/50 transition"
                                  title={`Upload CSV marks for ${col.title}`}
                                >
                                  <Upload className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </div>
                          </th>
                        ))}
                        <th className="px-3 py-3 w-28 text-center bg-indigo-50/70 border-r border-indigo-200 text-indigo-950 font-black">
                          Total Wt.
                          <div className="text-[10px] text-indigo-600 font-normal">out of 100%</div>
                        </th>
                        <th className="px-3 py-3 w-20 text-center bg-indigo-50/70 border-r border-indigo-200 text-indigo-950 font-black">
                          Grade
                          <div className="text-[10px] text-indigo-600 font-normal">Letter</div>
                        </th>
                        <th className="px-3 py-3 w-16 text-center bg-indigo-50/70 border-r border-indigo-200 text-indigo-950 font-black">
                          GPA
                          <div className="text-[10px] text-indigo-600 font-normal">Point</div>
                        </th>
                        <th className="px-3 py-3 w-28 text-center bg-slate-100/70 text-slate-800 font-bold">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {gradebookStudents.map((st) => {
                        const liveStats = calculateStudentLiveStats(st, gradebookColumns);

                        return (
                          <tr key={st.studentId} className="hover:bg-indigo-50/30 transition">
                            {/* Sticky Roll No */}
                            <td className="px-3 py-2.5 text-center font-bold text-slate-800 sticky left-0 bg-white z-10 border-r border-slate-200">
                              {st.rollNumber || '—'}
                            </td>

                            {/* Sticky Student Name & Admission Number */}
                            <td className="px-3 py-2.5 font-semibold text-slate-900 sticky left-14 bg-white z-10 border-r border-slate-200">
                              <div>{st.studentName}</div>
                              <div className="text-[10px] text-slate-400 font-mono">{st.admissionNumber}</div>
                            </td>

                            {/* Marks per column */}
                            {gradebookColumns.map((col) => {
                              const cellDraft = getStudentItemMark(st.studentId, col.id, st.marks[col.id]);
                              const isDirty = gradebookDrafts[`${st.studentId}:${col.id}`] !== undefined;
                              const contribution = computeCellContribution(
                                cellDraft.marksObtained,
                                col.maxMarks,
                                col.weightagePercentage,
                                cellDraft.isAbsent,
                                cellDraft.isExcused
                              );

                              return (
                                <td
                                  key={col.id}
                                  className={`px-2.5 py-2 text-center border-r border-slate-200 transition ${isDirty ? 'bg-amber-50/60' : ''
                                    }`}
                                >
                                  <div className="flex flex-col items-center gap-1">
                                    <div className="flex items-center gap-1">
                                      <input
                                        type="number"
                                        min="0"
                                        max={col.maxMarks}
                                        step="0.5"
                                        disabled={isSectionLocked || cellDraft.isAbsent || cellDraft.isExcused}
                                        value={
                                          cellDraft.marksObtained === null || cellDraft.marksObtained === undefined
                                            ? ''
                                            : cellDraft.marksObtained
                                        }
                                        onChange={(e) => {
                                          const val = e.target.value === '' ? null : Number(e.target.value);
                                          setGradebookDrafts((prev) => ({
                                            ...prev,
                                            [`${st.studentId}:${col.id}`]: {
                                              ...cellDraft,
                                              marksObtained: val,
                                            },
                                          }));
                                        }}
                                        placeholder="—"
                                        className={`w-16 text-center text-xs font-bold text-slate-900 rounded px-1.5 py-1 border transition focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-40 ${isDirty
                                            ? 'border-amber-400 bg-amber-50'
                                            : 'border-slate-300 bg-white'
                                          }`}
                                      />
                                      <span className="text-[10px] text-slate-400 font-medium">/{col.maxMarks}</span>
                                    </div>

                                    {/* Weighted Contribution badge */}
                                    <div className="flex items-center gap-1 text-[10px]">
                                      <span className="font-bold text-indigo-700 bg-indigo-50 px-1 py-0.2 rounded">
                                        {contribution.toFixed(2)}%
                                      </span>
                                      <span className="text-slate-400">of {col.weightagePercentage}%</span>
                                    </div>

                                    {/* Absent / Excused quick buttons */}
                                    <div className="flex items-center gap-1 text-[9px]">
                                      <label className="flex items-center gap-0.5 cursor-pointer text-slate-500 hover:text-rose-600">
                                        <input
                                          type="checkbox"
                                          disabled={isSectionLocked}
                                          checked={cellDraft.isAbsent}
                                          onChange={(e) => {
                                            setGradebookDrafts((prev) => ({
                                              ...prev,
                                              [`${st.studentId}:${col.id}`]: {
                                                ...cellDraft,
                                                isAbsent: e.target.checked,
                                                isExcused: e.target.checked ? false : cellDraft.isExcused,
                                                marksObtained: e.target.checked ? 0 : cellDraft.marksObtained,
                                              },
                                            }));
                                          }}
                                          className="w-2.5 h-2.5 text-rose-600 rounded"
                                        />
                                        Abs
                                      </label>
                                      <label className="flex items-center gap-0.5 cursor-pointer text-slate-500 hover:text-amber-600">
                                        <input
                                          type="checkbox"
                                          disabled={isSectionLocked}
                                          checked={cellDraft.isExcused}
                                          onChange={(e) => {
                                            setGradebookDrafts((prev) => ({
                                              ...prev,
                                              [`${st.studentId}:${col.id}`]: {
                                                ...cellDraft,
                                                isExcused: e.target.checked,
                                                isAbsent: e.target.checked ? false : cellDraft.isAbsent,
                                                marksObtained: e.target.checked ? null : cellDraft.marksObtained,
                                              },
                                            }));
                                          }}
                                          className="w-2.5 h-2.5 text-amber-600 rounded"
                                        />
                                        Exc
                                      </label>
                                    </div>
                                  </div>
                                </td>
                              );
                            })}

                            {/* Total Weighted Score */}
                            <td className="px-3 py-2.5 text-center bg-indigo-50/40 border-r border-indigo-200">
                              <span className="text-sm font-black text-indigo-950">
                                {liveStats.totalWeighted.toFixed(2)}%
                              </span>
                            </td>

                            {/* Letter Grade */}
                            <td className="px-3 py-2.5 text-center bg-indigo-50/40 border-r border-indigo-200">
                              <span className="inline-block px-2 py-0.5 rounded text-xs font-black bg-indigo-100 text-indigo-800">
                                {liveStats.letter}
                              </span>
                            </td>

                            {/* GPA */}
                            <td className="px-3 py-2.5 text-center bg-indigo-50/40 border-r border-indigo-200 font-bold text-slate-800">
                              {liveStats.gpa.toFixed(2)}
                            </td>

                            {/* Status */}
                            <td className="px-3 py-2.5 text-center bg-slate-50/50">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${st.status === 'OFFICIALLY_PUBLISHED'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : st.status === 'SUBMITTED_TO_EXAM_DEPARTMENT'
                                      ? 'bg-amber-100 text-amber-800'
                                      : st.status === 'SUBMITTED_TO_STUDENTS'
                                        ? 'bg-blue-100 text-blue-800'
                                        : 'bg-slate-100 text-slate-700'
                                  }`}
                              >
                                {st.status === 'SUBMITTED_TO_STUDENTS' ? 'GRADE IN PROGRESS' : st.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>

                    {/* Summary Statistics Footer */}
                    <tfoot className="bg-slate-100 font-bold text-xs text-slate-800 border-t-2 border-slate-300">
                      <tr>
                        <td colSpan={2} className="px-4 py-3 sticky left-0 bg-slate-100 z-10 border-r border-slate-300 font-black">
                          Class Average & Metrics
                        </td>
                        {gradebookColumns.map((col) => {
                          const avg = gradebookStats.columnAverages?.[col.id];
                          return (
                            <td key={col.id} className="px-3 py-3 text-center border-r border-slate-300">
                              <div className="font-extrabold text-slate-900">
                                {avg !== undefined ? avg.toFixed(1) : '—'} / {col.maxMarks}
                              </div>
                              <div className="text-[10px] text-indigo-700">
                                {avg !== undefined
                                  ? `${((avg / (col.maxMarks || 1)) * col.weightagePercentage).toFixed(2)}% wt`
                                  : '—'}
                              </div>
                            </td>
                          );
                        })}
                        <td className="px-3 py-3 text-center bg-indigo-100/70 border-r border-indigo-300 font-black text-indigo-950">
                          {gradebookStats.classAverageTotal.toFixed(2)}%
                        </td>
                        <td colSpan={3} className="px-3 py-3 text-center bg-indigo-100/70 font-semibold text-slate-700">
                          Pass Rate: <span className="font-black text-emerald-700">{gradebookStats.passRatePercent.toFixed(1)}%</span> · High: <span className="font-bold">{gradebookStats.highestTotal.toFixed(1)}%</span> · Low: <span className="font-bold">{gradebookStats.lowestTotal.toFixed(1)}%</span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* KPI Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Enrolled Students</p>
                    <p className="text-xl font-black text-slate-900 mt-0.5">
                      {gradebookStats.totalStudents}
                    </p>
                  </div>
                  <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-center">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Class Average</p>
                    <p className="text-xl font-black text-indigo-950 mt-0.5">
                      {gradebookStats.classAverageTotal.toFixed(2)}%
                    </p>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">Pass Rate</p>
                    <p className="text-xl font-black text-emerald-900 mt-0.5">
                      {gradebookStats.passRatePercent.toFixed(1)}%
                    </p>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600">Score Range</p>
                    <p className="text-sm font-black text-amber-950 mt-1.5">
                      {gradebookStats.lowestTotal.toFixed(1)}% — {gradebookStats.highestTotal.toFixed(1)}%
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 5: AUTOMATIC WEIGHTED RESULTS & THE TWO SUBMISSION BUTTONS */}
      {/* ============================================================== */}
      {activeTab === 'results' && (
        <div className="space-y-6">
          {/* Exam Department Moderation Console */}
          {isExamDept && (
            <div className="bg-slate-900 text-white rounded-2xl p-5 space-y-4 shadow-lg border border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-indigo-400" />
                    <h3 className="font-black text-sm text-white uppercase tracking-wider">
                      Examination Department Moderation & Approval Console
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Review forwarded section results, conduct grade moderation, and officially publish results to student transcripts.
                  </p>
                </div>

                <div className="flex items-center gap-2.5">
                  {sectionStatus === 'SUBMITTED_TO_EXAM_DEPARTMENT' && (
                    <>
                      <button
                        type="button"
                        disabled={examDeptReviewMutation.isPending}
                        onClick={() => {
                          if (!currentAssignment) return;
                          examDeptReviewMutation.mutate({
                            subjectId: currentAssignment.subjectId,
                            sectionId: currentAssignment.sectionId,
                            academicTermId: currentAssignment.academicTermId,
                            status: 'OFFICIALLY_PUBLISHED',
                            notes: 'Approved and officially published by Examination Department',
                          });
                        }}
                        className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition shadow-sm"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        {examDeptReviewMutation.isPending ? 'Publishing...' : 'Approve & Officially Publish'}
                      </button>

                      <button
                        type="button"
                        disabled={examDeptReviewMutation.isPending}
                        onClick={() => {
                          if (!currentAssignment) return;
                          examDeptReviewMutation.mutate({
                            subjectId: currentAssignment.subjectId,
                            sectionId: currentAssignment.sectionId,
                            academicTermId: currentAssignment.academicTermId,
                            status: 'RETURNED_FOR_CORRECTION',
                            notes: 'Returned by Examination Department for teacher review and correction',
                          });
                        }}
                        className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-rose-300 bg-rose-950/80 hover:bg-rose-900 border border-rose-800 rounded-xl transition shadow-sm"
                      >
                        <RotateCcw className="w-4 h-4" />
                        Return to Teacher
                      </button>
                    </>
                  )}

                  {sectionStatus === 'OFFICIALLY_PUBLISHED' && (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Officially Published to Transcripts
                    </span>
                  )}
                </div>
              </div>

              {/* Submissions queue from other sections */}
              {examDeptQuery.data?.submissions && examDeptQuery.data.submissions.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    All Institution Section Submissions ({examDeptQuery.data.submissions.length}):
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {examDeptQuery.data.submissions.map((sub, idx) => {
                      const isCurrent =
                        currentAssignment &&
                        currentAssignment.subjectId === sub.subjectId &&
                        currentAssignment.sectionId === sub.sectionId &&
                        currentAssignment.academicTermId === sub.academicTermId;

                      return (
                        <div
                          key={idx}
                          onClick={() => {
                            const matchIndex = assignmentsQuery.data?.findIndex(
                              (a) =>
                                a.subjectId === sub.subjectId &&
                                a.sectionId === sub.sectionId &&
                                a.academicTermId === sub.academicTermId
                            );
                            if (matchIndex !== undefined && matchIndex !== -1) {
                              setSelectedAssignmentIndex(matchIndex);
                            }
                          }}
                          className={`p-3 rounded-xl border text-xs cursor-pointer transition ${isCurrent
                              ? 'bg-indigo-950/70 border-indigo-500 text-white'
                              : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800'
                            }`}
                        >
                          <div className="font-bold flex items-center justify-between">
                            <span>{sub.subjectName}</span>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded font-black uppercase ${sub.status === 'OFFICIALLY_PUBLISHED'
                                  ? 'bg-emerald-900 text-emerald-200'
                                  : sub.status === 'SUBMITTED_TO_EXAM_DEPARTMENT'
                                    ? 'bg-amber-900 text-amber-200'
                                    : 'bg-slate-700 text-slate-300'
                                }`}
                            >
                              {sub.status}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-1">
                            {sub.className} ({sub.sectionName}) · {sub.studentsCount} Students
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-900">Automatic Course Weighted Results</h2>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${sectionStatus === 'OFFICIALLY_PUBLISHED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : sectionStatus === 'SUBMITTED_TO_EXAM_DEPARTMENT'
                          ? 'bg-amber-100 text-amber-800'
                          : sectionStatus === 'SUBMITTED_TO_STUDENTS'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-slate-100 text-slate-800'
                      }`}
                  >
                    Status: {sectionStatus}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Category contributions are calculated automatically based on configured weightages.
                </p>
              </div>

              {/* TWO SEPARATE TEACHER SUBMISSION BUTTONS */}
              {!isSectionLocked && (
                <div className="flex items-center gap-3">
                  {/* BUTTON A: Submit (Publish to Students) */}
                  <button
                    type="button"
                    disabled={submitToStudentsMutation.isPending}
                    onClick={() => submitToStudentsMutation.mutate()}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition shadow-sm"
                    title="Publish current provisional marks to students (teacher editing remains unlocked)"
                  >
                    <Send className="w-4 h-4" />
                    {submitToStudentsMutation.isPending ? 'Publishing...' : 'Button A: Submit (To Students)'}
                  </button>

                  {/* BUTTON B: Submit to Exam Department */}
                  <button
                    type="button"
                    onClick={() => setShowExamDeptConfirmModal(true)}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition shadow-sm"
                    title="Formally forward to Exam Department and lock teacher editing"
                  >
                    <Lock className="w-4 h-4" />
                    Button B: Submit to Exam Department
                  </button>
                </div>
              )}
            </div>

            {/* Results Table with category breakdown */}
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-3">Roll No</th>
                    <th className="px-3 py-3">Student Name</th>
                    {resultsQuery.data?.scheme?.categories?.map((cat) => (
                      <th key={cat.id} className="px-3 py-3 text-center">
                        {cat.name}
                        <div className="text-[10px] text-indigo-600 font-extrabold lowercase">
                          ({cat.weightagePercentage}%)
                        </div>
                      </th>
                    ))}
                    <th className="px-3 py-3 text-center bg-slate-100/70">Final Score</th>
                    <th className="px-3 py-3 text-center bg-slate-100/70">Letter Grade</th>
                    <th className="px-3 py-3 text-center bg-slate-100/70">GPA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {resultsQuery.data?.results?.map((res) => (
                    <tr key={res.id} className="hover:bg-slate-50/70 transition">
                      <td className="px-3 py-2.5 font-bold text-slate-800">{res.student.rollNumber || '—'}</td>
                      <td className="px-3 py-2.5 font-semibold text-slate-900">
                        {res.student.user.firstName} {res.student.user.lastName}
                        <div className="text-[10px] text-slate-400 font-mono">{res.student.admissionNumber}</div>
                      </td>

                      {/* Category contributions */}
                      {res.categoryBreakdown?.map((cb, idx) => (
                        <td key={idx} className="px-3 py-2.5 text-center">
                          <span className="font-bold text-slate-900">{cb.contribution.toFixed(2)}</span>
                          <span className="text-[10px] text-slate-400">/{cb.weightage}</span>
                          <div className="text-[10px] text-slate-500">
                            Avg: {cb.averagePercentage.toFixed(1)}%
                          </div>
                        </td>
                      ))}

                      <td className="px-3 py-2.5 text-center bg-slate-50 font-extrabold text-slate-900">
                        {res.totalPercentage.toFixed(2)}%
                      </td>
                      <td className="px-3 py-2.5 text-center bg-slate-50 font-extrabold text-indigo-600 text-sm">
                        {res.gradeLetter}
                      </td>
                      <td className="px-3 py-2.5 text-center bg-slate-50 font-bold text-slate-700">
                        {res.gpa !== null ? res.gpa.toFixed(2) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 5: STUDENT & PARENT VIEW                                    */}
      {/* ============================================================== */}
      {activeTab === 'student_view' && (
        <div className="space-y-6">
          {/* Enrolled Subject Selector for Students & Parents */}
          {studentSubjectsQuery.data && studentSubjectsQuery.data.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-indigo-600" />
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                  Enrolled Subject:
                </span>
              </div>
              <select
                value={selectedStudentSubjectIndex}
                onChange={(e) => setSelectedStudentSubjectIndex(Number(e.target.value))}
                className="text-sm font-semibold text-slate-800 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {studentSubjectsQuery.data.map((subj, idx) => (
                  <option key={`${subj.subjectId}-${subj.academicTermId}`} value={idx}>
                    {subj.subjectName} ({subj.subjectCode}) — {subj.className} · {subj.termName} {subj.isPublished ? '✓ (Published)' : '(Pending)'}
                  </option>
                ))}
              </select>
            </div>
          )}

          {studentResultQuery.data ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">
                    {studentResultQuery.data.subject?.name} ({studentResultQuery.data.subject?.code})
                  </h2>
                  <p className="text-xs text-slate-500">
                    Term: {studentResultQuery.data.academicTerm?.name} · Continuous Assessment & Course Performance
                  </p>
                </div>

                {/* Grade in progress or official final grade badge */}
                {studentResultQuery.data.gradeInProgress ? (
                  <div className="px-4 py-2 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-600 animate-spin" />
                    <span className="font-extrabold uppercase tracking-wider text-xs">
                      GRADE IN PROGRESS
                    </span>
                  </div>
                ) : (
                  <div className="px-4 py-2 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900 flex items-center gap-3">
                    <div>
                      <div className="text-[10px] font-bold uppercase text-indigo-500">Subject Grade</div>
                      <div className="text-xl font-black text-indigo-700">
                        {studentResultQuery.data.displayGrade}
                      </div>
                    </div>
                    {studentResultQuery.data.gpa !== null && (
                      <div className="border-l border-indigo-200 pl-3">
                        <div className="text-[10px] font-bold uppercase text-indigo-500">GPA</div>
                        <div className="text-xl font-black text-slate-800">
                          {studentResultQuery.data.gpa.toFixed(2)}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Notice */}
              {studentResultQuery.data.notice && (
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600">
                  {studentResultQuery.data.notice}
                </div>
              )}

              {/* Category Breakdown Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {studentResultQuery.data.categoryBreakdown?.map((cb: any, idx: number) => (
                  <div key={idx} className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-slate-900 text-sm">{cb.categoryName}</h4>
                      <span className="text-xs font-extrabold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                        Weight: {cb.weightage}%
                      </span>
                    </div>

                    <div className="text-xs text-slate-600 flex justify-between">
                      <span>Category Average:</span>
                      <span className="font-bold text-slate-900">{cb.averagePercentage.toFixed(1)}%</span>
                    </div>

                    <div className="text-xs text-slate-600 flex justify-between border-t border-slate-200 pt-2 font-semibold">
                      <span>Weighted Contribution:</span>
                      <span className="text-indigo-700 font-extrabold">
                        {cb.contribution.toFixed(2)} / {cb.weightage}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Published Assessment items and Submissions */}
              {studentResultQuery.data.assessmentScheme?.categories && (
                <div className="space-y-4 pt-4 border-t border-slate-100">
                  <h3 className="font-bold text-slate-900 text-sm">Published Assessments & Submissions</h3>
                  {studentResultQuery.data.assessmentScheme.categories.map((cat: any) => (
                    <div key={cat.id} className="space-y-2">
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide">{cat.name}</h4>
                      <div className="space-y-2">
                        {cat.assessments?.map((item: any) => {
                          const mark = item.marks?.[0];
                          return (
                            <div
                              key={item.id}
                              className="border border-slate-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white"
                            >
                              <div>
                                <span className="font-bold text-slate-900 text-xs">{item.title}</span>
                                {item.dueDate && (
                                  <span className="text-[11px] text-slate-400 ml-2">
                                    (Due: {new Date(item.dueDate).toLocaleDateString()})
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-3">
                                {mark ? (
                                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded">
                                    Score: {mark.marksObtained ?? 0} / {item.maxMarks}
                                  </span>
                                ) : (
                                  <span className="text-xs text-slate-400 italic">Not graded yet</span>
                                )}

                                {isStudent && (
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="text"
                                      placeholder="Paste URL or response"
                                      value={submissionContentText}
                                      onChange={(e) => setSubmissionContentText(e.target.value)}
                                      className="text-xs border border-slate-200 rounded px-2 py-1 w-36"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => submitStudentWorkMutation.mutate(item.id)}
                                      className="text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-2.5 py-1 rounded"
                                    >
                                      Submit
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500 text-sm">
              No published assessment results available for this subject yet.
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: CREATE ASSESSMENT ITEM                                  */}
      {/* ============================================================== */}
      {showItemModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Create Assessment Item</h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Title</label>
                <input
                  type="text"
                  placeholder="e.g. Assignment 1: Data Structures"
                  value={newItemTitle}
                  onChange={(e) => setNewItemTitle(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Maximum Marks</label>
                  <input
                    type="number"
                    min="1"
                    value={newItemMaxMarks}
                    onChange={(e) => setNewItemMaxMarks(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Due Date</label>
                  <input
                    type="datetime-local"
                    value={newItemDueDate}
                    onChange={(e) => setNewItemDueDate(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Connect to Term Exam Schedule (Optional)
                </label>
                <select
                  value={newItemExamScheduleId}
                  onChange={(e) => setNewItemExamScheduleId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs bg-slate-50 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">-- None / Standalone Assessment Item --</option>
                  {examSchedulesQuery.data?.map((sch) => (
                    <option key={sch.id} value={sch.id}>
                      {sch.sessionName || sch.examSession?.name || 'Exam'} · {new Date(sch.examDate).toLocaleDateString()} ({sch.startTime || 'TBD'}) [Max: {sch.maxMarks}, Pass: {sch.passMarks || sch.passingMarks || 40}]
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-500">
                  Select an exam schedule (e.g. Midterm or Final) to automatically link exam marks and sync live into student grades.
                </p>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Instructions / Description</label>
                <textarea
                  rows={3}
                  placeholder="Provide assignment guidelines or submission criteria..."
                  value={newItemInstructions}
                  onChange={(e) => setNewItemInstructions(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Attachment / Reference URL</label>
                <input
                  type="text"
                  placeholder="https://..."
                  value={newItemAttachmentUrl}
                  onChange={(e) => setNewItemAttachmentUrl(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowItemModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!newItemTitle || createItemMutation.isPending}
                onClick={() => createItemMutation.mutate()}
                className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg"
              >
                {createItemMutation.isPending ? 'Creating...' : 'Create Assessment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: EDIT ASSESSMENT ITEM                                    */}
      {/* ============================================================== */}
      {showEditItemModal && editingItem && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Pencil className="w-5 h-5 text-amber-500" />
                Edit Assessment Item
              </h3>
              <button
                type="button"
                onClick={() => setShowEditItemModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Title</label>
                <input
                  type="text"
                  value={editItemTitle}
                  onChange={(e) => setEditItemTitle(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {schemeQuery.data?.categories && schemeQuery.data.categories.length > 1 && (
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Assessment Category</label>
                  <select
                    value={editItemCategoryId}
                    onChange={(e) => setEditItemCategoryId(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs bg-slate-50 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {schemeQuery.data.categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name} ({cat.weightagePercentage}% weightage)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Maximum Marks</label>
                  <input
                    type="number"
                    min="1"
                    value={editItemMaxMarks}
                    onChange={(e) => setEditItemMaxMarks(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Due Date</label>
                  <input
                    type="datetime-local"
                    value={editItemDueDate}
                    onChange={(e) => setEditItemDueDate(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Connect to Term Exam Schedule (Optional)
                </label>
                <select
                  value={editItemExamScheduleId}
                  onChange={(e) => setEditItemExamScheduleId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs bg-slate-50 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">-- None / Standalone Assessment Item --</option>
                  {examSchedulesQuery.data?.map((sch) => (
                    <option key={sch.id} value={sch.id}>
                      {sch.sessionName || sch.examSession?.name || 'Exam'} · {new Date(sch.examDate).toLocaleDateString()} ({sch.startTime || 'TBD'}) [Max: {sch.maxMarks}, Pass: {sch.passMarks || sch.passingMarks || 40}]
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-500">
                  Easily link this assessment to the examination timetable. Changing or setting an exam automatically syncs marks for your students.
                </p>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Instructions / Description</label>
                <textarea
                  rows={3}
                  value={editItemInstructions}
                  onChange={(e) => setEditItemInstructions(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Attachment / Reference URL</label>
                <input
                  type="text"
                  placeholder="https://..."
                  value={editItemAttachmentUrl}
                  onChange={(e) => setEditItemAttachmentUrl(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowEditItemModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!editItemTitle || updateItemMutation.isPending}
                onClick={() => updateItemMutation.mutate()}
                className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-lg shadow-sm transition"
              >
                {updateItemMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: DELETE ASSESSMENT ITEM                                  */}
      {/* ============================================================== */}
      {showDeleteItemModal && deletingItem && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2 bg-rose-100 rounded-xl">
                <Trash2 className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete Assessment Item</h3>
                <p className="text-xs text-slate-500">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-slate-700 leading-relaxed">
              Are you sure you want to delete <span className="font-bold text-slate-900">"{deletingItem.title}"</span>?
              All student marks, submissions, and deadline histories recorded for this assessment will be permanently deleted, and student subject results will be recalculated.
            </p>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteItemModal(false);
                  setDeletingItem(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteItemMutation.isPending}
                onClick={() => deleteItemMutation.mutate()}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-lg shadow-sm transition"
              >
                {deleteItemMutation.isPending ? 'Deleting...' : 'Delete Assessment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: EXTEND ASSESSMENT DEADLINE (WITH AUDIT LOG)              */}
      {/* ============================================================== */}
      {showDeadlineModal && deadlineItem && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Extend Assignment Deadline</h3>
            <p className="text-xs text-slate-500">
              Extending the deadline preserves existing student submissions and logs the change reason.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Current Due Date</label>
                <div className="p-2 bg-slate-50 rounded-lg text-slate-600 font-mono">
                  {deadlineItem.dueDate
                    ? new Date(deadlineItem.dueDate).toLocaleString()
                    : 'No due date set'}
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">New Due Date</label>
                <input
                  type="datetime-local"
                  value={newDueDateValue}
                  onChange={(e) => setNewDueDateValue(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Reason for Extension (Required)</label>
                <textarea
                  rows={3}
                  placeholder="e.g. Granted 48h extension due to technical lab downtime..."
                  value={deadlineReason}
                  onChange={(e) => setDeadlineReason(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowDeadlineModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!newDueDateValue || deadlineReason.length < 5 || extendDeadlineMutation.isPending}
                onClick={() => extendDeadlineMutation.mutate()}
                className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg"
              >
                {extendDeadlineMutation.isPending ? 'Updating...' : 'Save & Extend'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: GRADE STUDENT SUBMISSION                                */}
      {/* ============================================================== */}
      {gradingSubmission && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Grade Student Assignment</h3>
            <p className="text-xs text-slate-500">
              Grading updates the student's Assignment category calculation automatically without manual data transfer.
            </p>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg space-y-1">
                <div className="font-bold text-slate-900">{gradingSubmission.studentName}</div>
                <div className="text-slate-500 font-mono text-[11px]">
                  Admission No: {gradingSubmission.admissionNumber}
                </div>
              </div>

              {gradingSubmission.contentText && (
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Submitted Response</label>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg max-h-40 overflow-y-auto whitespace-pre-wrap text-slate-800">
                    {gradingSubmission.contentText}
                  </div>
                </div>
              )}

              {gradingSubmission.attachmentUrl && (
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Attached Work</label>
                  <a
                    href={gradingSubmission.attachmentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-600 font-semibold underline truncate block"
                  >
                    {gradingSubmission.attachmentUrl}
                  </a>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Awarded Marks (Out of {gradingSubmission.maxMarks})
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={gradingSubmission.maxMarks}
                    step="0.5"
                    value={gradeInput}
                    onChange={(e) => setGradeInput(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Teacher Feedback</label>
                <textarea
                  rows={3}
                  placeholder="Provide constructive feedback..."
                  value={feedbackInput}
                  onChange={(e) => setFeedbackInput(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setGradingSubmission(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={gradeSubmissionMutation.isPending}
                onClick={() => gradeSubmissionMutation.mutate()}
                className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg"
              >
                {gradeSubmissionMutation.isPending ? 'Publishing Grade...' : 'Publish Grade & Recalculate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: CONFIRM BUTTON B (SUBMIT TO EXAM DEPARTMENT)             */}
      {/* ============================================================== */}
      {showExamDeptConfirmModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-rose-200 max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <Lock className="w-6 h-6 shrink-0" />
              <h3 className="text-lg font-bold text-slate-900">Forward to Exam Department?</h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Submitting to the Exam Department formally locks your direct editing rights for this subject result.
              Students will see <span className="font-bold text-amber-700">"GRADE IN PROGRESS"</span> while under examination review.
              Subsequent alterations will require submitting a formal Correction Request.
            </p>

            <div>
              <label className="font-bold text-slate-700 block mb-1 text-xs">Submission Remarks (Optional)</label>
              <textarea
                rows={2}
                placeholder="e.g. All assessments conducted, graded, and verified."
                value={examDeptRemarks}
                onChange={(e) => setExamDeptRemarks(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowExamDeptConfirmModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitToExamDeptMutation.isPending}
                onClick={() => submitToExamDeptMutation.mutate()}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-lg"
              >
                {submitToExamDeptMutation.isPending ? 'Submitting...' : 'Confirm & Forward'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: TEACHER REQUEST RESULT CORRECTION                       */}
      {/* ============================================================== */}
      {showCorrectionModal && correctionTarget && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Request Result Correction</h3>
            <p className="text-xs text-slate-500">
              Submit an official correction request to the Exam Department for a locked result.
            </p>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg space-y-1">
                <div className="font-bold text-slate-900">
                  {correctionTarget.student.user.firstName} {correctionTarget.student.user.lastName}
                </div>
                <div className="text-slate-500 font-mono text-[11px]">
                  Current Total: {correctionTarget.totalPercentage}% ({correctionTarget.gradeLetter})
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Proposed Corrected Total (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={proposedMarks}
                  onChange={(e) => setProposedMarks(Number(e.target.value))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Reason for Correction (Required)</label>
                <textarea
                  rows={3}
                  placeholder="Detail the grading oversight, recount, or recheck reason..."
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowCorrectionModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={correctionReason.length < 5 || requestCorrectionMutation.isPending}
                onClick={() => requestCorrectionMutation.mutate()}
                className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg"
              >
                {requestCorrectionMutation.isPending ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: CONNECT ASSESSMENT ITEM TO EXAM SCHEDULE                */}
      {/* ============================================================== */}
      {showConnectExamModal && targetAssessmentForExam && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-purple-200 max-w-lg w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-purple-700">
              <Link2 className="w-6 h-6 shrink-0" />
              <div>
                <h3 className="text-lg font-bold text-slate-900">Connect to Term Exam Schedule</h3>
                <p className="text-xs text-slate-500">
                  Auto-sync marks from Exams & Grades module into this continuous assessment
                </p>
              </div>
            </div>

            {/* Target Item Info */}
            <div className="bg-purple-50/70 border border-purple-100 rounded-xl p-3 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-purple-950">{targetAssessmentForExam.title}</span>
                <span className="font-extrabold text-purple-800 bg-purple-100 px-2 py-0.5 rounded">
                  Max: {targetAssessmentForExam.maxMarks} Marks
                </span>
              </div>
              <div className="text-purple-700">
                Category: <span className="font-semibold">{targetAssessmentForExam.category?.name || 'Assessment'}</span>
              </div>
            </div>

            {/* Available Exam Schedules List */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                Select Exam Schedule (Term {currentAssignment?.academicTerm?.name}):
              </label>

              {examSchedulesQuery.isLoading ? (
                <div className="py-6 text-center text-xs text-slate-400">Loading term exam schedules...</div>
              ) : !examSchedulesQuery.data || examSchedulesQuery.data.length === 0 ? (
                <div className="p-4 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-500 space-y-1">
                  <AlertCircle className="w-5 h-5 text-amber-500 mx-auto mb-1" />
                  <p className="font-bold text-slate-700">No exam schedules found for this subject & term.</p>
                  <p className="text-slate-400">
                    Create exam sessions (e.g. Midterm or Final Examinations) in the Exams module first.
                  </p>
                </div>
              ) : (
                <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                  {examSchedulesQuery.data.map((sched) => {
                    const isSelected = selectedExamScheduleId === sched.id || (!selectedExamScheduleId && targetAssessmentForExam.examScheduleId === sched.id);

                    return (
                      <div
                        key={sched.id}
                        onClick={() => setSelectedExamScheduleId(sched.id)}
                        className={`cursor-pointer rounded-xl p-3 border transition text-xs flex items-center justify-between gap-3 ${isSelected
                            ? 'bg-purple-50 border-purple-400 ring-2 ring-purple-400/20 shadow-sm'
                            : 'bg-white border-slate-200 hover:border-purple-200 hover:bg-slate-50/50'
                          }`}
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-black text-slate-900">{sched.sessionName || sched.examSession?.name || 'Exam Session'}</span>
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-100 text-slate-700 uppercase">
                              {sched.sessionStatus || sched.examSession?.status || 'SCHEDULED'}
                            </span>
                          </div>
                          <div className="text-slate-500 text-[11px]">
                            Max: {sched.maxMarks} marks · Pass: {sched.passMarks || sched.passingMarks || 40} marks · Date: {sched.examDate ? new Date(sched.examDate).toLocaleDateString() : 'TBD'}
                          </div>
                        </div>

                        <input
                          type="radio"
                          name="examScheduleSelect"
                          checked={isSelected}
                          onChange={() => setSelectedExamScheduleId(sched.id)}
                          className="text-purple-600 focus:ring-purple-500 shrink-0"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <p className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-100 leading-relaxed">
              💡 <strong>Automatic Scaling:</strong> If the exam schedule's max marks differ from this assessment item's max marks (e.g. 50 vs 100), marks will automatically scale proportionally so weighted percentages remain exact.
            </p>

            {/* Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              {targetAssessmentForExam.examScheduleId ? (
                <button
                  type="button"
                  disabled={connectExamScheduleMutation.isPending}
                  onClick={() =>
                    connectExamScheduleMutation.mutate({
                      itemId: targetAssessmentForExam.id,
                      examScheduleId: null,
                    })
                  }
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-lg transition"
                >
                  <Unlink className="w-3.5 h-3.5" />
                  Disconnect Exam
                </button>
              ) : <div />}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowConnectExamModal(false);
                    setTargetAssessmentForExam(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={
                    !selectedExamScheduleId && !targetAssessmentForExam.examScheduleId ||
                    connectExamScheduleMutation.isPending
                  }
                  onClick={async () => {
                    const schedId = selectedExamScheduleId || targetAssessmentForExam.examScheduleId;
                    if (!schedId) return;
                    await connectExamScheduleMutation.mutateAsync({
                      itemId: targetAssessmentForExam.id,
                      examScheduleId: schedId,
                    });
                    // Immediately trigger a sync
                    syncExamMarksMutation.mutate(targetAssessmentForExam.id);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg shadow-sm transition"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  {connectExamScheduleMutation.isPending ? 'Connecting...' : 'Connect & Sync Now'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: MANUAL & CSV MARKS UPLOAD (FOR ANY CATEGORY)             */}
      {/* ============================================================== */}
      {showUploadCsvModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-indigo-200 max-w-2xl w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5 text-indigo-700">
                <Upload className="w-5 h-5 shrink-0" />
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Upload Manual Marks / CSV</h3>
                  <p className="text-xs text-slate-500">
                    Bulk-enter marks for any assessment category (Midterm, Final, Quizzes, Lab, Attendance, etc.)
                  </p>
                </div>
              </div>

              {/* Assessment Item Selector if multiple */}
              <div className="flex items-center gap-2">
                <select
                  value={targetAssessmentForCsv?.id || ''}
                  onChange={(e) => {
                    const item = schemeQuery.data?.categories
                      ?.flatMap((c) => c.assessments || [])
                      ?.find((a) => a.id === e.target.value);
                    if (item) {
                      setTargetAssessmentForCsv(item);
                      if (csvRawText) parseCsvText(csvRawText, item.maxMarks);
                    }
                  }}
                  className="text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">-- Choose Target Assessment --</option>
                  {schemeQuery.data?.categories?.flatMap((c) =>
                    (c.assessments || []).map((item) => (
                      <option key={item.id} value={item.id}>
                        [{c.name}] {item.title} ({item.maxMarks} marks)
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>

            {targetAssessmentForCsv ? (
              <div className="space-y-4">
                {/* Component Target Banner & Download Template */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-indigo-50/70 border border-indigo-100 rounded-xl p-3 text-xs">
                  <div>
                    <span className="font-extrabold text-indigo-950">{targetAssessmentForCsv.title}</span>
                    <span className="mx-2 text-indigo-300">·</span>
                    <span className="text-indigo-800">Category: <strong>{targetAssessmentForCsv.category?.name || 'Assessment'}</strong></span>
                    <span className="mx-2 text-indigo-300">·</span>
                    <span className="text-indigo-800">Max Marks: <strong>{targetAssessmentForCsv.maxMarks}</strong></span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDownloadCsvTemplate(targetAssessmentForCsv)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-700 bg-white hover:bg-indigo-50 border border-indigo-200 rounded-lg shadow-2xs transition shrink-0"
                    title="Download pre-filled CSV with this section's student roll & admission numbers"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download Section Template (.csv)
                  </button>
                </div>

                {/* CSV File Upload or Paste Box */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-bold text-slate-700">Paste Marks Data or Select File:</label>
                    <label className="cursor-pointer text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1">
                      <Upload className="w-3 h-3" />
                      Browse CSV File
                      <input
                        type="file"
                        accept=".csv,.txt,.tsv"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                              const text = String(ev.target?.result || '');
                              setCsvRawText(text);
                              parseCsvText(text, targetAssessmentForCsv.maxMarks);
                            };
                            reader.readAsText(file);
                          }
                        }}
                      />
                    </label>
                  </div>

                  <textarea
                    rows={4}
                    placeholder={`Paste CSV or Excel data here, e.g.:\nAdmissionNo/RollNo, Marks, Absent(yes/no), Excused(yes/no), Remarks\nADM-101, 85, no, no, Excellent midterm performance\nADM-102, 92, no, no, Great answer on question 3`}
                    value={csvRawText}
                    onChange={(e) => {
                      const text = e.target.value;
                      setCsvRawText(text);
                      parseCsvText(text, targetAssessmentForCsv.maxMarks);
                    }}
                    className="w-full font-mono text-xs text-slate-800 bg-slate-50 border border-slate-300 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-[11px] text-slate-400">
                    Supports Comma-separated, Tab-separated (direct Excel/Google Sheets paste), or Semicolon formats. Header row is auto-detected.
                  </p>
                </div>

                {/* Parsed Preview Table */}
                {csvParsedRows.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-700">
                        Parsed Preview ({csvParsedRows.length} rows):
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800">
                          {csvParsedRows.filter((r) => r.matched && !r.warning).length} Valid
                        </span>
                        {csvParsedRows.some((r) => !r.matched || r.warning) && (
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800">
                            {csvParsedRows.filter((r) => !r.matched || r.warning).length} Warnings
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200">
                      <table className="w-full text-left text-xs text-slate-700">
                        <thead className="bg-slate-50 font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 sticky top-0">
                          <tr>
                            <th className="px-3 py-2">Identifier</th>
                            <th className="px-3 py-2">Student Name</th>
                            <th className="px-3 py-2 w-24">Marks</th>
                            <th className="px-3 py-2 w-16 text-center">Absent</th>
                            <th className="px-3 py-2">Remarks</th>
                            <th className="px-3 py-2">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {csvParsedRows.map((r, i) => (
                            <tr key={i} className={`hover:bg-slate-50/70 ${!r.matched ? 'bg-rose-50/50' : r.warning ? 'bg-amber-50/40' : ''}`}>
                              <td className="px-3 py-1.5 font-mono font-bold text-slate-800">{r.identifier}</td>
                              <td className="px-3 py-1.5 font-semibold text-slate-900">{r.studentName || '—'}</td>
                              <td className="px-3 py-1.5 font-bold text-indigo-700">
                                {r.marksObtained !== null && r.marksObtained !== undefined ? r.marksObtained : '—'}
                              </td>
                              <td className="px-3 py-1.5 text-center">
                                {r.isAbsent ? <span className="text-rose-600 font-bold">Yes</span> : '—'}
                              </td>
                              <td className="px-3 py-1.5 text-slate-500 truncate max-w-[140px]">{r.remarks || '—'}</td>
                              <td className="px-3 py-1.5">
                                {r.warning ? (
                                  <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded" title={r.warning}>
                                    {r.warning}
                                  </span>
                                ) : r.matched ? (
                                  <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded">
                                    Ready
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-bold text-rose-800 bg-rose-100 px-1.5 py-0.5 rounded">
                                    Unknown ID
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {csvError && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{csvError}</span>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setShowUploadCsvModal(false);
                      setTargetAssessmentForCsv(null);
                      setCsvRawText('');
                      setCsvParsedRows([]);
                    }}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={
                      csvParsedRows.filter((r) => r.matched).length === 0 ||
                      uploadCsvMarksMutation.isPending
                    }
                    onClick={() => {
                      const validRows = csvParsedRows
                        .filter((r) => r.matched)
                        .map((r) => ({
                          identifier: r.identifier,
                          marksObtained: r.marksObtained,
                          isAbsent: r.isAbsent,
                          isExcused: r.isExcused,
                          remarks: r.remarks,
                        }));

                      uploadCsvMarksMutation.mutate({
                        itemId: targetAssessmentForCsv.id,
                        rows: validRows,
                      });
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg shadow-sm transition"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {uploadCsvMarksMutation.isPending
                      ? 'Uploading & Recalculating...'
                      : `Confirm & Upload (${csvParsedRows.filter((r) => r.matched).length} Marks)`}
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-slate-500">
                Please choose an assessment item from the dropdown above to begin uploading marks.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
export default AssessmentsPage;
