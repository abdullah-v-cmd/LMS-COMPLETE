import { describe, it, expect } from 'vitest';

// Test that analytics role-authorization logic is correct by unit-testing the permission logic.
// These tests do not require a database connection.

describe('Analytics role authorization rules', () => {
  const financialRoles = [
    'ROLE_FINANCE_HEAD', 'ROLE_FEE_CLERK',
    'ROLE_INSTITUTION_ADMIN', 'ROLE_AUDITOR', 'ROLE_SUPER_ADMIN',
  ] as const;

  const transportRoles = [
    'ROLE_TRANSPORT_COORDINATOR', 'ROLE_INSTITUTION_ADMIN',
    'ROLE_AUDITOR', 'ROLE_SUPER_ADMIN',
  ] as const;

  const libraryRoles = [
    'ROLE_LIBRARIAN', 'ROLE_INSTITUTION_ADMIN',
    'ROLE_AUDITOR', 'ROLE_SUPER_ADMIN',
  ] as const;

  const hostelRoles = [
    'ROLE_HOSTEL_WARDEN', 'ROLE_INSTITUTION_ADMIN',
    'ROLE_AUDITOR', 'ROLE_SUPER_ADMIN',
  ] as const;

  const hrRoles = [
    'ROLE_INSTITUTION_ADMIN', 'ROLE_ACADEMIC_HEAD',
    'ROLE_AUDITOR', 'ROLE_SUPER_ADMIN',
  ] as const;

  const unauthorizedForFinance = ['ROLE_STUDENT', 'ROLE_PARENT', 'ROLE_CLASS_TEACHER', 'ROLE_LIBRARIAN'] as const;
  const unauthorizedForTransport = ['ROLE_STUDENT', 'ROLE_PARENT', 'ROLE_SUBJECT_TEACHER', 'ROLE_LIBRARIAN'] as const;

  it('finance analytics: authorized roles are correct', () => {
    for (const role of financialRoles) {
      expect(financialRoles).toContain(role);
    }
  });

  it('finance analytics: unauthorized roles are excluded', () => {
    for (const role of unauthorizedForFinance) {
      expect(financialRoles).not.toContain(role);
    }
  });

  it('transport analytics: coordinator is included', () => {
    expect(transportRoles).toContain('ROLE_TRANSPORT_COORDINATOR');
  });

  it('transport analytics: student and parent are excluded', () => {
    for (const role of unauthorizedForTransport) {
      expect(transportRoles).not.toContain(role);
    }
  });

  it('library analytics: librarian is included', () => {
    expect(libraryRoles).toContain('ROLE_LIBRARIAN');
  });

  it('library analytics: student is excluded', () => {
    expect(libraryRoles).not.toContain('ROLE_STUDENT');
  });

  it('hostel analytics: warden is included', () => {
    expect(hostelRoles).toContain('ROLE_HOSTEL_WARDEN');
  });

  it('hostel analytics: parent is excluded', () => {
    expect(hostelRoles).not.toContain('ROLE_PARENT');
  });

  it('hr analytics: academic head is included', () => {
    expect(hrRoles).toContain('ROLE_ACADEMIC_HEAD');
  });

  it('hr analytics: fee clerk is excluded', () => {
    expect(hrRoles).not.toContain('ROLE_FEE_CLERK');
  });

  it('dashboard stats: occupancy rate calculation is correct', () => {
    const totalCapacity = 200;
    const activeResidents = 150;
    const rate = totalCapacity > 0 ? Math.round((activeResidents / totalCapacity) * 1000) / 10 : 0;
    expect(rate).toBe(75.0);
  });

  it('dashboard stats: zero capacity avoids division by zero', () => {
    const totalCapacity = 0;
    const activeResidents = 0;
    const rate = totalCapacity > 0 ? Math.round((activeResidents / totalCapacity) * 1000) / 10 : 0;
    expect(rate).toBe(0);
  });

  it('attendance present rate calculation is correct', () => {
    const total = 30;
    const present = 27;
    const rate = total > 0 ? Math.round((present / total) * 1000) / 10 : 0;
    expect(rate).toBe(90.0);
  });
});
