// backend/src/services/notificationService.ts
import { notificationQueue } from "../../../apps/worker/src/index.js";
import { supabase } from "../index.js";

export interface NotificationPayload {
  type: "created" | "modified" | "cancelled" | "reminder";
  booking_id: string;
  tenant_id: string;
}

export class NotificationService {
  /**
   * 发送通知并将结果记录到 notification_usage
   */
  async send(payload: NotificationPayload): Promise<void> {
    try {
      // 1. 先记录到 notification_logs（用于审计）
      const { data: log, error: logErr } = await supabase
        .from("notification_logs")
        .insert({
          booking_event_id: payload.booking_id,
          tenant_id: payload.tenant_id,
          channel: "queue",
          status: "pending",
          type: payload.type,
        })
        .select()
        .single();

      if (logErr) {
        console.error("记录通知日志失败:", logErr);
        // 继续执行，不阻塞
      }

      // 2. 放入队列
      await notificationQueue.add("send-notification", payload);

      // 3. 更新用量计数（在 Worker 实际发送成功/失败后会再次更新）
      await this.updateUsage(payload.tenant_id, "sent", 1);

      console.log(`✅ 通知已放入 Queue: ${payload.type} - ${payload.booking_id}`);
    } catch (error) {
      console.error(`❌ 通知放入 Queue 失败: ${payload.type} - ${payload.booking_id}`, error);
      // 记录失败
      await this.updateUsage(payload.tenant_id, "failed", 1);
    }
  }

  /**
   * 更新通知用量统计
   */
  async updateUsage(tenantId: string, type: "sent" | "failed", count: number = 1) {
    const now = new Date();
    const yearMonth = now.toISOString().slice(0, 7);

    // 先查询当前记录
    const { data: existing } = await supabase
      .from("notification_usage")
      .select("sent_count, failed_count")
      .eq("tenant_id", tenantId)
      .eq("year_month", yearMonth)
      .eq("channel", "email")
      .maybeSingle();

    const newSent = (existing?.sent_count || 0) + (type === "sent" ? count : 0);
    const newFailed = (existing?.failed_count || 0) + (type === "failed" ? count : 0);

    const { error } = await supabase
      .from("notification_usage")
      .upsert(
        {
          tenant_id: tenantId,
          year_month: yearMonth,
          channel: "email",
          sent_count: newSent,
          failed_count: newFailed,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "tenant_id, year_month, channel",  // ✅ 关键！
        }
      );

    if (error) {
      console.error("更新通知用量失败:", error);
    }
  }

  /**
   * 获取租户本月用量
   */
  async getUsage(tenantId: string) {
    const now = new Date();
    const yearMonth = now.toISOString().slice(0, 7);

    const { data, error } = await supabase
      .from("notification_usage")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("year_month", yearMonth)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data || { sent_count: 0, failed_count: 0 };
  }
}