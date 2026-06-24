import { defineStore } from "pinia";
import { ref } from "vue";

export const useAuthStore = defineStore("auth", () => {
  // ✅ 改為讀取新的 key
  const patientId = ref<string>(localStorage.getItem("auth_user_id") || "");
  const tenantId = ref<string>(localStorage.getItem("auth_tenant_id") || "550e8400-e29b-41d4-a716-446655440000");
  const role = ref<string>(localStorage.getItem("auth_role") || "patient");

  function setPatientId(id: string) {
    patientId.value = id;
    localStorage.setItem("auth_user_id", id);
  }

  function setTenantId(id: string) {
    tenantId.value = id;
    localStorage.setItem("auth_tenant_id", id);
  }

  function setRole(r: string) {
    role.value = r;
    localStorage.setItem("auth_role", r);
  }

  return {
    patientId,
    tenantId,
    role,
    setPatientId,
    setTenantId,
    setRole,
  };
});