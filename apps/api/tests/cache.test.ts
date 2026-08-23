import type { RedisClientType } from 'redis';
import { describe, expect, it } from 'vitest';

import { RedisProjectCache, noOpProjectCache } from '../src/modules/cache/project.cache.js';

class MemoryRedis {
  readonly values = new Map<string, string>();
  shouldFail = false;

  async get(key: string) {
    if (this.shouldFail) throw new Error('redis unavailable');
    return this.values.get(key) ?? null;
  }

  async incr(key: string) {
    if (this.shouldFail) throw new Error('redis unavailable');
    const next = Number(this.values.get(key) ?? '0') + 1;
    this.values.set(key, String(next));
    return next;
  }

  async set(key: string, value: string, options?: { NX?: boolean }) {
    if (this.shouldFail) throw new Error('redis unavailable');
    if (options?.NX && this.values.has(key)) return null;
    this.values.set(key, value);
    return 'OK';
  }
}

describe('project cache', () => {
  it('uses cache-aside keys, records metrics, and changes generation on invalidation', async () => {
    const redis = new MemoryRedis();
    const cache = new RedisProjectCache(redis as unknown as RedisClientType, {
      detailTtlSeconds: 60,
      listTtlSeconds: 30,
    });
    const query = { limit: 12, page: 1, status: 'RECRUITING' };

    await expect(cache.getList(query)).resolves.toBeUndefined();
    await cache.setList(query, { items: [{ title: 'Cached project' }] });
    await expect(cache.getList(query)).resolves.toEqual({
      items: [{ title: 'Cached project' }],
    });
    await cache.setDetail('cached-project', { title: 'Cached detail' });
    await expect(cache.getDetail('cached-project')).resolves.toEqual({
      title: 'Cached detail',
    });

    await cache.invalidateProjects();
    await expect(cache.getList(query)).resolves.toBeUndefined();
    expect(redis.values.get('skillbridge:v1:projects:generation')).toBe('2');
    expect(cache.getMetrics()).toMatchObject({
      enabled: true,
      errors: 0,
      hits: 2,
      misses: 2,
      operations: 7,
    });
    expect(cache.getMetrics().averageLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it('fails open and counts Redis errors', async () => {
    const redis = new MemoryRedis();
    redis.shouldFail = true;
    const cache = new RedisProjectCache(redis as unknown as RedisClientType, {
      detailTtlSeconds: 60,
      listTtlSeconds: 30,
    });

    await expect(cache.getDetail('unavailable')).resolves.toBeUndefined();
    await expect(cache.setDetail('unavailable', {})).resolves.toBeUndefined();
    await expect(cache.invalidateProjects()).resolves.toBeUndefined();
    expect(cache.getMetrics()).toMatchObject({ enabled: true, errors: 3, operations: 3 });
  });

  it('provides a disabled no-op implementation', async () => {
    await expect(noOpProjectCache.getList({})).resolves.toBeUndefined();
    await expect(noOpProjectCache.getDetail('none')).resolves.toBeUndefined();
    await expect(noOpProjectCache.setList({}, {})).resolves.toBeUndefined();
    await expect(noOpProjectCache.setDetail('none', {})).resolves.toBeUndefined();
    await expect(noOpProjectCache.invalidateProjects()).resolves.toBeUndefined();
    expect(noOpProjectCache.getMetrics()).toMatchObject({ enabled: false, operations: 0 });
  });
});
