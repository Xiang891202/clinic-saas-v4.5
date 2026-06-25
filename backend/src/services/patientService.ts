import { SupabaseClient } from "@supabase/supabase-js";

export class PatientService {
  constructor(private supabase: SupabaseClient) {}

  async getPatients(tenantId: string, search?: string, limit = 50, offset = 0) {
    let query = this.supabase
      .from("patients")
      .select(`
        id, name_given, name_family, telecom_phone, telecom_email,
        gender, birth_date, created_at, email_verified
      `, { count: "exact" })
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.or(`name_given.ilike.%${search}%,name_family.ilike.%${search}%,telecom_phone.ilike.%${search}%,telecom_email.ilike.%${search}%`);
    }

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    // 计算预约次数
    const patientIds = (data || []).map((p: any) => p.id);
    let appointmentCounts: Record<string, number> = {};
    if (patientIds.length > 0) {
      const { data: counts } = await this.supabase
        .from("booking_events")
        .select("patient_id", { count: "exact" })
        .in("patient_id", patientIds);
      if (counts) {
        const map = new Map<string, number>();
        counts.forEach((c: any) => map.set(c.patient_id, (map.get(c.patient_id) || 0) + 1));
        appointmentCounts = Object.fromEntries(map);
      }
    }

    return {
      data: (data || []).map((p: any) => ({
        ...p,
        appointment_count: appointmentCounts[p.id] || 0,
        name: `${p.name_family || ""}${p.name_given || ""}`,
      })),
      total: count || 0,
      limit,
      offset,
    };
  }
}