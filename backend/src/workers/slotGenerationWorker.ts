// backend/src/workers/slotGenerationWorker.ts
import { Worker } from "bullmq";
import { redis } from "../config/redis.js";
import { supabase } from "../config/supabase.js";
import { SchedulerCoordinator } from "../scheduler/SchedulerCoordinator.js";
import { SlotGenerationService } from "../services/slotGenerationService.js";

export function createSlotGenerationWorker(connection: any) {
  const worker = new Worker(
    "slot-generation",
    async (job) => {
      const { tenantId, daysAhead } = job.data;
      const service = new SlotGenerationService(supabase);

      const jobId = job.id || `${job.name}-${Date.now()}`;
      const isDailyJob = job.name === "daily-slot-generation";

      if (isDailyJob) {
        const coordinator = new SchedulerCoordinator(redis, supabase);
        const result = await coordinator.execute(
          `daily-slot-generation-${new Date().toISOString().slice(0, 10)}`,
          "slot-generation",
          async () => {
            const results = await service.generateSlotsForAllTenants(daysAhead || 30);
            return results;
          },
          "bullmq"
        );

        if (result.executed) {
          console.log(`✅ 時段生成任務完成 (BullMQ):`, result.result);
        } else {
          console.log(`⏭️ 時段生成任務跳過 (BullMQ): ${result.error || "已在執行中"}`);
        }
        return result;
      }

      // 手動任務
      console.log(`🔄 手動生成時段: tenant=${tenantId || "所有"}, days=${daysAhead || 30}`);
      if (tenantId) {
        return await service.generateSlotsForTenant(tenantId, daysAhead || 30);
      } else {
        return await service.generateSlotsForAllTenants(daysAhead || 30);
      }
    },
    {
      connection,
      concurrency: 1,
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
    }
  );

  worker.on("completed", (job) => {
    console.log(`✅ 時段生成任務完成: ${job.id}`);
  });

  worker.on("failed", (job, err) => {
    console.error(`❌ 時段生成任務失敗: ${job?.id}`, err);
  });

  return worker;
}