// packages/shared/src/idempotency/idempotencyGuard.ts
import { Redis } from 'ioredis';
import { SupabaseClient } from '@supabase/supabase-js';

export interface IdempotencyGuardOptions {
  redisTtlSeconds?: number;     // 預設 7 天 (604800 秒)
  keyPrefix?: string;           // 預設 'idempotency'
}

export class IdempotencyGuard {
  private redis: Redis;
  private supabase: SupabaseClient;
  private ttl: number;
  private keyPrefix: string;

  constructor(
    redis: Redis,
    supabase: SupabaseClient,
    options: IdempotencyGuardOptions = {}
  ) {
    this.redis = redis;
    this.supabase = supabase;
    this.ttl = options.redisTtlSeconds ?? 7 * 24 * 60 * 60; // 7 天
    this.keyPrefix = options.keyPrefix ?? 'idempotency';
  }

  /**
   * 檢查是否已處理過該請求（冪等性檢查）
   * @param idempotencyKey 唯一鍵（例如：notification:booking-123:email）
   * @param tableName Supabase 表名（用於檢查 DB 唯一約束）
   * @param columnName 唯一約束欄位名稱（預設 'idempotency_key'）
   * @returns { exists: boolean; result?: any } 若已存在則回傳該筆記錄
   */
  async check(
    idempotencyKey: string,
    tableName: string,
    columnName: string = 'idempotency_key'
  ): Promise<{ exists: boolean; result?: any }> {
    // 1. 先檢查 Redis（快取）
    const redisKey = this.getRedisKey(idempotencyKey);
    const cached = await this.redis.get(redisKey);
    if (cached) {
      try {
        return { exists: true, result: JSON.parse(cached) };
      } catch {
        return { exists: true, result: null };
      }
    }

    // 2. Redis 未命中 → 檢查資料庫
    const { data, error } = await this.supabase
      .from(tableName)
      .select('*')
      .eq(columnName, idempotencyKey)
      .maybeSingle();

    if (error) {
      // 若表不存在或欄位不存在，忽略 DB 檢查，僅回傳 Redis 結果
      return { exists: false };
    }

    if (data) {
      // 寫入 Redis 快取（下次可快速命中）
      await this.redis.setex(redisKey, this.ttl, JSON.stringify(data));
      return { exists: true, result: data };
    }

    return { exists: false };
  }

  /**
   * 在執行成功後，將結果寫入 Redis 快取
   * （與 DB 寫入分離，確保冪等性資料持久化）
   */
  async record(
    idempotencyKey: string,
    result: any,
    tableName: string,
    columnName: string = 'idempotency_key'
  ): Promise<void> {
    const redisKey = this.getRedisKey(idempotencyKey);
    // 寫入 Redis（TTL 7 天）
    await this.redis.setex(redisKey, this.ttl, JSON.stringify(result));

    // 可選擇同時在 DB 建立紀錄（若業務需要），但通常 DB 的寫入已在業務邏輯中完成
    // 此方法僅確保 Redis 快取存在
  }

  /**
   * 手動清除特定鍵（用於測試或管理）
   */
  async clear(idempotencyKey: string): Promise<void> {
    const redisKey = this.getRedisKey(idempotencyKey);
    await this.redis.del(redisKey);
  }

  /**
   * 批量清除過期鍵（由系統 Cron 定期執行）
   * Redis 本身會自動過期，此方法僅供手動觸發
   */
  async cleanup(): Promise<number> {
    // Redis TTL 自動處理，無需手動清理
    // 此方法保留以備將來需要主動掃描時使用
    return 0;
  }

  private getRedisKey(idempotencyKey: string): string {
    return `${this.keyPrefix}:${idempotencyKey}`;
  }
}