// backend/src/middlewares/tenant.ts
import { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export async function requireTenant(req: FastifyRequest, reply: FastifyReply) {
  try {
    // 1. 從 Authorization header 取得 token
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return reply.status(401).send({ error: "未授權：缺少 Authorization header" });
    }

    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return reply.status(401).send({ error: "未授權：無效的 Token 格式" });
    }

    // 2. 驗證 JWT 並解碼
    const decoded = jwt.verify(token, env.jwtSecret) as {
      userId: string;
      tenantId: string;
      role: string;
    };

    // 3. 掛載 tenantId 到 req（供後續 handler 使用）
    (req as any).tenantId = decoded.tenantId;
    (req as any).user = decoded;

    // 4. 檢查是否為診所端角色
    if (!["clinic_admin", "admin"].includes(decoded.role)) {
      return reply.status(403).send({ error: "權限不足：僅限診所管理員" });
    }

    return;
  } catch (err: any) {
    if (err.name === "JsonWebTokenError") {
      return reply.status(401).send({ error: "無效的 Token" });
    }
    if (err.name === "TokenExpiredError") {
      return reply.status(401).send({ error: "Token 已過期，請重新登入" });
    }
    return reply.status(500).send({ error: "驗證失敗" });
  }
}