import Redis from "ioredis";

export class RedisLock {
  constructor(private redis: Redis) {}

  /**
   * 嘗試取得分散鎖 (Redis SET NX PX)
   * @param key 鎖的 Key
   * @param ttl 鎖定時間 (毫秒)，預設 10000 (10秒)
   * @returns boolean 是否成功取得鎖
   */
  async acquire(key: string, ttl: number = 10000): Promise<boolean> {
    const result = await this.redis.set(key, "locked", "NX", "PX", ttl);
    return result === "OK";
  }

  /**
   * 釋放分散鎖 (僅當 Key 存在時刪除)
   */
  async release(key: string): Promise<void> {
    await this.redis.del(key);
  }

  /**
   * 檢查鎖是否存在
   */
  async isLocked(key: string): Promise<boolean> {
    const val = await this.redis.get(key);
    return val !== null;
  }
}
