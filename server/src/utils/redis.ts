import Redis from 'ioredis';
import { env } from '../config/env';
import { logger } from './logger';

class RedisManager {
  private client: Redis | null = null;
  private isConnected = false;
  private inMemoryFallback = new Map<string, { value: string; expiresAt?: number }>();

  constructor() {
    if (env.REDIS_ENABLED) {
      try {
        this.client = new Redis(env.REDIS_URL, {
          maxRetriesPerRequest: 1,
          connectTimeout: 2000,
          retryStrategy: (times) => {
            if (times > 3) {
              return null; // Stop retrying if Redis is down, fall back gracefully
            }
            return Math.min(times * 500, 2000);
          },
          lazyConnect: true,
        });

        this.client.on('connect', () => {
          this.isConnected = true;
          logger.info('Redis connected successfully');
        });

        this.client.on('ready', () => {
          this.isConnected = true;
        });

        this.client.on('error', (err) => {
          this.isConnected = false;
          logger.warn(`Redis connection error: ${err.message}. Operating in fallback mode.`);
        });

        this.client.on('close', () => {
          this.isConnected = false;
        });

        // Attempt initial non-blocking connection
        this.client.connect().catch((err) => {
          logger.warn(`Initial Redis connection could not be established: ${err.message}. Fallback enabled.`);
        });
      } catch (err: any) {
        logger.warn(`Failed to initialize Redis client: ${err.message}`);
        this.client = null;
      }
    }
  }

  public getClient(): Redis | null {
    return this.isConnected ? this.client : null;
  }

  public async isHealthy(): Promise<boolean> {
    if (!this.client || !this.isConnected) return false;
    try {
      const pong = await this.client.ping();
      return pong === 'PONG';
    } catch {
      return false;
    }
  }

  public async get<T>(key: string): Promise<T | null> {
    if (this.client && this.isConnected) {
      try {
        const raw = await this.client.get(key);
        if (!raw) return null;
        return JSON.parse(raw) as T;
      } catch (err: any) {
        logger.warn(`Redis get failed for key "${key}": ${err.message}`);
      }
    }

    // In-memory fallback
    const entry = this.inMemoryFallback.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.inMemoryFallback.delete(key);
      return null;
    }
    return JSON.parse(entry.value) as T;
  }

  public async set(key: string, value: unknown, ttlSeconds?: number): Promise<boolean> {
    const serialized = JSON.stringify(value);

    if (this.client && this.isConnected) {
      try {
        if (ttlSeconds && ttlSeconds > 0) {
          await this.client.set(key, serialized, 'EX', ttlSeconds);
        } else {
          await this.client.set(key, serialized);
        }
        return true;
      } catch (err: any) {
        logger.warn(`Redis set failed for key "${key}": ${err.message}`);
      }
    }

    // In-memory fallback
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined;
    this.inMemoryFallback.set(key, { value: serialized, expiresAt });
    return true;
  }

  public async del(key: string): Promise<boolean> {
    let deleted = false;
    if (this.client && this.isConnected) {
      try {
        await this.client.del(key);
        deleted = true;
      } catch (err: any) {
        logger.warn(`Redis del failed for key "${key}": ${err.message}`);
      }
    }

    if (this.inMemoryFallback.has(key)) {
      this.inMemoryFallback.delete(key);
      deleted = true;
    }

    return deleted;
  }

  public async blacklistToken(token: string, expirySeconds = 900): Promise<boolean> {
    const key = `blacklist:${token}`;
    return this.set(key, { blacklistedAt: new Date().toISOString() }, expirySeconds);
  }

  public async isTokenBlacklisted(token: string): Promise<boolean> {
    const key = `blacklist:${token}`;
    const found = await this.get(key);
    return found !== null;
  }

  public async close(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        this.client.disconnect();
      }
      this.isConnected = false;
    }
  }
}

export const redis = new RedisManager();
