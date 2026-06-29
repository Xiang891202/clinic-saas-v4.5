// backend/src/routes/public/tenant.ts
import { FastifyInstance } from "fastify";
import { safeHandler } from "../../utils/controller-wrapper.js";
import { success } from "../../utils/response.js";
import { PublicTenantService } from "../../services/publicTenantService.js";

export async function publicTenantRoutes(fastify: FastifyInstance) {
  const service = new PublicTenantService(fastify.supabase);

  fastify.get(
    "/api/public/clinics",
    safeHandler(async (req, reply) => {
      const clinics = await service.getActiveClinics();
      return reply.send(success(clinics));
    })
  );
}