// backend/src/scheduler/SchedulerCoordinator.ts
import { Redis } from "ioredis";
import { SupabaseClient } from "@supabase/supabase-js";

export interface SchedulerCoordinatorOptions {
  lockDurationSeconds?: number; // 預設 300 秒
  tableName?: string;           // 預設 'schedule_coordination_logs'
}

export class SchedulerCoordinator {
  private redis: Redis;
  private supabase: SupabaseClient;
  private lockDuration: number;
  private tableName: string;

  constructor(
    redis: Redis,
    supabase: SupabaseClient,
    options: SchedulerCoordinatorOptions = {}
  ) {
    this.redis = redis;
    this.supabase = supabase;
    this.lockDuration = options.lockDurationSeconds ?? 300;
    this.tableName = options.tableName ?? "schedule_coordination_logs";
  }

  /**
   * 執行排程任務（具備去重保護）
   */
  async execute<T>(
    jobId: string,
    queueName: string,
    fn: () => Promise<T>,
    triggerSource: "cron" | "bullmq" | "manual" = "cron"
  ): Promise<{ executed: boolean; result?: T; error?: string }> {
    // 1. 嘗試獲取 Redis 鎖（防止雙重執行）
    const lockKey = `scheduler:lock:${jobId}`;
    const acquired = await this.redis.set(lockKey, "locked", "NX", "PX", this.lockDuration * 1000);

    if (!acquired) {
      console.log(`⏭️ 任務 ${jobId} 已在執行中（Redis 鎖），跳過`);
      return { executed: false };
    }

    // 2. 檢查 DB 是否最近已執行（雙重防護）
    const cutoff = new Date(Date.now() - this.lockDuration * 1000).toISOString();
    const { data: recent, error: queryError } = await this.supabase
      .from(this.tableName)
      .select("id, status")
      .eq("job_id", jobId)
      .eq("queue_name", queueName)
      .gte("started_at", cutoff)
      .in("status", ["running", "completed"])
      .maybeSingle();

    if (queryError) {
      console.error("查詢排程記錄失敗:", queryError);
      await this.redis.del(lockKey);
      return { executed: false, error: queryError.message };
    }

    if (recent) {
      console.log(`⏭️ 任務 ${jobId} 最近已執行（${recent.status}），跳過`);
      await this.redis.del(lockKey);
      return { executed: false };
    }

    // 3. 寫入執行記錄（開始）
    const { data: log, error: insertError } = await this.supabase
      .from(this.tableName)
      .insert({
        job_id: jobId,
        queue_name: queueName,
        trigger_source: triggerSource,
        started_at: new Date().toISOString(),
        status: "running",
      })
      .select()
      .single();

    if (insertError) {
      console.error("寫入排程記錄失敗:", insertError);
      await this.redis.del(lockKey);
      return { executed: false, error: insertError.message };
    }

    // 4. 執行任務
    try {
      const result = await fn();

      // 更新記錄（成功）
      await this.supabase
        .from(this.tableName)
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          result: JSON.stringify(result),
        })
        .eq("id", log.id);

      return { executed: true, result };
    } catch (err: any) {
      // 更新記錄（失敗）
      await this.supabase
        .from(this.tableName)
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error: err.message,
        })
        .eq("id", log.id);

      return { executed: true, error: err.message };
    } finally {
      // 釋放 Redis 鎖
      await this.redis.del(lockKey);
    }
  }
}