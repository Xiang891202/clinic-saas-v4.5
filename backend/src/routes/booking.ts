import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { BookingEngine } from "../../../packages/engine-booking/src";
import { notificationQueue } from "../../../apps/worker/src/index.js";

export async function bookingRoutes(
  fastify: FastifyInstance,
  bookingEngine: BookingEngine
) {
  // 時段查詢
  fastify.get("/api/booking/slots", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string || "550e8400-e29b-41d4-a716-446655440000";
      const { date, service_id, doctor_id, location_id, patient_id } = req.query as any;
      if (!date) return reply.status(400).send({ error: "date is required" });
      const slots = await bookingEngine.getAvailableSlots(tenantId, {
        date,
        service_id,
        doctor_id,
        location_id,
        patient_id,
      });
      return reply.send({ data: slots });
    } catch (error: any) {
      req.log.error(error);
      return reply.status(500).send({ error: error.message });
    }
  });

  // 建立預約
  fastify.post(
    "/api/booking/appointments",
    {
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
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const tenantId = req.headers["x-tenant-id"] as string || "550e8400-e29b-41d4-a716-446655440000";
        const result = await bookingEngine.createAppointment(tenantId, req.body as any);

        // ✅ 觸發通知
        try {
          await notificationQueue.add("send-notification", {
            type: "created",
            booking_id: result.id,
            tenant_id: tenantId,
          });
          console.log(`✅ 通知已放入 Queue，預約 ${result.id}`);
        } catch (notifyErr) {
          console.error("⚠️ 通知放入 Queue 失敗:", notifyErr);
        }

        return reply.status(201).send(result);
      } catch (error: any) {
        req.log.error(error);
        if (error.message.includes("CONFLICT")) return reply.status(409).send({ error: error.message });
        if (error.message.includes("已額滿")) return reply.status(400).send({ error: error.message });
        return reply.status(500).send({ error: error.message });
      }
    }
  );

  // 查詢預約列表
  fastify.get("/api/booking/appointments", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string || "550e8400-e29b-41d4-a716-446655440000";
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

      return reply.send({ data: formatted });
    } catch (error: any) {
      req.log.error(error);
      return reply.status(500).send({ error: error.message });
    }
  });
}