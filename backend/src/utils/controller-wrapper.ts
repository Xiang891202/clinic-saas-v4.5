import { FastifyRequest, FastifyReply } from "fastify";

type Handler = (req: FastifyRequest, reply: FastifyReply) => Promise<any>;

export const safeHandler = (fn: Handler) => {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      return await fn(req, reply);
    } catch (error: any) {
      req.log.error(error);
      const status = error.status || 500;
      return reply.status(status).send({ 
        success: false, 
        error: error.message 
      });
    }
  };
};