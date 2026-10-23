import { createHmac, timingSafeEqual } from 'crypto';

export type ReportCardIntegrityData = {
  id: string;
  institutionId: string;
  studentId: string;
  examSessionId: string;
  totalMarks: number;
  percentage: number;
  gpa: number | null;
  gradeLetter: string | null;
  rank: number | null;
  publishedAt: Date | null;
};

export function signReportCard(data: ReportCardIntegrityData, secret: string) {
  const canonical = JSON.stringify({
    id: data.id,
    institutionId: data.institutionId,
    studentId: data.studentId,
    examSessionId: data.examSessionId,
    totalMarks: data.totalMarks,
    percentage: data.percentage,
    gpa: data.gpa,
    gradeLetter: data.gradeLetter,
    rank: data.rank,
    publishedAt: data.publishedAt?.toISOString() ?? null,
  });
  return createHmac('sha256', secret).update(canonical).digest('hex');
}

export function verifyReportCardSignature(data: ReportCardIntegrityData, provided: string, secret: string) {
  if (!/^[a-f0-9]{64}$/i.test(provided)) return false;
  const expected = Buffer.from(signReportCard(data, secret), 'hex');
  const actual = Buffer.from(provided, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
