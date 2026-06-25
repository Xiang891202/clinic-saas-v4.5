<template>
  <div style="text-align: center; padding: 60px 0;">
    <div>⏳ 載入中...</div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";
// import { getAuthStorage } from "@clinic/engine-auth";

const router = useRouter();

onMounted(() => {
  // ✅ 同時檢查兩種 token
  const token = localStorage.getItem("auth_token") || localStorage.getItem("clinic_token");
  const role = localStorage.getItem("auth_role") || "patient";

  if (token) {
    const roleMap: Record<string, string> = {
      patient: "/patient-home",
      doctor: "/doctor-home",
      clinic_admin: "/clinic/dashboard",   // ✅ 修正為正確路徑
      admin: "/admin-home",
    };
    router.replace(roleMap[role] || "/patient-home");
    return;
  }

  // 無 Token → 一律導向 Email 登入
  router.replace("/email-login");
});
</script>