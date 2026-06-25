<template>
  <div style="padding: 20px; font-family: Arial, sans-serif;">
    <h1>👨‍⚕️ 醫師儀表板</h1>
    <p>歡迎，{{ userName || '醫師' }}</p>

    <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-top: 20px;">
      <router-link to="/doctor/appointments" style="padding: 12px 24px; background: #2196F3; color: white; text-decoration: none; border-radius: 8px;">
        📋 我的預約
      </router-link>
      <button @click="handleLogout" style="padding: 12px 24px; background: #f44336; color: white; border: none; border-radius: 8px; cursor: pointer;">登出</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";

const router = useRouter();
const userName = ref("");

const checkAuth = () => {
  const name = localStorage.getItem("auth_user_name") || "醫師";
  userName.value = name;
};

const handleLogout = () => {
  localStorage.removeItem("auth_token");
  localStorage.removeItem("auth_role");
  localStorage.removeItem("auth_tenant_id");
  localStorage.removeItem("auth_user_id");
  localStorage.removeItem("auth_user_name");
  localStorage.removeItem("clinic_token");
  localStorage.removeItem("clinic_tenant_id");
  router.push("/");
};

onMounted(checkAuth);
</script>