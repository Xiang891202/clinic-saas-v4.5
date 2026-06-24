// backend/src/routes/auth.ts
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { EmailAuthService } from "../services/emailAuth.js";

export async function authRoutes(
  fastify: FastifyInstance,
  emailAuthService: EmailAuthService
) {
  // ============================================================
  // 🟢 Email OTP 登入
  // ============================================================

  // 發送 OTP
  fastify.post("/api/auth/email/send-otp", async (req: FastifyRequest, reply: FastifyReply) => {
    const { email } = req.body as { email: string };

    try {
      const result = await emailAuthService.sendOtp(email);
      return reply.send(result);
    } catch (error: any) {
      return reply.status(500).send({ error: error.message });
    }
  });

  // 驗證 OTP
  fastify.post("/api/auth/email/verify", async (req: FastifyRequest, reply: FastifyReply) => {
    const { email, otp } = req.body as { email: string; otp: string };

    try {
      const result = await emailAuthService.verifyOtp(email, otp);
      return reply.send({
        success: true,
        data: {
          token: result.token,
          user: result.user,
        },
      });
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });

  // ============================================================
  // 🟢 登出（前端處理，後端僅提供驗證）
  // ============================================================
  fastify.post("/api/auth/logout", async (req: FastifyRequest, reply: FastifyReply) => {
    // 前端會清除 localStorage，後端可選擇將 token 加入黑名單
    // Phase 1 先簡單處理
    return reply.send({ success: true, message: "已登出" });
  });

  // ============================================================
  // 🔴 暫時註解 LINE 登入路由
  // ============================================================
  // fastify.post("/api/auth/line", async (req, reply) => { ... });
  // fastify.post("/api/auth/line/callback", async (req, reply) => { ... });
}