// backend/src/services/adminContractService.ts
import { SupabaseClient } from "@supabase/supabase-js";

export interface Contract {
  id: string;
  tenant_id: string;
  start_date: string;
  end_date: string;
  status: 'active' | 'expired' | 'cancelled' | 'pending';
  amount: number;
  plan: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export class AdminContractService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * 获取所有合约列表
   */
  async getContracts(params: {
    search?: string;
    limit?: number;
    offset?: number;
    status?: string;
    tenant_id?: string;
  }) {
    const { search, limit = 50, offset = 0, status, tenant_id } = params;

    let query = this.supabase
      .from("contracts")
      .select(`
        *,
        tenants ( id, name, email )
      `, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq("status", status);
    if (tenant_id) query = query.eq("tenant_id", tenant_id);

    if (search) {
      query = query.or(`plan.ilike.%${search}%,tenants.name.ilike.%${search}%`);
    }

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    return {
      data: data || [],
      total: count || 0,
      limit,
      offset,
    };
  }

  /**
   * 获取单个合约详情
   */
  async getContractById(id: string) {
    const { data, error } = await this.supabase
      .from("contracts")
      .select(`
        *,
        tenants ( id, name, email, phone, address )
      `)
      .eq("id", id)
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * 创建合约
   */
  async createContract(payload: Omit<Contract, 'id' | 'created_at' | 'updated_at'>) {
    // 验证租户是否存在
    const { data: tenant, error: tenantErr } = await this.supabase
      .from("tenants")
      .select("id")
      .eq("id", payload.tenant_id)
      .single();

    if (tenantErr || !tenant) {
      throw new Error("诊所不存在");
    }

    const { data, error } = await this.supabase
      .from("contracts")
      .insert({
        tenant_id: payload.tenant_id,
        start_date: payload.start_date,
        end_date: payload.end_date,
        status: payload.status || 'active',
        amount: payload.amount,
        plan: payload.plan,
        notes: payload.notes || null,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * 更新合约
   */
  async updateContract(id: string, payload: Partial<Omit<Contract, 'id' | 'created_at' | 'updated_at'>>) {
    const { data, error } = await this.supabase
      .from("contracts")
      .update({
        ...payload,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * 删除合约
   */
  async deleteContract(id: string) {
    const { error } = await this.supabase
      .from("contracts")
      .delete()
      .eq("id", id);

    if (error) throw new Error(error.message);
    return { success: true, message: "合约已删除" };
  }

  /**
   * 获取租户的合约统计
   */
  async getTenantContractStats(tenantId: string) {
    const { data, error } = await this.supabase
      .from("contracts")
      .select("status", { count: "exact" })
      .eq("tenant_id", tenantId);

    if (error) throw new Error(error.message);

    const stats = {
      total: data?.length || 0,
      active: (data || []).filter((c: any) => c.status === 'active').length,
      expired: (data || []).filter((c: any) => c.status === 'expired').length,
      cancelled: (data || []).filter((c: any) => c.status === 'cancelled').length,
    };

    return stats;
  }
}