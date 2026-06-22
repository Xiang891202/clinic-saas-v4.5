import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import Redis from 'ioredis';

dotenv.config();

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
export const redis = new Redis(process.env.REDIS_URL!);

const fastify = Fastify({ logger: true });

fastify.register(cors, { origin: true, credentials: true });
fastify.register(helmet);
fastify.register(rateLimit, { max: 100, timeWindow: '1 minute' });

fastify.get('/api/health', async (req, reply) => {
  let dbOk = false, redisOk = false;
  try {
    const { error } = await supabase.from('tenants').select('id').limit(1);
    if (!error) dbOk = true;
  } catch {}

  try {
    if (await redis.ping() === 'PONG') redisOk = true;
  } catch {}

  reply.status((dbOk && redisOk) ? 200 : 503).send({
    status: (dbOk && redisOk) ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    checks: { database: dbOk, redis: redisOk },
    version: '4.5'
  });
});

fastify.get('/api/test/db', async (req, reply) => {
  const { data: tenants, error: tErr } = await supabase
    .from('tenants')
    .select('id, name')
    .limit(2);

  const { data: patients, error: pErr } = await supabase
    .from('patients')
    .select('id, name_given, name_family, google_calendar_synced')
    .limit(2);

  const { error: cErr } = await supabase
    .from('schedule_coordination_logs')
    .select('id')
    .limit(1);

  if (tErr || pErr || cErr) {
    return reply.status(500).send({
      error: '結構驗證失敗',
      details: { tenants: tErr?.message, patients: pErr?.message, coord: cErr?.message }
    });
  }

  return reply.send({
    message: '✅ 後端與 Supabase 串接成功！',
    schema_version: '4.5',
    sample_tenants: tenants,
    sample_patients: patients,
    features: {
      google_calendar_synced: '✅',
      schedule_coordination: '✅'
    },
    redis_status: await redis.ping() === 'PONG' ? '連線正常' : '連線異常'
  });
});

fastify.listen({ port: 3000, host: '0.0.0.0' }, (err) => {
  if (err) throw err;
  console.log('🚀 後端伺服器 (v4.5) 已啟動 -> http://localhost:3000');
  console.log('📌 測試端點: http://localhost:3000/api/test/db');
});
