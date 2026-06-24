<template>
  <div style="padding: 20px; font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
    <h2>📋 我的預約</h2>
    <div v-if="loading" style="color: #666;">⏳ 載入中...</div>
    <div v-if="error" style="color: red; background: #ffebee; padding: 12px; border-radius: 8px;">❌ {{ error }}</div>
    <div v-if="appointments.length === 0 && !loading && !error" style="color: #666;">尚無預約紀錄</div>
    <div v-for="apt in appointments" :key="apt.id" style="border: 1px solid #ddd; border-radius: 8px; padding: 14px; margin-bottom: 10px; background: #fafafa;">
      <div><strong>👨‍⚕️ {{ apt.doctor_name || "醫師" }}</strong> — {{ apt.service_name || "服務" }}</div>
      <div>📌 狀態：{{ apt.status }}</div>
      <div>📅 {{ apt.slot_date }} ⏰ {{ apt.start_time }}</div>
    </div>
    <div style="margin-top: 20px;">
      <router-link to="/" style="color: #2196F3; text-decoration: none;">← 回首頁</router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";

const appointments = ref<any[]>([]);
const loading = ref(false);
const error = ref("");

onMounted(async () => {
  loading.value = true;
  try {
    // ✅ 直接從 localStorage 讀取 auth_user_id 和 auth_tenant_id
    const patientId = localStorage.getItem("auth_user_id");
    const tenantId = localStorage.getItem("auth_tenant_id");

    if (!patientId) {
      throw new Error("未登入或找不到病人 ID");
    }

    const res = await fetch(`/api/booking/appointments?patient_id=${patientId}`, {
      headers: { "x-tenant-id": tenantId || "" },
    });
    if (!res.ok) throw new Error("查詢失敗");
    const data = await res.json();
    appointments.value = data.data || [];
  } catch (err: any) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
});
</script>