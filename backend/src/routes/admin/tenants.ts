// backend/src/routes/admin/tenants.ts
import { FastifyInstance } from "fastify";
import { safeHandler } from "../../utils/controller-wrapper";
import { success } from "../../utils/response";
import { AdminTenantService } from "../../services/adminTenantService";

export async function adminTenantRoutes(fastify: FastifyInstance) {
  const tenantService = new AdminTenantService(fastify.supabase);

  // 获取租户列表（不需要 tenant-id）
  fastify.get(
    "/api/admin/tenants",
    safeHandler(async (req, reply) => {
      const { search, limit, offset, status } = req.query as any;
      
      const result = await tenantService.getTenants({
        search,
        limit: limit ? Number(limit) : 50,
        offset: offset ? Number(offset) : 0,
        status,
      });
      
      return reply.send(success(result));
    })
  );

  // 获取单个租户
  fastify.get(
    "/api/admin/tenants/:id",
    safeHandler(async (req, reply) => {
      const { id } = req.params as { id: string };
      const data = await tenantService.getTenantById(id);
      return reply.send(success(data));
    })
  );

  // 创建租户
  fastify.post(
    "/api/admin/tenants",
    safeHandler(async (req, reply) => {
      const data = await tenantService.createTenant(req.body as any);
      return reply.status(201).send(success(data));
    })
  );

  // 更新租户
  fastify.put(
    "/api/admin/tenants/:id",
    safeHandler(async (req, reply) => {
      const { id } = req.params as { id: string };
      const data = await tenantService.updateTenant(id, req.body as any);
      return reply.send(success(data));
    })
  );

  // 删除租户
  fastify.delete(
    "/api/admin/tenants/:id",
    safeHandler(async (req, reply) => {
      const { id } = req.params as { id: string };
      const result = await tenantService.deleteTenant(id);
      return reply.send(success(result));
    })
  );
}