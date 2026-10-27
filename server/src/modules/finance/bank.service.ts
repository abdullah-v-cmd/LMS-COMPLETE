import fs from 'fs';
import path from 'path';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../../types';

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
  updatedAt: string;
  updatedBy?: string;
}

const DATA_DIR = path.resolve(__dirname, '../../../data');
const SETTINGS_FILE = path.join(DATA_DIR, 'bank_settings.json');

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(SETTINGS_FILE)) {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify({}, null, 2), 'utf-8');
  }
}

function readAllSettings(): Record<string, BankIntegrationConfig> {
  try {
    ensureDataFile();
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    return JSON.parse(raw || '{}');
  } catch (err) {
    console.error('Error reading bank_settings.json:', err);
    return {};
  }
}

function writeAllSettings(settings: Record<string, BankIntegrationConfig>) {
  ensureDataFile();
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
}

export class BankService {
  private static getRawSettings(institutionId: string): BankIntegrationConfig {
    const all = readAllSettings();
    if (all[institutionId]) {
      return all[institutionId];
    }

    const defaultConfig: BankIntegrationConfig = {
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
      updatedAt: new Date().toISOString(),
      updatedBy: 'System Default',
    };

    all[institutionId] = defaultConfig;
    writeAllSettings(all);
    return defaultConfig;
  }

  static async getBankSettings(
    institutionId: string,
    options: { omitSecret?: boolean; maskSecret?: boolean } = { maskSecret: true }
  ): Promise<BankIntegrationConfig> {
    const raw = this.getRawSettings(institutionId);
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

    const current = this.getRawSettings(institutionId);
    let resolvedApiKey = data.gatewayApiKey;
    // If the client submitted a masked placeholder, keep the existing secret key
    if (resolvedApiKey && resolvedApiKey.startsWith('••••')) {
      resolvedApiKey = current.gatewayApiKey;
    }

    const updated: BankIntegrationConfig = {
      ...current,
      ...data,
      gatewayApiKey: resolvedApiKey !== undefined ? resolvedApiKey : current.gatewayApiKey,
      institutionId,
      updatedAt: new Date().toISOString(),
      updatedBy: `${user.email} (${user.role})`,
    };

    const all = readAllSettings();
    all[institutionId] = updated;
    writeAllSettings(all);

    return this.getBankSettings(institutionId, { maskSecret: true });
  }
}
