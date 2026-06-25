<template>
  <div style="padding: 20px; font-family: Arial, sans-serif; max-width: 1200px; margin: 0 auto;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <h2>📋 預約管理</h2>
      <button @click="logout" style="padding: 8px 16px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">登出</button>
    </div>

    <!-- 篩選列 -->
    <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px;">
      <input type="date" v-model="filters.date_from" @change="fetchAppointments" style="padding: 6px 12px; border: 1px solid #ccc; border-radius: 4px;" />
      <span style="align-self: center;">~</span>
      <input type="date" v-model="filters.date_to" @change="fetchAppointments" style="padding: 6px 12px; border: 1px solid #ccc; border-radius: 4px;" />
      <select v-model="filters.status" @change="fetchAppointments" style="padding: 6px 12px; border: 1px solid #ccc; border-radius: 4px;">
        <option value="">全部狀態</option>
        <option value="booked">已預約</option>
        <option value="arrived">已報到</option>
        <option value="completed">已完成</option>
        <option value="noshow">未到</option>
        <option value="cancelled">已取消</option>
      </select>
    </div>

    <!-- 表格 -->
    <div v-if="loading">載入中...</div>
    <div v-if="appointments.length === 0 && !loading" style="color: #666; text-align: center; padding: 40px 0;">暫無預約</div>

    <table v-else style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
      <thead style="background: #f5f5f5;">
        <tr>
          <th style="padding: 12px; text-align: left;">日期</th>
          <th style="padding: 12px; text-align: left;">時間</th>
          <th style="padding: 12px; text-align: left;">病人</th>
          <th style="padding: 12px; text-align: left;">醫師</th>
          <th style="padding: 12px; text-align: left;">服務</th>
          <th style="padding: 12px; text-align: left;">狀態</th>
          <th style="padding: 12px; text-align: left;">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="apt in appointments" :key="apt.id" style="border-bottom: 1px solid #eee;">
          <td style="padding: 12px;">{{ apt.slot_date }}</td>
          <td style="padding: 12px;">{{ apt.start_time }} - {{ apt.end_time }}</td>
          <td style="padding: 12px;">{{ apt.patient_name }}</td>
          <td style="padding: 12px;">{{ apt.doctor_name }}</td>
          <td style="padding: 12px;">{{ apt.service_name }}</td>
          <td style="padding: 12px;">
            <span :style="getStatusStyle(apt.status)">{{ getStatusLabel(apt.status) }}</span>
          </td>
          <td style="padding: 12px;">
            <router-link
              :to="`/booking/${apt.id}/edit`"
              style="padding: 4px 12px; background: #2196F3; color: white; border-radius: 4px; text-decoration: none; font-size: 12px; display: inline-block; margin-right: 6px;">
              編輯
            </router-link>
            <select @change="updateStatus(apt.id, ($event.target as HTMLSelectElement).value)" style="padding: 4px 8px; border: 1px solid #ccc; border-radius: 4px;">
              <option value="">變更狀態</option>
              <option value="arrived">報到</option>
              <option value="completed">完成</option>
              <option value="noshow">未到</option>
              <option value="cancelled">取消</option>
            </select>
          </td>
        </tr>
      </tbody>
    </table>

    <div style="margin-top: 16px;">
      <router-link to="/clinic/dashboard" style="color: #2196F3;">← 回儀表板</router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { apiFetch } from "../../api/index";

const router = useRouter();
const loading = ref(false);
const appointments = ref<any[]>([]);
const filters = ref({ date_from: "", date_to: "", status: "" });

const logout = () => {
  localStorage.removeItem("clinic_token");
  localStorage.removeItem("clinic_tenant_id");
  router.push("/clinic/login");
};

const getStatusLabel = (status: string) => {
  const map: any = { booked: "已預約", arrived: "已報到", completed: "已完成", noshow: "未到", cancelled: "已取消" };
  return map[status] || status;
};

const getStatusStyle = (status: string) => {
  const map: any = {
    booked: { background: "#e3f2fd", padding: "4px 8px", borderRadius: "4px" },
    arrived: { background: "#fff3e0", padding: "4px 8px", borderRadius: "4px" },
    completed: { background: "#c8e6c9", padding: "4px 8px", borderRadius: "4px" },
    noshow: { background: "#ffcdd2", padding: "4px 8px", borderRadius: "4px" },
    cancelled: { background: "#f5f5f5", padding: "4px 8px", borderRadius: "4px", color: "#999" },
  };
  return map[status] || {};
};

const fetchAppointments = async () => {
  const tenantId = localStorage.getItem("clinic_tenant_id");
  if (!tenantId) return router.push("/clinic/login");

  loading.value = true;
  try {
    const params = new URLSearchParams();
    if (filters.value.date_from) params.append("date_from", filters.value.date_from);
    if (filters.value.date_to) params.append("date_to", filters.value.date_to);
    if (filters.value.status) params.append("status", filters.value.status);

    const res = await apiFetch(`/api/clinic/appointments?${params.toString()}`);
    const data = await res.json();
    if (res.ok) appointments.value = data.data || [];
    else throw new Error(data.error);
  } catch (err) {
    console.error(err);
  } finally {
    loading.value = false;
  }
};

const updateStatus = async (id: string, status: string) => {
  if (!status) return;
  try {
    const res = await apiFetch(`/api/clinic/appointments/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      await fetchAppointments();
    }
  } catch (err) {
    console.error(err);
  }
};

// 页面激活时刷新
const handleVisibilityChange = () => {
  if (document.visibilityState === 'visible') {
    console.log('🔄 页面激活，重新加载预约数据');
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