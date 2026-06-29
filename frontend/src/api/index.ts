// frontend/src/api/index.ts
export const apiFetch = (url: string, options: RequestInit & { skipTenant?: boolean } = {}) => {
  const { skipTenant, ...fetchOptions } = options;

  const urlObj = new URL(url, window.location.origin);

  // ✅ 讀取 Token（優先使用 clinic_token，其次 auth_token）
  const token = localStorage.getItem("clinic_token") || localStorage.getItem("auth_token");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(fetchOptions.headers as Record<string, string> || {}),
  };

  // ✅ 加入 Authorization header
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // ✅ 處理 tenant_id（若需要）
  if (!skipTenant) {
    const tenantId = localStorage.getItem("clinic_tenant_id") || localStorage.getItem("auth_tenant_id");
    if (tenantId) {
      urlObj.searchParams.set("tenant_id", tenantId);
      headers["x-tenant-id"] = tenantId;
    }
  }

  return fetch(urlObj.toString(), { ...fetchOptions, headers });
};