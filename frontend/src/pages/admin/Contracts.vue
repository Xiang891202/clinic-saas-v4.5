<!-- frontend/src/pages/admin/Contracts.vue -->
<template>
  <div style="padding: 20px; font-family: Arial, sans-serif; max-width: 1200px; margin: 0 auto;">
    <!-- 标题栏 -->
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <div>
        <h2 style="margin: 0;">📄 合約管理</h2>
        <span style="color: #666; font-size: 14px;">共 {{ total }} 份合約</span>
      </div>
      <div style="display: flex; gap: 12px;">
        <button @click="openCreateModal" style="padding: 10px 20px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
          + 新增合約
        </button>
        <button @click="logout" style="padding: 10px 20px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">登出</button>
      </div>
    </div>

    <!-- 搜索和筛选 -->
    <div style="display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap;">
      <input
        type="text"
        v-model="search"
        placeholder="搜尋合約方案、診所名稱..."
        @keyup.enter="fetchContracts"
        style="flex: 1; min-width: 200px; padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px;"
      />
      <select v-model="statusFilter" @change="fetchContracts" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px;">
        <option value="">全部狀態</option>
        <option value="active">生效中</option>
        <option value="expired">已過期</option>
        <option value="cancelled">已取消</option>
        <option value="pending">待生效</option>
      </select>
      <button @click="fetchContracts" style="padding: 8px 16px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer;">搜尋</button>
    </div>

    <!-- 表格 -->
    <div v-if="loading" style="text-align: center; padding: 40px;">載入中...</div>

    <div v-else-if="contracts.length === 0" style="color: #666; text-align: center; padding: 40px 0;">
      尚無合約資料
    </div>

    <table v-else style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
      <thead style="background: #f5f5f5;">
        <tr>
          <th style="padding: 12px; text-align: left;">診所</th>
          <th style="padding: 12px; text-align: left;">方案</th>
          <th style="padding: 12px; text-align: left;">金額</th>
          <th style="padding: 12px; text-align: left;">開始日</th>
          <th style="padding: 12px; text-align: left;">到期日</th>
          <th style="padding: 12px; text-align: left;">狀態</th>
          <th style="padding: 12px; text-align: left;">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="c in contracts" :key="c.id" style="border-bottom: 1px solid #eee;">
          <td style="padding: 12px; font-weight: bold;">{{ c.tenants?.name || '未知診所' }}</td>
          <td style="padding: 12px;">{{ c.plan }}</td>
          <td style="padding: 12px;">${{ Number(c.amount).toLocaleString() }}</td>
          <td style="padding: 12px; font-size: 13px;">{{ formatDate(c.start_date) }}</td>
          <td style="padding: 12px; font-size: 13px;">
            {{ formatDate(c.end_date) }}
            <span v-if="isExpiringSoon(c.end_date)" style="margin-left: 6px; font-size: 11px; background: #ff9800; color: white; padding: 1px 8px; border-radius: 12px;">即將到期</span>
          </td>
          <td style="padding: 12px;">
            <span :style="getStatusStyle(c.status)">{{ getStatusLabel(c.status) }}</span>
          </td>
          <td style="padding: 12px;">
            <button @click="openEditModal(c)" style="margin-right: 8px; padding: 4px 12px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">編輯</button>
            <button @click="deleteContract(c.id)" style="padding: 4px 12px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">刪除</button>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- 分页 -->
    <div style="margin-top: 16px; display: flex; justify-content: space-between; align-items: center;">
      <span style="color: #666; font-size: 14px;">共 {{ total }} 份合約</span>
      <div style="display: flex; gap: 8px;">
        <button @click="prevPage" :disabled="offset === 0" style="padding: 4px 12px; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; background: white;">上一頁</button>
        <button @click="nextPage" :disabled="offset + limit >= total" style="padding: 4px 12px; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; background: white;">下一頁</button>
      </div>
    </div>

    <div style="margin-top: 16px;">
      <router-link to="/admin-home" style="color: #2196F3;">← 回儀表板</router-link>
    </div>

    <!-- ====== 新增/編輯 Modal ====== -->
    <div v-if="showModal" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000;">
      <div style="background: white; padding: 32px; border-radius: 12px; max-width: 500px; width: 90%; max-height: 90vh; overflow-y: auto;">
        <h3 style="margin-bottom: 16px;">{{ isEditing ? '編輯合約' : '新增合約' }}</h3>

        <div style="margin-bottom: 12px;">
          <label style="display: block; font-weight: bold; margin-bottom: 4px;">診所 *</label>
          <select v-model="form.tenant_id" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
            <option value="">選擇診所</option>
            <option v-for="t in tenantOptions" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
        </div>

        <div style="margin-bottom: 12px;">
          <label style="display: block; font-weight: bold; margin-bottom: 4px;">方案名稱 *</label>
          <input type="text" v-model="form.plan" placeholder="例如：標準方案" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" />
        </div>

        <div style="margin-bottom: 12px;">
          <label style="display: block; font-weight: bold; margin-bottom: 4px;">金額 *</label>
          <input type="number" v-model="form.amount" placeholder="例如：10000" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" />
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <label style="display: block; font-weight: bold; margin-bottom: 4px;">開始日期 *</label>
            <input type="date" v-model="form.start_date" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" />
          </div>
          <div>
            <label style="display: block; font-weight: bold; margin-bottom: 4px;">到期日期 *</label>
            <input type="date" v-model="form.end_date" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" />
          </div>
        </div>

        <div style="margin-bottom: 12px;">
          <label style="display: block; font-weight: bold; margin-bottom: 4px;">狀態</label>
          <select v-model="form.status" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
            <option value="active">生效中</option>
            <option value="pending">待生效</option>
            <option value="expired">已過期</option>
            <option value="cancelled">已取消</option>
          </select>
        </div>

        <div style="margin-bottom: 16px;">
          <label style="display: block; font-weight: bold; margin-bottom: 4px;">備註</label>
          <textarea v-model="form.notes" rows="2" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;"></textarea>
        </div>

        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <button @click="closeModal" style="padding: 8px 16px; background: #999; color: white; border: none; border-radius: 4px; cursor: pointer;">取消</button>
          <button @click="saveContract" :disabled="saving" style="padding: 8px 16px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer;">
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
import { adminContractApi, adminTenantApi } from "../../api/admin";

const router = useRouter();
const loading = ref(false);
const saving = ref(false);
const contracts = ref<any[]>([]);
const total = ref(0);
const limit = ref(20);
const offset = ref(0);
const search = ref("");
const statusFilter = ref("");
const tenantOptions = ref<any[]>([]);

const showModal = ref(false);
const isEditing = ref(false);
const editingId = ref("");

const defaultForm = {
  tenant_id: "",
  plan: "",
  amount: 0,
  start_date: "",
  end_date: "",
  status: "active",
  notes: "",
};
const form = ref({ ...defaultForm });

const getStatusLabel = (status: string) => {
  const map: any = { active: "生效中", expired: "已過期", cancelled: "已取消", pending: "待生效" };
  return map[status] || status;
};

const getStatusStyle = (status: string) => {
  const map: any = {
    active: { background: "#c8e6c9", padding: "4px 8px", borderRadius: "4px", color: "#2e7d32" },
    expired: { background: "#ffcdd2", padding: "4px 8px", borderRadius: "4px", color: "#c62828" },
    cancelled: { background: "#f5f5f5", padding: "4px 8px", borderRadius: "4px", color: "#999" },
    pending: { background: "#fff3e0", padding: "4px 8px", borderRadius: "4px", color: "#e65100" },
  };
  return map[status] || {};
};

const formatDate = (date: string) => {
  if (!date) return "-";
  const d = new Date(date);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
};

const isExpiringSoon = (endDate: string) => {
  const now = new Date();
  const end = new Date(endDate);
  const daysDiff = (end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return daysDiff >= 0 && daysDiff <= 30;
};

const fetchTenantOptions = async () => {
  try {
    const res = await adminTenantApi.getList({ limit: 1000 });
    const data = await res.json();
    if (res.ok) {
      tenantOptions.value = data.data?.data || [];
    }
  } catch (err) {
    console.error("加载诊所列表失败:", err);
  }
};

const fetchContracts = async () => {
  loading.value = true;
  try {
    const res = await adminContractApi.getList({
      search: search.value || undefined,
      status: statusFilter.value || undefined,
      limit: limit.value,
      offset: offset.value,
    });
    const data = await res.json();
    if (res.ok) {
      contracts.value = data.data?.data || [];
      total.value = data.data?.total || 0;
    }
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

const openEditModal = (contract: any) => {
  isEditing.value = true;
  editingId.value = contract.id;
  form.value = {
    tenant_id: contract.tenant_id,
    plan: contract.plan,
    amount: contract.amount,
    start_date: contract.start_date,
    end_date: contract.end_date,
    status: contract.status,
    notes: contract.notes || "",
  };
  showModal.value = true;
};

const closeModal = () => {
  showModal.value = false;
};

const saveContract = async () => {
  if (!form.value.tenant_id || !form.value.plan || !form.value.amount || !form.value.start_date || !form.value.end_date) {
    alert("請填寫完整資料");
    return;
  }

  saving.value = true;
  try {
    const res = isEditing.value
      ? await adminContractApi.update(editingId.value, form.value)
      : await adminContractApi.create(form.value);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "儲存失敗");
    showModal.value = false;
    await fetchContracts();
  } catch (err: any) {
    alert(err.message);
  } finally {
    saving.value = false;
  }
};

const deleteContract = async (id: string) => {
  if (!confirm("確定要刪除此合約嗎？")) return;
  try {
    const res = await adminContractApi.delete(id);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "操作失敗");
    alert(data.message || "合約已刪除");
    await fetchContracts();
  } catch (err: any) {
    alert(err.message);
  }
};

const prevPage = () => {
  if (offset.value > 0) {
    offset.value -= limit.value;
    fetchContracts();
  }
};

const nextPage = () => {
  if (offset.value + limit.value < total.value) {
    offset.value += limit.value;
    fetchContracts();
  }
};

const logout = () => {
  localStorage.removeItem("auth_token");
  localStorage.removeItem("auth_role");
  localStorage.removeItem("auth_tenant_id");
  localStorage.removeItem("auth_user_id");
  localStorage.removeItem("auth_user_name");
  localStorage.removeItem("clinic_token");
  localStorage.removeItem("clinic_tenant_id");
  router.push("/");
};

const handleVisibilityChange = () => {
  if (document.visibilityState === 'visible') {
    fetchContracts();
  }
};

onMounted(() => {
  Promise.all([fetchContracts(), fetchTenantOptions()]);
  document.addEventListener('visibilitychange', handleVisibilityChange);
});

onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange);
});
</script>