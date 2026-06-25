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

      <!-- ✅ 修改/取消按鈕（30 分鐘鎖定） -->
      <div v-if="canModify(apt)" style="display: flex; gap: 8px; margin-top: 8px;">
        <button @click="cancelAppointment(apt.id)" style="padding: 4px 12px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;">取消</button>
        <router-link :to="`/booking/${apt.id}/edit`" style="padding: 4px 12px; background: #2196F3; color: white; border-radius: 4px; text-decoration: none; font-size: 13px;">修改</router-link>
      </div>
      <div v-else-if="apt.status === 'booked'" style="color: #999; font-size: 13px; margin-top: 4px;">
        ⏰ 30 分鐘內無法修改或取消，請聯繫診所
      </div>
    </div>
    <div style="margin-top: 20px;">
      <router-link to="/" style="color: #2196F3; text-decoration: none;">← 回首頁</router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { apiFetch } from "../../api/index";

const appointments = ref<any[]>([]);
const loading = ref(false);
const error = ref("");

const fetchAppointments = async () => {
  loading.value = true;
  error.value = "";
  try {
    const patientId = localStorage.getItem("auth_user_id");
    const tenantId = localStorage.getItem("auth_tenant_id") || "";

    if (!patientId) {
      throw new Error("未登入或找不到病人 ID");
    }

    const res = await apiFetch(`/api/booking/appointments?patient_id=${patientId}`);
    if (!res.ok) throw new Error("查詢失敗");
    const data = await res.json();
    
    appointments.value = (data.data || []).filter(
      (apt: any) => apt.status === "booked" || apt.status === "arrived"
    );
  } catch (err: any) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
};

const cancelAppointment = async (id: string) => {
  if (!confirm("確定要取消此預約嗎？")) return;
  
  try {
    const res = await apiFetch(`/api/booking/appointments/${id}`, {
      method: "DELETE",
    });
    
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "取消失敗");
    }
    
    alert("✅ 預約已取消");
    await fetchAppointments();
  } catch (err: any) {
    alert("❌ " + err.message);
  }
};

const canModify = (apt: any) => {
  if (apt.status !== "booked") return false;
  const now = new Date();
  const slotDateTime = new Date(`${apt.slot_date}T${apt.start_time}`);
  const minutesUntil = (slotDateTime.getTime() - now.getTime()) / (1000 * 60);
  return minutesUntil >= 30;
};

const handleVisibilityChange = () => {
  if (document.visibilityState === 'visible') {
    console.log('🔄 页面激活，重新加载我的预约');
    fetchAppointments();
  }
};

onMounted(() => {
  fetchAppointments();
  document.addEventListener('visibilitychange', handleVisibilityChange);
});

onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange);
});
</script>
