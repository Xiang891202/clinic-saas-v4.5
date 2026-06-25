import { FastifyInstance } from "fastify";
import { requireTenant } from "../../middlewares/tenant";
import { safeHandler } from "../../utils/controller-wrapper";
import { PatientService } from "../../services/patientService";

export async function clinicPatientRoutes(fastify: FastifyInstance) {
  const service = new PatientService(fastify.supabase);

  fastify.get("/api/clinic/patients", { preHandler: [requireTenant] }, safeHandler(async (req, reply) => {
    const tenantId = (req as any).tenantId;
    const { search, limit = 50, offset = 0 } = req.query as any;
    const result = await service.getPatients(tenantId, search, Number(limit), Number(offset));
    return reply.send(result);
  }));
}