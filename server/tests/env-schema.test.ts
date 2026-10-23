import { describe, expect, it } from 'vitest';
import { envSchema } from '../src/config/env';

const baseline = {
  NODE_ENV: 'production',
  PORT: '4000',
  DATABASE_URL: 'postgresql://app:secret@db.example.test:5432/lms?sslmode=require',
  JWT_ACCESS_SECRET: 'access-secret-random-value-0123456789abcdef',
  JWT_REFRESH_SECRET: 'refresh-secret-random-value-0123456789abcdef',
  REPORT_CARD_SIGNING_SECRET: 'report-card-signing-secret-random-0123456789abcdef',
  COUNSELING_ENCRYPTION_SECRET: 'counseling-encryption-secret-random-0123456789abcdef',
  CLIENT_URL: 'https://school.example.test',
};

describe('production environment safeguards', () => {
  it('accepts secure production settings and rejects weak, shared, or insecure settings', () => {
    expect(envSchema.safeParse(baseline).success).toBe(true);
    expect(envSchema.safeParse({ ...baseline, JWT_ACCESS_SECRET: 'your_jwt_access_secret_min_32_chars_long' }).success).toBe(false);
    expect(envSchema.safeParse({ ...baseline, JWT_REFRESH_SECRET: baseline.JWT_ACCESS_SECRET }).success).toBe(false);
    expect(envSchema.safeParse({ ...baseline, CLIENT_URL: 'http://school.example.test' }).success).toBe(false);
    expect(envSchema.safeParse({ ...baseline, DATABASE_URL: 'postgresql://app:secret@db.example.test:5432/lms' }).success).toBe(false);
  });

  it('rejects invalid port and upload size values', () => {
    expect(envSchema.safeParse({ ...baseline, PORT: '4000abc' }).success).toBe(false);
    expect(envSchema.safeParse({ ...baseline, MAX_FILE_SIZE_MB: '0' }).success).toBe(false);
  });
});
