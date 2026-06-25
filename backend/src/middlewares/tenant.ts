import { FastifyRequest, FastifyReply } from "fastify";

export async function requireTenant(req: FastifyRequest, reply: FastifyReply) {
  const tenantId = req.headers["x-tenant-id"] as string;
  if (!tenantId) {
    return reply.status(400).send({ error: "缺少 tenant-id" });
  }
  (req as any).tenantId = tenantId;
}