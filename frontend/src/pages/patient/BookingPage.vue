<template>
  <div style="padding: 20px; font-family: Arial, sans-serif; max-width: 900px; margin: 0 auto;">
    <h2>📅 預約掛號</h2>
    <div style="margin-bottom: 16px;">
      <label style="font-weight: bold; margin-right: 8px;">日期：</label>
      <input type="date" v-model="date" @change="fetchSlots" :min="today" style="padding: 6px 12px; border-radius: 4px; border: 1px solid #ccc;" />
    </div>
    <div v-if="loading" style="color: #666;">⏳ 載入中...</div>
    <div v-if="error" style="color: red; background: #ffebee; padding: 12px; border-radius: 8px;">❌ {{ error }}</div>
    <div v-if="slots.length === 0 && !loading && !error" style="color: #666;">沒有可預約的時段</div>
    <div style="display: flex; flex-wrap: wrap; gap: 12px; margin-top: 12px;">
      <div v-for="slot in slots" :key="slot.id" style="border: 1px solid #ddd; border-radius: 8px; padding: 16px; width: 220px; background: #fafafa;">
        <div><strong>👨‍⚕️ {{ slot.doctor_name }}</strong></div>
        <div>📋 {{ slot.service_name }}</div>
        <div>⏰ {{ slot.start_time }} - {{ slot.end_time }}</div>
        <div style="font-size: 14px; color: #666;">可預約：{{ slot.max_capacity - slot.booked_count }} 人</div>
        <button @click="bookSlot(slot.id)" style="margin-top: 10px; padding: 8px 16px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
          📌 預約
        </button>
      </div>
    </div>
    <div v-if="bookingResult" style="margin-top: 16px; padding: 12px; background: #e8f5e9; border-radius: 8px; border-left: 4px solid #4CAF50;">
      ✅ 預約成功！預約編號：{{ bookingResult.id }}
    </div>
    <div style="margin-top: 20px;">
      <router-link to="/" style="color: #2196F3; text-decoration: none;">← 回首頁</router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";

// ✅ 直接從 localStorage 讀取
const patientId = localStorage.getItem("auth_user_id") || "";
const tenantId = localStorage.getItem("auth_tenant_id") || "550e8400-e29b-41d4-a716-446655440000";

// ✅ 計算今天的日期（格式：YYYY-MM-DD）
const today = computed(() => {
  const now = new Date();
  return now.toISOString().split('T')[0];
});

const date = ref(today.value);
const slots = ref<any[]>([]);
const loading = ref(false);
const error = ref("");
const bookingResult = ref<any>(null);

const fetchSlots = async () => {
  loading.value = true;
  error.value = "";
  try {
    const res = await fetch(`/api/booking/slots?date=${date.value}&patient_id=${patientId}`);
    if (!res.ok) throw new Error("查詢失敗");
    const data = await res.json();
    slots.value = data.data || [];
  } catch (err: any) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
};

const bookSlot = async (slotId: string) => {
  bookingResult.value = null;
  error.value = "";

  const selectedSlot = slots.value.find(s => s.id === slotId);
  if (!selectedSlot) {
    error.value = "找不到該時段，請重新整理";
    return;
  }

  // ✅ 檢查是否為過去的時間（今天且時間已過）
  const now = new Date();
  const slotDate = new Date(`${selectedSlot.slot_date}T${selectedSlot.start_time}`);
  if (slotDate < now) {
    error.value = "無法預約過去的時段，請選擇其他時間";
    return;
  }

  try {
    const res = await fetch("/api/booking/appointments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-tenant-id": tenantId,
      },
      body: JSON.stringify({
        slot_instance_id: slotId,
        patient_id: patientId,
        service_id: selectedSlot.service_id,
        doctor_id: selectedSlot.doctor_id,
        source: "web",
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "預約失敗");
    }
    bookingResult.value = await res.json();
    await fetchSlots();
  } catch (err: any) {
    error.value = err.message;
  }
};

onMounted(fetchSlots);
</script>