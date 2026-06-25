<template>
  <div style="padding: 20px; font-family: Arial, sans-serif; max-width: 1200px; margin: 0 auto;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <h2>📋 服務管理</h2>
      <button @click="logout" style="padding: 8px 16px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">登出</button>
    </div>

    <button @click="openCreateModal" style="margin-bottom: 16px; padding: 10px 20px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
      + 新增服務
    </button>

    <div v-if="loading">載入中...</div>

    <table v-else style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
      <thead style="background: #f5f5f5;">
        <tr>
          <th style="padding: 12px; text-align: left;">服務名稱</th>
          <th style="padding: 12px; text-align: left;">時間(分)</th>
          <th style="padding: 12px; text-align: left;">週期性</th>
          <th style="padding: 12px; text-align: left;">冷卻期(天)</th>
          <th style="padding: 12px; text-align: left;">訂金</th>
          <th style="padding: 12px; text-align: left;">狀態</th>
          <th style="padding: 12px; text-align: left;">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="svc in services" :key="svc.id" style="border-bottom: 1px solid #eee;">
          <td style="padding: 12px; font-weight: bold;">{{ svc.name }}</td>
          <td style="padding: 12px;">{{ svc.duration_minutes }}</td>
          <td style="padding: 12px;">
            <span v-if="svc.is_recurring">✅ {{ svc.recurrence_interval_days }}天</span>
            <span v-else style="color: #999;">❌ 無</span>
          </td>
          <td style="padding: 12px;">{{ svc.strict_cooldown_days || 0 }}</td>
          <td style="padding: 12px;">
            <span v-if="svc.requires_deposit">${{ svc.deposit_amount }}</span>
            <span v-else style="color: #999;">無</span>
          </td>
          <td style="padding: 12px;">
            <span :style="svc.is_active ? { color: '#4CAF50' } : { color: '#999' }">
              {{ svc.is_active ? '啟用' : '停用' }}
            </span>
          </td>
          <td style="padding: 12px;">
            <button @click="openEditModal(svc)" style="margin-right: 8px; padding: 4px 12px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer;">編輯</button>
            <button @click="deleteService(svc.id)" style="padding: 4px 12px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">刪除</button>
          </td>
        </tr>
      </tbody>
    </table>

    <div style="margin-top: 16px;">
      <router-link to="/clinic/dashboard" style="color: #2196F3;">← 回儀表板</router-link>
    </div>

    <!-- ========== 新增/編輯 Modal ========== -->
    <div v-if="showModal" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000;">
      <div style="background: white; padding: 32px; border-radius: 12px; max-width: 500px; width: 90%; max-height: 90vh; overflow-y: auto;">
        <h3 style="margin-bottom: 16px;">{{ isEditing ? '編輯服務' : '新增服務' }}</h3>

        <div style="margin-bottom: 12px;">
          <label style="display: block; font-weight: bold; margin-bottom: 4px;">服務名稱 *</label>
          <input type="text" v-model="form.name" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" />
        </div>

        <div style="margin-bottom: 12px;">
          <label style="display: block; font-weight: bold; margin-bottom: 4px;">時間長度 (分鐘) *</label>
          <input type="number" v-model="form.duration_minutes" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" />
        </div>

        <div style="margin-bottom: 12px;">
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
            <input type="checkbox" v-model="form.is_recurring" />
            <span style="font-weight: bold;">啟用週期性回診</span>
          </label>
        </div>

        <div v-if="form.is_recurring" style="margin-bottom: 12px; padding-left: 20px; border-left: 3px solid #2196F3;">
          <div style="margin-bottom: 8px;">
            <label style="display: block; font-weight: bold; margin-bottom: 4px;">間隔天數</label>
            <input type="number" v-model="form.recurrence_interval_days" placeholder="例如 30" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" />
          </div>
          <div>
            <label style="display: block; font-weight: bold; margin-bottom: 4px;">冷卻期 (天)</label>
            <input type="number" v-model="form.strict_cooldown_days" placeholder="例如 7" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" />
          </div>
        </div>

        <div style="margin-bottom: 12px;">
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
            <input type="checkbox" v-model="form.requires_deposit" />
            <span style="font-weight: bold;">需要訂金</span>
          </label>
        </div>

        <div v-if="form.requires_deposit" style="margin-bottom: 12px; padding-left: 20px; border-left: 3px solid #FF9800;">
          <label style="display: block; font-weight: bold; margin-bottom: 4px;">訂金金額</label>
          <input type="number" v-model="form.deposit_amount" placeholder="例如 500" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" />
        </div>

        <div style="margin-bottom: 16px;">
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
            <input type="checkbox" v-model="form.is_active" />
            <span style="font-weight: bold;">啟用此服務</span>
          </label>
        </div>

        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <button @click="closeModal" style="padding: 8px 16px; background: #999; color: white; border: none; border-radius: 4px; cursor: pointer;">取消</button>
          <button @click="saveService" :disabled="saving" style="padding: 8px 16px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer;">
            {{ saving ? '儲存中...' : '儲存' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { apiFetch } from "../../api/index";

const router = useRouter();
const loading = ref(false);
const saving = ref(false);
const services = ref<any[]>([]);
const showModal = ref(false);
const isEditing = ref(false);
const editingId = ref("");

const defaultForm = {
  name: "",
  duration_minutes: 30,
  is_active: true,
  is_recurring: false,
  recurrence_interval_days: null as number | null,
  strict_cooldown_days: 0,
  reminder_lead_days: 1,
  requires_deposit: false,
  deposit_amount: null as number | null,
};

const form = ref({ ...defaultForm });

const logout = () => {
  localStorage.removeItem("clinic_token");
  localStorage.removeItem("clinic_tenant_id");
  router.push("/clinic/login");
};

const fetchServices = async () => {
  const tenantId = localStorage.getItem("clinic_tenant_id");
  if (!tenantId) return router.push("/clinic/login");

  loading.value = true;
  try {
    const res = await apiFetch("/api/clinic/services");
    const data = await res.json();
    if (res.ok) services.value = data.data || [];
    else throw new Error(data.error);
  } catch (err) {
    console.error(err);
  } finally {
    loading.value = false;
  }
};

const openCreateModal = () => {
  isEditing.value = false;
  editingId.value = "";
  form.value = { ...defaultForm };
  showModal.value = true;
};

const openEditModal = (svc: any) => {
  isEditing.value = true;
  editingId.value = svc.id;
  form.value = {
    name: svc.name,
    duration_minutes: svc.duration_minutes,
    is_active: svc.is_active,
    is_recurring: svc.is_recurring || false,
    recurrence_interval_days: svc.recurrence_interval_days || null,
    strict_cooldown_days: svc.strict_cooldown_days || 0,
    reminder_lead_days: svc.reminder_lead_days || 1,
    requires_deposit: svc.requires_deposit || false,
    deposit_amount: svc.deposit_amount || null,
  };
  showModal.value = true;
};

const closeModal = () => {
  showModal.value = false;
};

const saveService = async () => {
  if (!form.value.name) {
    alert("請輸入服務名稱");
    return;
  }

  saving.value = true;
  try {
    const url = isEditing.value ? `/api/clinic/services/${editingId.value}` : "/api/clinic/services";
    const method = isEditing.value ? "PUT" : "POST";
    const res = await apiFetch(url, {
      method,
      body: JSON.stringify(form.value),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "儲存失敗");

    showModal.value = false;
    await fetchServices();
  } catch (err: any) {
    alert(err.message);
  } finally {
    saving.value = false;
  }
};

const deleteService = async (id: string) => {
  if (!confirm("確定要刪除此服務嗎？若有預約記錄將改為停用")) return;
  try {
    const res = await apiFetch(`/api/clinic/services/${id}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (res.ok) {
      alert(data.message || "操作成功");
      await fetchServices();
    } else {
      alert(data.error || "操作失敗");
    }
  } catch (err) {
    console.error(err);
  }
};

const handleVisibilityChange = () => {
  if (document.visibilityState === 'visible') {
    console.log('🔄 页面激活，重新加载服务列表');
    fetchServices();
  }
};

onMounted(() => {
  fetchServices();
  document.addEventListener('visibilitychange', handleVisibilityChange);
});

onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange);
});
</script>