<template>
  <div style="padding: 20px; font-family: Arial, sans-serif;">
    <h1>🏥 診所預約系統</h1>
    <p>歡迎使用 v4.6 Phase 1 MVP</p>

    <div style="background: #e8f5e9; padding: 12px; border-radius: 8px; margin-bottom: 16px;">
      <span>👋 您好，{{ userName || '使用者' }}</span>
      <button @click="handleLogout" style="margin-left: 12px; padding: 4px 12px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">登出</button>
    </div>

    <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-top: 20px;">
      <router-link to="/booking" style="padding: 12px 24px; background: #4CAF50; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
        📅 預約掛號
      </router-link>
      <router-link to="/my-appointments" style="padding: 12px 24px; background: #2196F3; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
        📋 我的預約
      </router-link>
    </div>
    <div style="margin-top: 40px; padding: 16px; background: #f5f5f5; border-radius: 8px; font-size: 14px; color: #666;">
      ⚡ Phase 1 MVP — 支援 LINE / Web 預約、行事曆同步、冷卻期過濾
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { getAuthStorage, logout } from "@clinic/engine-auth";

const router = useRouter();
const userName = ref("");
const userRole = ref("");

const checkAuth = () => {
  const auth = getAuthStorage();
  if (!auth.token) {
    router.replace("/");
    return;
  }
  userName.value = auth.name || "使用者";
  userRole.value = auth.role || "";
};

const handleLogout = () => {
  logout();
  router.push("/");
};

onMounted(() => {
  checkAuth();
});
</script>