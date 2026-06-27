// backend/src/routes/admin/policy.ts
import { FastifyInstance } from "fastify";
import { safeHandler } from "../../utils/controller-wrapper";
import { success } from "../../utils/response";
import { redisConfig } from '../../config/redis.js';
import { createQueue } from '../../config/queues.js';

export async function adminPolicyRoutes(fastify: FastifyInstance) {
  const policyEngine = (fastify as any).policyEngine;
  const executor = (fastify as any).executor;
  const supabase = (fastify as any).supabase;
  const redis = (fastify as any).redis;

  // 触发 Policy 评估
  fastify.post(
    "/api/admin/policy/evaluate",
    {
      schema: {
        body: {
          type: "object",
          required: ["event"],
          properties: {
            event: {
              type: "object",
              required: ["type", "context"],
              properties: {
                type: { type: "string" },
                context: { type: "object" },
              },
            },
          },
        },
      },
    },
    safeHandler(async (req, reply) => {
      const { event } = req.body as any;
      const tenantId = (req as any).tenantId;

      const fullEvent = {
        ...event,
        timestamp: new Date(),
        tenantId: tenantId || undefined,
      };

      const plan = policyEngine.evaluate(fullEvent);
      const result = await executor.execute(plan);

      return reply.send(success({
        planId: result.id,
        status: result.status,
        actions: result.actions,
        executedAt: result.executedAt,
        error: result.error,
      }));
    })
  );

  // 获取降级状态
  fastify.get(
    "/api/admin/policy/degraded-services",
    safeHandler(async (req, reply) => {
      const { data } = await supabase
        .from("service_degradation")
        .select("*")
        .eq("status", "degraded")
        .is("restored_at", null)
        .order("degraded_at", { ascending: false });

      const redisKeys = await redis.keys("degraded:*");
      const degradedFromRedis = [];
      for (const key of redisKeys) {
        const value = await redis.get(key);
        if (value) {
          degradedFromRedis.push({
            service: key.replace("degraded:", ""),
            ...JSON.parse(value),
          });
        }
      }

      return reply.send(success({
        database: data || [],
        redis: degradedFromRedis,
      }));
    })
  );

  // 手动恢复服务
  fastify.post(
    "/api/admin/policy/restore/:service",
    safeHandler(async (req, reply) => {
      const { service } = req.params as { service: string };
      const { reason } = req.body as { reason?: string };

      const restoreAction = {
        type: "RESTORE_SERVICE",
        priority: 1,
        target: service as "email" | "line" | "queue" | "all",
        reason: reason || "管理員手動恢復",
      };

      await executor.executeAction(restoreAction);

      return reply.send(success(null, `服务 ${service} 已手动恢复`));
    })
  );

  // 获取告警历史
  fastify.get(
    "/api/admin/policy/alerts",
    safeHandler(async (req, reply) => {
      const { limit = 50, severity } = req.query as { limit?: string; severity?: string };

      let query = supabase
        .from("alert_history")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(Number(limit));

      if (severity) {
        query = query.eq("severity", severity);
      }

      const { data } = await query;
      return reply.send(success(data || []));
    })
  );

  // backend/src/routes/admin/policy.ts - 补充队列监控相关接口

    // 获取队列状态
    fastify.get(
    "/api/admin/policy/queue-status",
    safeHandler(async (req, reply) => {
        const { queueName } = req.query as { queueName?: string };
        
        const result: any = {};
        const queues = queueName ? [queueName] : ["notification.queue", "billing.queue", "slot-generation"];
        
        for (const name of queues) {
        try {
            const q = createQueue(name);
            const counts = await q.getJobCounts();
            const total = counts.waiting + counts.active + counts.delayed;
            result[name] = {
            waiting: counts.waiting,
            active: counts.active,
            completed: counts.completed,
            failed: counts.failed,
            delayed: counts.delayed,
            total,
            };
            await q.close();
        } catch (err) {
            result[name] = { error: String(err) };
        }
        }
        
        return reply.send(success(result));
    })
    );

    // 手动触发队列检查
    fastify.post(
    "/api/admin/policy/check-queue/:queueName",
    safeHandler(async (req, reply) => {
        const { queueName } = req.params as { queueName: string };
        
        // 从 QueueMonitor 获取状态
        const status = await (fastify as any).queueMonitor.checkQueueNow(queueName);
        return reply.send(success(status));
    })
    );

}