// backend/src/routes/auth.ts
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { EmailAuthService } from "../services/emailAuth.js";
import { safeHandler } from "../utils/controller-wrapper.js";  // ✅ 新增

export async function authRoutes(
  fastify: FastifyInstance,
  emailAuthService: EmailAuthService
) {
  // ============================================================
  // 🟢 Email OTP 登入
  // ===========================================================
  // 發送 OTP
  fastify.post(
    "/api/auth/email/send-otp",
    {
      schema: {
        body: {
          type: "object",
          required: ["email"],
          properties: {
            email: { type: "string", format: "email" },
          },
        },
      },
    },
    safeHandler(async (req, reply) => {
      const { email } = req.body as { email: string };
      const result = await emailAuthService.sendOtp(email);
      return reply.send(result);
    })
  );

  // 驗證 OTP
  fastify.post(
    "/api/auth/email/verify",
    {
      schema: {
        body: {
          type: "object",
          required: ["email", "otp"],
          properties: {
            email: { type: "string", format: "email" },
            otp: { type: "string", minLength: 6, maxLength: 6 },
            clinic_code: { type: "string" },  // ✅ 新增
          },
        },
      },
    },
    safeHandler(async (req, reply) => {
      const { email, otp, clinic_code } = req.body as {
        email: string;
        otp: string;
        clinic_code?: string;
      };

      const result = await emailAuthService.verifyOtp(email, otp, clinic_code);
      return reply.send(result);
    })
  );

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