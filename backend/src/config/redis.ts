// backend/src/config/redis.ts
import { Redis } from 'ioredis';
import { env } from './env.js';

const url = new URL(env.redisUrl);

// ✅ 導出 URL 字串（給 BullMQ 使用）
export const redisUrl = env.redisUrl;

// 導出配置物件（備用，但建議統一用 URL 字串）
export const redisConfig = {
  host: url.hostname,
  port: parseInt(url.port) || 6379,
  username: url.username,
  password: url.password,
  tls: {},
  maxRetriesPerRequest: null,
};

export const redis = new Redis(redisConfig);

redis.on('connect', () => console.log('✅ [Redis] 成功連接至 Upstash 雲端資料庫'));
redis.on('error', (err) => console.error('❌ [Redis] 連線失敗:', err.message));
redis.config('SET', 'maxmemory-policy', 'noeviction').catch(() => {});