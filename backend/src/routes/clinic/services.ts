import { FastifyInstance } from "fastify";
import { requireTenant } from "../../middlewares/tenant";
import { safeHandler } from "../../utils/controller-wrapper";
import { ServiceManagementService } from "../../services/serviceManagementService";

export async function clinicServiceRoutes(fastify: FastifyInstance) {
  const service = new ServiceManagementService(fastify.supabase);

  fastify.get("/api/clinic/services", { preHandler: [requireTenant] }, safeHandler(async (req, reply) => {
    const tenantId = (req as any).tenantId;
    const data = await service.getServices(tenantId);
    return reply.send({ data });
  }));

  fastify.post("/api/clinic/services", { preHandler: [requireTenant] }, safeHandler(async (req, reply) => {
    const tenantId = (req as any).tenantId;
    const data = await service.createService(tenantId, req.body);
    return reply.status(201).send({ data });
  }));

  fastify.put("/api/clinic/services/:id", { preHandler: [requireTenant] }, safeHandler(async (req, reply) => {
    const tenantId = (req as any).tenantId;
    const { id } = req.params as { id: string };
    const data = await service.updateService(tenantId, id, req.body);
    return reply.send({ data });
  }));

  fastify.delete("/api/clinic/services/:id", { preHandler: [requireTenant] }, safeHandler(async (req, reply) => {
    const tenantId = (req as any).tenantId;
    const { id } = req.params as { id: string };
    const result = await service.deleteService(tenantId, id);
    return reply.send(result);
  }));
}