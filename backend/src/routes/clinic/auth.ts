import { FastifyInstance } from "fastify";
import { safeHandler } from "../../utils/controller-wrapper.js";
import { ClinicAuthService } from "../../services/ClinicAuthService.js";

export async function clinicAuthRoutes(fastify: FastifyInstance) {
  const authService = new ClinicAuthService(fastify.supabase);

  fastify.post("/api/auth/clinic/login", safeHandler(async (req, reply) => {
    const { email, password } = req.body as { email: string; password: string };
    const result = await authService.login(email, password);
    return reply.send(result);
  }));
}