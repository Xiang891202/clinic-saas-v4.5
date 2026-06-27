import { Queue, QueueOptions } from 'bullmq'; // ✅ 引入 QueueOptions
import { SupabaseClient } from '@supabase/supabase-js';
import { notificationQueue } from '../config/queues.js';

export interface NotificationPayload {
  type: "created" | "modified" | "cancelled" | "reminder";
  booking_id: string;
  tenant_id: string;
}

export class NotificationService {
  private supabase: SupabaseClient;
  
  // ⚠️ 將第一個參數的型態從 Redis 改為連線配置物件
  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  async send(payload: NotificationPayload): Promise<void> {
    const { supabase } = this;
    try {
      // 记录日志
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
      }

      // 放入队列
      await notificationQueue.add("send-notification", payload);

      // 更新用量
      await this.updateUsage(payload.tenant_id, "sent", 1);

      console.log(`✅ 通知已放入 Queue: ${payload.type} - ${payload.booking_id}`);
    } catch (error) {
      console.error(`❌ 通知放入 Queue 失败: ${payload.type} - ${payload.booking_id}`, error);
      await this.updateUsage(payload.tenant_id, "failed", 1);
    }
  }

  async updateUsage(tenantId: string, type: "sent" | "failed", count: number = 1) {
    const now = new Date();
    const yearMonth = now.toISOString().slice(0, 7);

    const { data: existing } = await this.supabase
      .from("notification_usage")
      .select("sent_count, failed_count")
      .eq("tenant_id", tenantId)
      .eq("year_month", yearMonth)
      .eq("channel", "email")
      .maybeSingle();

    const newSent = (existing?.sent_count || 0) + (type === "sent" ? count : 0);
    const newFailed = (existing?.failed_count || 0) + (type === "failed" ? count : 0);

    const { error } = await this.supabase
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
          onConflict: "tenant_id, year_month, channel",
        }
      );

    if (error) {
      console.error("更新通知用量失败:", error);
    }
  }

  async getUsage(tenantId: string) {
    const now = new Date();
    const yearMonth = now.toISOString().slice(0, 7);

    const { data, error } = await this.supabase
      .from("notification_usage")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("year_month", yearMonth)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data || { sent_count: 0, failed_count: 0 };
  }
}