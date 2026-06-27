// packages/shared/src/security/accountLocker.ts
import { Redis } from 'ioredis';

export interface AccountLockerOptions {
  maxAttempts?: number;      // 最大失敗次數，預設 5
  lockDurationSeconds?: number; // 鎖定秒數，預設 900 (15分鐘)
  keyPrefix?: string;        // Redis Key 前綴，預設 'login:fail'
}

export class AccountLocker {
  private redis: Redis;
  private maxAttempts: number;
  private lockDuration: number;
  private keyPrefix: string;

  constructor(redis: Redis, options: AccountLockerOptions = {}) {
    this.redis = redis;
    this.maxAttempts = options.maxAttempts ?? 5;
    this.lockDuration = options.lockDurationSeconds ?? 900;
    this.keyPrefix = options.keyPrefix ?? 'login:fail';
  }

  /**
   * 記錄失敗嘗試（登入失敗時呼叫）
   */
  async recordFailedAttempt(identifier: string): Promise<{ attempts: number; isLocked: boolean }> {
    const key = this.getKey(identifier);
    const attempts = await this.redis.incr(key);
    
    if (attempts === 1) {
      await this.redis.expire(key, this.lockDuration);
    }

    const isLocked = attempts >= this.maxAttempts;
    return { attempts, isLocked };
  }

  /**
   * 檢查是否被鎖定
   */
  async isLocked(identifier: string): Promise<boolean> {
    const key = this.getKey(identifier);
    const attempts = await this.redis.get(key);
    if (!attempts) return false;
    return parseInt(attempts, 10) >= this.maxAttempts;
  }

  /**
   * 取得剩餘鎖定秒數（前端倒數用）
   */
  async getRemainingLockSeconds(identifier: string): Promise<number> {
    const key = this.getKey(identifier);
    const ttl = await this.redis.ttl(key);
    return ttl > 0 ? ttl : 0;
  }

  /**
   * 手動解鎖（管理端使用）
   */
  async unlock(identifier: string): Promise<void> {
    const key = this.getKey(identifier);
    await this.redis.del(key);
  }

  /**
   * 登入成功時清除失敗記錄
   */
  async clearFailedAttempts(identifier: string): Promise<void> {
    const key = this.getKey(identifier);
    await this.redis.del(key);
  }

  /**
   * 取得當前失敗次數
   */
  async getAttempts(identifier: string): Promise<number> {
    const key = this.getKey(identifier);
    const val = await this.redis.get(key);
    return val ? parseInt(val, 10) : 0;
  }

  private getKey(identifier: string): string {
    return `${this.keyPrefix}:${identifier}`;
  }
}