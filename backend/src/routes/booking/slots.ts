import { FastifyInstance } from "fastify";
import { requireAuth } from "../../middlewares/auth";
import { safeHandler } from "../../utils/controller-wrapper";
import { success, error } from "../../utils/response";

export async function bookingSlotRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/api/booking/slots",
    { preHandler: [requireAuth] },
    safeHandler(async (req, reply) => {
      const user = (req as any).user;
      const tenantId = user?.tenantId;
      if (!tenantId) {
        return reply.status(401).send(error("未授權"));
      }

      const { date, service_id, doctor_id, location_id, patient_id } = req.query as any;
      if (!date) {
        return reply.status(400).send(error("date is required"));
      }

      const bookingEngine = (fastify as any).bookingEngine;
      const slots = await bookingEngine.getAvailableSlots(tenantId, {
        date,
        service_id,
        doctor_id,
        location_id,
        patient_id,  // 可選，若病人查詢自己的時段可能需要，但安全上最好從 JWT 取得
      });
      return reply.send(success(slots));
    })
  );
}