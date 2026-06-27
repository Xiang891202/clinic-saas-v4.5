// packages/shared/src/idempotency/scheduleDedupe.ts
import { SupabaseClient } from '@supabase/supabase-js';

export interface ScheduleDedupeOptions {
  tableName?: string;           // 預設 'schedule_coordination_logs'
  lockDurationSeconds?: number; // 預設 300 秒（5 分鐘）
}

export interface JobExecution {
  jobId: string;                // 唯一任務識別碼
  queueName: string;            // 佇列名稱
  triggerSource: 'cron' | 'bullmq' | 'manual';
  startedAt: Date;
  completedAt?: Date;
  status: 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
}

export class ScheduleDedupe {
  private supabase: SupabaseClient;
  private tableName: string;
  private lockDuration: number;

  constructor(
    supabase: SupabaseClient,
    options: ScheduleDedupeOptions = {}
  ) {
    this.supabase = supabase;
    this.tableName = options.tableName ?? 'schedule_coordination_logs';
    this.lockDuration = options.lockDurationSeconds ?? 300;
  }

  /**
   * 嘗試獲取任務執行鎖（防止雙重觸發）
   * @param jobId 任務唯一 ID（例如：daily-slot-generation-2026-06-27）
   * @param queueName 佇列名稱
   * @param triggerSource 觸發來源
   * @returns { acquired: boolean; executionId?: string } 是否取得鎖
   */
  async acquireLock(
    jobId: string,
    queueName: string,
    triggerSource: JobExecution['triggerSource'] = 'cron'
  ): Promise<{ acquired: boolean; executionId?: string }> {
    // 1. 檢查該 jobId 是否已在執行中（最近 N 秒內）
    const cutoff = new Date(Date.now() - this.lockDuration * 1000);

    const { data: existing, error } = await this.supabase
      .from(this.tableName)
      .select('id, status, started_at')
      .eq('job_id', jobId)
      .eq('queue_name', queueName)
      .gte('started_at', cutoff.toISOString())
      .in('status', ['running', 'completed'])
      .order('started_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('查詢排程鎖失敗:', error);
      return { acquired: false };
    }

    if (existing && existing.length > 0) {
      // 已有執行記錄（無論成功或失敗，在鎖定期間內視為已處理）
      return { acquired: false };
    }

    // 2. 寫入執行記錄，獲取鎖
    const { data: inserted, error: insertError } = await this.supabase
      .from(this.tableName)
      .insert({
        job_id: jobId,
        queue_name: queueName,
        trigger_source: triggerSource,
        started_at: new Date().toISOString(),
        status: 'running',
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('寫入排程鎖失敗:', insertError);
      return { acquired: false };
    }

    return { acquired: true, executionId: inserted.id };
  }

  /**
   * 釋放鎖（任務完成或失敗時呼叫）
   */
  async releaseLock(
    executionId: string,
    status: 'completed' | 'failed',
    result?: any,
    error?: string
  ): Promise<void> {
    const updateData: any = {
      status,
      completed_at: new Date().toISOString(),
    };
    if (result !== undefined) updateData.result = result;
    if (error !== undefined) updateData.error = error;

    const { error: updateError } = await this.supabase
      .from(this.tableName)
      .update(updateData)
      .eq('id', executionId);

    if (updateError) {
      console.error('更新排程鎖失敗:', updateError);
    }
  }

  /**
   * 檢查某任務最近是否已執行（用於防禦性檢查）
   */
  async hasRecentExecution(
    jobId: string,
    queueName: string,
    withinSeconds: number = 3600
  ): Promise<boolean> {
    const cutoff = new Date(Date.now() - withinSeconds * 1000);

    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('id')
      .eq('job_id', jobId)
      .eq('queue_name', queueName)
      .eq('status', 'completed')
      .gte('completed_at', cutoff.toISOString())
      .limit(1);

    if (error) {
      console.error('查詢最近執行記錄失敗:', error);
      return false;
    }

    return data && data.length > 0;
  }

  /**
   * 清理過舊的執行記錄（由系統維護）
   */
  async cleanupOldRecords(days: number = 30): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const { count, error } = await this.supabase
      .from(this.tableName)
      .delete()
      .lt('started_at', cutoff.toISOString());

    if (error) {
      console.error('清理排程記錄失敗:', error);
      return 0;
    }
    return count || 0;
  }
}