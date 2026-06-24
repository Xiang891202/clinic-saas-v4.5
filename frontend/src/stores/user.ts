import { defineStore } from "pinia";
import { ref, computed } from "vue";

export const useUserStore = defineStore("user", () => {
  const token = ref<string | null>(localStorage.getItem("patient_token"));
  const patientId = ref<string | null>(localStorage.getItem("patient_id"));
  const patientName = ref<string | null>(localStorage.getItem("patient_name"));

  const isLoggedIn = computed(() => !!token.value);

  function login(data: { token: string; patientId: string; name: string }) {
    token.value = data.token;
    patientId.value = data.patientId;
    patientName.value = data.name;
    localStorage.setItem("patient_token", data.token);
    localStorage.setItem("patient_id", data.patientId);
    localStorage.setItem("patient_name", data.name);
  }

  function logout() {
    token.value = null;
    patientId.value = null;
    patientName.value = null;
    localStorage.removeItem("patient_token");
    localStorage.removeItem("patient_id");
    localStorage.removeItem("patient_name");
  }

  return { token, patientId, patientName, isLoggedIn, login, logout };
});