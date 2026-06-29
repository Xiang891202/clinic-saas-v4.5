// backend/src/routes/clinic/auth.ts
import { FastifyInstance } from "fastify";
import { safeHandler } from "../../utils/controller-wrapper.js";
// ❌ 移除 ClinicAuthService
// import { ClinicAuthService } from "../../services/ClinicAuthService.js";
import { EmailAuthService } from "../../services/emailAuth.js";

export async function clinicAuthRoutes(
  fastify: FastifyInstance,
  emailAuthService: EmailAuthService  // ✅ 改為注入 EmailAuthService
) {
  // ❌ 移除這行，不再自己 new
  // const authService = new ClinicAuthService(fastify.supabase);

  fastify.post(
    "/api/auth/clinic/login",
    safeHandler(async (req, reply) => {
      const { email, password } = req.body as { email: string; password: string };
      
      // ✅ 取得真實 IP（用於 IP 限流）
      const ip = req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';
      
      // ✅ 呼叫 EmailAuthService.login（含鎖定 + Policy 事件）
      const result = await emailAuthService.login(email, password, ip);
      return reply.send(result);
    })
  );
}