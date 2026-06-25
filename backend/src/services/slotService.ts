import { SupabaseClient } from "@supabase/supabase-js";

export class SlotService {
  constructor(private supabase: SupabaseClient) {}

  async getSlotsByMonth(tenantId: string, year: number, month: number) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];
    
    const { data, error } = await this.supabase
      .from("slot_instances")
      .select(`*, doctors (id, name), services (id, name)`)
      .eq("tenant_id", tenantId)
      .gte("slot_date", startDate)
      .lte("slot_date", endDate)
      .eq("status", "open")
      .order("slot_date", { ascending: true });
      
    if (error) throw new Error(error.message);
    return data;
  }

  async createSlot(tenantId: string, payload: any) {
    // 检查冲突
    const { data: existing } = await this.supabase
      .from("slot_instances")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("slot_date", payload.slot_date)
      .eq("doctor_id", payload.doctor_id)
      .eq("start_time", payload.start_time)
      .maybeSingle();
      
    if (existing) {
      throw new Error("該醫師在此時間已有時段");
    }

    const { data, error } = await this.supabase
      .from("slot_instances")
      .insert({ ...payload, tenant_id: tenantId, status: "open", booked_count: 0 })
      .select(`*, doctors (id, name), services (id, name)`)
      .single();
      
    if (error) throw new Error(error.message);
    return data;
  }

  // 其他方法：deleteSlot, getSlotsByDate, updateSlot...
}