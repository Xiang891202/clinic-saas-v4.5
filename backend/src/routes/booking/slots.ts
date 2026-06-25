// routes/booking/slots.ts
import { FastifyInstance } from "fastify";
import { requireTenant } from "../../middlewares/tenant";
import { safeHandler } from "../../utils/controller-wrapper";
import { success, error } from "../../utils/response";

export async function bookingSlotRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/api/booking/slots",
    { preHandler: [requireTenant] },
    safeHandler(async (req, reply) => {
      const tenantId = (req as any).tenantId;
      const { date, service_id, doctor_id, location_id, patient_id } = req.query as any;
      if (!date) {
        return reply.status(400).send(error("date is required"));
      }

      // 这里原本调用 bookingEngine.getAvailableSlots，需要从外部注入
      // 我们将在主路由中传入 bookingEngine
      // 这里假设通过 fastify.bookingEngine 获取，或者通过闭包传入
      // 为了保持清晰，我们将在路由注册时传入 bookingEngine
      const bookingEngine = (fastify as any).bookingEngine;
      const slots = await bookingEngine.getAvailableSlots(tenantId, {
        date,
        service_id,
        doctor_id,
        location_id,
        patient_id,
      });
      return reply.send(success(slots));
    })
  );
}