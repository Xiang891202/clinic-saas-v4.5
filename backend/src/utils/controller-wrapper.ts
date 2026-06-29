// backend/src/utils/controller-wrapper.ts
import { FastifyRequest, FastifyReply } from "fastify";

export const safeHandler = (handler: (req: FastifyRequest, reply: FastifyReply) => Promise<any>) => {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      return await handler(req, reply);
    } catch (error: any) {
      // ✅ 區分業務錯誤（4xx）與系統錯誤（5xx）
      const message = error.message || "伺服器錯誤";
      
      // 若是「帳號鎖定」相關錯誤，建議用 403
      if (message.includes("鎖定") || message.includes("鎖住")) {
        return reply.status(403).send({ error: message });
      }
      
      // 若是「帳號或密碼錯誤」，用 401
      if (message.includes("帳號或密碼錯誤") || message.includes("密碼錯誤")) {
        return reply.status(401).send({ error: message });
      }
      
      // 若是「請求過於頻繁」，用 429
      if (message.includes("請求過於頻繁")) {
        return reply.status(429).send({ error: message });
      }
      
      // 其他業務錯誤預設 400
      if (message.includes("為必填") || message.includes("無效") || message.includes("不存在")) {
        return reply.status(400).send({ error: message });
      }
      
      // 系統錯誤用 500
      console.error("❌ 系統錯誤:", error);
      return reply.status(500).send({ error: "伺服器內部錯誤，請稍後再試" });
    }
  };
};