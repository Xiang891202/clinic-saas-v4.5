// packages/engine-billing/src/types.ts

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'expired';

export interface PaymentRecord {
  id: string;
  booking_id: string;
  tenant_id: string;
  amount: number;          // 單位：分
  currency: string;        // 預設 'TWD'
  transaction_id: string;  // 金流端交易編號
  payment_method: 'credit_card' | 'bank_transfer' | 'ecpay';
  status: PaymentStatus;
  payment_url?: string;
  expires_at?: Date;
  paid_at?: Date;
  metadata?: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface CreateDepositPaymentParams {
  bookingId: string;
  tenantId: string;
  amount: number;          // 單位：分
  currency?: string;
  description?: string;
  successUrl?: string;
  cancelUrl?: string;
  expireMinutes?: number;
}

export interface ConfirmPaymentParams {
  transactionId: string;
  status: 'paid' | 'failed';
  metadata?: Record<string, any>;
}

export interface PaymentWebhookResult {
  handled: boolean;
  transactionId: string;
  status: PaymentStatus;
  metadata?: Record<string, any>;
}