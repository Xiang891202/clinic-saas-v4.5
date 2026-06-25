// src/api/index.ts
export const apiFetch = (url: string, options: RequestInit & { skipTenant?: boolean } = {}) => {
  const { skipTenant, ...fetchOptions } = options;

  const urlObj = new URL(url, window.location.origin);

  if (!skipTenant) {
    const tenantId = localStorage.getItem("clinic_tenant_id") || localStorage.getItem("auth_tenant_id");
    if (tenantId) {
      urlObj.searchParams.set("tenant_id", tenantId);
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(fetchOptions.headers as Record<string, string> || {}),
  };

  if (!skipTenant) {
    const tenantId = localStorage.getItem("clinic_tenant_id") || localStorage.getItem("auth_tenant_id");
    if (tenantId) {
      headers["x-tenant-id"] = tenantId;
    }
  }

  return fetch(urlObj.toString(), { ...fetchOptions, headers });
};