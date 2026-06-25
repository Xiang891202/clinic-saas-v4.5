// backend/src/routes/admin/contracts.ts
import { FastifyInstance } from "fastify";
import { safeHandler } from "../../utils/controller-wrapper";
import { success } from "../../utils/response";
import { AdminContractService } from "../../services/adminContractService";

export async function adminContractRoutes(fastify: FastifyInstance) {
  const contractService = new AdminContractService(fastify.supabase);

  // 获取合约列表（不需要 tenant-id）
  fastify.get(
    "/api/admin/contracts",
    safeHandler(async (req, reply) => {
      const { search, limit, offset, status, tenant_id } = req.query as any;
      
      const result = await contractService.getContracts({
        search,
        limit: limit ? Number(limit) : 50,
        offset: offset ? Number(offset) : 0,
        status,
        tenant_id,
      });
      
      return reply.send(success(result));
    })
  );

  // 获取单个合约
  fastify.get(
    "/api/admin/contracts/:id",
    safeHandler(async (req, reply) => {
      const { id } = req.params as { id: string };
      const data = await contractService.getContractById(id);
      return reply.send(success(data));
    })
  );

  // 创建合约
  fastify.post(
    "/api/admin/contracts",
    safeHandler(async (req, reply) => {
      const data = await contractService.createContract(req.body as any);
      return reply.status(201).send(success(data));
    })
  );

  // 更新合约
  fastify.put(
    "/api/admin/contracts/:id",
    safeHandler(async (req, reply) => {
      const { id } = req.params as { id: string };
      const data = await contractService.updateContract(id, req.body as any);
      return reply.send(success(data));
    })
  );

  // 删除合约
  fastify.delete(
    "/api/admin/contracts/:id",
    safeHandler(async (req, reply) => {
      const { id } = req.params as { id: string };
      const result = await contractService.deleteContract(id);
      return reply.send(success(result));
    })
  );

  // 获取租户合约统计
  fastify.get(
    "/api/admin/contracts/stats/:tenantId",
    safeHandler(async (req, reply) => {
      const { tenantId } = req.params as { tenantId: string };
      const stats = await contractService.getTenantContractStats(tenantId);
      return reply.send(success(stats));
    })
  );
}