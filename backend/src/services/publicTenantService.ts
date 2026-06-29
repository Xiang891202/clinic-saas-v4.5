// backend/src/services/publicTenantService.ts
import { SupabaseClient } from "@supabase/supabase-js";

export class PublicTenantService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * 取得所有啟用中的診所（供公開選單使用）
   */
  async getActiveClinics() {
    const { data, error } = await this.supabase
      .from("tenants")
      .select("id, name, public_code")
      .eq("status", "active")
      .order("name", { ascending: true });

    if (error) throw new Error(error.message);
    return data || [];
  }
}