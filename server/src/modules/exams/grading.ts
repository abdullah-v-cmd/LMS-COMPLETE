export type GradeBand = { minimumPercentage: number; gradeLetter: string; gpa: number };

export const DEFAULT_GRADE_BANDS: GradeBand[] = [
  { minimumPercentage: 90, gradeLetter: 'A+', gpa: 4 },
  { minimumPercentage: 80, gradeLetter: 'A', gpa: 3.5 },
  { minimumPercentage: 70, gradeLetter: 'B', gpa: 3 },
  { minimumPercentage: 60, gradeLetter: 'C', gpa: 2.5 },
  { minimumPercentage: 50, gradeLetter: 'D', gpa: 2 },
  { minimumPercentage: 0, gradeLetter: 'F', gpa: 0 },
];

export function calculateGrade(percentage: number, bands: GradeBand[]) {
  const band = [...bands].sort((a, b) => b.minimumPercentage - a.minimumPercentage)
    .find((item) => percentage >= item.minimumPercentage);
  if (!band) throw new Error('A grading scale must include a band beginning at 0 percent');
  return { gradeLetter: band.gradeLetter, gpa: band.gpa };
}
