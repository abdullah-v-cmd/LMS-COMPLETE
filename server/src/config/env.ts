import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

// Backward compatibility: map COUNSELING_ENCRYPTION_KEY to COUNSELING_ENCRYPTION_SECRET if provided
if (!process.env.COUNSELING_ENCRYPTION_SECRET && process.env.COUNSELING_ENCRYPTION_KEY) {
  process.env.COUNSELING_ENCRYPTION_SECRET = process.env.COUNSELING_ENCRYPTION_KEY;
}

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().default('4000').transform((val, ctx) => {
    const port = Number(val);
    if (!Number.isInteger(port) || port < 1 || port > 65535) { ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'PORT must be an integer from 1 to 65535' }); return z.NEVER; }
    return port;
  }),
  API_PREFIX: z.string().default('/api/v1'),
  DATABASE_URL: z.string().url().refine((value) => value.startsWith('postgresql://') || value.startsWith('postgres://'), 'DATABASE_URL must be a PostgreSQL connection URL'),
  DIRECT_URL: z.string().url().optional(),
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 chars'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 chars'),
  REPORT_CARD_SIGNING_SECRET: z.string().min(16).optional(),
  COUNSELING_ENCRYPTION_SECRET: z.string().min(16).optional(),
  FINANCE_ENCRYPTION_SECRET: z.string().min(16).optional(),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  UPLOAD_DIR: z.string().default('./uploads'),
  STORAGE_PROVIDER: z.enum(['LOCAL', 'VERCEL_BLOB', 'S3']).default('LOCAL'),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  MAX_FILE_SIZE_MB: z.string().default('10').transform((val, ctx) => {
    const size = Number(val);
    if (!Number.isInteger(size) || size < 1 || size > 1024) { ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'MAX_FILE_SIZE_MB must be an integer from 1 to 1024' }); return z.NEVER; }
    return size;
  }),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_ENABLED: z.string().default('true').transform((val) => val !== 'false'),
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
  if (config.FINANCE_ENCRYPTION_SECRET && (config.FINANCE_ENCRYPTION_SECRET.length < 32 || /your_|change.?me|example|default/i.test(config.FINANCE_ENCRYPTION_SECRET))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['FINANCE_ENCRYPTION_SECRET'], message: 'Production finance encryption secret must be a unique random value of at least 32 characters' });
  }
  if (config.FINANCE_ENCRYPTION_SECRET && (config.FINANCE_ENCRYPTION_SECRET === config.COUNSELING_ENCRYPTION_SECRET || config.FINANCE_ENCRYPTION_SECRET === config.JWT_ACCESS_SECRET)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['FINANCE_ENCRYPTION_SECRET'], message: 'Finance encryption secret must be separate from JWT and counseling secrets' });
  }
  const clientUrls = config.CLIENT_URL.split(',').map((u) => u.trim());
  const invalidClientUrl = clientUrls.find((u) => !u.startsWith('https://') && !u.includes('localhost'));
  if (invalidClientUrl) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['CLIENT_URL'], message: 'Production CLIENT_URL must use HTTPS' });
  }
  if (!config.DATABASE_URL.includes('localhost') && !/[?&]sslmode=(require|verify-ca|verify-full)(?:&|$)/i.test(config.DATABASE_URL)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['DATABASE_URL'], message: 'Production database URL must require TLS using sslmode=require or stronger' });
  }
  if (config.STORAGE_PROVIDER === 'VERCEL_BLOB' && !config.BLOB_READ_WRITE_TOKEN) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['BLOB_READ_WRITE_TOKEN'], message: 'BLOB_READ_WRITE_TOKEN is required when STORAGE_PROVIDER is VERCEL_BLOB' });
  }
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Invalid environment configuration:', parsedEnv.error.format());
  process.exit(1);
}

export const env = parsedEnv.data;
