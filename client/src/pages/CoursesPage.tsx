import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  BookOpen,
  Plus,
  FileText,
  Upload,
  CheckCircle,
  Clock,
  ExternalLink,
  Award,
  Layers,
  Calendar,
  AlertCircle,
  FileCheck,
  Download,
  X,
  Trash2,
} from 'lucide-react';

interface CourseModule {
  id: string;
  title: string;
  sequenceOrder: number;
  lessons: {
    id: string;
    title: string;
    contentRichText?: string;
    videoUrl?: string;
  }[];
}

interface StudentSubmission {
  id: string;
  assignmentId: string;
  studentId: string;
  submittedAt: string;
  contentText?: string | null;
  attachmentUrl?: string | null;
  status: string;
  grade?: number | null;
  feedback?: string | null;
  student: {
    id: string;
    admissionNumber: string;
    rollNumber?: string | null;
    user: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    };
    section?: {
      name: string;
      classGrade: {
        name: string;
      };
    };
  };
}

interface Assignment {
  id: string;
  courseId: string;
  title: string;
  instructions: string;
  maxPoints: number;
  dueDate: string;
  allowLateSubmissions: boolean;
  latePenaltyPercent: number;
  submissions?: StudentSubmission[];
}

interface Course {
  id: string;
  title: string;
  code: string;
  description?: string | null;
  isPublished: boolean;
  subject: { id: string; name: string; code: string };
  section: { id: string; name: string; classGrade?: { name: string } };
  teacher: { user: { firstName: string; lastName: string } };
  modules?: CourseModule[];
  assignments?: Assignment[];
  _count?: { modules: number; assignments: number };
}

interface AcademicSubject {
  id: string;
  name: string;
  code: string;
}

interface AcademicSection {
  id: string;
  name: string;
  classGrade: { id: string; name: string };
}

interface TeacherProfile {
  id: string;
  user: { id: string; firstName: string; lastName: string };
}

interface AcademicTerm {
  id: string;
  name: string;
  academicYear: { name: string };
}

interface TeacherAssignmentItem {
  id: string;
  teacherId: string;
  subjectId: string;
  sectionId: string;
  academicTermId: string;
  teacher: {
    id: string;
    userId: string;
    user?: { id: string; firstName: string; lastName: string; email: string };
  };
  subject: AcademicSubject;
  section: AcademicSection;
  academicTerm?: {
    id: string;
    name: string;
    academicYear?: { name: string };
  };
}

const errorText = (e: unknown) =>
  axios.isAxiosError(e)
    ? e.response?.data?.error?.message ?? 'Action failed.'
    : 'Action failed.';

export const CoursesPage: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const cache = useQueryClient();

  const isStudent = user?.role === 'ROLE_STUDENT';
  const isTeacher = user?.role === 'ROLE_SUBJECT_TEACHER' || user?.role === 'ROLE_CLASS_TEACHER';
  const isAdmin = user?.role === 'ROLE_SUPER_ADMIN' || user?.role === 'ROLE_INSTITUTION_ADMIN' || user?.role === 'ROLE_ACADEMIC_HEAD';
  const canCreateCourse = hasPermission('course:create');
  const canCreateAssignment = hasPermission('assignment:create');
  const canGrade = hasPermission('assignment:grade');
  const canSubmit = hasPermission('assignment:submit') || isStudent;

  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'assignments' | 'modules'>('assignments');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  // Modals
  const [isCourseModalOpen, setIsCourseModalOpen] = useState(false);
  const [isAssignmentModalOpen, setIsAssignmentModalOpen] = useState(false);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [activeAssignmentForSubmit, setActiveAssignmentForSubmit] = useState<Assignment | null>(null);
  const [activeAssignmentForGrading, setActiveAssignmentForGrading] = useState<Assignment | null>(null);

  // New Course Form
  const [courseForm, setCourseForm] = useState({
    title: '',
    code: '',
    description: '',
    subjectId: '',
    sectionId: '',
    teacherId: '',
    academicTermId: '',
    isPublished: true,
  });

  // New Assignment Form (with Weightage, Criteria & PDF Instructions)
  const [assignmentForm, setAssignmentForm] = useState({
    targetCourseId: '',
    title: '',
    instructions: '',
    weightagePercent: 15,
    criteria: '1. Problem Solving (40 pts)\n2. Methodology & Analysis (40 pts)\n3. Documentation & Presentation (20 pts)',
    maxPoints: 100,
    dueDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    allowLateSubmissions: true,
    latePenaltyPercent: 5,
    instructionPdfName: '',
    instructionPdfUrl: '',
  });

  // Student PDF Submission Form
  const [submitForm, setSubmitForm] = useState({
    contentText: '',
    pdfFileName: '',
    pdfDataUrl: '',
  });

  // Teacher Grading Drafts
  const [gradeDrafts, setGradeDrafts] = useState<Record<string, { grade: number; feedback: string }>>({});

  // PDF Preview Modal State
  const [activePdfPreview, setActivePdfPreview] = useState<{
    url: string;
    blobUrl?: string;
    streamUrl?: string;
    title: string;
    fileName: string;
    submissionId?: string;
  } | null>(null);

  const handleOpenPdf = (
    attachmentUrl: string,
    title: string,
    fileName = 'submission.pdf',
    submissionId?: string
  ) => {
    if (!attachmentUrl && !submissionId) return;
    try {
      const token = localStorage.getItem('accessToken') || '';
      const streamUrl = submissionId
        ? `http://localhost:4000/api/v1/lms/submissions/${submissionId}/attachment?token=${encodeURIComponent(token)}`
        : undefined;

      let blobUrl: string | undefined = streamUrl;

      if (attachmentUrl && attachmentUrl.startsWith('data:')) {
        const parts = attachmentUrl.split(';base64,');
        const contentType = parts[0].replace('data:', '') || 'application/pdf';
        const base64Data = parts[1] || '';
        const binaryStr = window.atob(base64Data);
        const len = binaryStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: contentType });
        blobUrl = URL.createObjectURL(blob);
      } else if (attachmentUrl && !attachmentUrl.startsWith('data:')) {
        blobUrl = attachmentUrl;
      }

      setActivePdfPreview({
        url: attachmentUrl,
        blobUrl: blobUrl || streamUrl,
        streamUrl,
        title,
        fileName,
        submissionId,
      });
    } catch (err) {
      console.error('Failed to parse and open PDF:', err);
      if (submissionId) {
        const token = localStorage.getItem('accessToken') || '';
        const streamUrl = `http://localhost:4000/api/v1/lms/submissions/${submissionId}/attachment?token=${encodeURIComponent(token)}`;
        setActivePdfPreview({
          url: attachmentUrl,
          blobUrl: streamUrl,
          streamUrl,
          title,
          fileName,
          submissionId,
        });
      } else {
        setError('Unable to decode the submitted PDF file.');
      }
    }
  };

  const handleDownloadPdf = (blobUrl: string, fileName: string) => {
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Queries
  const coursesQuery = useQuery({
    queryKey: ['lms-courses'],
    queryFn: async () => {
      const res = await apiClient.get('/lms/courses');
      return (res.data.data as Course[]) || [];
    },
  });

  const selectedCourseQuery = useQuery({
    queryKey: ['lms-course-detail', selectedCourseId],
    queryFn: async () => {
      const res = await apiClient.get(`/lms/courses/${selectedCourseId}`);
      return res.data.data as Course;
    },
    enabled: Boolean(selectedCourseId),
  });

  const subjectsQuery = useQuery({
    queryKey: ['academic-subjects'],
    queryFn: async () => (await apiClient.get('/academic/subjects')).data.data as AcademicSubject[],
    enabled: canCreateCourse,
  });

  const sectionsQuery = useQuery({
    queryKey: ['academic-sections-all'],
    queryFn: async () => (await apiClient.get('/academic/sections')).data.data as AcademicSection[],
    enabled: canCreateCourse,
  });

  const teachersQuery = useQuery({
    queryKey: ['academic-teachers'],
    queryFn: async () => {
      const res = await apiClient.get('/academic/teachers');
      return (res.data.data as TeacherProfile[]) || [];
    },
    enabled: canCreateCourse,
  });

  const yearsQuery = useQuery({
    queryKey: ['academic-years-terms'],
    queryFn: async () => {
      const res = await apiClient.get('/academic/years');
      return res.data.data as { id: string; name: string; terms: AcademicTerm[] }[];
    },
    enabled: canCreateCourse,
  });

  const teacherAssignmentsQuery = useQuery({
    queryKey: ['academic-teacher-assignments'],
    queryFn: async () => {
      const res = await apiClient.get('/academic/teacher-assignments');
      return (res.data.data as TeacherAssignmentItem[]) || [];
    },
    enabled: canCreateCourse,
  });

  const myAssignments = useMemo(() => {
    if (!user) return [];
    const list = teacherAssignmentsQuery.data ?? [];
    return list.filter((a) => a.teacher?.user?.id === user.id || a.teacher?.userId === user.id);
  }, [teacherAssignmentsQuery.data, user]);

  const myTeacherProfileId = useMemo(() => {
    if (!user) return '';
    if (myAssignments.length > 0 && myAssignments[0].teacher?.id) {
      return myAssignments[0].teacher.id;
    }
    const found = (teachersQuery.data ?? []).find((t) => t.user?.id === user.id);
    return found ? found.id : '';
  }, [user, myAssignments, teachersQuery.data]);

  const allowedSubjects = useMemo(() => {
    if (!isTeacher || isAdmin) {
      return subjectsQuery.data ?? [];
    }
    const map = new Map<string, AcademicSubject>();
    myAssignments.forEach((a) => {
      if (a.subject) {
        map.set(a.subject.id, a.subject);
      }
    });
    return Array.from(map.values());
  }, [isTeacher, isAdmin, subjectsQuery.data, myAssignments]);

  const allowedSections = useMemo(() => {
    if (!isTeacher || isAdmin) {
      return sectionsQuery.data ?? [];
    }
    // Filter sections assigned to this teacher for the currently selected subject (or all if none selected yet)
    const filtered = courseForm.subjectId
      ? myAssignments.filter((a) => a.subject?.id === courseForm.subjectId)
      : myAssignments;
    const map = new Map<string, AcademicSection>();
    filtered.forEach((a) => {
      if (a.section) {
        map.set(a.section.id, a.section);
      }
    });
    return Array.from(map.values());
  }, [isTeacher, isAdmin, sectionsQuery.data, myAssignments, courseForm.subjectId]);

  const handleOpenCourseModal = () => {
    setError('');
    setNotice('');
    const initialTeacherId = (isTeacher && !isAdmin) ? myTeacherProfileId : '';
    const initialSubjectId = (isTeacher && !isAdmin && allowedSubjects.length === 1) ? allowedSubjects[0].id : '';
    setCourseForm({
      title: '',
      code: '',
      description: '',
      subjectId: initialSubjectId,
      sectionId: '',
      teacherId: initialTeacherId,
      academicTermId: '',
      isPublished: true,
    });
    setIsCourseModalOpen(true);
  };

  // Auto-select first course when loaded
  React.useEffect(() => {
    if (!selectedCourseId && coursesQuery.data && coursesQuery.data.length > 0) {
      setSelectedCourseId(coursesQuery.data[0].id);
    }
  }, [coursesQuery.data, selectedCourseId]);

  // Mutations
  const invalidate = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ['lms-courses'] }),
      cache.invalidateQueries({ queryKey: ['lms-course-detail', selectedCourseId] }),
    ]);
  };

  const createCourseMutation = useMutation({
    mutationFn: async () => apiClient.post('/lms/courses', courseForm),
    onSuccess: async (res) => {
      setError('');
      setNotice('Course created successfully.');
      setIsCourseModalOpen(false);
      await invalidate();
      if (res.data.data?.id) setSelectedCourseId(res.data.data.id);
    },
    onError: (e) => {
      setNotice('');
      setError(errorText(e));
    },
  });

  const createAssignmentMutation = useMutation({
    mutationFn: async () => {
      const courseIdToUse = assignmentForm.targetCourseId || selectedCourseId;
      if (!courseIdToUse) {
        throw new Error('Please select an assigned class, section and subject for this assignment.');
      }

      let finalInstructions = `[Weightage: ${assignmentForm.weightagePercent}%]\n[Criteria: ${assignmentForm.criteria}]\n${assignmentForm.instructions}`;
      if (assignmentForm.instructionPdfUrl) {
        finalInstructions += `\n\n[ATTACHED_INSTRUCTION_PDF_NAME: ${assignmentForm.instructionPdfName || 'Instructions.pdf'}]\n[ATTACHED_INSTRUCTION_PDF_URL: ${assignmentForm.instructionPdfUrl}]`;
      }

      return apiClient.post('/lms/assignments', {
        courseId: courseIdToUse,
        title: assignmentForm.title,
        instructions: finalInstructions,
        weightagePercent: Number(assignmentForm.weightagePercent),
        criteria: assignmentForm.criteria,
        maxPoints: Number(assignmentForm.maxPoints),
        dueDate: assignmentForm.dueDate,
        allowLateSubmissions: assignmentForm.allowLateSubmissions,
        latePenaltyPercent: Number(assignmentForm.latePenaltyPercent),
      });
    },
    onSuccess: async () => {
      setError('');
      setNotice('Assignment published successfully with subject/class allocation and instructions.');
      setIsAssignmentModalOpen(false);
      setAssignmentForm({
        targetCourseId: '',
        title: '',
        instructions: '',
        weightagePercent: 15,
        criteria: '1. Problem Solving (40 pts)\n2. Methodology & Analysis (40 pts)\n3. Documentation & Presentation (20 pts)',
        maxPoints: 100,
        dueDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
        allowLateSubmissions: true,
        latePenaltyPercent: 5,
        instructionPdfName: '',
        instructionPdfUrl: '',
      });
      await invalidate();
    },
    onError: (e) => {
      setNotice('');
      setError(errorText(e));
    },
  });

  const deleteCourseMutation = useMutation({
    mutationFn: async (courseId: string) =>
      apiClient.post('/system/recycle-bin/delete', {
        entityType: 'COURSE',
        entityId: courseId,
        reason: 'Course moved to Recycle Bin by authorized administrator',
      }),
    onSuccess: async () => {
      setError('');
      setNotice('Course moved to Recycle Bin. You can restore or permanently delete it in Settings > Recycle Bin.');
      await invalidate();
    },
    onError: (e) => {
      setNotice('');
      setError(errorText(e));
    },
  });

  const submitAssignmentMutation = useMutation({
    mutationFn: async () => {
      if (!activeAssignmentForSubmit) throw new Error('No active assignment selected.');
      if (!submitForm.pdfDataUrl) throw new Error('Please select and attach a valid PDF document.');
      return apiClient.post(`/lms/assignments/${activeAssignmentForSubmit.id}/submit`, {
        contentText: submitForm.contentText || `Submitted assignment document: ${submitForm.pdfFileName}`,
        attachmentUrl: submitForm.pdfDataUrl,
      });
    },
    onSuccess: async () => {
      setError('');
      setNotice('Assignment PDF submitted successfully!');
      setIsSubmitModalOpen(false);
      setSubmitForm({ contentText: '', pdfFileName: '', pdfDataUrl: '' });
      await invalidate();
    },
    onError: (e) => {
      setNotice('');
      setError(errorText(e));
    },
  });

  const gradeSubmissionMutation = useMutation({
    mutationFn: async ({ submissionId, grade, feedback }: { submissionId: string; grade: number; feedback: string }) =>
      apiClient.post(`/lms/submissions/${submissionId}/grade`, { grade, feedback }),
    onSuccess: async () => {
      setError('');
      setNotice('Submission grade and criteria feedback saved.');
      await invalidate();
    },
    onError: (e) => {
      setNotice('');
      setError(errorText(e));
    },
  });

  // Handle PDF file selection
  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF documents (.pdf) are permitted for assignment submissions.');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setError('PDF file size exceeds 15 MB limit.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setSubmitForm((prev) => ({
        ...prev,
        pdfFileName: file.name,
        pdfDataUrl: event.target?.result as string,
      }));
      setError('');
    };
    reader.readAsDataURL(file);
  };

  // Handle Teacher PDF Instruction / Worksheet Upload
  const handleInstructionPdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF documents (.pdf) are permitted for assignment instructions.');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setError('Instruction PDF file size exceeds 15 MB limit.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setAssignmentForm((prev) => ({
        ...prev,
        instructionPdfName: file.name,
        instructionPdfUrl: event.target?.result as string,
      }));
      setError('');
    };
    reader.readAsDataURL(file);
  };

  // Helper parser for weightage, criteria and instruction PDF embedded in instructions
  const parseAssignmentDetails = (rawInstructions: string) => {
    const weightageMatch = rawInstructions.match(/\[Weightage:\s*(\d+)%\]/i);
    const criteriaMatch = rawInstructions.match(/\[Criteria:\s*([^\]]+)\]/i);
    const pdfUrlMatch = rawInstructions.match(/\[ATTACHED_INSTRUCTION_PDF_URL:\s*(data:[^\]]+|https?:[^\]]+)\]/i);
    const pdfNameMatch = rawInstructions.match(/\[ATTACHED_INSTRUCTION_PDF_NAME:\s*([^\]]+)\]/i);

    let cleanInstructions = rawInstructions
      .replace(/\[Weightage:\s*\d+%\]/gi, '')
      .replace(/\[Criteria:\s*[^\]]+\]/gi, '')
      .replace(/\[ATTACHED_INSTRUCTION_PDF_URL:\s*[^\]]+\]/gi, '')
      .replace(/\[ATTACHED_INSTRUCTION_PDF_NAME:\s*[^\]]+\]/gi, '')
      .trim();

    return {
      weightage: weightageMatch ? Number(weightageMatch[1]) : 15,
      criteria: criteriaMatch ? criteriaMatch[1] : null,
      instructionPdfUrl: pdfUrlMatch ? pdfUrlMatch[1] : null,
      instructionPdfName: pdfNameMatch ? pdfNameMatch[1].trim() : 'Instructions.pdf',
      instructions: cleanInstructions || rawInstructions,
    };
  };

  const currentCourse = selectedCourseQuery.data || coursesQuery.data?.find((c) => c.id === selectedCourseId);

  // Available term options
  const termOptions = useMemo(() => {
    return (yearsQuery.data ?? []).flatMap((year) =>
      year.terms.map((term) => ({
        id: term.id,
        label: `${year.name} - ${term.name}`,
      }))
    );
  }, [yearsQuery.data]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-primary-700">
            Academics & Digital Learning
          </p>
          <h1 className="mt-1 text-2xl font-black text-slate-900">Courses & Assignments</h1>
          <p className="mt-1 text-sm text-slate-600">
            Course curriculum, weighted assignments with grading rubrics, and PDF submission portal.
          </p>
        </div>

        {canCreateCourse && (
          <button
            type="button"
            onClick={handleOpenCourseModal}
            className="flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 transition"
          >
            <Plus className="h-4 w-4" />
            + Create New Course
          </button>
        )}
      </header>

      {/* Notice / Alerts */}
      {notice && (
        <div role="status" className="flex items-center gap-2 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800 border border-emerald-200">
          <CheckCircle className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{notice}</span>
        </div>
      )}
      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-xl bg-rose-50 p-4 text-sm text-rose-800 border border-rose-200">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Courses Selector & Details */}
      {coursesQuery.isLoading && (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
          Loading enrolled courses...
        </div>
      )}

      {coursesQuery.data && coursesQuery.data.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
          <BookOpen className="mx-auto h-12 w-12 text-slate-300" />
          <h3 className="mt-3 text-base font-bold text-slate-900">No Courses Available</h3>
          <p className="mt-1 text-sm text-slate-500">
            {isStudent
              ? 'You are not currently enrolled in any published courses for your section.'
              : 'No courses have been created for your institution yet.'}
          </p>
          {canCreateCourse && (
            <button
              type="button"
              onClick={() => setIsCourseModalOpen(true)}
              className="mt-4 rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
            >
              + Create First Course
            </button>
          )}
        </div>
      )}

      {coursesQuery.data && coursesQuery.data.length > 0 && (
        <>
          {/* Course Selector Tabs */}
          <div className="flex gap-2 overflow-x-auto pb-1 border-b border-slate-200">
            {coursesQuery.data.map((course) => {
              const isSelected = course.id === selectedCourseId;
              return (
                <button
                  key={course.id}
                  type="button"
                  onClick={() => setSelectedCourseId(course.id)}
                  className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${isSelected
                      ? 'bg-slate-900 text-white shadow'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                    }`}
                >
                  <BookOpen className={`h-4 w-4 ${isSelected ? 'text-primary-300' : 'text-slate-400'}`} />
                  <span>{course.title}</span>
                  <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-mono ${isSelected ? 'bg-slate-800 text-primary-200' : 'bg-slate-100 text-slate-600'
                    }`}>
                    {course.code}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active Course Workspace */}
          {currentCourse && (
            <div className="space-y-6">
              {/* Course Info Card */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-primary-100 px-2.5 py-1 text-xs font-bold text-primary-800">
                        {currentCourse.code}
                      </span>
                      <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {currentCourse.subject.name}
                      </span>
                      <span className="rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                        {currentCourse.section.classGrade ? `${currentCourse.section.classGrade.name} - ` : ''}
                        {currentCourse.section.name}
                      </span>
                    </div>
                    <h2 className="mt-2 text-xl font-bold text-slate-900">{currentCourse.title}</h2>
                    {currentCourse.description && (
                      <p className="mt-1 text-sm text-slate-600">{currentCourse.description}</p>
                    )}
                  </div>

                  <div className="text-right text-xs text-slate-500 flex flex-col items-end gap-2">
                    <div>
                      <p className="font-semibold text-slate-800">
                        Instructor: {currentCourse.teacher?.user?.firstName} {currentCourse.teacher?.user?.lastName}
                      </p>
                      <p className="mt-1">
                        {currentCourse.assignments?.length ?? 0} Assignments · {currentCourse.modules?.length ?? 0} Modules
                      </p>
                    </div>

                    {(isAdmin || canCreateCourse) && (
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Move course "${currentCourse.title} (${currentCourse.code})" to Recycle Bin? You can restore it anytime in Settings > Recycle Bin.`)) {
                            deleteCourseMutation.mutate(currentCourse.id);
                          }
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 transition shadow-sm"
                        title="Delete this course and send it to the Recycle Bin"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-600" />
                        Delete Course (To Bin)
                      </button>
                    )}
                  </div>
                </div>

                {/* Sub-Navigation Tabs */}
                <div className="mt-6 flex border-b border-slate-200">
                  <button
                    type="button"
                    onClick={() => setActiveTab('assignments')}
                    className={`flex items-center gap-2 border-b-2 px-5 py-2.5 text-sm font-semibold transition ${activeTab === 'assignments'
                        ? 'border-primary-600 text-primary-700'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                      }`}
                  >
                    <FileCheck className="h-4 w-4" />
                    Assignments & PDF Submissions ({currentCourse.assignments?.length ?? 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('modules')}
                    className={`flex items-center gap-2 border-b-2 px-5 py-2.5 text-sm font-semibold transition ${activeTab === 'modules'
                        ? 'border-primary-600 text-primary-700'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                      }`}
                  >
                    <Layers className="h-4 w-4" />
                    Syllabus Modules ({currentCourse.modules?.length ?? 0})
                  </button>
                </div>
              </div>

              {/* TAB 1: ASSIGNMENTS & PDF SUBMISSIONS */}
              {activeTab === 'assignments' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">Course Assignments</h3>
                      <p className="text-xs text-slate-500">
                        Assignments carry specific weightage toward the term grade and require PDF file submissions.
                      </p>
                    </div>

                    {(canCreateAssignment || isTeacher || isAdmin) && (
                      <button
                        type="button"
                        onClick={() => setIsAssignmentModalOpen(true)}
                        className="flex items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        + Post Assignment
                      </button>
                    )}
                  </div>

                  {(!currentCourse.assignments || currentCourse.assignments.length === 0) ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                      No assignments have been posted for this course yet.
                    </div>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                      {currentCourse.assignments.map((assignment) => {
                        const parsed = parseAssignmentDetails(assignment.instructions);
                        const mySubmission = isStudent
                          ? assignment.submissions?.find((s) => s.student?.user?.id === user?.id)
                          : null;
                        const submissionsCount = assignment.submissions?.length || 0;

                        return (
                          <div
                            key={assignment.id}
                            className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
                          >
                            <div>
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-bold text-primary-800">
                                  Weightage: {parsed.weightage}%
                                </span>
                                <span className="flex items-center gap-1 text-xs text-slate-500 font-medium">
                                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                                  Due: {new Date(assignment.dueDate).toLocaleDateString()}
                                </span>
                              </div>

                              <h4 className="mt-2 text-base font-bold text-slate-900">{assignment.title}</h4>
                              <p className="mt-1 text-xs text-slate-600 line-clamp-3 whitespace-pre-line">
                                {parsed.instructions}
                              </p>

                              {/* Grading Criteria Rubric Box */}
                              {parsed.criteria && (
                                <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs border border-slate-200">
                                  <p className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">
                                    Evaluation Criteria & Rubric:
                                  </p>
                                  <p className="mt-1 text-slate-600 whitespace-pre-line font-medium">
                                    {parsed.criteria}
                                  </p>
                                </div>
                              )}

                              {/* Teacher Attached Instruction PDF / Worksheet */}
                              {parsed.instructionPdfUrl && (
                                <div className="mt-3 flex items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50/70 p-3">
                                  <div className="flex items-center gap-2 overflow-hidden">
                                    <FileText className="h-4 w-4 shrink-0 text-indigo-600" />
                                    <div className="truncate text-xs">
                                      <p className="font-bold text-indigo-950 truncate">
                                        Instruction: {parsed.instructionPdfName}
                                      </p>
                                      <p className="text-[11px] text-indigo-600">Attached teacher worksheet / prompt PDF</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleOpenPdf(
                                          parsed.instructionPdfUrl!,
                                          `Instructions: ${assignment.title}`,
                                          parsed.instructionPdfName || 'instructions.pdf'
                                        )
                                      }
                                      className="flex items-center gap-1 rounded-lg border border-indigo-300 bg-white px-2.5 py-1 text-xs font-bold text-indigo-700 shadow-sm hover:bg-indigo-50 transition"
                                    >
                                      <FileText className="h-3 w-3" />
                                      View PDF
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (parsed.instructionPdfUrl!.startsWith('data:')) {
                                          const parts = parsed.instructionPdfUrl!.split(';base64,');
                                          const contentType = parts[0].replace('data:', '') || 'application/pdf';
                                          const base64Data = parts[1] || '';
                                          const binaryStr = window.atob(base64Data);
                                          const bytes = new Uint8Array(binaryStr.length);
                                          for (let i = 0; i < binaryStr.length; i++) {
                                            bytes[i] = binaryStr.charCodeAt(i);
                                          }
                                          const blob = new Blob([bytes], { type: contentType });
                                          const blobUrl = URL.createObjectURL(blob);
                                          handleDownloadPdf(blobUrl, parsed.instructionPdfName || 'instructions.pdf');
                                        } else {
                                          handleDownloadPdf(parsed.instructionPdfUrl!, parsed.instructionPdfName || 'instructions.pdf');
                                        }
                                      }}
                                      className="flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 transition"
                                    >
                                      <Download className="h-3 w-3" />
                                      Download PDF
                                    </button>
                                  </div>
                                </div>
                              )}

                              <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                                <span className="font-semibold text-slate-700">Max Marks: {assignment.maxPoints} pts</span>
                                <span>{assignment.allowLateSubmissions ? 'Late submissions allowed' : 'Strict deadline'}</span>
                              </div>
                            </div>

                            {/* Action Area based on Role */}
                            <div className="mt-5 border-t border-slate-100 pt-3">
                              {isStudent ? (
                                mySubmission ? (
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <span
                                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold ${mySubmission.status === 'GRADED'
                                            ? 'bg-emerald-100 text-emerald-800'
                                            : 'bg-amber-100 text-amber-800'
                                          }`}
                                      >
                                        <CheckCircle className="h-3 w-3" />
                                        {mySubmission.status === 'GRADED'
                                          ? `Score: ${mySubmission.grade} / ${assignment.maxPoints}`
                                          : 'Submitted (Pending Review)'}
                                      </span>
                                      {mySubmission.feedback && (
                                        <p className="mt-1 text-xs text-slate-600">
                                          Feedback: {mySubmission.feedback}
                                        </p>
                                      )}
                                    </div>

                                    {mySubmission.attachmentUrl && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleOpenPdf(
                                            mySubmission.attachmentUrl!,
                                            `My Submission: ${assignment.title}`,
                                            `${assignment.title}.pdf`,
                                            mySubmission.id
                                          )
                                        }
                                        className="flex items-center gap-1.5 rounded-lg border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-bold text-primary-700 hover:bg-primary-100 shadow-sm"
                                      >
                                        <FileText className="h-3.5 w-3.5" />
                                        View PDF
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveAssignmentForSubmit(assignment);
                                      setIsSubmitModalOpen(true);
                                    }}
                                    className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary-600 py-2 text-xs font-bold text-white shadow-sm hover:bg-primary-700"
                                  >
                                    <Upload className="h-3.5 w-3.5" />
                                    Submit Assignment (PDF)
                                  </button>
                                )
                              ) : (
                                /* Teacher / Admin View */
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-semibold text-slate-600">
                                    {submissionsCount} student {submissionsCount === 1 ? 'submission' : 'submissions'}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setActiveAssignmentForGrading(assignment)}
                                    className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                                  >
                                    <Award className="h-3.5 w-3.5 text-primary-600" />
                                    Review & Grade
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: SYLLABUS MODULES */}
              {activeTab === 'modules' && (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h3 className="text-base font-bold text-slate-900 mb-4">Course Syllabus & Lessons</h3>
                  {(!currentCourse.modules || currentCourse.modules.length === 0) ? (
                    <p className="text-sm text-slate-500">No course modules have been structured yet.</p>
                  ) : (
                    <div className="space-y-4">
                      {currentCourse.modules.map((module, i) => (
                        <div key={module.id} className="rounded-xl border border-slate-200 p-4">
                          <h4 className="font-bold text-slate-900 text-sm">
                            Module {i + 1}: {module.title}
                          </h4>
                          {module.lessons && module.lessons.length > 0 ? (
                            <ul className="mt-2 space-y-2 border-t border-slate-100 pt-2 text-xs">
                              {module.lessons.map((lesson, li) => (
                                <li key={lesson.id} className="flex items-center justify-between py-1">
                                  <span className="text-slate-700 font-medium">
                                    {i + 1}.{li + 1} {lesson.title}
                                  </span>
                                  {lesson.videoUrl && (
                                    <a
                                      href={lesson.videoUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-primary-600 hover:underline"
                                    >
                                      Watch Video
                                    </a>
                                  )}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-1 text-xs text-slate-400">No lessons attached.</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* MODAL 1: CREATE COURSE */}
      {isCourseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-lg font-bold text-slate-900">Create Academic Course</h3>
              <button
                type="button"
                onClick={() => setIsCourseModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                createCourseMutation.mutate();
              }}
              className="mt-4 space-y-3"
            >
              {isTeacher && !isAdmin && (
                <div className="rounded-xl bg-indigo-50/80 p-3.5 border border-indigo-200 text-xs text-indigo-950">
                  <div className="flex items-center gap-1.5 font-bold text-indigo-900">
                    <BookOpen className="w-4 h-4 text-indigo-700" />
                    <span>Faculty Course Creation Policy</span>
                  </div>
                  <p className="mt-1 text-slate-600 leading-relaxed">
                    You can only create courses for subjects ({allowedSubjects.map((s) => s.name).join(', ') || 'None assigned'}) and class sections officially allocated to your profile.
                  </p>
                  {allowedSubjects.length === 0 && (
                    <div className="mt-2 rounded-lg bg-rose-100 p-2 text-rose-800 font-semibold border border-rose-200">
                      No subjects are currently assigned to your account by administration. Please contact the Academic Head.
                    </div>
                  )}
                </div>
              )}

              <label className="block text-xs font-semibold text-slate-700">
                Course Title
                <input
                  required
                  placeholder="e.g. Advanced Mathematics 10"
                  value={courseForm.title}
                  onChange={(e) => setCourseForm({ ...courseForm, title: e.target.value })}
                  className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-sm"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-semibold text-slate-700">
                  Course Code
                  <input
                    required
                    placeholder="e.g. MATH-10A"
                    value={courseForm.code}
                    onChange={(e) => setCourseForm({ ...courseForm, code: e.target.value })}
                    className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-sm"
                  />
                </label>

                <label className="block text-xs font-semibold text-slate-700">
                  Subject {isTeacher && !isAdmin && <span className="text-indigo-600 font-normal">(Allocated)</span>}
                  <select
                    required
                    value={courseForm.subjectId}
                    onChange={(e) => {
                      const newSubjectId = e.target.value;
                      setCourseForm({
                        ...courseForm,
                        subjectId: newSubjectId,
                        sectionId: '', // Reset target section to prevent unassigned cross-selection
                      });
                    }}
                    className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-sm"
                  >
                    <option value="">-- Select Subject --</option>
                    {allowedSubjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} · {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-semibold text-slate-700">
                  Target Section {isTeacher && !isAdmin && <span className="text-indigo-600 font-normal">(Allocated)</span>}
                  <select
                    required
                    value={courseForm.sectionId}
                    onChange={(e) => setCourseForm({ ...courseForm, sectionId: e.target.value })}
                    className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-sm"
                  >
                    <option value="">-- Select Section --</option>
                    {allowedSections.map((sec) => (
                      <option key={sec.id} value={sec.id}>
                        {sec.classGrade.name} - {sec.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-xs font-semibold text-slate-700">
                  Assigned Teacher
                  {isTeacher && !isAdmin ? (
                    <div className="mt-1 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
                      <span>{user?.firstName} {user?.lastName} (You)</span>
                      <span className="rounded bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                        Faculty
                      </span>
                    </div>
                  ) : (
                    <select
                      required
                      value={courseForm.teacherId}
                      onChange={(e) => setCourseForm({ ...courseForm, teacherId: e.target.value })}
                      className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-sm"
                    >
                      <option value="">Select teacher</option>
                      {(teachersQuery.data ?? []).map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.user.firstName} {t.user.lastName}
                        </option>
                      ))}
                    </select>
                  )}
                </label>
              </div>

              <label className="block text-xs font-semibold text-slate-700">
                Academic Term
                <select
                  required
                  value={courseForm.academicTermId}
                  onChange={(e) => setCourseForm({ ...courseForm, academicTermId: e.target.value })}
                  className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-sm"
                >
                  <option value="">Select academic term</option>
                  {termOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-semibold text-slate-700">
                Course Description (Optional)
                <textarea
                  rows={2}
                  value={courseForm.description}
                  onChange={(e) => setCourseForm({ ...courseForm, description: e.target.value })}
                  className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-sm"
                />
              </label>

              <div className="mt-5 flex justify-end gap-2 border-t pt-3">
                <button
                  type="button"
                  onClick={() => setIsCourseModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createCourseMutation.isPending || (isTeacher && !isAdmin && allowedSubjects.length === 0)}
                  className="rounded-xl bg-primary-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50"
                >
                  {createCourseMutation.isPending ? 'Creating...' : 'Create Course'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: CREATE ASSIGNMENT WITH WEIGHTAGE & CRITERIA */}
      {isAssignmentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Post Assignment</h3>
                <p className="text-xs text-slate-500">
                  Set instructions, assignment weightage, and evaluation criteria rubric.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAssignmentModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                createAssignmentMutation.mutate();
              }}
              className="mt-4 space-y-3"
            >
              <label className="block text-xs font-semibold text-slate-700">
                Assigned Subject & Class/Section <span className="text-red-500">*</span>
                <select
                  required
                  value={assignmentForm.targetCourseId || selectedCourseId || ''}
                  onChange={(e) => {
                    setAssignmentForm({ ...assignmentForm, targetCourseId: e.target.value });
                    setSelectedCourseId(e.target.value);
                  }}
                  className="mt-1 block w-full rounded-lg border border-slate-300 p-2.5 text-sm bg-slate-50 font-medium"
                >
                  <option value="">-- Select Subject & Target Class --</option>
                  {(coursesQuery.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.subject.name} ({c.code}) — {c.section.classGrade ? `${c.section.classGrade.name} - ` : ''}{c.section.name} {c.teacher?.user ? `· Instructor: ${c.teacher.user.firstName} ${c.teacher.user.lastName}` : ''}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-semibold text-slate-700">
                Assignment Title
                <input
                  required
                  placeholder="e.g. Term Project: Differential Calculus Applications"
                  value={assignmentForm.title}
                  onChange={(e) => setAssignmentForm({ ...assignmentForm, title: e.target.value })}
                  className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-sm"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-semibold text-slate-700">
                  Weightage in Final Grade (%)
                  <input
                    required
                    type="number"
                    min="1"
                    max="100"
                    value={assignmentForm.weightagePercent}
                    onChange={(e) =>
                      setAssignmentForm({ ...assignmentForm, weightagePercent: Number(e.target.value) })
                    }
                    className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-sm"
                  />
                </label>

                <label className="block text-xs font-semibold text-slate-700">
                  Max Marks / Points
                  <input
                    required
                    type="number"
                    min="1"
                    value={assignmentForm.maxPoints}
                    onChange={(e) => setAssignmentForm({ ...assignmentForm, maxPoints: Number(e.target.value) })}
                    className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-sm"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-semibold text-slate-700">
                  Due Date
                  <input
                    required
                    type="date"
                    value={assignmentForm.dueDate}
                    onChange={(e) => setAssignmentForm({ ...assignmentForm, dueDate: e.target.value })}
                    className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-sm"
                  />
                </label>

                <label className="block text-xs font-semibold text-slate-700">
                  Late Penalty (% / Day)
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={assignmentForm.latePenaltyPercent}
                    onChange={(e) =>
                      setAssignmentForm({ ...assignmentForm, latePenaltyPercent: Number(e.target.value) })
                    }
                    className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-sm"
                  />
                </label>
              </div>

              <label className="block text-xs font-semibold text-slate-700">
                Evaluation Rubric & Grading Criteria
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Problem formulation (30%), Correct solution (40%), Neat PDF format (30%)"
                  value={assignmentForm.criteria}
                  onChange={(e) => setAssignmentForm({ ...assignmentForm, criteria: e.target.value })}
                  className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-sm font-mono text-xs"
                />
              </label>

              <label className="block text-xs font-semibold text-slate-700">
                Full Assignment Instructions
                <textarea
                  required
                  rows={3}
                  placeholder="Detailed guidelines for the student..."
                  value={assignmentForm.instructions}
                  onChange={(e) => setAssignmentForm({ ...assignmentForm, instructions: e.target.value })}
                  className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-sm"
                />
              </label>

              {/* Attach Instruction Worksheet PDF */}
              <div className="rounded-xl border border-dashed border-indigo-300 bg-indigo-50/50 p-3">
                <label className="block text-xs font-semibold text-indigo-950">
                  Attach Instruction Document / Problem Worksheet (PDF)
                </label>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Optional: Upload a question paper, rubric worksheet, or reading guide for students to view and download.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={handleInstructionPdfUpload}
                    className="text-xs text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-indigo-700 cursor-pointer"
                  />
                  {assignmentForm.instructionPdfName && (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                      {assignmentForm.instructionPdfName}
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-5 flex justify-end gap-2 border-t pt-3">
                <button
                  type="button"
                  onClick={() => setIsAssignmentModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createAssignmentMutation.isPending}
                  className="rounded-xl bg-primary-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50"
                >
                  {createAssignmentMutation.isPending ? 'Publishing...' : 'Publish Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: STUDENT PDF SUBMISSION PORTAL */}
      {isSubmitModalOpen && activeAssignmentForSubmit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Submit Assignment</h3>
                <p className="text-xs text-slate-500">{activeAssignmentForSubmit.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsSubmitModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitAssignmentMutation.mutate();
              }}
              className="mt-4 space-y-4"
            >
              {/* PDF File Input */}
              <div className="rounded-xl border-2 border-dashed border-slate-300 p-6 text-center hover:border-primary-500 transition">
                <FileText className="mx-auto h-10 w-10 text-primary-600" />
                <p className="mt-2 text-sm font-bold text-slate-800">
                  {submitForm.pdfFileName || 'Select Assignment PDF Document'}
                </p>
                <p className="text-xs text-slate-500">Only PDF files (.pdf) up to 15MB are accepted</p>

                <label className="mt-3 inline-block cursor-pointer rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800">
                  Browse PDF File
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    className="hidden"
                    onChange={handlePdfUpload}
                  />
                </label>
              </div>

              <label className="block text-xs font-semibold text-slate-700">
                Submission Notes / Remarks for Teacher
                <textarea
                  rows={2}
                  placeholder="Optional comments or explanations about your solution..."
                  value={submitForm.contentText}
                  onChange={(e) => setSubmitForm({ ...submitForm, contentText: e.target.value })}
                  className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-sm"
                />
              </label>

              <div className="mt-5 flex justify-end gap-2 border-t pt-3">
                <button
                  type="button"
                  onClick={() => setIsSubmitModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitAssignmentMutation.isPending || !submitForm.pdfDataUrl}
                  className="flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {submitAssignmentMutation.isPending ? 'Submitting...' : 'Upload & Submit PDF'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: TEACHER GRADING & CRITERIA REVIEW */}
      {activeAssignmentForGrading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Student Submissions Roster</h3>
                <p className="text-xs text-slate-500">
                  {activeAssignmentForGrading.title} · Max {activeAssignmentForGrading.maxPoints} pts
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveAssignmentForGrading(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            {(!activeAssignmentForGrading.submissions || activeAssignmentForGrading.submissions.length === 0) ? (
              <div className="my-8 text-center text-sm text-slate-500">
                No students have submitted this assignment yet.
              </div>
            ) : (
              <div className="my-4 divide-y divide-slate-100">
                {activeAssignmentForGrading.submissions.map((sub) => {
                  const draft = gradeDrafts[sub.id] || {
                    grade: sub.grade ?? 0,
                    feedback: sub.feedback ?? '',
                  };

                  return (
                    <div key={sub.id} className="py-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold text-slate-900">
                            {sub.student.user.firstName} {sub.student.user.lastName}
                            <span className="ml-2 font-mono text-xs font-normal text-slate-500">
                              ({sub.student.admissionNumber})
                            </span>
                          </p>
                          <p className="text-xs text-slate-500">
                            Submitted on {new Date(sub.submittedAt).toLocaleString()} ·{' '}
                            <span
                              className={`font-semibold ${sub.status === 'LATE' ? 'text-rose-600' : 'text-emerald-600'
                                }`}
                            >
                              {sub.status}
                            </span>
                          </p>
                        </div>

                        {sub.attachmentUrl && (
                          <button
                            type="button"
                            onClick={() =>
                              handleOpenPdf(
                                sub.attachmentUrl!,
                                `Submitted Assignment: ${sub.student?.user ? `${sub.student.user.firstName} ${sub.student.user.lastName}` : 'Student'}`,
                                `${sub.student?.admissionNumber || 'student'}-assignment.pdf`,
                                sub.id
                              )
                            }
                            className="flex items-center gap-1.5 rounded-lg border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-bold text-primary-700 hover:bg-primary-100 shadow-sm"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Open Submitted PDF
                          </button>
                        )}
                      </div>

                      {sub.contentText && (
                        <p className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600">
                          {sub.contentText}
                        </p>
                      )}

                      {/* Grading inputs */}
                      <div className="flex flex-wrap items-end gap-3 rounded-xl bg-slate-50/70 p-3 border border-slate-200">
                        <label className="text-xs font-semibold text-slate-700">
                          Marks / {activeAssignmentForGrading.maxPoints}
                          <input
                            type="number"
                            min="0"
                            max={activeAssignmentForGrading.maxPoints}
                            value={draft.grade}
                            onChange={(e) =>
                              setGradeDrafts((prev) => ({
                                ...prev,
                                [sub.id]: { ...draft, grade: Number(e.target.value) },
                              }))
                            }
                            className="mt-1 block w-24 rounded-lg border border-slate-300 p-1.5 text-xs font-bold"
                          />
                        </label>

                        <label className="flex-1 text-xs font-semibold text-slate-700">
                          Criteria Feedback & Rubric Notes
                          <input
                            placeholder="e.g. Great problem analysis; please improve step 2 formatting."
                            value={draft.feedback}
                            onChange={(e) =>
                              setGradeDrafts((prev) => ({
                                ...prev,
                                [sub.id]: { ...draft, feedback: e.target.value },
                              }))
                            }
                            className="mt-1 block w-full rounded-lg border border-slate-300 p-1.5 text-xs"
                          />
                        </label>

                        <button
                          type="button"
                          disabled={gradeSubmissionMutation.isPending}
                          onClick={() =>
                            gradeSubmissionMutation.mutate({
                              submissionId: sub.id,
                              grade: draft.grade,
                              feedback: draft.feedback,
                            })
                          }
                          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                        >
                          Save Grade
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-4 flex justify-end border-t pt-3">
              <button
                type="button"
                onClick={() => setActiveAssignmentForGrading(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: IN-APP PDF VIEWER & DOWNLOADER */}
      {activePdfPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="relative flex flex-col w-full max-w-4xl max-h-[90vh] rounded-2xl bg-white p-5 shadow-2xl border border-slate-200">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary-600" />
                <div>
                  <h3 className="text-base font-bold text-slate-900 leading-none">
                    {activePdfPreview.title}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">{activePdfPreview.fileName}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {(activePdfPreview.blobUrl || activePdfPreview.streamUrl) && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        window.open(
                          activePdfPreview.streamUrl || activePdfPreview.blobUrl,
                          '_blank'
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-sm"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open in New Tab
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleDownloadPdf(
                          activePdfPreview.blobUrl || activePdfPreview.streamUrl!,
                          activePdfPreview.fileName
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-700 shadow-sm"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download PDF
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setActivePdfPreview(null)}
                  className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Embedded PDF Viewer */}
            <div className="flex-1 w-full overflow-hidden rounded-xl bg-slate-100 border border-slate-200 min-h-[520px] flex flex-col">
              {activePdfPreview.blobUrl || activePdfPreview.streamUrl ? (
                <object
                  data={activePdfPreview.blobUrl || activePdfPreview.streamUrl}
                  type="application/pdf"
                  className="w-full h-full min-h-[520px] rounded-xl flex-1"
                >
                  <iframe
                    src={activePdfPreview.streamUrl || activePdfPreview.blobUrl}
                    className="w-full h-full min-h-[520px] rounded-xl"
                    title={activePdfPreview.title}
                  >
                    <div className="flex flex-col items-center justify-center p-8 text-center h-full">
                      <FileText className="h-12 w-12 text-primary-500 mb-3" />
                      <p className="text-sm font-semibold text-slate-800">Previewing: {activePdfPreview.title}</p>
                      <p className="text-xs text-slate-500 mt-1 mb-4">
                        If your browser does not embed inline PDFs, click below to open or download directly.
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          window.open(activePdfPreview.streamUrl || activePdfPreview.blobUrl, '_blank')
                        }
                        className="rounded-xl bg-primary-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-primary-700"
                      >
                        Open PDF in New Window
                      </button>
                    </div>
                  </iframe>
                </object>
              ) : (
                <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                  <AlertCircle className="h-10 w-10 text-amber-500 mb-2" />
                  <p className="text-sm font-semibold text-slate-700">PDF Preview Not Available</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Please use the download button to view the document locally.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
