import { FastifyInstance } from "fastify";
import { requireTenant } from "../../middlewares/tenant";
import { safeHandler } from "../../utils/controller-wrapper";
import { ClinicAppointmentService } from "../../services/clinicAppointmentService";

export async function clinicAppointmentRoutes(fastify: FastifyInstance) {
  const service = new ClinicAppointmentService(fastify.supabase);

  fastify.get("/api/clinic/appointments", { preHandler: [requireTenant] }, safeHandler(async (req, reply) => {
    const tenantId = (req as any).tenantId;
    const { status, date_from, date_to } = req.query as any;
    const data = await service.getAppointments(tenantId, { status, date_from, date_to });
    return reply.send({ data });
  }));

  fastify.patch("/api/clinic/appointments/:id/status", { preHandler: [requireTenant] }, safeHandler(async (req, reply) => {
    const tenantId = (req as any).tenantId;
    const { id } = req.params as { id: string };
    const { status } = req.body as { status: string };
    const result = await service.updateStatus(tenantId, id, status);
    return reply.send(result);
  }));
}