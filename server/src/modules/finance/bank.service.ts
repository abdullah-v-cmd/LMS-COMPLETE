import fs from 'fs';
import path from 'path';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../../types';
import { prisma } from '../../utils/prisma';
import { encryptGatewaySecret, decryptGatewaySecret } from './encryption';
import { logger } from '../../utils/logger';

export interface BankIntegrationConfig {
  institutionId: string;
  bankName: string;
  accountTitle: string;
  accountNumber: string;
  ibanOrRoutingNumber: string;
  swiftBicCode: string;
  branchName: string;
  branchCode: string;
  currency: string;
  depositInstructions: string;
  gatewayProvider: 'MANUAL_DEPOSIT' | 'STRIPE' | 'PAYPAL' | 'CUSTOM_GATEWAY';
  gatewayApiKey?: string;
  gatewayMerchantId?: string;
  isOnlinePaymentEnabled: boolean;
  isGatewayApiKeyConfigured?: boolean;
  updatedAt: string;
  updatedBy?: string;
}

const LEGACY_DATA_FILE = path.resolve(__dirname, '../../../data/bank_settings.json');

export class BankService {
  /**
   * One-time legacy JSON file migration to PostgreSQL.
   */
  private static async migrateLegacyFileIfPresent(institutionId: string) {
    try {
      if (fs.existsSync(LEGACY_DATA_FILE)) {
        const raw = fs.readFileSync(LEGACY_DATA_FILE, 'utf-8');
        const all = JSON.parse(raw || '{}');
        const legacy = all[institutionId];
        if (legacy) {
          const encryptedKey = legacy.gatewayApiKey ? encryptGatewaySecret(legacy.gatewayApiKey) : null;
          return await prisma.bankIntegrationSetting.create({
            data: {
              institutionId,
              bankName: legacy.bankName || 'National Education Bank',
              accountTitle: legacy.accountTitle || 'EduFlow Institutional Tuition Reserve',
              accountNumber: legacy.accountNumber || '0129-84729104-01',
              ibanOrRoutingNumber: legacy.ibanOrRoutingNumber || 'PK82NEBK01298472910401',
              swiftBicCode: legacy.swiftBicCode || 'NEBKPKAXXX',
              branchName: legacy.branchName || 'Main Campus Boulevard Branch',
              branchCode: legacy.branchCode || '0129',
              currency: legacy.currency || 'USD',
              depositInstructions:
                legacy.depositInstructions ||
                'Please specify the Student Admission Number and Invoice Number on your bank deposit slip or mobile bank transfer reference.',
              gatewayProvider: legacy.gatewayProvider || 'MANUAL_DEPOSIT',
              gatewayApiKeyEncrypted: encryptedKey,
              gatewayMerchantId: legacy.gatewayMerchantId || null,
              isOnlinePaymentEnabled: legacy.isOnlinePaymentEnabled ?? true,
              updatedBy: legacy.updatedBy || 'Migrated from local JSON',
            },
          });
        }
      }
    } catch (err: any) {
      logger.warn(`Legacy bank settings migration skipped or already completed: ${err.message}`);
    }
    return null;
  }

  /**
   * Fetches raw record from PostgreSQL (or seeds default if not present).
   */
  private static async getRawSettings(institutionId: string) {
    let setting = await prisma.bankIntegrationSetting.findUnique({
      where: { institutionId },
    });

    if (!setting) {
      // Check if we can migrate from legacy file
      const migrated = await this.migrateLegacyFileIfPresent(institutionId);
      if (migrated) {
        setting = migrated;
      } else {
        // Create default institutional bank setting in PostgreSQL
        setting = await prisma.bankIntegrationSetting.create({
          data: {
            institutionId,
            bankName: 'National Education Bank',
            accountTitle: 'EduFlow Institutional Tuition Reserve',
            accountNumber: '0129-84729104-01',
            ibanOrRoutingNumber: 'PK82NEBK01298472910401',
            swiftBicCode: 'NEBKPKAXXX',
            branchName: 'Main Campus Boulevard Branch',
            branchCode: '0129',
            currency: 'USD',
            depositInstructions:
              'Please specify the Student Admission Number and Invoice Number on your bank deposit slip or mobile bank transfer reference.',
            gatewayProvider: 'MANUAL_DEPOSIT',
            isOnlinePaymentEnabled: true,
            updatedBy: 'System Default',
          },
        });
      }
    }

    const hasConfiguredApiKey = Boolean(setting.gatewayApiKeyEncrypted);
    let decryptedApiKey: string | undefined = undefined;
    if (setting.gatewayApiKeyEncrypted) {
      try {
        decryptedApiKey = decryptGatewaySecret(setting.gatewayApiKeyEncrypted);
      } catch (err: any) {
        logger.error('Failed to decrypt payment gateway API key:', { message: err.message });
      }
    }

    return {
      institutionId: setting.institutionId,
      bankName: setting.bankName,
      accountTitle: setting.accountTitle,
      accountNumber: setting.accountNumber,
      ibanOrRoutingNumber: setting.ibanOrRoutingNumber,
      swiftBicCode: setting.swiftBicCode,
      branchName: setting.branchName,
      branchCode: setting.branchCode,
      currency: setting.currency,
      depositInstructions: setting.depositInstructions,
      gatewayProvider: setting.gatewayProvider as BankIntegrationConfig['gatewayProvider'],
      gatewayApiKey: decryptedApiKey,
      gatewayMerchantId: setting.gatewayMerchantId || undefined,
      isOnlinePaymentEnabled: setting.isOnlinePaymentEnabled,
      isGatewayApiKeyConfigured: hasConfiguredApiKey,
      updatedAt: setting.updatedAt.toISOString(),
      updatedBy: setting.updatedBy || undefined,
    };
  }

  static async getBankSettings(
    institutionId: string,
    options: { omitSecret?: boolean; maskSecret?: boolean } = { maskSecret: true }
  ): Promise<BankIntegrationConfig> {
    const raw = await this.getRawSettings(institutionId);
    const result: BankIntegrationConfig = { ...raw };

    if (options.omitSecret) {
      delete result.gatewayApiKey;
    } else if (options.maskSecret && result.gatewayApiKey) {
      const key = result.gatewayApiKey;
      result.gatewayApiKey = key.length > 4 ? `••••••••••••${key.slice(-4)}` : '••••••••••••';
    }

    return result;
  }

  static async updateBankSettings(
    institutionId: string,
    data: Partial<BankIntegrationConfig>,
    user: AuthenticatedUser
  ): Promise<BankIntegrationConfig> {
    const allowedRoles: UserRole[] = [
      UserRole.ROLE_SUPER_ADMIN,
      UserRole.ROLE_INSTITUTION_ADMIN,
      UserRole.ROLE_FINANCE_HEAD,
    ];

    if (!allowedRoles.includes(user.role)) {
      throw {
        status: 403,
        message: 'You are not authorized to configure bank and payment integration settings.',
      };
    }

    const current = await this.getRawSettings(institutionId);
    let resolvedApiKey = typeof data.gatewayApiKey === 'string' ? data.gatewayApiKey.trim() : undefined;

    // If empty string or masked placeholder submitted, preserve the existing secret key!
    if (!resolvedApiKey || resolvedApiKey.startsWith('••••')) {
      resolvedApiKey = current.gatewayApiKey;
    }

    const encryptedKey = resolvedApiKey
      ? encryptGatewaySecret(resolvedApiKey)
      : undefined;

    await prisma.bankIntegrationSetting.upsert({
      where: { institutionId },
      update: {
        ...(data.bankName ? { bankName: data.bankName } : {}),
        ...(data.accountTitle ? { accountTitle: data.accountTitle } : {}),
        ...(data.accountNumber ? { accountNumber: data.accountNumber } : {}),
        ...(data.ibanOrRoutingNumber ? { ibanOrRoutingNumber: data.ibanOrRoutingNumber } : {}),
        ...(data.swiftBicCode ? { swiftBicCode: data.swiftBicCode } : {}),
        ...(data.branchName ? { branchName: data.branchName } : {}),
        ...(data.branchCode ? { branchCode: data.branchCode } : {}),
        ...(data.currency ? { currency: data.currency } : {}),
        ...(data.depositInstructions ? { depositInstructions: data.depositInstructions } : {}),
        ...(data.gatewayProvider ? { gatewayProvider: data.gatewayProvider } : {}),
        ...(data.gatewayMerchantId !== undefined ? { gatewayMerchantId: data.gatewayMerchantId || null } : {}),
        ...(data.isOnlinePaymentEnabled !== undefined ? { isOnlinePaymentEnabled: data.isOnlinePaymentEnabled } : {}),
        ...(encryptedKey !== undefined ? { gatewayApiKeyEncrypted: encryptedKey } : {}),
        updatedBy: `${user.email} (${user.role})`,
      },
      create: {
        institutionId,
        bankName: data.bankName || current.bankName,
        accountTitle: data.accountTitle || current.accountTitle,
        accountNumber: data.accountNumber || current.accountNumber,
        ibanOrRoutingNumber: data.ibanOrRoutingNumber || current.ibanOrRoutingNumber,
        swiftBicCode: data.swiftBicCode || current.swiftBicCode,
        branchName: data.branchName || current.branchName,
        branchCode: data.branchCode || current.branchCode,
        currency: data.currency || current.currency,
        depositInstructions: data.depositInstructions || current.depositInstructions,
        gatewayProvider: data.gatewayProvider || current.gatewayProvider,
        gatewayMerchantId: data.gatewayMerchantId || null,
        gatewayApiKeyEncrypted: encryptedKey || null,
        isOnlinePaymentEnabled: data.isOnlinePaymentEnabled ?? current.isOnlinePaymentEnabled,
        updatedBy: `${user.email} (${user.role})`,
      },
    });

    return this.getBankSettings(institutionId, { maskSecret: true });
  }
}
