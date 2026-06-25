import { SupabaseClient } from "@supabase/supabase-js";

export class ServiceManagementService {
  constructor(private supabase: SupabaseClient) {}

  async getServices(tenantId: string) {
    const { data, error } = await this.supabase
      .from("services")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  }

  async createService(tenantId: string, payload: any) {
    const { data, error } = await this.supabase
      .from("services")
      .insert({ ...payload, tenant_id: tenantId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async updateService(tenantId: string, id: string, payload: any) {
    const { data, error } = await this.supabase
      .from("services")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async deleteService(tenantId: string, id: string) {
    // 检查是否有预约记录
    const { count, error: countErr } = await this.supabase
      .from("booking_events")
      .select("id", { count: "exact", head: true })
      .eq("service_id", id)
      .eq("tenant_id", tenantId)
      .in("status", ["booked", "arrived", "completed"]);

    if (countErr) throw new Error(countErr.message);

    if (count && count > 0) {
      // 有预约 → 软删除（停用）
      const { error } = await this.supabase
        .from("services")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tenant_id", tenantId);
      if (error) throw new Error(error.message);
      return { success: true, message: `服務已停用（有 ${count} 筆預約記錄）`, is_soft_deleted: true };
    } else {
      // 无预约 → 真删除
      const { error } = await this.supabase
        .from("services")
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId);
      if (error) throw new Error(error.message);
      return { success: true, message: "服務已刪除" };
    }
  }
}