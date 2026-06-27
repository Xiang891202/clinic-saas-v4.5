// packages/shared/src/payment/IPaymentGateway.ts
import {
  PaymentRequest,
  PaymentResponse,
  WebhookPayload,
  WebhookResult,
  RefundRequest,
} from './types.js';

export interface IPaymentGateway {
  /**
   * 建立付款（產生連結或直接交易）
   */
  createPayment(request: PaymentRequest): Promise<PaymentResponse>;

  /**
   * 查詢付款狀態
   */
  getPaymentStatus(transactionId: string): Promise<PaymentResponse>;

  /**
   * 處理 Webhook 通知
   */
  handleWebhook(payload: WebhookPayload): Promise<WebhookResult>;

  /**
   * 退款
   */
  refund(request: RefundRequest): Promise<{ success: boolean; refundId?: string }>;

  /**
   * 驗證 Webhook 簽章（每種金流可能不同，由實作決定）
   */
  verifyWebhookSignature?(payload: any, signature: string): boolean;

  /**
   * 是否為「跳轉型」付款（需要導向金流頁面）
   */
  isRedirectRequired(): boolean;
}