// backend/src/workers/slotGenerationWorker.ts
import { Worker } from "bullmq";
import { redis } from "../index.js";
import { SlotGenerationService } from "../services/slotGenerationService.js";
import { supabase } from "../index.js";

const slotGenerationWorker = new Worker(
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
    connection: redis,
    concurrency: 1, // 避免并发冲突
    removeOnComplete: { count: 10 },
    removeOnFail: { count: 10 },
  }
);

slotGenerationWorker.on("completed", (job) => {
  console.log(`✅ 时段生成任务完成: ${job.id}`);
});

slotGenerationWorker.on("failed", (job, err) => {
  console.error(`❌ 时段生成任务失败: ${job?.id}`, err);
});

export { slotGenerationWorker };