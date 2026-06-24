<template>
  <div style="padding: 20px; font-family: Arial, sans-serif; max-width: 1200px; margin: 0 auto;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <h2>👥 病人列表</h2>
      <button @click="logout" style="padding: 8px 16px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">登出</button>
    </div>

    <div style="display: flex; gap: 12px; margin-bottom: 16px;">
      <input
        type="text"
        v-model="search"
        placeholder="搜尋姓名、電話、Email..."
        @keyup.enter="fetchPatients"
        style="flex: 1; padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px;"
      />
      <button @click="fetchPatients" style="padding: 8px 16px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer;">搜尋</button>
    </div>

    <div v-if="loading">載入中...</div>

    <div v-else-if="patients.length === 0" style="color: #666; text-align: center; padding: 40px 0;">
      尚無病人資料
    </div>

    <table v-else style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
      <thead style="background: #f5f5f5;">
        <tr>
          <th style="padding: 12px; text-align: left;">姓名</th>
          <th style="padding: 12px; text-align: left;">手機</th>
          <th style="padding: 12px; text-align: left;">Email</th>
          <th style="padding: 12px; text-align: left;">性別</th>
          <th style="padding: 12px; text-align: left;">預約次數</th>
          <th style="padding: 12px; text-align: left;">加入時間</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="p in patients" :key="p.id" style="border-bottom: 1px solid #eee;">
          <td style="padding: 12px; font-weight: bold;">{{ p.name || p.name_family + p.name_given || '未知' }}</td>
          <td style="padding: 12px;">{{ p.telecom_phone || '-' }}</td>
          <td style="padding: 12px;">{{ p.telecom_email || '-' }}</td>
          <td style="padding: 12px;">{{ p.gender === 'male' ? '男' : p.gender === 'female' ? '女' : '-' }}</td>
          <td style="padding: 12px; text-align: center;">
            <span style="background: #e3f2fd; padding: 2px 12px; border-radius: 12px;">{{ p.appointment_count || 0 }}</span>
          </td>
          <td style="padding: 12px; font-size: 13px; color: #666;">{{ formatDate(p.created_at) }}</td>
        </tr>
      </tbody>
    </table>

    <div style="margin-top: 16px; display: flex; justify-content: space-between; align-items: center;">
      <span style="color: #666; font-size: 14px;">共 {{ total }} 位病人</span>
      <div style="display: flex; gap: 8px;">
        <button @click="prevPage" :disabled="offset === 0" style="padding: 4px 12px; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; background: white;">上一頁</button>
        <button @click="nextPage" :disabled="offset + limit >= total" style="padding: 4px 12px; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; background: white;">下一頁</button>
      </div>
    </div>

    <div style="margin-top: 16px;">
      <router-link to="/clinic/dashboard" style="color: #2196F3;">← 回儀表板</router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";

const router = useRouter();
const loading = ref(false);
const patients = ref<any[]>([]);
const total = ref(0);
const limit = ref(20);
const offset = ref(0);
const search = ref("");

const logout = () => {
  localStorage.removeItem("clinic_token");
  localStorage.removeItem("clinic_tenant_id");
  router.push("/clinic/login");
};

const formatDate = (date: string) => {
  if (!date) return "-";
  const d = new Date(date);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
};

const fetchPatients = async () => {
  const tenantId = localStorage.getItem("clinic_tenant_id");
  if (!tenantId) return router.push("/clinic/login");

  loading.value = true;
  try {
    const params = new URLSearchParams({
      limit: String(limit.value),
      offset: String(offset.value),
    });
    if (search.value) params.append("search", search.value);

    const res = await fetch(`/api/clinic/patients?${params.toString()}`, {
      headers: { "x-tenant-id": tenantId },
    });
    const data = await res.json();
    if (res.ok) {
      patients.value = data.data || [];
      total.value = data.total || 0;
    }
  } catch (err) {
    console.error(err);
  } finally {
    loading.value = false;
  }
};

const prevPage = () => {
  if (offset.value > 0) {
    offset.value -= limit.value;
    fetchPatients();
  }
};

const nextPage = () => {
  if (offset.value + limit.value < total.value) {
    offset.value += limit.value;
    fetchPatients();
  }
};

onMounted(fetchPatients);
</script>