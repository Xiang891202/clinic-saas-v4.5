<template>
  <div style="max-width: 800px; margin: 40px auto; padding: 24px; font-family: Arial, sans-serif; background: #f9f9f9; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.1);">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <h2 style="margin: 0;">✏️ 修改預約</h2>
      <button @click="goBack" style="padding: 6px 16px; background: #999; color: white; border: none; border-radius: 4px; cursor: pointer;">取消</button>
    </div>

    <div v-if="loading" style="text-align: center; padding: 40px;">⏳ 載入中...</div>
    <div v-if="error" style="color: red; text-align: center;">❌ {{ error }}</div>

    <div v-if="!loading && !error && booking">
      <!-- 目前預約資訊 -->
      <div style="background: white; padding: 16px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #eee;">
        <div><strong>預約編號：</strong>{{ booking.id }}</div>
        <div><strong>病人：</strong>{{ booking.patients?.name_family }}{{ booking.patients?.name_given }}</div>
        <div><strong>目前時段：</strong>{{ booking.slot_instances?.slot_date }} {{ booking.slot_instances?.start_time }} - {{ booking.slot_instances?.end_time }}</div>
        <div><strong>目前服務：</strong>{{ booking.slot_instances?.services?.name }}</div>
        <div><strong>目前醫師：</strong>{{ booking.slot_instances?.doctors?.name }}</div>
        <div><strong>狀態：</strong>{{ getStatusLabel(booking.status) }}</div>
      </div>

      <!-- ✅ 選擇新日期 -->
      <div style="margin-bottom: 16px;">
        <label style="display: block; font-weight: bold; margin-bottom: 4px;">選擇新日期</label>
        <input type="date" v-model="selectedDate" @change="fetchAvailableSlots" :min="today" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" />
      </div>

      <!-- ✅ 選擇新時段（只能選開放的） -->
      <div v-if="availableSlots.length > 0" style="margin-bottom: 16px;">
        <label style="display: block; font-weight: bold; margin-bottom: 4px;">選擇新時段</label>
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
          <div
            v-for="slot in availableSlots"
            :key="slot.id"
            @click="selectedSlotId = slot.id"
            style="padding: 8px 14px; border: 2px solid #ddd; border-radius: 6px; cursor: pointer; background: white;"
            :style="selectedSlotId === slot.id ? { borderColor: '#2196F3', background: '#e3f2fd' } : {}"
          >
            {{ slot.start_time }} - {{ slot.end_time }}
            <span style="font-size: 12px; color: #666;">({{ slot.max_capacity - slot.booked_count }}人)</span>
          </div>
        </div>
      </div>
      <div v-else-if="selectedDate && !loadingSlots" style="color: #999; text-align: center; padding: 12px 0;">
        該日無可用時段，請選擇其他日期
      </div>

      <!-- 診所管理員專屬：狀態變更 -->
      <div v-if="isClinicAdmin" style="margin-top: 16px;">
        <label style="display: block; font-weight: bold; margin-bottom: 4px;">變更狀態</label>
        <select v-model="editForm.status" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
          <option value="booked">已預約</option>
          <option value="arrived">已報到</option>
          <option value="completed">已完成</option>
          <option value="noshow">未到</option>
          <option value="cancelled">取消</option>
        </select>
      </div>

      <div v-if="saveError" style="color: red; margin-top: 12px;">❌ {{ saveError }}</div>
      <div v-if="saveSuccess" style="color: green; margin-top: 12px;">✅ 預約已更新！</div>

      <button @click="saveChanges" :disabled="saving || !selectedSlotId" style="margin-top: 20px; width: 100%; padding: 14px; background: #2196F3; color: white; border: none; border-radius: 4px; font-size: 16px; cursor: pointer;">
        {{ saving ? '儲存中...' : '儲存修改' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, onUnmounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { apiFetch } from "../../api/index";

const router = useRouter();
const route = useRoute();
const bookingId = route.params.id as string;

const loading = ref(true);
const loadingSlots = ref(false);
const error = ref("");
const saveError = ref("");
const saveSuccess = ref(false);
const saving = ref(false);

const booking = ref<any>(null);
const availableSlots = ref<any[]>([]);
const selectedDate = ref("");
const selectedSlotId = ref("");

const services = ref<any[]>([]);
const doctors = ref<any[]>([]);

const role = localStorage.getItem("auth_role") || "patient";
const isClinicAdmin = computed(() => role === "clinic_admin");
const today = new Date().toISOString().split("T")[0];

const editForm = ref({
  status: "",
});

const getStatusLabel = (status: string) => {
  const map: any = { booked: "已預約", arrived: "已報到", completed: "已完成", noshow: "未到", cancelled: "已取消" };
  return map[status] || status;
};

const goBack = () => {
  router.push(role === "clinic_admin" ? "/clinic/appointments" : "/my-appointments");
};

const fetchBooking = async () => {
  loading.value = true;
  error.value = "";
  try {
    const token = localStorage.getItem("auth_token");
    const res = await apiFetch(`/api/booking/appointments/${bookingId}`, {
      headers: { Authorization: `Bearer ${token}` }, // 保留 Authorization
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "載入失敗");
    booking.value = data.data;
    editForm.value.status = data.data.status || "";
    selectedDate.value = data.data.slot_instances?.slot_date || "";
  } catch (err: any) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
};

const fetchAvailableSlots = async () => {
  if (!selectedDate.value) return;
  loadingSlots.value = true;
  selectedSlotId.value = "";
  try {
    const patientId = localStorage.getItem("auth_user_id");
    const res = await apiFetch(`/api/booking/slots?date=${selectedDate.value}&patient_id=${patientId}`);
    const data = await res.json();
    if (res.ok) {
      availableSlots.value = data.data || [];
      const originalSlot = availableSlots.value.find(s => s.id === booking.value.slot_instances?.id);
      if (originalSlot) {
        selectedSlotId.value = originalSlot.id;
      }
    }
  } catch (err) {
    console.error("查詢時段失敗:", err);
  } finally {
    loadingSlots.value = false;
  }
};

const saveChanges = async () => {
  if (!selectedSlotId.value) {
    saveError.value = "請選擇一個時段";
    return;
  }

  saveError.value = "";
  saveSuccess.value = false;
  saving.value = true;

  try {
    const token = localStorage.getItem("auth_token");
    const body: any = {
      slot_instance_id: selectedSlotId.value,
    };

    if (isClinicAdmin.value && editForm.value.status) {
      body.status = editForm.value.status;
    }

    const res = await apiFetch(`/api/booking/appointments/${bookingId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`, // 保留 Authorization
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "儲存失敗");

    saveSuccess.value = true;
    setTimeout(() => {
      goBack();
    }, 1500);
  } catch (err: any) {
    saveError.value = err.message;
  } finally {
    saving.value = false;
  }
};

const fetchOptions = async () => {
  const tenantId = localStorage.getItem("auth_tenant_id");
  if (!tenantId) return;

  try {
    const [svcRes, docRes] = await Promise.all([
      apiFetch("/api/clinic/services"),
      apiFetch("/api/clinic/doctors"),
    ]);
    const svcData = await svcRes.json();
    const docData = await docRes.json();
    if (svcRes.ok) services.value = svcData.data || [];
    if (docRes.ok) doctors.value = docData.data || [];
  } catch (err) {
    console.error("載入選項失敗:", err);
  }
};

const handleVisibilityChange = () => {
  if (document.visibilityState === 'visible') {
    console.log('🔄 页面激活，重新加载预约详情');
    fetchBooking();
    fetchOptions();
    if (selectedDate.value) fetchAvailableSlots();
  }
};

onMounted(() => {
  fetchBooking();
  fetchOptions();
  document.addEventListener('visibilitychange', handleVisibilityChange);
});

onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange);
});
</script>
