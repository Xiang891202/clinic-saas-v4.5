import { FastifyInstance } from "fastify";
import { requireTenant } from "../../middlewares/tenant";
import { safeHandler } from "../../utils/controller-wrapper";
import { DoctorService } from "../../services/doctorService";

export async function clinicDoctorRoutes(fastify: FastifyInstance) {
  const service = new DoctorService(fastify.supabase);

  fastify.get("/api/clinic/doctors", { preHandler: [requireTenant] }, safeHandler(async (req, reply) => {
    const tenantId = (req as any).tenantId;
    const data = await service.getDoctors(tenantId);
    return reply.send({ data });
  }));
}