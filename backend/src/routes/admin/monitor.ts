// routes/admin/monitor.ts
import { FastifyInstance } from "fastify";
import { safeHandler } from "../../utils/controller-wrapper";
import { success } from "../../utils/response";
import { AdminMonitorService } from "../../services/adminMonitor";

export async function adminMonitorRoutes(fastify: FastifyInstance) {
  const monitorService = new AdminMonitorService(fastify.supabase);

  // ========== 获取通知统计（指定租户，可选） ==========
  fastify.get(
    "/api/admin/monitor/notifications",
    safeHandler(async (req, reply) => {
      const { tenant_id, date } = req.query as { tenant_id?: string; date?: string };
      const targetDate = date || new Date().toISOString().slice(0, 10);
      // 如果提供了 tenant_id，则查询该租户，否则查询所有租户汇总
      let stats;
      if (tenant_id) {
        stats = await monitorService.getNotificationStats(tenant_id, targetDate);
      } else {
        const global = await monitorService.getGlobalStats(targetDate.slice(0, 7));
        stats = global.total;
      }
      return reply.send(success(stats));
    })
  );

  // ========== 获取每日趋势（全局） ==========
  fastify.get(
    "/api/admin/monitor/notifications/trend",
    safeHandler(async (req, reply) => {
      const { days, tenant_id } = req.query as { days?: string; tenant_id?: string };
      let trend;
      if (tenant_id) {
        trend = await monitorService.getDailyTrend(tenant_id, Number(days) || 7);
      } else {
        // 全局趋势：需要遍历所有租户，或直接查询所有日志（这里简化：只查 tenant_id 为空时查询所有租户的总和）
        // 更优方案：在 service 中增加 getGlobalDailyTrend 方法
        // 我们暂时直接调用 getDailyTrend 不传 tenantId，但 service 方法需要支持可选 tenantId
        trend = await monitorService.getGlobalDailyTrend(Number(days) || 7);
      }
      return reply.send(success(trend));
    })
  );

  // ========== 获取失败日志（全局） ==========
  fastify.get(
    "/api/admin/monitor/notification-logs",
    safeHandler(async (req, reply) => {
      const { limit = 20, tenant_id } = req.query as { limit?: string; tenant_id?: string };
      let logs;
      if (tenant_id) {
        logs = await monitorService.getFailedLogs(tenant_id, Number(limit));
      } else {
        logs = await monitorService.getGlobalFailedLogs(Number(limit));
      }
      return reply.send(success(logs));
    })
  );

  // ========== 获取全局通知用量（无需 tenant-id） ==========
  fastify.get(
    "/api/admin/monitor/notification-usage",
    safeHandler(async (req, reply) => {
      const { year_month } = req.query as { year_month?: string };
      const targetMonth = year_month || new Date().toISOString().slice(0, 7);
      const stats = await monitorService.getGlobalStats(targetMonth);
      return reply.send(success(stats));
    })
  );

  // ========== 系统健康检查 ==========
  fastify.get(
    "/api/admin/monitor/health",
    safeHandler(async (req, reply) => {
      const checks = {
        database: false,
        redis: false,
        queue: false,
      };

      // 1. 检查数据库
      try {
        const { error } = await fastify.supabase.from("tenants").select("id").limit(1);
        checks.database = !error;
      } catch {
        checks.database = false;
      }

      // 2. 检查 Redis（从 fastify 实例获取）
      try {
        const redis = (fastify as any).redis;
        if (redis) {
          const pong = await redis.ping();
          checks.redis = pong === "PONG";
        }
      } catch {
        checks.redis = false;
      }

      // 3. 检查 Queue（BullMQ）
      try {
        const { Queue } = await import("bullmq");
        const redis = (fastify as any).redis;
        if (redis) {
          const testQueue = new Queue("test-check", { connection: redis });
          await testQueue.add("check", { timestamp: Date.now() });
          await testQueue.close();
          checks.queue = true;
        }
      } catch {
        checks.queue = false;
      }

      const allHealthy = checks.database && checks.redis && checks.queue;
      const status = allHealthy ? "healthy" : "degraded";

      return reply.send({
        success: true,
        data: {
          status,
          checks,
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
        },
      });
    })
  );

  // 获取所有诊所的用量列表
  fastify.get(
    "/api/admin/monitor/tenant-usage",
    safeHandler(async (req, reply) => {
      const { year_month } = req.query as { year_month?: string };
      const targetMonth = year_month || new Date().toISOString().slice(0, 7);
      const list = await monitorService.getTenantUsageList(targetMonth);
      return reply.send(success(list));
    })
  );
}