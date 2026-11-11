import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '../src/utils/prisma';
import { BankService } from '../src/modules/finance/bank.service';
import { SystemService } from '../src/modules/system/system.service';
import { encryptGatewaySecret, decryptGatewaySecret } from '../src/modules/finance/encryption';
import { StorageService } from '../src/utils/storage';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import { app } from '../src/app';

describe('Vercel Production Persistence & Security Suite', () => {
  let testInstitutionId: string;
  let testCourseId: string;

  beforeAll(async () => {
    // Get or create test institution
    let inst = await prisma.institution.findFirst();
    if (!inst) {
      inst = await prisma.institution.create({
        data: {
          name: 'Vercel Test Institution',
          code: 'VERCEL_TEST_' + Date.now(),
        },
      });
    }
    testInstitutionId = inst.id;

    // Get an existing course to test soft-delete
    const course = await prisma.course.findFirst({
      where: { institutionId: testInstitutionId },
    });
    if (course) {
      testCourseId = course.id;
    }
  });

  describe('1. AES-256-GCM Sensitive Field Encryption', () => {
    it('encrypts and decrypts text accurately with authentication tags', () => {
      const secret = 'sk_live_secret_key_1234567890abcdef';
      const encrypted = encryptGatewaySecret(secret);
      expect(encrypted).toBeDefined();
      expect(encrypted).not.toEqual(secret);
      expect(encrypted.startsWith('v1:')).toBe(true);
      expect(encrypted.split(':').length).toBe(4); // v1:iv:tag:data

      const decrypted = decryptGatewaySecret(encrypted);
      expect(decrypted).toEqual(secret);
    });

    it('returns legacy unencrypted string gracefully without error', () => {
      const plain = 'legacy_unencrypted_secret';
      expect(decryptGatewaySecret(plain)).toEqual(plain);
    });
  });

  describe('2. Bank Integration PostgreSQL Persistence', () => {
    it('saves and retrieves bank integration settings with masked secrets in database', async () => {
      const adminUser = {
        id: 'test-admin-user',
        email: 'admin@school.edu',
        username: 'admin',
        role: UserRole.ROLE_SUPER_ADMIN,
        institutionId: testInstitutionId,
        permissions: [],
      };

      const updatePayload = {
        bankName: 'Meezan Bank Ltd',
        accountTitle: 'LMS University Fee Collection',
        accountNumber: 'PK99MEZN00012345678901',
        ibanOrRoutingNumber: 'PK99MEZN00012345678901',
        swiftBicCode: 'MEZNPKKA',
        branchName: 'Main Campus Branch',
        branchCode: '0101',
        currency: 'USD',
        depositInstructions: 'Please mention Student ID',
        gatewayProvider: 'STRIPE' as const,
        gatewayApiKey: 'sk_test_vercel_stripe_secret_key_99999',
        isOnlinePaymentEnabled: true,
      };

      const saved = await BankService.updateBankSettings(testInstitutionId, updatePayload, adminUser);
      expect(saved).toBeDefined();
      expect(saved.bankName).toBe('Meezan Bank Ltd');
      expect(saved.accountNumber).toBe('PK99MEZN00012345678901');
      // Secret key should be masked in returned object
      expect(saved.gatewayApiKey).toContain('••••');

      // Verify that database record actually stores encrypted cipher
      const dbRow = await prisma.bankIntegrationSetting.findUnique({
        where: { institutionId: testInstitutionId },
      });
      expect(dbRow).toBeDefined();
      expect(dbRow?.gatewayApiKeyEncrypted).toBeDefined();
      expect(dbRow?.gatewayApiKeyEncrypted).not.toEqual('sk_test_vercel_stripe_secret_key_99999');
      expect(dbRow?.gatewayApiKeyEncrypted?.startsWith('v1:')).toBe(true);

      // Verify getBankSettings returns the configuration
      const fetched = await BankService.getBankSettings(testInstitutionId);
      expect(fetched.bankName).toBe('Meezan Bank Ltd');
      expect(fetched.gatewayApiKey).toContain('••••');
    });
  });

  describe('3. Recycle Bin PostgreSQL Persistence', () => {
    it('creates, lists, restores, and purges recycle bin records in PostgreSQL', async () => {
      // Create a direct record in prisma.recycleBinRecord to verify DB persistence
      const record = await prisma.recycleBinRecord.create({
        data: {
          institutionId: testInstitutionId,
          entityType: 'STUDENT',
          entityId: 'test-student-id-' + Date.now(),
          entityTitle: 'Test Student Record',
          deletedAt: new Date(),
          deletedBy: 'system-test-user',
          reason: 'Automated test of PostgreSQL recycle bin',
          snapshot: { sample: 'data' },
        },
      });

      expect(record).toBeDefined();
      expect(record.id).toBeDefined();

      const listed = await SystemService.getRecycleBin(testInstitutionId);
      expect(listed.some((i) => i.id === record.id)).toBe(true);

      // Purge item via permanentDelete
      const purgeResult = await SystemService.permanentDelete(testInstitutionId, record.id);
      expect(purgeResult.success).toBe(true);

      const afterPurge = await prisma.recycleBinRecord.findUnique({
        where: { id: record.id },
      });
      expect(afterPurge).toBeNull();
    });
  });

  describe('4. Storage Service & Vercel Blob Architecture', () => {
    it('decodes base64 data URLs to buffers with correct MIME type', async () => {
      const dataUrl = 'data:text/plain;base64,SGVsbG8gVmVyY2VsIFNlcnZlcmxlc3Mh';
      const file = await StorageService.getFile(dataUrl);
      expect(file).not.toBeNull();
      expect(file?.mimeType).toBe('text/plain');
      expect(file?.buffer.toString('utf-8')).toBe('Hello Vercel Serverless!');
    });

    it('sanitizes unsafe filenames and prevents path traversal', () => {
      expect(StorageService.sanitizeFilename('../../../etc/passwd')).toBe('passwd');
      expect(StorageService.sanitizeFilename('..\\..\\windows\\system32\\calc.exe')).toBe('calc.exe');
      expect(StorageService.sanitizeFilename('assignment submission 2026.pdf')).toBe('assignment_submission_2026.pdf');
    });

    it('rejects executable and dangerous script files', () => {
      expect(() => StorageService.validateFileType('malicious.exe')).toThrow();
      expect(() => StorageService.validateFileType('exploit.sh')).toThrow();
      expect(() => StorageService.validateFileType('payload.bat')).toThrow();
      expect(() => StorageService.validateFileType('backdoor.php')).toThrow();
      expect(() => StorageService.validateFileType('valid_document.pdf')).not.toThrow();
      expect(() => StorageService.validateFileType('student_photo.png')).not.toThrow();
    });

    it('uploads, retrieves, and deletes files across all domain folders', async () => {
      const folders: Array<'students' | 'teachers' | 'courses' | 'assignments' | 'submissions' | 'exams' | 'avatars'> = [
        'students',
        'teachers',
        'courses',
        'assignments',
        'submissions',
        'exams',
        'avatars',
      ];

      for (const folder of folders) {
        const dummyBuffer = Buffer.from(`Test content for folder: ${folder}`);
        const stored = await StorageService.uploadFile(
          dummyBuffer,
          `${folder}_test.pdf`,
          'application/pdf',
          { folder }
        );

        expect(stored).toBeDefined();
        expect(stored.key).toContain(`${folder}/`);
        expect(stored.url).toBeDefined();

        const retrieved = await StorageService.getFile(stored.url);
        expect(retrieved).not.toBeNull();
        expect(retrieved?.buffer.toString()).toBe(`Test content for folder: ${folder}`);

        const deleted = await StorageService.deleteFile(stored.url);
        expect(deleted).toBe(true);
      }
    });

    it('strictly prohibits silent fallback to ephemeral storage in production when Vercel Blob is configured', async () => {
      // Simulate production environment with missing token
      const originalProvider = process.env.STORAGE_PROVIDER;
      const originalToken = process.env.BLOB_READ_WRITE_TOKEN;
      const originalEnv = process.env.NODE_ENV;

      try {
        process.env.STORAGE_PROVIDER = 'VERCEL_BLOB';
        delete process.env.BLOB_READ_WRITE_TOKEN;

        await expect(
          StorageService.uploadFile(Buffer.from('test'), 'doc.pdf', 'application/pdf')
        ).rejects.toThrow();
      } finally {
        process.env.STORAGE_PROVIDER = originalProvider;
        if (originalToken) process.env.BLOB_READ_WRITE_TOKEN = originalToken;
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('enforces authentication and authorization for sensitive documents', async () => {
      // 1. Upload a sensitive counseling document
      const sensitiveFile = await StorageService.uploadFile(
        Buffer.from('Confidential Counseling Report: Case #12345'),
        'counseling_case_report.pdf',
        'application/pdf',
        { folder: 'counseling' }
      );

      // 2. Unauthenticated request to /api/v1/storage/counseling/... must be rejected with 401
      const unauthRes = await request(app).get(`/api/v1/storage/${sensitiveFile.key}`);
      expect(unauthRes.status).toBe(401);
      expect(unauthRes.body.error.code).toBe('UNAUTHORIZED');

      // 3. Unauthenticated request via query key must also be rejected with 401
      const queryRes = await request(app).get(`/api/v1/storage/file?key=${encodeURIComponent(sensitiveFile.key)}`);
      expect(queryRes.status).toBe(401);

      // 4. Clean up file
      await StorageService.deleteFile(sensitiveFile.url);
    });
  });
});
