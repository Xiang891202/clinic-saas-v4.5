export class DoctorService {
  constructor(private supabase: SupabaseClient) {}

  async getDoctors(tenantId: string) {
    const { data, error } = await this.supabase
      .from("doctors")
      .select("id, name, specialty")
      .eq("tenant_id", tenantId)
      .eq("is_active", true);
    if (error) throw new Error(error.message);
    return data;
  }
}