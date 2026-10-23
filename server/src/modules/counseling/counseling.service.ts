import { CounselingReferralStatus, UserRole } from '@prisma/client';
import { prisma } from '../../utils/prisma';
import { AuthenticatedUser } from '../../types';
import { env } from '../../config/env';
import { decryptCounselingNote, encryptCounselingNote } from './encryption';

const counselors: UserRole[] = [UserRole.ROLE_COUNSELOR];
function requireCounselor(user: AuthenticatedUser) { if (!counselors.includes(user.role)) throw { status: 403, message: 'Counseling records are restricted to assigned counselors' }; }

export class CounselingService {
  static async referralCandidates(user: AuthenticatedUser, institutionId: string) {
    let studentIds: string[] | undefined;
    if (user.role === UserRole.ROLE_PARENT) {
      const parent = await prisma.parentProfile.findFirst({ where: { userId: user.id, institutionId }, select: { id: true } });
      if (!parent) return [];
      const links = await prisma.studentParentRelation.findMany({ where: { parentId: parent.id, student: { institutionId, status: 'ENROLLED' } }, select: { studentId: true } });
      studentIds = links.map((link) => link.studentId);
    } else if (user.role === UserRole.ROLE_CLASS_TEACHER || user.role === UserRole.ROLE_SUBJECT_TEACHER) {
      const profile = await prisma.teacherProfile.findFirst({ where: { userId: user.id, institutionId }, select: { id: true } });
      if (!profile) return [];
      const assignments = await prisma.teacherAssignment.findMany({ where: { teacherId: profile.id, section: { classGrade: { institutionId } } }, select: { sectionId: true } });
      const sectionIds = [...new Set(assignments.map((item) => item.sectionId))];
      return prisma.studentProfile.findMany({ where: { institutionId, status: 'ENROLLED', sectionId: { in: sectionIds } }, select: { id: true, admissionNumber: true, user: { select: { firstName: true, lastName: true } } }, orderBy: { admissionNumber: 'asc' } });
    } else if (user.role !== UserRole.ROLE_COUNSELOR) {
      throw { status: 403, message: 'This role may not select a student for welfare referral' };
    }
    return prisma.studentProfile.findMany({ where: { institutionId, status: 'ENROLLED', ...(studentIds ? { id: { in: studentIds } } : {}) }, select: { id: true, admissionNumber: true, user: { select: { firstName: true, lastName: true } } }, orderBy: { admissionNumber: 'asc' } });
  }

  static async submitReferral(user: AuthenticatedUser, institutionId: string, data: { studentId: string; reason: string }) {
    const student = await prisma.studentProfile.findFirst({ where: { id: data.studentId, institutionId, status: 'ENROLLED' }, select: { id: true, sectionId: true } });
    if (!student) throw { status: 404, message: 'Enrolled student not found in this institution' };
    if (user.role === UserRole.ROLE_PARENT) {
      const parent = await prisma.parentProfile.findFirst({ where: { userId: user.id, institutionId }, select: { id: true } });
      const linked = parent && await prisma.studentParentRelation.findFirst({ where: { parentId: parent.id, studentId: student.id }, select: { id: true } });
      if (!linked) throw { status: 403, message: 'Parents may only refer a verified linked child' };
    } else if (user.role === UserRole.ROLE_CLASS_TEACHER || user.role === UserRole.ROLE_SUBJECT_TEACHER) {
      const profile = await prisma.teacherProfile.findFirst({ where: { userId: user.id, institutionId }, select: { id: true } });
      const assigned = profile && await prisma.teacherAssignment.findFirst({ where: { teacherId: profile.id, sectionId: student.sectionId, section: { classGrade: { institutionId } } }, select: { id: true } });
      if (!assigned) throw { status: 403, message: 'Teachers may only refer students in their assigned sections' };
    } else if (user.role !== UserRole.ROLE_COUNSELOR) {
      throw { status: 403, message: 'This role may not submit a student welfare referral' };
    }
    const referral = await prisma.counselingReferral.create({ data: { institutionId, studentId: student.id, referredByUserId: user.id, reason: null, encryptedReason: encryptCounselingNote(data.reason, env.COUNSELING_ENCRYPTION_SECRET ?? env.JWT_ACCESS_SECRET) } });
    return { id: referral.id, studentId: referral.studentId, status: referral.status, createdAt: referral.createdAt };
  }

  static async referrals(user: AuthenticatedUser, institutionId: string) {
    const counselor = user.role === UserRole.ROLE_COUNSELOR;
    const referrals = await prisma.counselingReferral.findMany({
      where: { institutionId, ...(!counselor && { referredByUserId: user.id }) },
      select: { id: true, studentId: true, reason: true, encryptedReason: true, status: true, reviewedAt: true, createdAt: true, student: { select: { admissionNumber: true, user: { select: { firstName: true, lastName: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    return referrals.map(({ reason, encryptedReason, ...referral }) => ({ ...referral, reason: encryptedReason ? decryptCounselingNote(encryptedReason, env.COUNSELING_ENCRYPTION_SECRET ?? env.JWT_ACCESS_SECRET) : reason }));
  }

  static async reviewReferral(user: AuthenticatedUser, institutionId: string, id: string, status: 'ACCEPTED' | 'DECLINED') {
    requireCounselor(user);
    const update = await prisma.counselingReferral.updateMany({ where: { id, institutionId, status: CounselingReferralStatus.PENDING }, data: { status, reviewedByUserId: user.id, reviewedAt: new Date() } });
    if (!update.count) throw { status: 404, message: 'Pending counseling referral not found' };
    return prisma.counselingReferral.findFirstOrThrow({ where: { id, institutionId }, select: { id: true, studentId: true, status: true, reviewedAt: true } });
  }

  static async cases(user: AuthenticatedUser, institutionId: string) {
    requireCounselor(user);
    const records = await prisma.counselingCase.findMany({ where: { institutionId, counselorId: user.id }, include: { student: { select: { id: true, admissionNumber: true, user: { select: { firstName: true, lastName: true } } } }, supportPlans: { select: { id: true, title: true, goal: true, actions: true, encryptedTitle: true, encryptedGoal: true, encryptedActions: true, status: true, startsAt: true, endsAt: true, followUps: { select: { id: true, dueAt: true, completedAt: true } } } } }, orderBy: { updatedAt: 'desc' } });
    return records.map(({ caseTitle, encryptedCaseTitle, supportPlans, ...record }) => ({
      ...record,
      caseTitle: encryptedCaseTitle ? decryptCounselingNote(encryptedCaseTitle, env.COUNSELING_ENCRYPTION_SECRET ?? env.JWT_ACCESS_SECRET) : caseTitle,
      supportPlans: supportPlans.map(({ title, goal, actions, encryptedTitle, encryptedGoal, encryptedActions, ...plan }) => ({
        ...plan,
        title: encryptedTitle ? decryptCounselingNote(encryptedTitle, env.COUNSELING_ENCRYPTION_SECRET ?? env.JWT_ACCESS_SECRET) : title,
        goal: encryptedGoal ? decryptCounselingNote(encryptedGoal, env.COUNSELING_ENCRYPTION_SECRET ?? env.JWT_ACCESS_SECRET) : goal,
        actions: encryptedActions ? decryptCounselingNote(encryptedActions, env.COUNSELING_ENCRYPTION_SECRET ?? env.JWT_ACCESS_SECRET) : actions,
      })),
    }));
  }

  static async createCase(user: AuthenticatedUser, institutionId: string, data: { studentId: string; caseTitle: string; riskLevel: string }) {
    requireCounselor(user);
    if (!await prisma.studentProfile.findFirst({ where: { id: data.studentId, institutionId, status: 'ENROLLED' }, select: { id: true } })) throw { status: 404, message: 'Enrolled student not found in this institution' };
    const record = await prisma.counselingCase.create({ data: { ...data, caseTitle: null, encryptedCaseTitle: encryptCounselingNote(data.caseTitle, env.COUNSELING_ENCRYPTION_SECRET ?? env.JWT_ACCESS_SECRET), institutionId, counselorId: user.id } });
    return { id: record.id, studentId: record.studentId, caseTitle: data.caseTitle, riskLevel: record.riskLevel, status: record.status };
  }

  static async notes(user: AuthenticatedUser, institutionId: string, caseId: string) {
    requireCounselor(user);
    const counselingCase = await prisma.counselingCase.findFirst({ where: { id: caseId, institutionId, counselorId: user.id }, select: { id: true } });
    if (!counselingCase) throw { status: 404, message: 'Counseling case not found' };
    const notes = await prisma.counselingNote.findMany({ where: { caseId }, orderBy: { sessionDate: 'desc' } });
    return notes.map(({ encryptedNotes, encryptedActionPlan, actionPlan: _legacyActionPlan, ...note }) => ({ ...note, notes: decryptCounselingNote(encryptedNotes, env.COUNSELING_ENCRYPTION_SECRET ?? env.JWT_ACCESS_SECRET), actionPlan: encryptedActionPlan ? decryptCounselingNote(encryptedActionPlan, env.COUNSELING_ENCRYPTION_SECRET ?? env.JWT_ACCESS_SECRET) : null }));
  }

  static async addNote(user: AuthenticatedUser, institutionId: string, caseId: string, data: { sessionDate?: string; notes: string; actionPlan?: string }) {
    requireCounselor(user);
    const counselingCase = await prisma.counselingCase.findFirst({ where: { id: caseId, institutionId, counselorId: user.id }, select: { id: true } });
    if (!counselingCase) throw { status: 404, message: 'Counseling case not found' };
    const note = await prisma.counselingNote.create({ data: { caseId, authorUserId: user.id, sessionDate: data.sessionDate ? new Date(data.sessionDate) : new Date(), encryptedNotes: encryptCounselingNote(data.notes, env.COUNSELING_ENCRYPTION_SECRET ?? env.JWT_ACCESS_SECRET), encryptedActionPlan: data.actionPlan ? encryptCounselingNote(data.actionPlan, env.COUNSELING_ENCRYPTION_SECRET ?? env.JWT_ACCESS_SECRET) : null } });
    return { id: note.id, caseId, sessionDate: note.sessionDate, notes: data.notes, actionPlan: note.actionPlan, createdAt: note.createdAt };
  }

  static async createSupportPlan(user: AuthenticatedUser, institutionId: string, data: { caseId: string; title: string; goal: string; actions: string; startsAt?: string; endsAt?: string }) {
    requireCounselor(user);
    if (!await prisma.counselingCase.findFirst({ where: { id: data.caseId, institutionId, counselorId: user.id }, select: { id: true } })) throw { status: 404, message: 'Counseling case not found' };
    const record = await prisma.counselingSupportPlan.create({ data: { ...data, title: null, goal: null, actions: null, encryptedTitle: encryptCounselingNote(data.title, env.COUNSELING_ENCRYPTION_SECRET ?? env.JWT_ACCESS_SECRET), encryptedGoal: encryptCounselingNote(data.goal, env.COUNSELING_ENCRYPTION_SECRET ?? env.JWT_ACCESS_SECRET), encryptedActions: encryptCounselingNote(data.actions, env.COUNSELING_ENCRYPTION_SECRET ?? env.JWT_ACCESS_SECRET), institutionId, createdByUserId: user.id, startsAt: data.startsAt ? new Date(data.startsAt) : new Date(), endsAt: data.endsAt ? new Date(data.endsAt) : null } });
    return { id: record.id, caseId: record.caseId, title: data.title, goal: data.goal, actions: data.actions, status: record.status };
  }

  static async addFollowUp(user: AuthenticatedUser, institutionId: string, data: { supportPlanId: string; dueAt: string; notes?: string }) {
    requireCounselor(user);
    const plan = await prisma.counselingSupportPlan.findFirst({ where: { id: data.supportPlanId, institutionId, counselingCase: { counselorId: user.id } }, select: { id: true } });
    if (!plan) throw { status: 404, message: 'Support plan not found' };
    return prisma.counselingFollowUp.create({ data: { supportPlanId: plan.id, dueAt: new Date(data.dueAt), createdByUserId: user.id, encryptedNotes: data.notes ? encryptCounselingNote(data.notes, env.COUNSELING_ENCRYPTION_SECRET ?? env.JWT_ACCESS_SECRET) : null } });
  }

  static async completeFollowUp(user: AuthenticatedUser, institutionId: string, id: string, notes?: string) {
    requireCounselor(user);
    const followUp = await prisma.counselingFollowUp.findFirst({ where: { id, supportPlan: { institutionId, counselingCase: { counselorId: user.id } } }, select: { id: true } });
    if (!followUp) throw { status: 404, message: 'Follow-up not found' };
    const updated = await prisma.counselingFollowUp.update({ where: { id }, data: { completedAt: new Date(), ...(notes ? { encryptedNotes: encryptCounselingNote(notes, env.COUNSELING_ENCRYPTION_SECRET ?? env.JWT_ACCESS_SECRET) } : {}) } });
    return { id: updated.id, dueAt: updated.dueAt, completedAt: updated.completedAt };
  }

  static async rules(user: AuthenticatedUser, institutionId: string) { requireCounselor(user); return prisma.counselingAtRiskRule.findMany({ where: { institutionId }, orderBy: { name: 'asc' } }); }
  static async saveRule(user: AuthenticatedUser, institutionId: string, data: { name: string; minimumAbsences: number; lookbackDays: number; minimumGradePercent?: number | null; isActive: boolean }) {
    requireCounselor(user);
    return prisma.counselingAtRiskRule.upsert({ where: { institutionId_name: { institutionId, name: data.name } }, create: { ...data, institutionId, updatedByUserId: user.id }, update: { ...data, updatedByUserId: user.id } });
  }

  static async atRiskStudents(user: AuthenticatedUser, institutionId: string) {
    requireCounselor(user);
    const rules = await prisma.counselingAtRiskRule.findMany({ where: { institutionId, isActive: true } });
    if (!rules.length) return [];
    const oldestStart = new Date(Date.now() - Math.max(...rules.map((rule) => rule.lookbackDays)) * 86400000);
    const students = await prisma.studentProfile.findMany({
      where: { institutionId, status: 'ENROLLED' },
      select: { id: true, admissionNumber: true, user: { select: { firstName: true, lastName: true } }, attendanceRecords: { where: { date: { gte: oldestStart }, status: 'ABSENT' }, select: { date: true } }, reportCards: { where: { isPublished: true }, orderBy: { publishedAt: 'desc' }, take: 1, select: { percentage: true, examSession: { select: { name: true } } } } },
    });
    return students.flatMap((student) => {
      const matched = rules.flatMap((rule) => {
        const start = Date.now() - rule.lookbackDays * 86400000;
        const absenceCount = student.attendanceRecords.filter((item) => item.date.getTime() >= start).length;
        const reasons: string[] = [];
        if (absenceCount >= rule.minimumAbsences) reasons.push(`${absenceCount} absences in ${rule.lookbackDays} days`);
        const latest = student.reportCards[0];
        if (rule.minimumGradePercent !== null && rule.minimumGradePercent !== undefined && latest && latest.percentage < rule.minimumGradePercent) reasons.push(`${latest.percentage.toFixed(1)}% in ${latest.examSession.name}`);
        return reasons.length ? [{ rule: rule.name, reasons }] : [];
      });
      return matched.length ? [{ studentId: student.id, admissionNumber: student.admissionNumber, firstName: student.user.firstName, lastName: student.user.lastName, matches: matched }] : [];
    });
  }
}
