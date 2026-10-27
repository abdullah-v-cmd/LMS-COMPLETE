import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { redactAuditPayload } from '../src/middleware/audit';
import { BankService } from '../src/modules/finance/bank.service';
import { recordPaymentSchema, bankIntegrationSchema, feeStructureSchema, waiverRequestSchema } from '../src/modules/finance/finance.schemas';
import { UserRole } from '@prisma/client';

describe('Security Audit: Frontend Leak Prevention, SQL Injection Defense & Payment Gateway Security', () => {
  const rootDir = path.resolve(__dirname, '../../');
  const bankSettingsPath = path.resolve(rootDir, 'server/data/bank_settings.json');

  afterAll(() => {
    try {
      if (fs.existsSync(bankSettingsPath)) {
        const raw = JSON.parse(fs.readFileSync(bankSettingsPath, 'utf-8') || '{}');
        delete raw['test-inst-gateway-security'];
        fs.writeFileSync(bankSettingsPath, JSON.stringify(raw, null, 2), 'utf-8');
      }
    } catch {
      // ignore
    }
  });
  const clientSrcDir = path.resolve(rootDir, 'client/src');
  const serverSrcDir = path.resolve(rootDir, 'server/src');

  // =========================================================================
  // 1. FRONTEND DATA & API KEY LEAK PREVENTION
  // =========================================================================
  describe('1. Frontend Codebase Isolation & Secret Leak Defense', () => {
    function getAllFiles(dir: string, extensions: string[]): string[] {
      let results: string[] = [];
      if (!fs.existsSync(dir)) return results;
      const list = fs.readdirSync(dir);
      for (const file of list) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
          results = results.concat(getAllFiles(fullPath, extensions));
        } else if (extensions.some((ext) => file.endsWith(ext))) {
          results.push(fullPath);
        }
      }
      return results;
    }

    it('verifies frontend source code does not contain database connection strings or credentials', () => {
      const clientFiles = getAllFiles(clientSrcDir, ['.ts', '.tsx', '.html', '.js']);
      expect(clientFiles.length).toBeGreaterThan(0);

      const forbiddenPatterns = [
        /postgresql:\/\//i,
        /postgres:\/\//i,
        /mysql:\/\//i,
        /mongodb(\+srv)?:\/\//i,
        /lms_dev_only/i,
        /DATABASE_URL/i,
      ];

      for (const file of clientFiles) {
        const content = fs.readFileSync(file, 'utf-8');
        for (const pattern of forbiddenPatterns) {
          const match = content.match(pattern);
          expect(match, `Forbidden database credential pattern ${pattern} found in ${path.basename(file)}`).toBeNull();
        }
      }
    });

    it('verifies frontend does not import Prisma ORM or server secrets', () => {
      const clientFiles = getAllFiles(clientSrcDir, ['.ts', '.tsx']);
      const forbiddenImports = [
        /@prisma\/client/i,
        /JWT_ACCESS_SECRET/i,
        /JWT_REFRESH_SECRET/i,
        /REPORT_CARD_SIGNING_SECRET/i,
        /COUNSELING_ENCRYPTION_SECRET/i,
      ];

      for (const file of clientFiles) {
        const content = fs.readFileSync(file, 'utf-8');
        for (const pattern of forbiddenImports) {
          const match = content.match(pattern);
          expect(match, `Server secret or Prisma import ${pattern} found in client file ${path.basename(file)}`).toBeNull();
        }
      }
    });

    it('verifies client build config proxies backend API securely without embedding secret environment variables', () => {
      const viteConfigPath = path.resolve(rootDir, 'client/vite.config.ts');
      const content = fs.readFileSync(viteConfigPath, 'utf-8');
      expect(content).toContain('/api');
      expect(content).not.toContain('process.env.DATABASE_URL');
      expect(content).not.toContain('process.env.JWT');
    });
  });

  // =========================================================================
  // 2. ENDPOINT DATA LEAK PREVENTION (PASSWORD HASH & SENSITIVE CREDENTIALS)
  // =========================================================================
  describe('2. Endpoint Data Leak Prevention (Password Hashes & Internal Secrets)', () => {
    it('verifies LMS service course queries explicitly select safe user fields and never leak passwordHash', () => {
      const lmsServicePath = path.resolve(serverSrcDir, 'modules/lms/lms.service.ts');
      const content = fs.readFileSync(lmsServicePath, 'utf-8');

      // Must have SAFE_USER_SELECT defined
      expect(content).toContain('SAFE_USER_SELECT');
      // Must not have un-projected user: true in course queries
      expect(content).not.toMatch(/teacher:\s*\{\s*include:\s*\{\s*user:\s*true\s*\}\s*\}/);
      expect(content).not.toMatch(/student:\s*\{\s*include:\s*\{\s*user:\s*true\s*\}\s*\}/);
    });

    it('verifies Student service queries do not leak passwordHash or mfaSecret in profiles or parent relations', () => {
      const studentServicePath = path.resolve(serverSrcDir, 'modules/students/students.service.ts');
      const content = fs.readFileSync(studentServicePath, 'utf-8');

      expect(content).toContain('SAFE_USER_SELECT');
      expect(content).not.toMatch(/parent:\s*\{\s*include:\s*\{\s*user:\s*true\s*\}\s*\}/);
    });

    it('verifies System database backup and recycle bin queries sanitize user records', () => {
      const systemServicePath = path.resolve(serverSrcDir, 'modules/system/system.service.ts');
      const content = fs.readFileSync(systemServicePath, 'utf-8');

      expect(content).toContain('SAFE_USER_SELECT');
      expect(content).not.toMatch(/teacherProfile\.findMany\(\s*\{\s*where:\s*filter,\s*include:\s*\{\s*user:\s*true\s*\}\s*\}\)/);
    });
  });

  // =========================================================================
  // 3. SQL INJECTION DEFENSE (PRISMA PARAMETERIZATION & ZOD SANITIZATION)
  // =========================================================================
  describe('3. SQL Injection Defense & Query Parameter Sanitization', () => {
    function getAllServerFiles(dir: string): string[] {
      let results: string[] = [];
      const list = fs.readdirSync(dir);
      for (const file of list) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
          results = results.concat(getAllServerFiles(fullPath));
        } else if (file.endsWith('.ts')) {
          results.push(fullPath);
        }
      }
      return results;
    }

    it('verifies zero unsafe raw SQL executions ($queryRawUnsafe or $executeRawUnsafe) in the entire server codebase', () => {
      const files = getAllServerFiles(serverSrcDir);
      for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8');
        expect(content).not.toContain('$queryRawUnsafe');
        expect(content).not.toContain('$executeRawUnsafe');
      }
    });

    it('verifies request schemas block classic SQL injection vectors in UUID fields', () => {
      const injectionPayloads = [
        "' OR '1'='1",
        "'; DROP TABLE users; --",
        "1 UNION SELECT null, username, passwordHash FROM users--",
        "00000000-0000-0000-0000-000000000000' OR '1'='1",
        "admin'--",
      ];

      for (const payload of injectionPayloads) {
        // Record payment UUID checks
        expect(recordPaymentSchema.safeParse({
          invoiceId: payload,
          amount: 100,
          paymentMethod: 'CASH',
        }).success).toBe(false);

        // Fee structure UUID checks
        expect(feeStructureSchema.safeParse({
          academicYearId: payload,
          classGradeId: 'b0184c98-7f09-4b16-a22c-95b8dbf2a010',
          name: 'Tuition Fee',
          amount: 500,
          dueDate: '2026-12-01',
        }).success).toBe(false);

        // Waiver request UUID checks
        expect(waiverRequestSchema.safeParse({
          invoiceId: payload,
          amount: 50,
          reason: 'Hardship exemption',
        }).success).toBe(false);
      }
    });

    it('verifies numeric and date validators reject string concatenation SQL injections', () => {
      expect(feeStructureSchema.safeParse({
        academicYearId: 'a0184c98-7f09-4b16-a22c-95b8dbf2a010',
        classGradeId: 'b0184c98-7f09-4b16-a22c-95b8dbf2a010',
        name: 'Tuition',
        amount: "100 OR 1=1" as any,
        dueDate: "2026-12-01'; DROP TABLE courses;--",
      }).success).toBe(false);
    });
  });

  // =========================================================================
  // 4. PAYMENT GATEWAY SECURITY & AUDIT REDACTION
  // =========================================================================
  describe('4. Payment Gateway Security & Credential Protection', () => {
    it('strictly forbids client-asserted ONLINE payments through manual teller collection schema', () => {
      const res = recordPaymentSchema.safeParse({
        invoiceId: 'a0184c98-7f09-4b16-a22c-95b8dbf2a010',
        amount: 250,
        paymentMethod: 'ONLINE',
        transactionRef: 'txn_fake_123',
      });
      expect(res.success).toBe(false);
    });

    it('accepts legitimate manual payment methods: CASH, CHEQUE, and BANK_TRANSFER', () => {
      const validBase = {
        invoiceId: 'a0184c98-7f09-4b16-a22c-95b8dbf2a010',
        amount: 250,
        transactionRef: 'REF-OFFLINE-9812',
      };

      expect(recordPaymentSchema.safeParse({ ...validBase, paymentMethod: 'CASH' }).success).toBe(true);
      expect(recordPaymentSchema.safeParse({ ...validBase, paymentMethod: 'CHEQUE' }).success).toBe(true);
      expect(recordPaymentSchema.safeParse({ ...validBase, paymentMethod: 'BANK_TRANSFER' }).success).toBe(true);
    });

    it('redacts gateway API keys, merchant secrets, and tokens from audit logs', () => {
      const payload = {
        bankName: 'National Bank',
        gatewayProvider: 'STRIPE',
        gatewayApiKey: 'mock_gateway_api_key_sample1234567890',
        gatewayMerchantId: 'acct_123456789',
        password: 'SuperSecretPassword!',
        token: 'eySampleTokenString',
        deep: {
          subApiKey: 'key_mock_secret_sample',
          mfaSecret: 'JBSWY3DPEHPK3PXP',
          normalTitle: 'Tuition Reserve',
        },
      };

      const redacted = redactAuditPayload(payload) as any;
      expect(redacted.gatewayApiKey).toBe('[REDACTED]');
      expect(redacted.password).toBe('[REDACTED]');
      expect(redacted.token).toBe('[REDACTED]');
      expect(redacted.deep.subApiKey).toBe('[REDACTED]');
      expect(redacted.deep.mfaSecret).toBe('[REDACTED]');
      expect(redacted.deep.normalTitle).toBe('Tuition Reserve');
    });

    it('masks gatewayApiKey for administrators and omits it entirely for public/student view', async () => {
      const testInstitutionId = 'test-inst-gateway-security';

      // 1. Update settings with an API key
      const adminUser = {
        id: 'admin-01',
        email: 'admin@school.test',
        username: 'admin',
        role: UserRole.ROLE_INSTITUTION_ADMIN,
        institutionId: testInstitutionId,
        permissions: [],
      };

      await BankService.updateBankSettings(
        testInstitutionId,
        {
          bankName: 'Test Escrow Bank',
          accountTitle: 'Tuition Account',
          accountNumber: '11223344',
          gatewayProvider: 'STRIPE',
          gatewayApiKey: 'mock_gateway_secret_key_9999',
          isOnlinePaymentEnabled: true,
        },
        adminUser
      );

      // 2. Admin read: Must be masked so the raw secret key is never sent over the wire
      const adminView = await BankService.getBankSettings(testInstitutionId, { maskSecret: true });
      expect(adminView.gatewayApiKey).toBeDefined();
      expect(adminView.gatewayApiKey).toMatch(/^••••••••••••9999$/);
      expect(adminView.gatewayApiKey).not.toContain('mock_gateway_secret_key');

      // 3. Public/Student/Parent read: Must be completely omitted
      const publicView = await BankService.getBankSettings(testInstitutionId, { omitSecret: true });
      expect(publicView.gatewayApiKey).toBeUndefined();
      expect(publicView.bankName).toBe('Test Escrow Bank');
      expect(publicView.accountNumber).toBe('11223344');

      // 4. Retains existing key if masked placeholder is submitted in update
      await BankService.updateBankSettings(
        testInstitutionId,
        {
          bankName: 'Updated Escrow Bank',
          gatewayApiKey: '••••••••••••9999',
        },
        adminUser
      );

      const reCheck = await BankService.getBankSettings(testInstitutionId, { maskSecret: true });
      expect(reCheck.bankName).toBe('Updated Escrow Bank');
      expect(reCheck.gatewayApiKey).toBe('••••••••••••9999');
    });
  });
});
