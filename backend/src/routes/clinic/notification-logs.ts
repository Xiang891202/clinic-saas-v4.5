// backend/src/routes/clinic/notification-logs.ts
import { FastifyInstance } from "fastify";
import { requireTenant } from "../../middlewares/tenant";
import { safeHandler } from "../../utils/controller-wrapper";
import { success } from "../../utils/response";

export async function clinicNotificationLogsRoutes(fastify: FastifyInstance) {
  
  // ========== 获取通知失败记录 ==========
  fastify.get(
    "/api/clinic/notification-logs",
    { preHandler: [requireTenant] },
    safeHandler(async (req, reply) => {
      const tenantId = (req as any).tenantId;
      const { limit = 50, offset = 0, date_from, date_to, status } = req.query as {
        limit?: string;
        offset?: string;
        date_from?: string;
        date_to?: string;
        status?: string;
      };

      let query = fastify.supabase
        .from("notification_logs")
        .select(`
          id,
          booking_event_id,
          channel,
          status,
          detail,
          created_at,
          booking_events (
            id,
            patient_id,
            patients ( name_given, name_family, telecom_phone, telecom_email ),
            slot_instances (
              slot_date,
              start_time,
              end_time,
              doctors ( name ),
              services ( name )
            )
          )
        `, { count: "exact" })
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .range(Number(offset), Number(offset) + Number(limit) - 1);

      // 状态过滤（只显示失败）
      if (status) {
        query = query.eq("status", status);
      } else {
        query = query.in("status", ["failed", "pending"]);
      }

      if (date_from) {
        query = query.gte("created_at", `${date_from}T00:00:00`);
      }
      if (date_to) {
        query = query.lte("created_at", `${date_to}T23:59:59`);
      }

      const { data, error, count } = await query;
      if (error) throw new Error(error.message);

      // 格式化返回数据
      const formatted = (data || []).map((log: any) => ({
        id: log.id,
        booking_id: log.booking_event_id,
        channel: log.channel,
        status: log.status,
        error_message: log.detail?.error || "未知錯誤",
        created_at: log.created_at,
        patient_name: log.booking_events?.patients 
          ? `${log.booking_events.patients.name_family || ""}${log.booking_events.patients.name_given || ""}`
          : "未知病人",
        patient_phone: log.booking_events?.patients?.telecom_phone || "",
        slot_date: log.booking_events?.slot_instances?.slot_date,
        start_time: log.booking_events?.slot_instances?.start_time,
        doctor_name: log.booking_events?.slot_instances?.doctors?.name || "未知醫師",
        service_name: log.booking_events?.slot_instances?.services?.name || "未知服務",
      }));

      return reply.send(success({
        data: formatted,
        total: count || 0,
        limit: Number(limit),
        offset: Number(offset),
      }));
    })
  );

  // ========== 获取通知统计（失败率） ==========
  fastify.get(
    "/api/clinic/notification-logs/stats",
    { preHandler: [requireTenant] },
    safeHandler(async (req, reply) => {
      const tenantId = (req as any).tenantId;
      const { days = 7 } = req.query as { days?: string };

      const since = new Date();
      since.setDate(since.getDate() - Number(days));

      const { data, error } = await fastify.supabase
        .from("notification_logs")
        .select("status, channel, created_at")
        .eq("tenant_id", tenantId)
        .gte("created_at", since.toISOString());

      if (error) throw new Error(error.message);

      const total = data?.length || 0;
      const failed = (data || []).filter((l: any) => l.status === "failed").length;
      const sent = (data || []).filter((l: any) => l.status === "sent").length;
      const rate = total > 0 ? Math.round((failed / total) * 100) : 0;

      // 按渠道统计
      const byChannel = {
        email: { total: 0, failed: 0 },
        line: { total: 0, failed: 0 },
      };
      (data || []).forEach((l: any) => {
        const ch = l.channel as "email" | "line";
        if (byChannel[ch]) {
          byChannel[ch].total++;
          if (l.status === "failed") byChannel[ch].failed++;
        }
      });

      return reply.send(success({
        total,
        sent,
        failed,
        failed_rate: rate,
        by_channel: byChannel,
        days: Number(days),
      }));
    })
  );
}