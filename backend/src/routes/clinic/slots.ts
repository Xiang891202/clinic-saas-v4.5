import { FastifyInstance } from "fastify";
import { requireTenant } from "../../middlewares/tenant";
import { safeHandler } from "../../utils/controller-wrapper";
import { SlotService } from "../../services/slotService";

export async function clinicSlotRoutes(fastify: FastifyInstance) {
  const slotService = new SlotService(fastify.supabase);

  fastify.get("/api/clinic/slots", { preHandler: [requireTenant] }, safeHandler(async (req, reply) => {
    const tenantId = (req as any).tenantId;
    const { month, year } = req.query as { month: string; year: string };
    const data = await slotService.getSlotsByMonth(tenantId, parseInt(year), parseInt(month));
    return reply.send({ data });
  }));

  fastify.post("/api/clinic/slots/date", { preHandler: [requireTenant] }, safeHandler(async (req, reply) => {
    const tenantId = (req as any).tenantId;
    const data = await slotService.createSlot(tenantId, req.body);
    return reply.status(201).send({ data });
  }));

  fastify.delete("/api/clinic/slots/date/:id", { preHandler: [requireTenant] }, safeHandler(async (req, reply) => {
    const tenantId = (req as any).tenantId;
    const { id } = req.params as { id: string };
    const result = await slotService.deleteSlot(tenantId, id);
    return reply.send(result);
  }));

  // backend/src/routes/clinic/slots.ts 中补充
    fastify.post(
    "/api/clinic/slots/generate",
    { preHandler: [requireTenant] },
    safeHandler(async (req, reply) => {
        const tenantId = (req as any).tenantId;
        const { days = 30 } = req.query as { days?: number };
        
        const service = new SlotGenerationService(fastify.supabase);
        const result = await service.generateSlotsForTenant(tenantId, days);
        
        return reply.send(success(result, `已生成 ${result.generated} 个时段`));
    })
    );
}