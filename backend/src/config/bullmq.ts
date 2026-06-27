import { Queue, Worker } from 'bullmq';
import { redisConfig } from './redis.js';

// 設置全域配置物件，BullMQ 內部 new 連線時才會帶上正確的 TLS 設定
Queue.defaults = { connection: redisConfig };
Worker.defaults = { connection: redisConfig };

console.log('✅ [BullMQ] 全域預設連線已設定（啟用 Upstash TLS）');
