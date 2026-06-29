// backend/src/middlewares/auth.ts
import { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return reply.status(401).send({ error: "未授權" });
    }
    const token = authHeader.replace("Bearer ", "");
    const decoded = jwt.verify(token, env.jwtSecret) as {
      patientId?: string;
      userId?: string;
      tenantId: string;
      role: string;
    };

    // ✅ 同時掛載 user 和 tenantId
    (req as any).user = decoded;
    (req as any).tenantId = decoded.tenantId;  // 關鍵！
    
    // 若為病人，也掛載 patientId
    if (decoded.patientId) {
      (req as any).patientId = decoded.patientId;
    }
  } catch (err) {
    return reply.status(401).send({ error: "無效的 Token" });
  }
}