import type { RedisClientType } from 'redis';

export interface PresenceStore {
  isOnline(projectId: string, userId: string): Promise<boolean>;
  listOnline(projectId: string): Promise<string[]>;
  touch(projectId: string, userId: string, ttlMs: number): Promise<void>;
}

export class RedisPresenceStore implements PresenceStore {
  constructor(private readonly redis: RedisClientType) {}

  async isOnline(projectId: string, userId: string) {
    try {
      const score = await this.redis.zScore(this.key(projectId), userId);
      return score !== null && score > Date.now();
    } catch (error) {
      console.warn('Redis presence lookup failed; using local presence only.', error);
      return false;
    }
  }

  async listOnline(projectId: string) {
    try {
      const key = this.key(projectId);
      const now = Date.now();
      await this.redis.zRemRangeByScore(key, 0, now);
      return await this.redis.zRangeByScore(key, now + 1, '+inf');
    } catch (error) {
      console.warn('Redis presence listing failed; using local presence only.', error);
      return [];
    }
  }

  async touch(projectId: string, userId: string, ttlMs: number) {
    try {
      const key = this.key(projectId);
      await this.redis.zAdd(key, { score: Date.now() + ttlMs, value: userId });
      await this.redis.expire(key, Math.ceil((ttlMs * 2) / 1_000));
    } catch (error) {
      console.warn('Redis presence heartbeat failed; local presence remains active.', error);
    }
  }

  private key(projectId: string) {
    return `skillbridge:v1:presence:project:${projectId}`;
  }
}
