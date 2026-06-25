// packages/shared/src/notification/usage.ts
import { SupabaseClient } from "@supabase/supabase-js";

export class NotificationUsageService {
  constructor(private supabase: SupabaseClient) {}

  async recordUsage(tenantId: string, channel: string, status: "sent" | "failed"): Promise<void> {
    const yearMonth = new Date().toISOString().slice(0, 7);
    const field = status === "sent" ? "sent_count" : "failed_count";

    // 使用 upsert 避免重複記錄
    const { error } = await this.supabase
      .from("notification_usage")
      .upsert({
        tenant_id: tenantId,
        year_month,
        channel,
        [field]: 1,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.error("記錄通知用量失敗:", error);
    }
  }
}