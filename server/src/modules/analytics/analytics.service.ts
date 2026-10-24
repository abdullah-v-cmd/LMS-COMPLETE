import { UserRole } from '@prisma/client';
import { prisma } from '../../utils/prisma';
import { AuthenticatedUser } from '../../types';
import { redis } from '../../utils/redis';

/** Role-scoped analytics aggregated from persisted database records. */
export class AnalyticsService {
  // ─── ATTENDANCE ANALYTICS ─────────────────────────────────────────────────

  static async attendanceSummary(institutionId: string, user: AuthenticatedUser, query: { from?: string; to?: string; sectionId?: string }) {
    const { from, to, sectionId } = query;
    const where: any = { institutionId };
    if (from) where.date = { ...(where.date ?? {}), gte: new Date(from) };
    if (to) where.date = { ...(where.date ?? {}), lte: new Date(to) };

    // Teachers see only their assigned sections
    if (user.role === UserRole.ROLE_CLASS_TEACHER || user.role === UserRole.ROLE_SUBJECT_TEACHER) {
      const teacher = await prisma.teacherProfile.findFirst({ where: { institutionId, userId: user.id }, select: { id: true } });
      if (!teacher) return { total: 0, present: 0, absent: 0, late: 0, excused: 0, presentRate: 0, dailySeries: [] };
      const assignments = await prisma.teacherAssignment.findMany({ where: { teacherId: teacher.id }, select: { sectionId: true } });
      const sectionIds = assignments.map((a: { sectionId: string }) => a.sectionId);
      where.sectionId = sectionId ? (sectionIds.includes(sectionId) ? sectionId : 'none') : { in: sectionIds };
    } else if (sectionId) {
      where.sectionId = sectionId;
    }

    const [statusGroups, dailyGroups] = await Promise.all([
      prisma.attendanceRecord.groupBy({ by: ['status'], where, _count: true }),
      prisma.attendanceRecord.groupBy({ by: ['date'], where, _count: true, orderBy: { date: 'asc' }, take: 90 }),
    ]);

    const counts: Record<string, number> = {};
    for (const g of (statusGroups as any[])) counts[g.status] = g._count;
    const total = Object.values(counts).reduce((s: number, v: number) => s + v, 0);
    const present = counts['PRESENT'] ?? 0;
    return {
      total,
      present,
      absent: counts['ABSENT'] ?? 0,
      late: counts['LATE'] ?? 0,
      excused: counts['EXCUSED'] ?? 0,
      presentRate: total > 0 ? Math.round((present / total) * 1000) / 10 : 0,
      dailySeries: (dailyGroups as any[]).map((g: { date: Date; _count: number }) => ({
        date: g.date.toISOString().slice(0, 10),
        count: g._count,
      })),
    };
  }

  // ─── ACADEMIC / EXAM ANALYTICS ────────────────────────────────────────────

  static async examResultsSummary(institutionId: string, user: AuthenticatedUser, query: { sessionId?: string; academicYearId?: string }) {
    const { sessionId, academicYearId } = query;

    const privileged: string[] = [
      UserRole.ROLE_INSTITUTION_ADMIN, UserRole.ROLE_EXAM_CONTROLLER,
      UserRole.ROLE_ACADEMIC_HEAD, UserRole.ROLE_AUDITOR, UserRole.ROLE_SUPER_ADMIN,
    ];

    const sessionWhere: any = { institutionId };
    if (sessionId) sessionWhere.id = sessionId;
    if (academicYearId) sessionWhere.academicTerm = { academicYear: { id: academicYearId } };
    if (!privileged.includes(user.role)) sessionWhere.status = 'PUBLISHED';

    const sessions = await prisma.examSession.findMany({
      where: sessionWhere,
      select: { id: true, name: true, status: true, _count: { select: { schedules: true } } },
      take: 20,
    });

    const reportCards = await prisma.studentReportCard.groupBy({
      by: ['examSessionId'],
      where: { examSession: sessionWhere },
      _count: true,
      _avg: { gpa: true },
    });
    const cardMap = new Map<string, any>((reportCards as any[]).map((r: any) => [r.examSessionId, r]));

    return sessions.map((s: any) => ({
      sessionId: s.id,
      sessionName: s.name,
      status: s.status,
      scheduleCount: s._count.schedules,
      reportCardCount: cardMap.get(s.id)?._count ?? 0,
      averageGpa: cardMap.get(s.id)?._avg?.gpa ? Math.round(Number(cardMap.get(s.id)!._avg!.gpa!) * 100) / 100 : null,
    }));
  }

  // ─── FINANCE ANALYTICS ────────────────────────────────────────────────────

  static async financeSummary(institutionId: string, user: AuthenticatedUser, query: { from?: string; to?: string }) {
    const financialRoles: string[] = [
      UserRole.ROLE_FINANCE_HEAD, UserRole.ROLE_FEE_CLERK,
      UserRole.ROLE_INSTITUTION_ADMIN, UserRole.ROLE_AUDITOR, UserRole.ROLE_SUPER_ADMIN,
    ];
    if (!financialRoles.includes(user.role)) throw { status: 403, message: 'Finance analytics not authorized for your role' };

    const invoiceWhere: any = { institutionId };
    const paymentWhere: any = { invoice: { institutionId } };
    if (query.from) paymentWhere.paidAt = { gte: new Date(query.from) };
    if (query.to) paymentWhere.paidAt = { ...(paymentWhere.paidAt ?? {}), lte: new Date(query.to) };

    const [invoiceGroups, paymentGroups, defaulterCount] = await Promise.all([
      prisma.studentFeeInvoice.groupBy({ by: ['status'], where: invoiceWhere, _count: true, _sum: { totalAmount: true } }),
      prisma.feePayment.aggregate({ where: paymentWhere, _sum: { amountPaid: true }, _count: true }),
      prisma.studentFeeInvoice.count({ where: { ...invoiceWhere, status: { in: ['UNPAID', 'PARTIAL'] }, dueDate: { lt: new Date() } } }),
    ]);

    const byStatus: Record<string, { count: number; total: number }> = {};
    for (const g of (invoiceGroups as any[])) byStatus[g.status] = { count: g._count, total: Number(g._sum.totalAmount ?? 0) };

    return {
      invoicesByStatus: byStatus,
      totalCollected: Number(paymentGroups._sum.amountPaid ?? 0),
      paymentCount: paymentGroups._count,
      overdueDefaulterCount: defaulterCount,
    };
  }

  // ─── LMS / COURSE ANALYTICS ───────────────────────────────────────────────

  static async lmsSummary(institutionId: string, user: AuthenticatedUser, query: { courseId?: string }) {
    const teachingRoles: string[] = [
      UserRole.ROLE_SUBJECT_TEACHER, UserRole.ROLE_TEACHING_ASSISTANT,
      UserRole.ROLE_INSTITUTION_ADMIN, UserRole.ROLE_ACADEMIC_HEAD,
      UserRole.ROLE_AUDITOR, UserRole.ROLE_SUPER_ADMIN,
    ];

    const courseWhere: any = { institutionId };
    if (query.courseId) courseWhere.id = query.courseId;

    if (user.role === UserRole.ROLE_SUBJECT_TEACHER || user.role === UserRole.ROLE_TEACHING_ASSISTANT) {
      const teacher = await prisma.teacherProfile.findFirst({ where: { institutionId, userId: user.id }, select: { id: true } });
      if (!teacher) return [];
      courseWhere.teacherId = teacher.id;
    } else if (!teachingRoles.includes(user.role)) {
      throw { status: 403, message: 'LMS analytics not authorized for your role' };
    }

    const courses = await prisma.course.findMany({
      where: courseWhere,
      select: {
        id: true,
        subject: { select: { name: true, code: true } },
        section: { select: { id: true, name: true, classGrade: { select: { name: true } } } },
        _count: { select: { assignments: true, modules: true } },
      },
      take: 50,
    });

    const courseIds = courses.map((c: { id: string }) => c.id);
    const sectionIds = [...new Set(courses.map((c: { section: { id: string } }) => c.section.id))];

    const [submissionGroups, gradedGroups, studentCountBySection] = await Promise.all([
      prisma.assignmentSubmission.groupBy({
        by: ['assignmentId'],
        where: { assignment: { courseId: { in: courseIds } } },
        _count: true,
      }),
      prisma.assignmentSubmission.groupBy({
        by: ['assignmentId'],
        where: { assignment: { courseId: { in: courseIds } }, status: 'GRADED' },
        _count: true,
      }),
      prisma.studentProfile.groupBy({
        by: ['sectionId'],
        where: { sectionId: { in: sectionIds }, status: 'ENROLLED' },
        _count: true,
      }),
    ]);

    const sectionStudentMap = new Map<string, number>((studentCountBySection as any[]).map((s: any) => [s.sectionId, s._count]));
    const totalSubmissions = (submissionGroups as any[]).reduce((acc: number, curr: any) => acc + curr._count, 0);
    const totalGraded = (gradedGroups as any[]).reduce((acc: number, curr: any) => acc + curr._count, 0);

    return courses.map((c: any) => ({
      courseId: c.id,
      title: `${c.subject.name} (${c.section.classGrade.name} - ${c.section.name})`,
      enrollments: sectionStudentMap.get(c.section.id) ?? 0,
      modules: c._count.modules,
      assignments: c._count.assignments,
      submissions: totalSubmissions,
      graded: totalGraded,
    }));
  }

  // ─── TRANSPORT ANALYTICS ─────────────────────────────────────────────────

  static async transportSummary(institutionId: string, user: AuthenticatedUser, query: { from?: string; to?: string; routeId?: string }) {
    const allowed: string[] = [
      UserRole.ROLE_TRANSPORT_COORDINATOR, UserRole.ROLE_INSTITUTION_ADMIN,
      UserRole.ROLE_AUDITOR, UserRole.ROLE_SUPER_ADMIN,
    ];
    if (!allowed.includes(user.role)) throw { status: 403, message: 'Transport analytics not authorized for your role' };

    const where: any = { route: { institutionId } };
    if (query.from) where.serviceDate = { gte: new Date(query.from) };
    if (query.to) where.serviceDate = { ...(where.serviceDate ?? {}), lte: new Date(query.to) };
    if (query.routeId) where.routeId = query.routeId;

    const [statusGroups, routeGroups, chargeAgg] = await Promise.all([
      prisma.transportAttendance.groupBy({ by: ['status'], where, _count: true }),
      prisma.transportAttendance.groupBy({ by: ['routeId'], where, _count: true }),
      prisma.transportMonthlyCharge.aggregate({ where: { route: { institutionId } }, _count: true, _sum: { amount: true } }),
    ]);

    const routeIds = (routeGroups as any[]).map((g: any) => g.routeId);
    const routes = await prisma.transportRoute.findMany({ where: { id: { in: routeIds } }, select: { id: true, name: true } });
    const routeNameMap = new Map<string, string>(routes.map((r: { id: string; name: string }) => [r.id, r.name]));

    return {
      byStatus: (statusGroups as any[]).map((g: any) => ({ status: g.status, count: g._count })),
      byRoute: (routeGroups as any[]).map((g: any) => ({ routeId: g.routeId, routeName: routeNameMap.get(g.routeId) ?? g.routeId, count: g._count })),
      billingCharges: chargeAgg._count,
      totalBilled: Number(chargeAgg._sum.amount ?? 0),
    };
  }

  // ─── LIBRARY ANALYTICS ────────────────────────────────────────────────────

  static async librarySummary(institutionId: string, user: AuthenticatedUser) {
    const allowed: string[] = [
      UserRole.ROLE_LIBRARIAN, UserRole.ROLE_INSTITUTION_ADMIN,
      UserRole.ROLE_AUDITOR, UserRole.ROLE_SUPER_ADMIN,
    ];
    if (!allowed.includes(user.role)) throw { status: 403, message: 'Library analytics not authorized for your role' };

    const [catalogCount, copyGroups, loanGroups, reservations, auditSnapshots] = await Promise.all([
      prisma.bookCatalog.count({ where: { institutionId } }),
      prisma.bookCopy.groupBy({ by: ['status'], where: { book: { institutionId } }, _count: true }),
      prisma.bookBorrowRecord.groupBy({ by: ['status'], where: { book: { institutionId } }, _count: true }),
      prisma.libraryReservation.count({ where: { institutionId, status: 'QUEUED' } }),
      prisma.libraryInventoryAudit.findMany({
        where: { institutionId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          createdAt: true,
          scannedCount: true,
          expectedCount: true,
          book: { select: { title: true } },
        },
      }),
    ]);

    return {
      catalogBooks: catalogCount,
      copyStatus: (copyGroups as any[]).map((g: any) => ({ status: g.status, count: g._count })),
      loanStatus: (loanGroups as any[]).map((g: any) => ({ status: g.status, count: g._count })),
      waitingReservations: reservations,
      recentAudits: (auditSnapshots as any[]).map((a: any) => ({
        id: a.id,
        auditedAt: a.createdAt,
        title: a.book.title,
        expectedCount: a.expectedCount,
        scannedCount: a.scannedCount,
      })),
    };
  }

  // ─── HOSTEL ANALYTICS ────────────────────────────────────────────────────

  static async hostelSummary(institutionId: string, user: AuthenticatedUser) {
    const allowed: string[] = [
      UserRole.ROLE_HOSTEL_WARDEN, UserRole.ROLE_INSTITUTION_ADMIN,
      UserRole.ROLE_AUDITOR, UserRole.ROLE_SUPER_ADMIN,
    ];
    if (!allowed.includes(user.role)) throw { status: 403, message: 'Hostel analytics not authorized for your role' };

    const [blockCount, roomAgg, activeResidents, incidentGroups, messChargeGroups] = await Promise.all([
      prisma.hostelBlock.count({ where: { institutionId } }),
      prisma.hostelRoom.aggregate({
        where: { block: { institutionId } },
        _count: true,
        _sum: { capacity: true, occupiedBeds: true },
      }),
      prisma.hostelBedAllocation.count({ where: { room: { block: { institutionId } } } }),
      prisma.hostelIncident.groupBy({ by: ['category'], where: { institutionId }, _count: true }),
      prisma.hostelMessCharge.groupBy({ by: ['status'], where: { institutionId }, _count: true, _sum: { amount: true } }),
    ]);

    const totalCapacity = roomAgg._sum?.capacity ?? 0;
    return {
      blocks: blockCount,
      totalRooms: roomAgg._count,
      totalCapacity,
      activeResidents,
      occupancyRate: totalCapacity > 0 ? Math.round((activeResidents / totalCapacity) * 1000) / 10 : 0,
      incidents: (incidentGroups as any[]).map((g: any) => ({ category: g.category, count: g._count })),
      messCharges: (messChargeGroups as any[]).map((g: any) => ({ status: g.status, count: g._count, total: Number(g._sum.amount ?? 0) })),
    };
  }

  // ─── STAFF / HR ANALYTICS ────────────────────────────────────────────────

  static async hrSummary(institutionId: string, user: AuthenticatedUser) {
    const allowed: string[] = [
      UserRole.ROLE_INSTITUTION_ADMIN, UserRole.ROLE_ACADEMIC_HEAD,
      UserRole.ROLE_AUDITOR, UserRole.ROLE_SUPER_ADMIN,
    ];
    if (!allowed.includes(user.role)) throw { status: 403, message: 'HR analytics not authorized for your role' };

    const [teacherCount, leaveGroups, payrollRuns] = await Promise.all([
      prisma.teacherProfile.count({ where: { institutionId } }),
      prisma.staffLeaveRequest.groupBy({ by: ['status'], where: { teacher: { institutionId } }, _count: true }),
      prisma.payrollRun.findMany({
        where: { institutionId },
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: {
          id: true,
          period: true,
          totalGross: true,
          _count: { select: { entries: true } },
        },
      }),
    ]);

    return {
      totalTeachers: teacherCount,
      leaveByStatus: (leaveGroups as any[]).map((g: any) => ({ status: g.status, count: g._count })),
      recentPayrolls: (payrollRuns as any[]).map((r: any) => ({
        id: r.id,
        period: r.period,
        totalGross: Number(r.totalGross),
        staffCount: r._count.entries,
      })),
    };
  }

  // ─── DASHBOARD OVERVIEW (with Redis 60s caching) ─────────────────────────

  static async dashboardStats(institutionId: string, user: AuthenticatedUser) {
    const cacheKey = `analytics:dash:${institutionId}:${user.id}:${user.role}`;
    const cached = await redis.get<any>(cacheKey);
    if (cached) return cached;

    const role = user.role;
    let result: any;

    // Student: own attendance, enrolled courses, upcoming exams
    if (role === UserRole.ROLE_STUDENT) {
      const profile = await prisma.studentProfile.findFirst({ where: { institutionId, userId: user.id }, select: { id: true, sectionId: true } });
      if (!profile) {
        result = { student: null };
      } else {
        const [courseCount, attendanceSummary, reportCards] = await Promise.all([
          prisma.course.count({ where: { sectionId: profile.sectionId, institutionId } }),
          prisma.attendanceRecord.groupBy({ by: ['status'], where: { studentId: profile.id, institutionId }, _count: true }),
          prisma.studentReportCard.count({ where: { studentId: profile.id, institutionId } }),
        ]);
        const attendMap: Record<string, number> = {};
        for (const g of (attendanceSummary as any[])) attendMap[g.status] = g._count;
        result = {
          student: { enrollments: courseCount, attendanceSummary: attendMap, reportCards },
        };
      }
    } else if (role === UserRole.ROLE_PARENT) {
      // Parent: children status
      const parent = await prisma.parentProfile.findFirst({ where: { institutionId, userId: user.id }, select: { id: true } });
      if (!parent) {
        result = { children: [] };
      } else {
        const children = await prisma.studentParentRelation.findMany({
          where: { parentId: parent.id, student: { institutionId } },
          select: { student: { select: { id: true, admissionNumber: true, user: { select: { firstName: true, lastName: true } } } } },
        });
        result = { children: (children as any[]).map((c: any) => c.student) };
      }
    } else if (role === UserRole.ROLE_SUBJECT_TEACHER || role === UserRole.ROLE_CLASS_TEACHER) {
      // Teacher: courses and recent assignments
      const teacher = await prisma.teacherProfile.findFirst({ where: { institutionId, userId: user.id }, select: { id: true } });
      if (!teacher) {
        result = { teacher: null };
      } else {
        const [courseCount, assignmentCount] = await Promise.all([
          prisma.course.count({ where: { teacherId: teacher.id, institutionId } }),
          prisma.assignment.count({ where: { course: { teacherId: teacher.id, institutionId } } }),
        ]);
        result = { teacher: { courses: courseCount, assignments: assignmentCount } };
      }
    } else {
      // Admin/HOD/Coordinator: institution-wide summary
      const [studentCount, teacherCount, courseCount, unpaidInvoices] = await Promise.all([
        prisma.studentProfile.count({ where: { institutionId } }),
        prisma.teacherProfile.count({ where: { institutionId } }),
        prisma.course.count({ where: { institutionId } }),
        prisma.studentFeeInvoice.count({ where: { institutionId, status: { in: ['UNPAID', 'PARTIAL'] } } }),
      ]);

      result = {
        institution: { students: studentCount, teachers: teacherCount, courses: courseCount, unpaidInvoices },
      };
    }

    // Cache for 60 seconds
    await redis.set(cacheKey, result, 60);
    return result;
  }
}
