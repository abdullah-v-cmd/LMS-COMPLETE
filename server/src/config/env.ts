import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().default('4000').transform((val, ctx) => {
    const port = Number(val);
    if (!Number.isInteger(port) || port < 1 || port > 65535) { ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'PORT must be an integer from 1 to 65535' }); return z.NEVER; }
    return port;
  }),
  API_PREFIX: z.string().default('/api/v1'),
  DATABASE_URL: z.string().url().refine((value) => value.startsWith('postgresql://') || value.startsWith('postgres://'), 'DATABASE_URL must be a PostgreSQL connection URL'),
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 chars'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 chars'),
  REPORT_CARD_SIGNING_SECRET: z.string().min(16).optional(),
  COUNSELING_ENCRYPTION_SECRET: z.string().min(16).optional(),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),
  CLIENT_URL: z.string().url().default('http://localhost:5173'),
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_FILE_SIZE_MB: z.string().default('10').transform((val, ctx) => {
    const size = Number(val);
    if (!Number.isInteger(size) || size < 1 || size > 1024) { ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'MAX_FILE_SIZE_MB must be an integer from 1 to 1024' }); return z.NEVER; }
    return size;
  }),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']).default('info'),
}).superRefine((config, ctx) => {
  if (config.NODE_ENV !== 'production') return;
  if (config.JWT_ACCESS_SECRET.length < 32 || /your_|change.?me|example|default/i.test(config.JWT_ACCESS_SECRET)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['JWT_ACCESS_SECRET'], message: 'Production access secret must be a unique random value of at least 32 characters' });
  }
  if (config.JWT_REFRESH_SECRET.length < 32 || /your_|change.?me|example|default/i.test(config.JWT_REFRESH_SECRET)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['JWT_REFRESH_SECRET'], message: 'Production refresh secret must be a unique random value of at least 32 characters' });
  }
  if (config.JWT_ACCESS_SECRET === config.JWT_REFRESH_SECRET) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['JWT_REFRESH_SECRET'], message: 'Production access and refresh secrets must differ' });
  }
  if (!config.REPORT_CARD_SIGNING_SECRET || config.REPORT_CARD_SIGNING_SECRET.length < 32 || /your_|change.?me|example|default/i.test(config.REPORT_CARD_SIGNING_SECRET)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['REPORT_CARD_SIGNING_SECRET'], message: 'Production report card signing secret must be a unique random value of at least 32 characters' });
  }
  if (!config.COUNSELING_ENCRYPTION_SECRET || config.COUNSELING_ENCRYPTION_SECRET.length < 32 || /your_|change.?me|example|default/i.test(config.COUNSELING_ENCRYPTION_SECRET)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['COUNSELING_ENCRYPTION_SECRET'], message: 'Production counseling encryption secret must be a unique random value of at least 32 characters' });
  }
  if (!config.CLIENT_URL.startsWith('https://')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['CLIENT_URL'], message: 'Production CLIENT_URL must use HTTPS' });
  }
  if (!/[?&]sslmode=(require|verify-ca|verify-full)(?:&|$)/i.test(config.DATABASE_URL)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['DATABASE_URL'], message: 'Production database URL must require TLS using sslmode=require or stronger' });
  }
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Invalid environment configuration:', parsedEnv.error.format());
  process.exit(1);
}

export const env = parsedEnv.data;
