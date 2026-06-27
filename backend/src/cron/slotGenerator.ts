// backend/src/cron/slotGenerator.ts
import { Queue, QueueOptions } from "bullmq"; // ✅ 引入 QueueOptions
import { slotGenerationQueue } from '../config/queues.js';

export async function scheduleSlotGeneration() {
  await slotGenerationQueue.add(
    "daily-slot-generation",
    { daysAhead: 30 },
    {
      repeat: { pattern: "0 2 * * *" },
      jobId: "daily-slot-generation",
      removeOnComplete: true,
      removeOnFail: false,
    }
  );
  console.log("⏰ 时段生成调度已设置: 每天凌晨 2 点");
}

export async function generateSlotsForTenant(tenantId: string, daysAhead: number = 30) {
  await slotGenerationQueue.add(
    `manual-slot-generation-${tenantId}`,
    { tenantId, daysAhead },
    { jobId: `manual-slot-generation-${tenantId}-${Date.now()}`, removeOnComplete: true }
  );
}
