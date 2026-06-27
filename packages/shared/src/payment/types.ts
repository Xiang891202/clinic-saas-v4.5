// packages/shared/src/payment/types.ts

export type PaymentMethod = 'credit_card' | 'bank_transfer' | 'ecpay';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'expired';

export interface PaymentRequest {
  amount: number;               // 最小單位（分）
  currency?: string;            // 預設 TWD
  orderId: string;              // 內部訂單編號
  description?: string;
  metadata?: Record<string, any>;
  successUrl?: string;          // 付款成功後跳轉
  cancelUrl?: string;           // 取消跳轉
  expireMinutes?: number;       // 付款有效期限（分）
}

export interface PaymentResponse {
  transactionId: string;        // 金流端交易編號
  paymentUrl?: string;          // 付款連結（若為跳轉型）
  status: PaymentStatus;
  rawData?: any;                // 原始回傳資料（僅供除錯）
}

export interface WebhookPayload {
  rawBody: any;                 // 原始請求體
  headers: Record<string, string>;
}

export interface WebhookResult {
  handled: boolean;
  transactionId?: string;
  status: PaymentStatus;
  metadata?: Record<string, any>;
}

export interface RefundRequest {
  transactionId: string;
  amount?: number;              // 若未填則全額退
  reason?: string;
}