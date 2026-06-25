// backend/src/services/adminTenantService.ts
import { SupabaseClient } from "@supabase/supabase-js";

export interface Tenant {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  status: 'active' | 'inactive' | 'suspended';
  created_at: string;
  updated_at: string;
}

export class AdminTenantService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * 获取所有租户列表（支持分页和搜索）
   */
  async getTenants(params: {
    search?: string;
    limit?: number;
    offset?: number;
    status?: string;
  }) {
    const { search, limit = 50, offset = 0, status } = params;

    let query = this.supabase
      .from("tenants")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq("status", status);
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    // 获取每个租户的合约数量
    const tenantIds = (data || []).map((t: any) => t.id);
    let contractCounts: Record<string, number> = {};
    if (tenantIds.length > 0) {
      const { data: counts } = await this.supabase
        .from("contracts")
        .select("tenant_id", { count: "exact" })
        .in("tenant_id", tenantIds)
        .eq("status", "active");
      if (counts) {
        const map = new Map<string, number>();
        counts.forEach((c: any) => {
          map.set(c.tenant_id, (map.get(c.tenant_id) || 0) + 1);
        });
        contractCounts = Object.fromEntries(map);
      }
    }

    return {
      data: (data || []).map((t: any) => ({
        ...t,
        contract_count: contractCounts[t.id] || 0,
      })),
      total: count || 0,
      limit,
      offset,
    };
  }

  /**
   * 获取单个租户详情
   */
  async getTenantById(id: string) {
    const { data, error } = await this.supabase
      .from("tenants")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * 创建租户
   */
  async createTenant(payload: Omit<Tenant, 'id' | 'created_at' | 'updated_at'>) {
    const { data, error } = await this.supabase
      .from("tenants")
      .insert({
        name: payload.name,
        email: payload.email,
        phone: payload.phone || null,
        address: payload.address || null,
        status: payload.status || 'active',
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * 更新租户
   */
  async updateTenant(id: string, payload: Partial<Omit<Tenant, 'id' | 'created_at' | 'updated_at'>>) {
    const { data, error } = await this.supabase
      .from("tenants")
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
   * 删除租户（软删除 - 停用）
   */
  async deleteTenant(id: string) {
    // 检查是否有活跃合约
    const { count, error: countErr } = await this.supabase
      .from("contracts")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", id)
      .eq("status", "active");

    if (countErr) throw new Error(countErr.message);

    if (count && count > 0) {
      throw new Error(`该诊所有 ${count} 个活跃合约，无法删除`);
    }

    const { error } = await this.supabase
      .from("tenants")
      .update({ status: 'inactive', updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) throw new Error(error.message);
    return { success: true, message: "诊所已停用" };
  }
}