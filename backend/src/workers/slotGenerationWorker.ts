// backend/src/workers/slotGenerationWorker.ts
import { Worker, WorkerOptions } from "bullmq"; // ✅ 引入 WorkerOptions
import { SlotGenerationService } from "../services/slotGenerationService.js";
import { supabase } from "../index.js";
import { redisUrl } from '../config/redis.js';


// ⚠️ 將參數從 (redis: Redis) 改為接收 BullMQ 的連線設定 (connection: WorkerOptions["connection"])
export function createSlotGenerationWorker(connection: WorkerOptions["connection"]) {
  const worker = new Worker(
    "slot-generation",
    async (job) => {
      const { tenantId, daysAhead } = job.data;
      const service = new SlotGenerationService(supabase);

      console.log(`🔄 开始生成时段: tenant=${tenantId || "所有"}, days=${daysAhead || 30}`);

      if (tenantId) {
        const result = await service.generateSlotsForTenant(tenantId, daysAhead || 30);
        console.log(`✅ 租户 ${tenantId} 时段生成完成: ${result.generated} 新增, ${result.skipped} 跳过`);
        return result;
      } else {
        const results = await service.generateSlotsForAllTenants(daysAhead || 30);
        console.log(`✅ 所有租户时段生成完成`);
        return results;
      }
    },
    {
      connection, // ✅ 使用傳入的配置物件，BullMQ 會自動為此 Worker 建立專屬的 TLS 連線
      concurrency: 1,
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
    }
  );

  worker.on("completed", (job) => {
    console.log(`✅ 时段生成任务完成: ${job.id}`);
  });

  worker.on("failed", (job, err) => {
    console.error(`❌ 时段生成任务失败: ${job?.id}`, err);
  });

  return worker;
}
