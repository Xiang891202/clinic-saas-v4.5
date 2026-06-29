// backend/src/services/clinicNotificationService.ts
import { SupabaseClient } from "@supabase/supabase-js";

export interface NotificationLogFilter {
  status?: 'sent' | 'failed' | 'pending';
  channel?: 'email' | 'line' | 'queue';
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export class ClinicNotificationService {
  constructor(private supabase: SupabaseClient) {}

  async getNotificationLogs(
    tenantId: string,
    filter: NotificationLogFilter = {}
  ) {
    const {
      status,
      channel,
      startDate,
      endDate,
      limit = 20,
      offset = 0,
    } = filter;

    let query = this.supabase
    .from("notification_logs")
    .select(
        `
        id,
        booking_event_id,
        channel,
        status,
        detail,
        created_at,
        acknowledged,
        booking_events (
            id,
            patients (
            name_given,
            name_family,
            telecom_email,
            telecom_phone
            )
        )
        `,
        { count: "exact" }
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq("status", status);
    }

    if (channel) {
      query = query.eq("channel", channel);
    }

    if (startDate) {
      query = query.gte("created_at", startDate);
    }

    if (endDate) {
      query = query.lte("created_at", endDate);
    }

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`查詢通知記錄失敗: ${error.message}`);
    }

    const formattedData = (data || []).map((item: any) => {
    // 處理 booking_events（可能是物件或陣列）
    const bookingEvent = item.booking_events?.[0] || item.booking_events || null;
    const patient = bookingEvent?.patients?.[0] || bookingEvent?.patients || null;

    return {
        id: item.id,
        bookingId: item.booking_event_id,
        channel: item.channel,
        status: item.status,
        detail: item.detail || {},
        createdAt: item.created_at,
        acknowledged: item.acknowledged || false,
        patient: patient
        ? {
            name: `${patient.name_family || ''}${patient.name_given || ''}`,
            email: patient.telecom_email,
            phone: patient.telecom_phone,
            }
        : null,
    };
    });

    return {
      data: formattedData,
      total: count || 0,
      limit,
      offset,
    };
  }

  async getFailedNotifications(
    tenantId: string,
    filter: Omit<NotificationLogFilter, 'status'> = {}
    ) {
    return this.getNotificationLogs(tenantId, {
        ...filter,
        status: 'failed',
        // 可選：預設只查未確認
        // acknowledged: false,
    });
    }

  async acknowledgeNotification(
    tenantId: string,
    notificationId: string
  ): Promise<void> {
    const { error } = await this.supabase
      .from("notification_logs")
      .update({
        acknowledged: true,
      })
      .eq("id", notificationId)
      .eq("tenant_id", tenantId);

    if (error) {
      throw new Error(`標記已確認失敗: ${error.message}`);
    }
  }

  async batchAcknowledgeNotifications(
    tenantId: string,
    notificationIds: string[]
  ): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const id of notificationIds) {
      try {
        await this.acknowledgeNotification(tenantId, id);
        success++;
      } catch {
        failed++;
      }
    }

    return { success, failed };
  }

    async getNotificationSummary(tenantId: string) {
    const { data, error } = await this.supabase
        .from("notification_logs")
        .select("status, channel", { count: "exact" })
        .eq("tenant_id", tenantId)
        .eq("status", "failed")           // 只查失敗
        .is("acknowledged", null)         // ✅ 只查未確認
        .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    if (error) {
        throw new Error(`取得通知統計失敗: ${error.message}`);
    }

    // 因為已過濾 status = 'failed'，所以摘要只需統計總數
    const summary = {
        total: data?.length || 0,
        sent: 0,          // 不再計算 sent/pending，因為只查失敗
        failed: data?.length || 0,
        pending: 0,
        byChannel: {
        email: { sent: 0, failed: 0 },
        line: { sent: 0, failed: 0 },
        queue: { sent: 0, failed: 0 },
        },
    };

    // 按渠道分類（可選）
    (data || []).forEach((item: any) => {
        const channel = item.channel as 'email' | 'line' | 'queue';
        if (channel && summary.byChannel[channel]) {
        summary.byChannel[channel].failed = (summary.byChannel[channel].failed || 0) + 1;
        }
    });

    return summary;
    }

  async retryFailedNotification(
    tenantId: string,
    notificationId: string,
    queue: any
  ): Promise<void> {
    if (!tenantId) {
        throw new Error("缺少診所識別碼");
    }
    if (!queue) {
        throw new Error("通知佇列未初始化");
    }
    const { data: notification, error } = await this.supabase
      .from("notification_logs")
      .select("booking_event_id, channel, detail")
      .eq("id", notificationId)
      .eq("tenant_id", tenantId)
      .eq("status", "failed")
      .single();

    if (error || !notification) {
      throw new Error("找不到失敗通知記錄");
    }

    await queue.add(
      "send-notification",
      {
        type: notification.detail?.type || "created",
        booking_id: notification.booking_event_id,
        tenant_id: tenantId,
      },
      {
        jobId: `retry-${notificationId}-${Date.now()}`,
      }
    );

    await this.supabase
      .from("notification_logs")
      .update({
        status: "pending",
        detail: {
          ...notification.detail,
          retried_at: new Date().toISOString(),
        },
      })
      .eq("id", notificationId)
      .eq("tenant_id", tenantId);
  }
}