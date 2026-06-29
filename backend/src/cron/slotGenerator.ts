// backend/src/cron/slotGenerator.ts
import { Queue } from "bullmq";
import { redis } from "../config/redis.js";
import { supabase } from "../config/supabase.js";
import { SchedulerCoordinator } from "../scheduler/SchedulerCoordinator.js";
import { SlotGenerationService } from "../services/slotGenerationService.js";


const slotGenerationQueue = new Queue("slot-generation", {
  connection: redis,
});

const coordinator = new SchedulerCoordinator(redis, supabase);

/**
 * 每天凌晨 2 點觸發時段生成（Cron 觸發）
 */
export async function scheduleSlotGeneration() {
  const result = await coordinator.execute(
    `daily-slot-generation-${new Date().toISOString().slice(0, 10)}`,
    "slot-generation",
    async () => {
      return await generateSlots(30);
    },
    "cron"
  );

  if (result.executed) {
    console.log(`✅ 時段生成任務完成 (Cron):`, result.result);
  } else {
    console.log(`⏭️ 時段生成任務跳過 (Cron): ${result.error || "已在執行中"}`);
  }
}

/**
 * 實際生成時段的函數（供 Worker 和 Cron 共用）
 */
export async function generateSlots(daysAhead: number = 30) {
  const service = new SlotGenerationService(supabase);
  try {
    const results = await service.generateSlotsForAllTenants(daysAhead);
    console.log(`✅ 完成生成 ${daysAhead} 天後的時段:`, results);
    return results;
  } catch (err) {
    console.error("❌ 時段生成失敗:", err);
    throw err; // 讓協調器記錄失敗
  }
}

export async function generateSlotsForTenant(tenantId: string, daysAhead: number = 30) {
  await slotGenerationQueue.add(
    `manual-slot-generation-${tenantId}`,
    { tenantId, daysAhead },
    { jobId: `manual-slot-generation-${tenantId}-${Date.now()}`, removeOnComplete: true }
  );
}