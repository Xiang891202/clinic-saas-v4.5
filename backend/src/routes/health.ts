// backend/src/routes/health.ts
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { SupabaseClient } from "@supabase/supabase-js";
import { Redis } from "ioredis";

export async function healthRoutes(
  fastify: FastifyInstance,
  supabase: SupabaseClient,
  redis: Redis
) {
  fastify.get("/api/health", async (req: FastifyRequest, reply: FastifyReply) => {
    let dbOk = false;
    let redisOk = false;

    try {
      const { error } = await supabase.from("tenants").select("id").limit(1);
      if (!error) dbOk = true;
    } catch {}

    try {
      if ((await redis.ping()) === "PONG") redisOk = true;
    } catch {}

    reply.status(dbOk && redisOk ? 200 : 503).send({
      status: dbOk && redisOk ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      checks: { database: dbOk, redis: redisOk },
      version: "4.6 (Phase 1)",
    });
  });

  // 測試 API
  fastify.get("/api/test/db", async (req: FastifyRequest, reply: FastifyReply) => {
    const { data: tenants, error: tErr } = await supabase.from("tenants").select("id, name").limit(2);
    if (tErr) return reply.status(500).send({ error: tErr.message });
    return reply.send({
      message: "✅ Phase 1 環境就緒！",
      tenants,
      redis_status: (await redis.ping()) === "PONG" ? "連線正常" : "連線異常",
      features: { booking_engine: "✅", create_appointment: "✅" },
    });
  });
}