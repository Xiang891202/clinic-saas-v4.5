// backend/src/routes/admin/auth.ts
import { FastifyInstance } from "fastify";
import { safeHandler } from "../../utils/controller-wrapper";
import { AdminAuthService } from "../../services/adminAuthService";

export async function adminAuthRoutes(fastify: FastifyInstance) {
  const authService = new AdminAuthService(fastify.supabase);

  fastify.post(
    "/api/auth/admin/login",
    safeHandler(async (req, reply) => {
      const { email, password } = req.body as { email: string; password: string };
      const result = await authService.login(email, password);
      return reply.send(result);
    })
  );
}