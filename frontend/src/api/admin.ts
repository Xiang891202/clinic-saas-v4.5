// frontend/src/api/admin.ts
import { apiFetch } from "./index";

// ========== 租户管理 ==========
export const adminTenantApi = {
  // 获取租户列表
  getList: (params?: { search?: string; status?: string; limit?: number; offset?: number }) => {
    const query = new URLSearchParams();
    if (params?.search) query.append("search", params.search);
    if (params?.status) query.append("status", params.status);
    if (params?.limit) query.append("limit", String(params.limit));
    if (params?.offset) query.append("offset", String(params.offset));
    return apiFetch(`/api/admin/tenants?${query.toString()}`);
  },

  // 获取单个租户
  getById: (id: string) => apiFetch(`/api/admin/tenants/${id}`),

  // 创建租户
  create: (data: any) => apiFetch("/api/admin/tenants", {
    method: "POST",
    body: JSON.stringify(data),
  }),

  // 更新租户
  update: (id: string, data: any) => apiFetch(`/api/admin/tenants/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  }),

  // 删除租户（停用）
  delete: (id: string) => apiFetch(`/api/admin/tenants/${id}`, {
    method: "DELETE",
  }),
};

// ========== 合约管理 ==========
export const adminContractApi = {
  // 获取合约列表
  getList: (params?: { search?: string; status?: string; tenant_id?: string; limit?: number; offset?: number }) => {
    const query = new URLSearchParams();
    if (params?.search) query.append("search", params.search);
    if (params?.status) query.append("status", params.status);
    if (params?.tenant_id) query.append("tenant_id", params.tenant_id);
    if (params?.limit) query.append("limit", String(params.limit));
    if (params?.offset) query.append("offset", String(params.offset));
    return apiFetch(`/api/admin/contracts?${query.toString()}`);
  },

  // 获取单个合约
  getById: (id: string) => apiFetch(`/api/admin/contracts/${id}`),

  // 创建合约
  create: (data: any) => apiFetch("/api/admin/contracts", {
    method: "POST",
    body: JSON.stringify(data),
  }),

  // 更新合约
  update: (id: string, data: any) => apiFetch(`/api/admin/contracts/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  }),

  // 删除合约
  delete: (id: string) => apiFetch(`/api/admin/contracts/${id}`, {
    method: "DELETE",
  }),

  // 获取租户合约统计
  getStats: (tenantId: string) => apiFetch(`/api/admin/contracts/stats/${tenantId}`),
};