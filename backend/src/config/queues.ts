import { Queue } from 'bullmq';
import { redisConfig } from './redis.js';

// 所有佇列實例都從這裡產生，確保連線設定一致
export function createQueue(name: string) {
  return new Queue(name, { connection: redisConfig });
}

// 也可以直接預先建立常用的佇列實例
export const notificationQueue = createQueue('notification.queue');
export const slotGenerationQueue = createQueue('slot-generation');
export const billingQueue = createQueue('billing.queue');