// backend/src/routes/payment.ts
import { FastifyInstance } from "fastify";
import { safeHandler } from "../utils/controller-wrapper.js";
import { success } from "../utils/response.js";

export async function paymentRoutes(fastify: FastifyInstance) {
  const billingEngine = (fastify as any).billingEngine;

  // 1. 建立訂金付款
  fastify.post(
    "/api/payment/deposit",
    {
      schema: {
        body: {
          type: "object",
          required: ["bookingId", "amount"],
          properties: {
            bookingId: { type: "string", format: "uuid" },
            amount: { type: "number", minimum: 1 },
            currency: { type: "string", default: "TWD" },
            successUrl: { type: "string" },
            cancelUrl: { type: "string" },
          },
        },
      },
    },
    safeHandler(async (req, reply) => {
      const { bookingId, amount, currency, successUrl, cancelUrl } = req.body as any;
      const tenantId = (req as any).tenantId;

      const result = await billingEngine.createDepositPayment({
        bookingId,
        tenantId,
        amount,
        currency: currency || "TWD",
        description: `預約訂金 (${bookingId})`,
        successUrl: successUrl || `${process.env.APP_URL}/payment/success`,
        cancelUrl: cancelUrl || `${process.env.APP_URL}/payment/cancel`,
        expireMinutes: 30,
      });

      return reply.send(success(result));
    })
  );

  // 2. 查詢付款狀態
  fastify.get(
    "/api/payment/status/:bookingId",
    safeHandler(async (req, reply) => {
      const { bookingId } = req.params as { bookingId: string };
      const tenantId = (req as any).tenantId;

      const status = await billingEngine.getPaymentStatus(bookingId, tenantId);
      return reply.send(success(status));
    })
  );

  // 3. Webhook（金流通知）
  fastify.post(
    "/api/webhook/payment",
    {
      config: { rawBody: true },
    },
    async (req, reply) => {
      const payload = req.body;
      const headers = req.headers as Record<string, string>;
      
      const result = await billingEngine.handleWebhook(payload, headers);
      
      if (result.handled) {
        return reply.status(200).send({ received: true });
      }
      return reply.status(400).send({ error: "Webhook 處理失敗" });
    }
  );
}