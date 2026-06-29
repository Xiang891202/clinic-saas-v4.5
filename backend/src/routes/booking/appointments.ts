import { FastifyInstance } from "fastify";
// import { requireTenant } from "../../middlewares/tenant";
import { requireAuth } from "../../middlewares/auth";  // ✅ 改用 requireAuth
import { safeHandler } from "../../utils/controller-wrapper";
import { success, error } from "../../utils/response";
import { NotificationService } from "../../services/notificationService";
import { isValidUUID } from "../../utils/validate-uuid";

// const notificationService = new NotificationService();

export async function bookingAppointmentRoutes(fastify: FastifyInstance) {
  const bookingEngine = (fastify as any).bookingEngine;
  const supabase = (fastify as any).supabase;
  const notificationService = new NotificationService(supabase);  // ✅ 傳入 supabase

  // appointments.ts - POST handler
  // ========== 创建预约 ==========
  fastify.post(
    "/api/booking/appointments",
    {
      preHandler: [requireAuth],
      schema: {
        body: {
          type: "object",
          required: ["slot_instance_id", "patient_id", "service_id", "doctor_id"],
          properties: {
            slot_instance_id: { type: "string", format: "uuid" },
            patient_id: { type: "string", format: "uuid" },
            service_id: { type: "string", format: "uuid" },
            doctor_id: { type: "string", format: "uuid" },
            location_id: { type: "string", format: "uuid" },
            source: { type: "string", enum: ["web", "line", "manual"] },
          },
        },
      },
    },
    safeHandler(async (req, reply) => {
      const user = (req as any).user;
      const tenantId = user?.tenantId;
      if (!tenantId) {
        return reply.status(401).send(error("未授權"));
      }

      const body = req.body as any;
      const patientId = user?.patientId;
      if (!patientId) {
        return reply.status(401).send(error("未授權的病人"));
      }
      body.patient_id = patientId;

      if (!body.service_id || !body.doctor_id) {
        return reply.status(400).send(error("時段缺少醫師或服務資訊"));
      }

      const result = await bookingEngine.createAppointment(tenantId, body);
      await notificationService.send({
        type: "created",
        booking_id: result.id,
        tenant_id: tenantId,
      });

      return reply.status(201).send(success(result));
    })
  );

  // ========== 查询预约列表 ==========
  fastify.get(
    "/api/booking/appointments",
    { preHandler: [requireAuth] },
    safeHandler(async (req, reply) => {
      const tenantId = (req as any).tenantId;
      const { patient_id } = req.query as { patient_id?: string };
      const targetPatientId = patient_id || "61258c2e-4512-4a82-8c5d-a8c866b8b676";

      const { data: appointments, error } = await fastify.supabase
        .from("booking_events")
        .select(`
          id,
          status,
          created_at,
          slot_instance_id,
          slot_instances!inner (
            slot_date,
            start_time,
            end_time,
            doctors ( name ),
            services ( name )
          )
        `)
        .eq("tenant_id", tenantId)
        .eq("patient_id", targetPatientId)
        .order("created_at", { ascending: false });

      if (error) throw new Error(`查詢預約失敗: ${error.message}`);

      const formatted = (appointments || []).map((apt: any) => ({
        id: apt.id,
        status: apt.status,
        created_at: apt.created_at,
        slot_date: apt.slot_instances?.slot_date || null,
        start_time: apt.slot_instances?.start_time || null,
        end_time: apt.slot_instances?.end_time || null,
        doctor_name: apt.slot_instances?.doctors?.name || "未知醫師",
        service_name: apt.slot_instances?.services?.name || "未知服務",
      }));

      return reply.send(success(formatted));
    })
  );

  // ========== 修改预约 ==========
  fastify.patch(
    "/api/booking/appointments/:id",
    {
      preHandler: [requireAuth],
      schema: {
        body: {
          type: "object",
          properties: {
            slot_instance_id: { type: "string", format: "uuid" },
            service_id: { type: "string", format: "uuid" },
            doctor_id: { type: "string", format: "uuid" },
            location_id: { type: "string", format: "uuid" },
          },
        },
      },
    },
    safeHandler(async (req, reply) => {
      const { id } = req.params as { id: string };
      if (!isValidUUID(id)) {
        return reply.status(400).send(error("無效的預約 ID"));
      }

      const tenantId = (req as any).tenantId;
      const result = await bookingEngine.modifyAppointment(tenantId, id, req.body as any);

      await notificationService.send({
        type: "modified",
        booking_id: result.id,
        tenant_id: tenantId,
      });

      return reply.send(success(result));
    })
  );

  // ========== 取消预约 ==========
  fastify.delete(
    "/api/booking/appointments/:id",
    { preHandler: [requireAuth] },
    safeHandler(async (req, reply) => {
      const { id } = req.params as { id: string };
      if (!isValidUUID(id)) {
        return reply.status(400).send(error("無效的預約 ID"));
      }

      const tenantId = (req as any).tenantId;
      await bookingEngine.cancelAppointment(tenantId, id);

      await notificationService.send({
        type: "cancelled",
        booking_id: id,
        tenant_id: tenantId,
      });

      return reply.send(success(null, "預約已取消"));
    })
  );

  // ========== 取得单笔预约详情（需要认证） ==========
  fastify.get(
    "/api/booking/appointments/:id",
    { preHandler: [requireAuth] },
    safeHandler(async (req, reply) => {
      const { id } = req.params as { id: string };
      const tenantId = (req as any).tenantId;
      const user = (req as any).user;
      const userId = user?.patientId || user?.userId || user?.patientId;
      const role = user?.role || "patient";

      const { data: booking, error } = await fastify.supabase
        .from("booking_events")
        .select(`
          *,
          patients ( id, name_given, name_family, telecom_phone, telecom_email ),
          slot_instances (
            id,
            slot_date,
            start_time,
            end_time,
            max_capacity,
            booked_count,
            status,
            doctors ( id, name ),
            services ( id, name )
          )
        `)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .single();

      if (error) {
        throw new Error("查詢預約失敗");
      }
      if (!booking) {
        return reply.status(404).send(error("預約不存在", 404));
      }

      // 权限检查：病人只能看自己的
      if (role === "patient" && booking.patient_id !== userId) {
        return reply.status(403).send(error("您沒有權限查看此預約", 403));
      }

      return reply.send(success(booking));
    })
  );
}