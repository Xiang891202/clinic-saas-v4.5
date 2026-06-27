// packages/shared/src/payment/ManualBankTransferAdapter.ts
import { IPaymentGateway } from './IPaymentGateway.js';
import {
  PaymentRequest,
  PaymentResponse,
  WebhookPayload,
  WebhookResult,
  RefundRequest,
} from './types.js';

/**
 * 銀行轉帳付款 – 由管理員手動確認入帳
 * 因此 createPayment 僅產生付款資訊，不觸發實際交易
 */
export class ManualBankTransferAdapter implements IPaymentGateway {
  async createPayment(request: PaymentRequest): Promise<PaymentResponse> {
    // 產生虛擬帳號或提供銀行帳號資訊
    const transactionId = `BANK-${Date.now()}-${request.orderId.slice(0, 8)}`;
    return {
      transactionId,
      status: 'pending',
      // 可回傳銀行帳號等資訊 (放在 rawData)
      rawData: {
        bankName: 'XX 銀行',
        accountNumber: '1234567890',
        accountHolder: '診所預約系統',
        amount: request.amount / 100, // 顯示元
        description: request.description || '預約訂金',
      },
    };
  }

  async getPaymentStatus(transactionId: string): Promise<PaymentResponse> {
    // 狀態由管理員手動更新，此處僅回傳預設 pending
    return { transactionId, status: 'pending' };
  }

  async handleWebhook(payload: WebhookPayload): Promise<WebhookResult> {
    // 銀行轉帳無 Webhook，手動確認
    return { handled: false, status: 'pending' };
  }

  async refund(request: RefundRequest): Promise<{ success: boolean; refundId?: string }> {
    // 銀行轉帳退款需人工處理，此處僅記錄
    return { success: true, refundId: `REFUND-${Date.now()}` };
  }

  isRedirectRequired(): boolean {
    return false; // 無須跳轉，顯示帳號資訊
  }
}