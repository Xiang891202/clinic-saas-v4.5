// backend/src/routes/clinic/business-hours.ts
import { FastifyInstance } from "fastify";
import { requireTenant } from "../../middlewares/tenant";
import { safeHandler } from "../../utils/controller-wrapper";
import { success } from "../../utils/response";

export async function clinicBusinessHoursRoutes(fastify: FastifyInstance) {
  
  // ========== 获取营业时间 ==========
  fastify.get(
    "/api/clinic/business-hours",
    { preHandler: [requireTenant] },
    safeHandler(async (req, reply) => {
      const tenantId = (req as any).tenantId;

      const { data, error } = await fastify.supabase
        .from("tenants")
        .select("business_hours")
        .eq("id", tenantId)
        .single();

      if (error) throw new Error(error.message);

      // 返回默认值如果为空
      const defaultHours = {
        working_days: [1, 2, 3, 4, 5],
        working_hours: { start: "09:00", end: "18:00" },
        special_holidays: [],
        notification_preferences: {
          send_summary_at: "08:00",
          reminder_lead_minutes: 30,
          enable_login_reminder: true,
        },
      };

      return reply.send(success(data?.business_hours || defaultHours));
    })
  );

  // ========== 更新营业时间 ==========
  fastify.put(
    "/api/clinic/business-hours",
    { preHandler: [requireTenant] },
    safeHandler(async (req, reply) => {
      const tenantId = (req as any).tenantId;
      const payload = req.body as {
        working_days?: number[];
        working_hours?: { start: string; end: string };
        special_holidays?: string[];
        notification_preferences?: {
          send_summary_at?: string;
          reminder_lead_minutes?: number;
          enable_login_reminder?: boolean;
        };
      };

      // 验证数据
      if (payload.working_days) {
        for (const day of payload.working_days) {
          if (day < 1 || day > 7) {
            throw new Error("工作天必须为 1-7 (1=周一, 7=周日)");
          }
        }
      }

      if (payload.working_hours) {
        const { start, end } = payload.working_hours;
        if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(start) || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(end)) {
          throw new Error("营业时间格式无效，请使用 HH:MM");
        }
      }

      // 获取当前值
      const { data: current } = await fastify.supabase
        .from("tenants")
        .select("business_hours")
        .eq("id", tenantId)
        .single();

      const merged = {
        ...(current?.business_hours || {}),
        ...payload,
        updated_at: new Date().toISOString(),
      };

      const { error } = await fastify.supabase
        .from("tenants")
        .update({ business_hours: merged })
        .eq("id", tenantId);

      if (error) throw new Error(error.message);

      return reply.send(success(merged, "营业时间已更新"));
    })
  );
}