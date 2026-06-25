// backend/src/services/adminMonitor.ts
import { SupabaseClient } from "@supabase/supabase-js";

export interface NotificationStats {
  total: number;
  sent: number;
  failed: number;
  rate: number;
}

export class AdminMonitorService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * 获取通知统计（仅 Email）
   */
  async getNotificationStats(tenantId: string, date: string): Promise<NotificationStats> {
    const yearMonth = date.slice(0, 7);

    const { data, error } = await this.supabase
      .from("notification_usage")
      .select("sent_count, failed_count")
      .eq("tenant_id", tenantId)
      .eq("year_month", yearMonth)
      .eq("channel", "email");

    if (error) throw new Error(error.message);

    let sent = 0;
    let failed = 0;

    (data || []).forEach((row) => {
      sent += row.sent_count || 0;
      failed += row.failed_count || 0;
    });

    const total = sent + failed;
    const rate = total > 0 ? Math.round((sent / total) * 100) : 0;

    return { total, sent, failed, rate };
  }

  /**
   * 获取每日趋势（仅 Email，指定租户）
   */
  async getDailyTrend(tenantId: string, days: number = 7) {
    const results = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);

      const { data } = await this.supabase
        .from("notification_logs")
        .select("status")
        .eq("tenant_id", tenantId)
        .eq("channel", "email")
        .gte("created_at", `${dateStr}T00:00:00`)
        .lt("created_at", `${dateStr}T23:59:59`);

      const sent = (data || []).filter((l: any) => l.status === "sent").length;
      const failed = (data || []).filter((l: any) => l.status === "failed").length;
      results.push({ date: dateStr, sent, failed });
    }
    return results;
  }

  /**
   * 获取全局每日趋势（所有租户汇总）
   */
  async getGlobalDailyTrend(days: number = 7) {
    const results = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);

      const { data } = await this.supabase
        .from("notification_logs")
        .select("status")
        .eq("channel", "email")
        .gte("created_at", `${dateStr}T00:00:00`)
        .lt("created_at", `${dateStr}T23:59:59`);

      const sent = (data || []).filter((l: any) => l.status === "sent").length;
      const failed = (data || []).filter((l: any) => l.status === "failed").length;
      results.push({ date: dateStr, sent, failed });
    }
    return results;
  }

  /**
   * 获取失败通知日志（指定租户）
   */
  async getFailedLogs(tenantId: string, limit: number = 20) {
    const { data, error } = await this.supabase
      .from("notification_logs")
      .select(`
        id,
        created_at,
        channel,
        status,
        detail,
        booking_event_id,
        tenants ( id, name )
      `)
      .eq("tenant_id", tenantId)
      .eq("channel", "email")
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);
    return data || [];
  }

  /**
   * 获取全局失败通知日志（所有租户）
   */
  async getGlobalFailedLogs(limit: number = 20) {
    const { data, error } = await this.supabase
      .from("notification_logs")
      .select(`
        id,
        created_at,
        channel,
        status,
        detail,
        booking_event_id,
        tenants ( id, name )
      `)
      .eq("channel", "email")
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);
    return data || [];
  }

  /**
   * 获取所有租户的通知统计（管理端全局视图，仅 Email）
   */
  async getGlobalStats(yearMonth: string) {
    const { data, error } = await this.supabase
      .from("notification_usage")
      .select(`
        tenant_id,
        sent_count,
        failed_count,
        tenants ( id, name )
      `)
      .eq("year_month", yearMonth)
      .eq("channel", "email");

    if (error) throw new Error(error.message);

    const tenantMap = new Map();
    (data || []).forEach((row: any) => {
      const tenantId = row.tenant_id;
      if (!tenantMap.has(tenantId)) {
        tenantMap.set(tenantId, {
          tenant_id: tenantId,
          tenant_name: row.tenants?.name || "未知",
          sent: 0,
          failed: 0,
        });
      }
      const stats = tenantMap.get(tenantId);
      stats.sent += row.sent_count || 0;
      stats.failed += row.failed_count || 0;
    });

    const stats = Array.from(tenantMap.values());
    const totalSent = stats.reduce((sum, s) => sum + s.sent, 0);
    const totalFailed = stats.reduce((sum, s) => sum + s.failed, 0);
    const total = totalSent + totalFailed;
    const rate = total > 0 ? Math.round((totalSent / total) * 100) : 0;

    return {
      tenants: stats,
      total: { sent: totalSent, failed: totalFailed, total, rate },
    };
  }

  // backend/src/services/adminMonitor.ts

  /**
   * 获取所有诊所的当月用量（含限额）
   */
  async getTenantUsageList(yearMonth: string) {
    // 1. 获取所有诊所的当月用量
    const { data: usageData, error } = await this.supabase
      .from("notification_usage")
      .select(`
        tenant_id,
        sent_count,
        failed_count,
        tenants ( id, name, email_limit )
      `)
      .eq("year_month", yearMonth)
      .eq("channel", "email");

    if (error) throw new Error(error.message);

    // 2. 获取所有诊所（包括没有用量的，以显示限额）
    const { data: allTenants, error: tenantErr } = await this.supabase
      .from("tenants")
      .select("id, name, email_limit, status")
      .eq("status", "active");

    if (tenantErr) throw new Error(tenantErr.message);

    // 合并数据
    const usageMap = new Map();
    (usageData || []).forEach((item: any) => {
      usageMap.set(item.tenant_id, {
        sent: item.sent_count || 0,
        failed: item.failed_count || 0,
        tenant: item.tenants,
      });
    });

    const result = (allTenants || []).map((tenant: any) => {
      const usage = usageMap.get(tenant.id) || { sent: 0, failed: 0 };
      return {
        tenant_id: tenant.id,
        tenant_name: tenant.name,
        email_limit: tenant.email_limit || 0,
        sent: usage.sent,
        failed: usage.failed,
        total: usage.sent + usage.failed,
        usage_rate: tenant.email_limit > 0 ? Math.round((usage.sent / tenant.email_limit) * 100) : 0,
      };
    });

    return result;
  }
}