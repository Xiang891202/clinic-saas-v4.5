// packages/engine-billing/src/BillingEngine.ts
import { SupabaseClient } from "@supabase/supabase-js";
import { IPaymentGateway } from "@clinic/shared/payment/index.js";
import {
  PaymentRecord,
  CreateDepositPaymentParams,
  ConfirmPaymentParams,
  PaymentStatus,
  PaymentWebhookResult,
} from "./types.js";

export class BillingEngine {
  constructor(
    private supabase: SupabaseClient,
    private paymentGateway: IPaymentGateway
  ) {}

  /**
   * 建立訂金付款
   * 1. 查詢預約（確保存在且狀態為 pending_deposit）
   * 2. 建立付款記錄（status: pending）
   * 3. 呼叫金流閘道取得付款連結
   * 4. 更新付款記錄（transaction_id, payment_url）
   */
  async createDepositPayment(
    params: CreateDepositPaymentParams
  ): Promise<{ paymentUrl: string; transactionId: string }> {
    // 1. 查詢預約
    const { data: booking, error: bookingError } = await this.supabase
      .from("booking_events")
      .select("id, tenant_id, status, service_id, slot_instance_id")
      .eq("id", params.bookingId)
      .eq("tenant_id", params.tenantId)
      .single();

    if (bookingError || !booking) {
      throw new Error("預約不存在");
    }

    // 僅允許 pending_deposit 或 booked 狀態（若已付訂金則不重複建立）
    if (booking.status === "booked") {
      throw new Error("此預約已完成訂金支付，無需重複付款");
    }

    // 2. 檢查是否已有付款記錄（防止重複建立）
    const { data: existingPayment } = await this.supabase
      .from("payments")
      .select("id, status")
      .eq("booking_id", params.bookingId)
      .eq("tenant_id", params.tenantId)
      .in("status", ["pending", "paid"])
      .maybeSingle();

    if (existingPayment) {
      if (existingPayment.status === "paid") {
        throw new Error("此預約已付款");
      }
      throw new Error("此預約已有進行中的付款，請稍後再試");
    }

    // 3. 建立付款記錄
    const { data: payment, error: paymentError } = await this.supabase
      .from("payments")
      .insert({
        booking_id: params.bookingId,
        tenant_id: params.tenantId,
        amount: params.amount,
        currency: params.currency || "TWD",
        payment_method: "credit_card", // 可依閘道類型調整
        status: "pending",
        expires_at: params.expireMinutes
          ? new Date(Date.now() + params.expireMinutes * 60 * 1000).toISOString()
          : null,
        metadata: { description: params.description },
      })
      .select()
      .single();

    if (paymentError) {
      throw new Error(`建立付款記錄失敗: ${paymentError.message}`);
    }

    // 4. 呼叫金流閘道
    const orderId = `booking-${params.bookingId}`;
    const result = await this.paymentGateway.createPayment({
      amount: params.amount,
      currency: params.currency || "TWD",
      orderId,
      description: params.description || `預約訂金 (${orderId})`,
      successUrl: params.successUrl || `${process.env.APP_URL}/payment/success`,
      cancelUrl: params.cancelUrl || `${process.env.APP_URL}/payment/cancel`,
      expireMinutes: params.expireMinutes,
      metadata: {
        bookingId: params.bookingId,
        tenantId: params.tenantId,
        paymentId: payment.id,
      },
    });

    // 5. 更新付款記錄（transaction_id, payment_url）
    const { error: updateError } = await this.supabase
      .from("payments")
      .update({
        transaction_id: result.transactionId,
        payment_url: result.paymentUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payment.id);

    if (updateError) {
      console.error("更新付款記錄失敗:", updateError);
      // 不拋出錯誤，因為已建立付款記錄
    }

    return {
      paymentUrl: result.paymentUrl || "",
      transactionId: result.transactionId,
    };
  }

  /**
   * 確認付款（Webhook 或手動呼叫）
   * 1. 查詢付款記錄
   * 2. 驗證交易狀態
   * 3. 更新付款記錄狀態
   * 4. 更新預約狀態（booking → booked）
   * 5. 觸發通知（透過 Worker）
   */
  async confirmPayment(params: ConfirmPaymentParams): Promise<void> {
    // 1. 查詢付款記錄
    const { data: payment, error: paymentError } = await this.supabase
      .from("payments")
      .select("*")
      .eq("transaction_id", params.transactionId)
      .single();

    if (paymentError || !payment) {
      throw new Error(`找不到付款記錄: ${params.transactionId}`);
    }

    if (payment.status === "paid") {
      console.log(`付款 ${params.transactionId} 已確認，跳過重複處理`);
      return;
    }

    if (payment.status !== "pending") {
      throw new Error(`付款 ${params.transactionId} 狀態為 ${payment.status}，無法確認`);
    }

    // 2. 更新付款記錄
    const updateData: any = {
      status: params.status,
      updated_at: new Date().toISOString(),
      metadata: {
        ...(payment.metadata || {}),
        webhook: params.metadata,
      },
    };

    if (params.status === "paid") {
      updateData.paid_at = new Date().toISOString();
    }

    const { error: updateError } = await this.supabase
      .from("payments")
      .update(updateData)
      .eq("id", payment.id);

    if (updateError) {
      throw new Error(`更新付款記錄失敗: ${updateError.message}`);
    }

    // 3. 若付款成功 → 更新預約狀態
    if (params.status === "paid") {
      const { error: bookingError } = await this.supabase
        .from("booking_events")
        .update({
          status: "booked",
          updated_at: new Date().toISOString(),
        })
        .eq("id", payment.booking_id)
        .eq("tenant_id", payment.tenant_id);

      if (bookingError) {
        console.error(`更新預約狀態失敗: ${bookingError.message}`);
        // 不拋出錯誤，因為付款已確認，可由 Reconciliation 修復
      }

      // ✅ 觸發通知（預約成功，含訂金）
      console.log(`📧 預約 ${payment.booking_id} 訂金已確認，待發送通知`);
    }
  }

  /**
   * 處理金流 Webhook
   */
  async handleWebhook(payload: any, headers: Record<string, string>): Promise<PaymentWebhookResult> {
    const result = await this.paymentGateway.handleWebhook({
      rawBody: payload,
      headers,
    });

    if (result.handled && result.transactionId) {
      await this.confirmPayment({
        transactionId: result.transactionId,
        status: result.status,
        metadata: result.metadata,
      });
    }

    return result;
  }

  /**
   * 查詢付款狀態（供前端輪詢或管理端使用）
   */
  async getPaymentStatus(bookingId: string, tenantId: string): Promise<{
    status: PaymentStatus;
    paymentUrl?: string;
    amount: number;
    transactionId?: string;
    paidAt?: Date;
    expiresAt?: Date;
  }> {
    const { data: payment, error } = await this.supabase
      .from("payments")
      .select("*")
      .eq("booking_id", bookingId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error || !payment) {
      throw new Error("找不到付款記錄");
    }

    return {
      status: payment.status,
      paymentUrl: payment.payment_url,
      amount: payment.amount,
      transactionId: payment.transaction_id,
      paidAt: payment.paid_at,
      expiresAt: payment.expires_at,
    };
  }

  /**
   * 釋放逾時訂金（由 Reconciliation Engine 定期呼叫）
   */
  async releaseExpiredDeposits(): Promise<{
    released: number;
    errors: string[];
  }> {
    const result = { released: 0, errors: [] as string[] };

    try {
      // 查詢超過 30 分鐘未付款的預約
      const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();

      const { data: expiredPayments, error } = await this.supabase
        .from("payments")
        .select("id, booking_id, tenant_id")
        .eq("status", "pending")
        .lt("created_at", cutoff);

      if (error) {
        result.errors.push(`查詢逾時付款失敗: ${error.message}`);
        return result;
      }

      for (const payment of expiredPayments || []) {
        try {
          // 更新付款狀態為 expired
          const { error: updateError } = await this.supabase
            .from("payments")
            .update({
              status: "expired",
              updated_at: new Date().toISOString(),
            })
            .eq("id", payment.id);

          if (updateError) {
            result.errors.push(`更新付款 ${payment.id} 失敗: ${updateError.message}`);
            continue;
          }

          // 更新預約狀態為 expired_deposit（釋放時段）
          const { error: bookingError } = await this.supabase
            .from("booking_events")
            .update({
              status: "expired_deposit",
              updated_at: new Date().toISOString(),
            })
            .eq("id", payment.booking_id)
            .eq("tenant_id", payment.tenant_id);

          if (bookingError) {
            result.errors.push(`更新預約 ${payment.booking_id} 失敗: ${bookingError.message}`);
            continue;
          }

          // ✅ 釋放時段容量（-1）
          // 這裡透過 Supabase 直接更新，不呼叫 Booking Engine（保持低耦合）
          const { data: booking } = await this.supabase
            .from("booking_events")
            .select("slot_instance_id")
            .eq("id", payment.booking_id)
            .single();

          if (booking?.slot_instance_id) {
            await this.supabase.rpc("decrement_booked_count", {
              slot_id: booking.slot_instance_id,
            });
          }

          result.released++;
        } catch (err) {
          result.errors.push(`釋放訂金 ${payment.id} 失敗: ${err}`);
        }
      }
    } catch (err) {
      result.errors.push(`釋放逾時訂金失敗: ${err}`);
    }

    return result;
  }
}