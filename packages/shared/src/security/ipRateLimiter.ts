// packages/shared/src/security/ipRateLimiter.ts
import { Redis } from 'ioredis';

export interface IpRateLimiterOptions {
  maxRequests?: number;      // 最大請求數，預設 60
  windowSeconds?: number;    // 時間窗口（秒），預設 60
  keyPrefix?: string;        // Redis Key 前綴，預設 'rate:ip'
}

export class IpRateLimiter {
  private redis: Redis;
  private maxRequests: number;
  private windowSeconds: number;
  private keyPrefix: string;

  constructor(redis: Redis, options: IpRateLimiterOptions = {}) {
    this.redis = redis;
    this.maxRequests = options.maxRequests ?? 60;
    this.windowSeconds = options.windowSeconds ?? 60;
    this.keyPrefix = options.keyPrefix ?? 'rate:ip';
  }

  /**
   * 檢查並記錄請求（在 API 層呼叫）
   * @returns { allowed: boolean; remaining: number; resetAfter: number }
   */
  async checkAndRecord(ip: string): Promise<{
    allowed: boolean;
    remaining: number;
    resetAfter: number;
  }> {
    const key = this.getKey(ip);
    const current = await this.redis.incr(key);

    // 第一次請求時設定過期時間
    if (current === 1) {
      await this.redis.expire(key, this.windowSeconds);
    }

    const remaining = Math.max(0, this.maxRequests - current);
    const ttl = await this.redis.ttl(key);
    const resetAfter = ttl > 0 ? ttl : 0;

    return {
      allowed: current <= this.maxRequests,
      remaining,
      resetAfter,
    };
  }

  /**
   * 僅查詢當前狀態，不記錄（用於顯示限流資訊）
   */
  async getStatus(ip: string): Promise<{
    current: number;
    max: number;
    remaining: number;
    resetAfter: number;
  }> {
    const key = this.getKey(ip);
    const current = parseInt((await this.redis.get(key)) || '0', 10);
    const ttl = await this.redis.ttl(key);
    const resetAfter = ttl > 0 ? ttl : 0;

    return {
      current,
      max: this.maxRequests,
      remaining: Math.max(0, this.maxRequests - current),
      resetAfter,
    };
  }

  /**
   * 手動重設限流（管理端使用）
   */
  async reset(ip: string): Promise<void> {
    const key = this.getKey(ip);
    await this.redis.del(key);
  }

  private getKey(ip: string): string {
    return `${this.keyPrefix}:${ip}`;
  }
}