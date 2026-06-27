// backend/src/monitors/degradationMonitor.ts
import { Redis } from "ioredis";
import { SupabaseClient } from "@supabase/supabase-js";
import { ActionExecutor, PolicyEngine } from "../../../packages/engine-policy/src/index.js";

export class DegradationMonitor {
  private redis: Redis;
  private supabase: SupabaseClient;
  private policyEngine: PolicyEngine;
  private executor: ActionExecutor;
  private checkInterval: number; // 秒

  constructor(
    redis: Redis,
    supabase: SupabaseClient,
    policyEngine: PolicyEngine,
    executor: ActionExecutor,
    checkInterval: number = 60 // 默认每 60 秒检查一次
  ) {
    this.redis = redis;
    this.supabase = supabase;
    this.policyEngine = policyEngine;
    this.executor = executor;
    this.checkInterval = checkInterval;
  }

  /**
   * 启动监控（持续运行）
   */
  async start(): Promise<void> {
    console.log(`🔄 Degradation Monitor 已启动 (检查间隔: ${this.checkInterval}秒)`);

    // 立即执行一次
    await this.check();

    // 定时执行
    setInterval(async () => {
      await this.check();
    }, this.checkInterval * 1000);
  }

  /**
   * 执行一次检查
   */
  async check(): Promise<void> {
    try {
      // 1. 检查 Redis 中的降级标记
      const keys = await this.redis.keys("degraded:*");
      
      for (const key of keys) {
        const value = await this.redis.get(key);
        if (!value) continue;

        const data = JSON.parse(value);
        const service = key.replace("degraded:", "");
        
        // 2. 检查是否已过期（Redis TTL 会自动过期，但以防万一）
        const ttl = await this.redis.ttl(key);
        
        // 如果 TTL 为 -1（永不过期）或 -2（不存在），需要手动判断
        if (ttl === -2) {
          // 键已不存在，跳过
          continue;
        }

        // 如果 TTL 为 -1（没有设置过期时间），检查数据库中的记录
        if (ttl === -1) {
          const { data: dbRecord } = await this.supabase
            .from("service_degradation")
            .select("*")
            .eq("service_name", service)
            .eq("status", "degraded")
            .is("restored_at", null)
            .maybeSingle();

          // 如果数据库没有降级记录，或者已经超过预期时间，触发恢复
          if (!dbRecord) {
            await this.restoreService(service, "数据库记录不一致，已自动恢复");
            continue;
          }

          // 如果有 duration_seconds，检查是否超时
          if (dbRecord.duration_seconds) {
            const degradedAt = new Date(dbRecord.degraded_at);
            const elapsed = (Date.now() - degradedAt.getTime()) / 1000;
            if (elapsed > dbRecord.duration_seconds) {
              await this.restoreService(service, `降级时间已超过 ${dbRecord.duration_seconds} 秒，自动恢复`);
            }
          }
        }
      }

      // 3. 检查数据库中是否还有 Redis 中不存在的降级记录（兜底）
      const { data: dbDegraded } = await this.supabase
        .from("service_degradation")
        .select("*")
        .eq("status", "degraded")
        .is("restored_at", null);

      for (const record of dbDegraded || []) {
        const key = `degraded:${record.service_name}`;
        const exists = await this.redis.exists(key);
        
        if (!exists) {
          // Redis 中不存在，但数据库标记为降级 → 不一致，触发恢复
          await this.restoreService(
            record.service_name,
            `Redis 标记丢失，数据库记录 ${record.id} 已自动恢复`
          );
        }
      }
    } catch (error: any) {
      console.error("❌ Degradation Monitor 检查失败:", error.message);
    }
  }

  /**
   * 恢复服务（触发 Policy Engine）
   */
  private async restoreService(service: string, reason: string): Promise<void> {
    console.log(`🔄 自动恢复服务: ${service} - ${reason}`);

    const event = {
      type: "SERVICE_RESTORE" as const,
      timestamp: new Date(),
      context: {
        serviceName: service,
        reason,
        source: "degradation-monitor",
      },
    };

    const plan = this.policyEngine.evaluate(event);
    await this.executor.execute(plan);
  }
}