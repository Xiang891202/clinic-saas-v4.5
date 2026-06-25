// backend/src/cron/slotGenerator.ts
import { Queue } from "bullmq";
import { redis } from "../index.js";

const slotGenerationQueue = new Queue("slot-generation", {
  connection: redis,
});

/**
 * 每天凌晨 2 点触发时段生成
 * 生成所有租户未来 30 天的时段
 */
export async function scheduleSlotGeneration() {
  // 使用 BullMQ Repeatable Job
  await slotGenerationQueue.add(
    "daily-slot-generation",
    { daysAhead: 30 },
    {
      repeat: {
        pattern: "0 2 * * *", // 每天凌晨 2 点
      },
      jobId: "daily-slot-generation",
      removeOnComplete: true,
      removeOnFail: false,
    }
  );

  console.log("⏰ 时段生成调度已设置: 每天凌晨 2 点");
}

/**
 * 手动为指定租户生成时段（API 调用用）
 */
export async function generateSlotsForTenant(tenantId: string, daysAhead: number = 30) {
  await slotGenerationQueue.add(
    `manual-slot-generation-${tenantId}`,
    { tenantId, daysAhead },
    {
      jobId: `manual-slot-generation-${tenantId}-${Date.now()}`,
      removeOnComplete: true,
    }
  );
}

export { slotGenerationQueue };