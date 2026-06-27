// packages/shared/src/payment/StripeAdapter.ts
import Stripe from 'stripe';
import { IPaymentGateway } from './IPaymentGateway.js';
import {
  PaymentRequest,
  PaymentResponse,
  WebhookPayload,
  WebhookResult,
  RefundRequest,
} from './types.js';

export interface StripeAdapterOptions {
  secretKey: string;
  webhookSecret?: string;
  apiVersion?: string;
}

export class StripeAdapter implements IPaymentGateway {
  private client: Stripe;
  private webhookSecret?: string;

  constructor(options: StripeAdapterOptions) {
    this.client = new Stripe(options.secretKey, {
      apiVersion: options.apiVersion || '2025-02-24.acacia',
    });
    this.webhookSecret = options.webhookSecret;
  }

  async createPayment(request: PaymentRequest): Promise<PaymentResponse> {
    // 若未提供 successUrl/cancelUrl，使用預設
    const successUrl = request.successUrl || `${process.env.APP_URL}/payment/success`;
    const cancelUrl = request.cancelUrl || `${process.env.APP_URL}/payment/cancel`;

    const session = await this.client.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: request.currency || 'twd',
            product_data: {
              name: request.description || '預約訂金',
              metadata: request.metadata,
            },
            unit_amount: request.amount, // 單位：分
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        orderId: request.orderId,
        ...(request.metadata || {}),
      },
      expires_at: request.expireMinutes
        ? Math.floor(Date.now() / 1000) + request.expireMinutes * 60
        : undefined,
    });

    return {
      transactionId: session.id,
      paymentUrl: session.url || undefined,
      status: 'pending',
      rawData: session,
    };
  }

  async getPaymentStatus(transactionId: string): Promise<PaymentResponse> {
    const session = await this.client.checkout.sessions.retrieve(transactionId);
    let status: PaymentResponse['status'] = 'pending';
    if (session.payment_status === 'paid') status = 'paid';
    else if (session.payment_status === 'no_payment_required') status = 'pending';
    else if (session.status === 'expired') status = 'expired';

    return {
      transactionId: session.id,
      status,
      rawData: session,
    };
  }

  async handleWebhook(payload: WebhookPayload): Promise<WebhookResult> {
    const sig = payload.headers['stripe-signature'];
    if (!sig || !this.webhookSecret) {
      return { handled: false, status: 'failed' };
    }

    try {
      const event = this.client.webhooks.constructEvent(
        typeof payload.rawBody === 'string' ? payload.rawBody : JSON.stringify(payload.rawBody),
        sig,
        this.webhookSecret
      );

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        return {
          handled: true,
          transactionId: session.id,
          status: 'paid',
          metadata: { orderId: session.metadata?.orderId },
        };
      }
      return { handled: false, status: 'pending' };
    } catch (err) {
      return { handled: false, status: 'failed' };
    }
  }

  async refund(request: RefundRequest): Promise<{ success: boolean; refundId?: string }> {
    const refund = await this.client.refunds.create({
      payment_intent: request.transactionId, // Stripe Checkout session 沒有直接 refund，需先取 payment_intent
      amount: request.amount,
      reason: request.reason as Stripe.RefundCreateParams.Reason,
    });
    return { success: true, refundId: refund.id };
  }

  isRedirectRequired(): boolean {
    return true; // Checkout Session 需要跳轉
  }
}