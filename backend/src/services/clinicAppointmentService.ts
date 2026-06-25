import { SupabaseClient } from "@supabase/supabase-js";

export class ClinicAppointmentService {
  constructor(private supabase: SupabaseClient) {}

  async getAppointments(tenantId: string, filters: { status?: string; date_from?: string; date_to?: string }) {
    let query = this.supabase
      .from("booking_events")
      .select(`
        id, status, source, created_at, patient_id,
        patients ( name_given, name_family, telecom_phone, telecom_email ),
        slot_instances!inner (
          slot_date, start_time, end_time,
          doctors ( name ),
          services ( name )
        )
      `)
      .eq("tenant_id", tenantId);

    if (filters.status) query = query.eq("status", filters.status);
    if (filters.date_from) query = query.gte("slot_instances.slot_date", filters.date_from);
    if (filters.date_to) query = query.lte("slot_instances.slot_date", filters.date_to);

    const { data, error } = await query.order("slot_instances(slot_date)", { ascending: true });
    if (error) throw new Error(error.message);

    return (data || []).map((apt: any) => ({
      id: apt.id,
      status: apt.status,
      source: apt.source,
      created_at: apt.created_at,
      patient_name: `${apt.patients?.name_family || ""}${apt.patients?.name_given || ""}`,
      patient_phone: apt.patients?.telecom_phone || "",
      patient_email: apt.patients?.telecom_email || "",
      slot_date: apt.slot_instances?.slot_date,
      start_time: apt.slot_instances?.start_time,
      end_time: apt.slot_instances?.end_time,
      doctor_name: apt.slot_instances?.doctors?.name || "未知醫師",
      service_name: apt.slot_instances?.services?.name || "未知服務",
    }));
  }

  async updateStatus(tenantId: string, appointmentId: string, status: string) {
    const validStatuses = ["completed", "noshow", "cancelled", "arrived"];
    if (!validStatuses.includes(status)) {
      throw new Error("無效的狀態值");
    }

    const { error } = await this.supabase
      .from("booking_events")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", appointmentId)
      .eq("tenant_id", tenantId);

    if (error) throw new Error(error.message);
    return { success: true, message: `預約狀態已更新為 ${status}` };
  }
}