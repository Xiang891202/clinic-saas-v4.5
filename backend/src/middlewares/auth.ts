import { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return reply.status(401).send({ error: "未授權" });
  }
  const token = authHeader.replace("Bearer ", "");
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!);
    (req as any).user = decoded;
  } catch {
    return reply.status(401).send({ error: "無效的 Token" });
  }
}