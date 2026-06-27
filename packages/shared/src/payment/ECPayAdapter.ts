// packages/shared/src/payment/ECPayAdapter.ts
import crypto from 'crypto';
import { IPaymentGateway } from './IPaymentGateway.js';
import {
  PaymentRequest,
  PaymentResponse,
  WebhookPayload,
  WebhookResult,
  RefundRequest,
} from './types.js';

export interface ECPayAdapterOptions {
  merchantId: string;
  hashKey: string;
  hashIV: string;
  apiUrl: string;               // 正式或測試環境
  returnUrl?: string;           // 付款完成後同步跳轉
  notifyUrl?: string;           // 非同步通知（Webhook）
  clientBackUrl?: string;       // 取消返回
}

export class ECPayAdapter implements IPaymentGateway {
  private options: ECPayAdapterOptions;

  constructor(options: ECPayAdapterOptions) {
    this.options = options;
  }

  async createPayment(request: PaymentRequest): Promise<PaymentResponse> {
    const orderId = `EC${request.orderId.slice(0, 10)}${Date.now()}`;
    const totalAmount = Math.round(request.amount / 100); // ECPay 單位為元（整數）
    const expireMinutes = request.expireMinutes || 120;

    const params = {
      MerchantID: this.options.merchantId,
      MerchantTradeNo: orderId,
      MerchantTradeDate: this.formatDate(new Date()),
      PaymentType: 'aio',
      TotalAmount: totalAmount,
      TradeDesc: request.description || '預約訂金',
      ItemName: request.description || '預約訂金',
      ReturnURL: this.options.returnUrl || `${process.env.APP_URL}/payment/ecpay-return`,
      OrderResultURL: this.options.returnUrl || `${process.env.APP_URL}/payment/ecpay-result`,
      NotifyURL: this.options.notifyUrl || `${process.env.APP_URL}/webhook/ecpay`,
      ClientBackURL: this.options.clientBackUrl || request.cancelUrl,
      ExpireDate: expireMinutes,
      EncryptType: 1,
      ...request.metadata,
    };

    // 產生 CheckMacValue
    const checkMacValue = this.generateCheckMacValue(params);
    const formData = {
      ...params,
      CheckMacValue: checkMacValue,
    };

    // ECPay 通常以表單 POST 方式導向付款頁
    const paymentUrl = `${this.options.apiUrl}?${new URLSearchParams(formData).toString()}`;

    return {
      transactionId: orderId,
      paymentUrl,
      status: 'pending',
      rawData: formData,
    };
  }

  async getPaymentStatus(transactionId: string): Promise<PaymentResponse> {
    // ECPay 提供查詢 API，此處簡化，實際需呼叫訂單查詢
    // 若無法即時查詢，回傳 pending
    return {
      transactionId,
      status: 'pending',
    };
  }

  async handleWebhook(payload: WebhookPayload): Promise<WebhookResult> {
    const body = payload.rawBody;
    // ECPay 通知為 POST 表單，需驗證 CheckMacValue
    const checkMacValue = body.CheckMacValue;
    if (!checkMacValue) {
      return { handled: false, status: 'failed' };
    }

    // 複製參數並移除 CheckMacValue
    const params = { ...body };
    delete params.CheckMacValue;

    const computed = this.generateCheckMacValue(params);
    if (computed !== checkMacValue) {
      return { handled: false, status: 'failed' };
    }

    // 判斷交易狀態
    const status = body.RtnCode === '1' ? 'paid' : 'failed';
    return {
      handled: true,
      transactionId: body.MerchantTradeNo,
      status,
      metadata: { orderId: body.MerchantTradeNo },
    };
  }

  async refund(request: RefundRequest): Promise<{ success: boolean; refundId?: string }> {
    // ECPay 退款需使用 API，簡化實作
    // 此處僅示意
    return { success: false, refundId: undefined };
  }

  isRedirectRequired(): boolean {
    return true; // 表單跳轉
  }

  private formatDate(date: Date): string {
    return date.toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  }

  private generateCheckMacValue(params: Record<string, any>): string {
    // 依 ECPay 規範：排序、拼接、URLencode、Hash
    const sortedKeys = Object.keys(params).sort();
    let raw = `HashKey=${this.options.hashKey}&`;
    raw += sortedKeys.map(key => `${key}=${params[key]}`).join('&');
    raw += `&HashIV=${this.options.hashIV}`;

    const encoded = encodeURIComponent(raw);
    const checksum = crypto.createHash('sha256').update(encoded).digest('hex').toUpperCase();
    return checksum;
  }
}