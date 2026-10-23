import { describe, expect, it } from 'vitest';
import { calculateGrade, DEFAULT_GRADE_BANDS } from '../src/modules/exams/grading';

describe('Configurable examination grade calculations', () => {
  const bands = [
    { minimumPercentage: 0, gradeLetter: 'F', gpa: 0 },
    { minimumPercentage: 60, gradeLetter: 'C', gpa: 2 },
    { minimumPercentage: 80, gradeLetter: 'A', gpa: 4 },
  ];

  it('uses inclusive lower thresholds and the highest matching band', () => {
    expect(calculateGrade(59.99, bands)).toEqual({ gradeLetter: 'F', gpa: 0 });
    expect(calculateGrade(60, bands)).toEqual({ gradeLetter: 'C', gpa: 2 });
    expect(calculateGrade(79.99, bands)).toEqual({ gradeLetter: 'C', gpa: 2 });
    expect(calculateGrade(80, bands)).toEqual({ gradeLetter: 'A', gpa: 4 });
    expect(calculateGrade(100, bands)).toEqual({ gradeLetter: 'A', gpa: 4 });
  });

  it('preserves the existing default grading outcomes when no institution scale is saved', () => {
    expect(calculateGrade(89.99, DEFAULT_GRADE_BANDS)).toEqual({ gradeLetter: 'A', gpa: 3.5 });
    expect(calculateGrade(90, DEFAULT_GRADE_BANDS)).toEqual({ gradeLetter: 'A+', gpa: 4 });
  });

  it('rejects calculation if a corrupt persisted scale has no zero threshold', () => {
    expect(() => calculateGrade(30, [{ minimumPercentage: 50, gradeLetter: 'P', gpa: 2 }])).toThrow(/beginning at 0/);
  });
});
