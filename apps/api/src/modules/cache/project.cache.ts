import { createHash } from 'node:crypto';

import type { RedisClientType } from 'redis';

export interface CacheMetrics {
  averageLatencyMs: number;
  enabled: boolean;
  errors: number;
  hits: number;
  misses: number;
  operations: number;
}

export interface ProjectCache {
  getDetail<T>(slug: string): Promise<T | undefined>;
  getList<T>(query: unknown): Promise<T | undefined>;
  getMetrics(): CacheMetrics;
  invalidateProjects(): Promise<void>;
  setDetail(slug: string, value: unknown): Promise<void>;
  setList(query: unknown, value: unknown): Promise<void>;
}

const emptyMetrics = (): CacheMetrics => ({
  averageLatencyMs: 0,
  enabled: false,
  errors: 0,
  hits: 0,
  misses: 0,
  operations: 0,
});

export const noOpProjectCache: ProjectCache = {
  async getDetail() {
    return undefined;
  },
  async getList() {
    return undefined;
  },
  getMetrics: emptyMetrics,
  async invalidateProjects() {},
  async setDetail() {},
  async setList() {},
};

interface RedisProjectCacheOptions {
  detailTtlSeconds: number;
  listTtlSeconds: number;
}

const namespace = 'skillbridge:v1:projects';
const generationKey = `${namespace}:generation`;

export class RedisProjectCache implements ProjectCache {
  private errors = 0;
  private hits = 0;
  private misses = 0;
  private operations = 0;
  private totalLatencyMs = 0;

  constructor(
    private readonly redis: RedisClientType,
    private readonly options: RedisProjectCacheOptions,
  ) {}

  async getDetail<T>(slug: string) {
    return this.get<T>(`detail:${slug}`);
  }

  async getList<T>(query: unknown) {
    const fingerprint = createHash('sha256').update(JSON.stringify(query)).digest('hex');
    return this.get<T>(`list:${fingerprint}`);
  }

  getMetrics(): CacheMetrics {
    return {
      averageLatencyMs:
        this.operations === 0 ? 0 : Number((this.totalLatencyMs / this.operations).toFixed(3)),
      enabled: true,
      errors: this.errors,
      hits: this.hits,
      misses: this.misses,
      operations: this.operations,
    };
  }

  async invalidateProjects() {
    await this.measure(async () => {
      await this.redis.incr(generationKey);
    });
  }

  async setDetail(slug: string, value: unknown) {
    await this.set(`detail:${slug}`, value, this.options.detailTtlSeconds);
  }

  async setList(query: unknown, value: unknown) {
    const fingerprint = createHash('sha256').update(JSON.stringify(query)).digest('hex');
    await this.set(`list:${fingerprint}`, value, this.options.listTtlSeconds);
  }

  private async generation() {
    const current = await this.redis.get(generationKey);
    if (current) return current;
    await this.redis.set(generationKey, '1', { NX: true });
    return (await this.redis.get(generationKey)) ?? '1';
  }

  private async get<T>(suffix: string): Promise<T | undefined> {
    return this.measure(async () => {
      const value = await this.redis.get(`${namespace}:g${await this.generation()}:${suffix}`);
      if (value === null) {
        this.misses += 1;
        return undefined;
      }
      this.hits += 1;
      return JSON.parse(value) as T;
    });
  }

  private async set(suffix: string, value: unknown, ttlSeconds: number) {
    await this.measure(async () => {
      await this.redis.set(
        `${namespace}:g${await this.generation()}:${suffix}`,
        JSON.stringify(value),
        {
          expiration: { type: 'EX', value: ttlSeconds },
        },
      );
    });
  }

  private async measure<T>(operation: () => Promise<T>): Promise<T | undefined> {
    const startedAt = performance.now();
    this.operations += 1;
    try {
      return await operation();
    } catch (error) {
      this.errors += 1;
      console.warn('Redis project cache operation failed; continuing with PostgreSQL.', error);
      return undefined;
    } finally {
      this.totalLatencyMs += performance.now() - startedAt;
    }
  }
}
