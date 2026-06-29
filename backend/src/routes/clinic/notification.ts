// backend/src/routes/clinic/notification.ts
import { FastifyInstance } from "fastify";
import { safeHandler } from "../../utils/controller-wrapper.js";
import { success } from "../../utils/response.js";
import { ClinicNotificationService } from "../../services/clinicNotificationService.js";
import { requireTenant } from "../../middlewares/tenant.js";
import { notificationQueue } from "../../config/queues.js";
import { isValidUUID } from "../../utils/validate-uuid.js";

export async function clinicNotificationRoutes(fastify: FastifyInstance) {
  const service = new ClinicNotificationService(fastify.supabase);

  // ========== 取得失敗通知清單 ==========
  fastify.get(
    "/api/clinic/notifications/failed",
    {
      preHandler: [requireTenant],  // ✅ 加入
      schema: {
        querystring: {
          type: "object",
          properties: {
            channel: { type: "string", enum: ["email", "line", "queue"] },
            startDate: { type: "string", format: "date" },
            endDate: { type: "string", format: "date" },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            offset: { type: "integer", minimum: 0, default: 0 },
          },
        },
      },
    },
    safeHandler(async (req, reply) => {
      const tenantId = (req as any).tenantId;
      const { channel, startDate, endDate, limit, offset } = req.query as any;

      const result = await service.getFailedNotifications(tenantId, {
        channel,
        startDate,
        endDate,
        limit: limit ? Number(limit) : 20,
        offset: offset ? Number(offset) : 0,
      });

      return reply.send(success(result));
    })
  );

  // ========== 取得所有通知記錄（含篩選） ==========
  fastify.get(
    "/api/clinic/notifications",
    {
      preHandler: [requireTenant],  // ✅ 加入
      schema: {
        querystring: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["sent", "failed", "pending"] },
            channel: { type: "string", enum: ["email", "line", "queue"] },
            startDate: { type: "string", format: "date" },
            endDate: { type: "string", format: "date" },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            offset: { type: "integer", minimum: 0, default: 0 },
          },
        },
      },
    },
    safeHandler(async (req, reply) => {
      const tenantId = (req as any).tenantId;
      const { status, channel, startDate, endDate, limit, offset } = req.query as any;

      const result = await service.getNotificationLogs(tenantId, {
        status,
        channel,
        startDate,
        endDate,
        limit: limit ? Number(limit) : 20,
        offset: offset ? Number(offset) : 0,
      });

      return reply.send(success(result));
    })
  );

  // ========== 標記單筆通知為已確認 ==========
    fastify.patch(
    "/api/clinic/notifications/:id/acknowledge",
    {
        preHandler: [requireTenant],
    },
    safeHandler(async (req, reply) => {
        const tenantId = (req as any).tenantId;
        const { id } = req.params as { id: string };

        if (!isValidUUID(id)) {
        return reply.status(400).send({ error: "無效的通知 ID" });
        }

        await service.acknowledgeNotification(tenantId, id);
        return reply.send(success({ acknowledged: true }));
    })
    );

  // ========== 批量標記為已確認 ==========
  fastify.post(
    "/api/clinic/notifications/batch-acknowledge",
    {
      preHandler: [requireTenant],  // ✅ 加入
      schema: {
        body: {
          type: "object",
          required: ["ids"],
          properties: {
            ids: {
              type: "array",
              items: { type: "string", format: "uuid" },
              minItems: 1,
            },
          },
        },
      },
    },
    safeHandler(async (req, reply) => {
      const tenantId = (req as any).tenantId;
      const { ids } = req.body as { ids: string[] };

      const result = await service.batchAcknowledgeNotifications(tenantId, ids);
      return reply.send(success(result));
    })
  );

  // ========== 重試失敗通知 ==========
    fastify.post(
    "/api/clinic/notifications/:id/retry",
    {
        preHandler: [requireTenant],
    },
    safeHandler(async (req, reply) => {
        const tenantId = (req as any).tenantId;
        const { id } = req.params as { id: string };

        if (!isValidUUID(id)) {
        return reply.status(400).send({ error: "無效的通知 ID" });
        }

        await service.retryFailedNotification(tenantId, id, notificationQueue);
        return reply.send(success({ retried: true, message: "已重新放入發送佇列" }));
    })
    );

  // ========== 取得通知統計摘要 ==========
  fastify.get(
    "/api/clinic/notifications/summary",
    {
        preHandler: [requireTenant],  // ✅ 加入
    },
    safeHandler(async (req, reply) => {
      const tenantId = (req as any).tenantId;
      const summary = await service.getNotificationSummary(tenantId);
      return reply.send(success(summary));
    })
  );
}