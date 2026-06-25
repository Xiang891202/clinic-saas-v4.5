<!-- frontend/src/pages/admin/Tenants.vue -->
<template>
  <div style="padding: 20px; font-family: Arial, sans-serif; max-width: 1200px; margin: 0 auto;">
    <!-- 标题栏 -->
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <div>
        <h2 style="margin: 0;">🏢 診所管理</h2>
        <span style="color: #666; font-size: 14px;">共 {{ total }} 間診所</span>
      </div>
      <div style="display: flex; gap: 12px;">
        <button @click="openCreateModal" style="padding: 10px 20px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
          + 新增診所
        </button>
        <button @click="logout" style="padding: 10px 20px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">登出</button>
      </div>
    </div>

    <!-- 搜索和筛选 -->
    <div style="display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap;">
      <input
        type="text"
        v-model="search"
        placeholder="搜尋診所名稱、Email..."
        @keyup.enter="fetchTenants"
        style="flex: 1; min-width: 200px; padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px;"
      />
      <select v-model="statusFilter" @change="fetchTenants" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px;">
        <option value="">全部狀態</option>
        <option value="active">啟用中</option>
        <option value="inactive">已停用</option>
        <option value="suspended">已暫停</option>
      </select>
      <button @click="fetchTenants" style="padding: 8px 16px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer;">搜尋</button>
    </div>

    <!-- 表格 -->
    <div v-if="loading" style="text-align: center; padding: 40px;">載入中...</div>

    <div v-else-if="tenants.length === 0" style="color: #666; text-align: center; padding: 40px 0;">
      尚無診所資料
    </div>

    <table v-else style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
      <!-- ✅ 正确的 thead -->
      <thead style="background: #f5f5f5;">
        <tr>
          <th style="padding: 12px; text-align: left;">診所名稱</th>
          <th style="padding: 12px; text-align: left;">Email</th>
          <th style="padding: 12px; text-align: left;">電話</th>
          <th style="padding: 12px; text-align: left;">狀態</th>
          <th style="padding: 12px; text-align: left;">合約數</th>
          <th style="padding: 12px; text-align: left;">建立時間</th>
          <th style="padding: 12px; text-align: left;">Email 用量</th>
          <th style="padding: 12px; text-align: left;">操作</th>
        </tr>
      </thead>
      <!-- ✅ 正确的 tbody -->
      <tbody>
        <tr v-for="t in tenants" :key="t.id" style="border-bottom: 1px solid #eee;">
          <td style="padding: 12px; font-weight: bold;">{{ t.name }}</td>
          <td style="padding: 12px;">{{ t.email }}</td>
          <td style="padding: 12px;">{{ t.phone || '-' }}</td>
          <td style="padding: 12px;">
            <span :style="getStatusStyle(t.status)">{{ getStatusLabel(t.status) }}</span>
          </td>
          <td style="padding: 12px; text-align: center;">
            <span style="background: #e3f2fd; padding: 2px 12px; border-radius: 12px;">{{ t.contract_count || 0 }}</span>
          </td>
          <td style="padding: 12px; font-size: 13px; color: #666;">{{ formatDate(t.created_at) }}</td>
          <!-- ✅ Email 用量列 -->
          <td style="padding: 12px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 13px;">{{ t.usage?.sent || 0 }} / {{ t.email_limit || 0 }}</span>
              <div style="flex: 1; height: 6px; background: #eee; border-radius: 3px; min-width: 60px;">
                <div :style="{
                  width: `${Math.min(100, ((t.usage?.sent || 0) / (t.email_limit || 1)) * 100)}%`,
                  height: '100%',
                  background: (t.usage?.sent || 0) > (t.email_limit || 1) ? '#f44336' : '#4CAF50',
                  borderRadius: '3px',
                }"></div>
              </div>
              <span style="font-size: 12px; color: #999;">
                {{ Math.min(100, Math.round(((t.usage?.sent || 0) / (t.email_limit || 1)) * 100)) }}%
              </span>
            </div>
          </td>
          <td style="padding: 12px;">
            <button @click="openEditModal(t)" style="margin-right: 8px; padding: 4px 12px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">編輯</button>
            <button @click="deleteTenant(t.id)" style="padding: 4px 12px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">停用</button>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- 分页 -->
    <div style="margin-top: 16px; display: flex; justify-content: space-between; align-items: center;">
      <span style="color: #666; font-size: 14px;">共 {{ total }} 間診所</span>
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
        <h3 style="margin-bottom: 16px;">{{ isEditing ? '編輯診所' : '新增診所' }}</h3>

        <div style="margin-bottom: 12px;">
          <label style="display: block; font-weight: bold; margin-bottom: 4px;">診所名稱 *</label>
          <input type="text" v-model="form.name" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" />
        </div>

        <div style="margin-bottom: 12px;">
          <label style="display: block; font-weight: bold; margin-bottom: 4px;">Email *</label>
          <input type="email" v-model="form.email" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" />
        </div>

        <div style="margin-bottom: 12px;">
          <label style="display: block; font-weight: bold; margin-bottom: 4px;">電話</label>
          <input type="text" v-model="form.phone" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" />
        </div>

        <div style="margin-bottom: 12px;">
          <label style="display: block; font-weight: bold; margin-bottom: 4px;">地址</label>
          <input type="text" v-model="form.address" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" />
        </div>

        <div style="margin-bottom: 16px;">
          <label style="display: block; font-weight: bold; margin-bottom: 4px;">狀態</label>
          <select v-model="form.status" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
            <option value="active">啟用中</option>
            <option value="inactive">已停用</option>
            <option value="suspended">已暫停</option>
          </select>
        </div>

        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <button @click="closeModal" style="padding: 8px 16px; background: #999; color: white; border: none; border-radius: 4px; cursor: pointer;">取消</button>
          <button @click="saveTenant" :disabled="saving" style="padding: 8px 16px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer;">
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
import { adminTenantApi } from "../../api/admin";
import { apiFetch } from "../../api/index";  // ✅ 确保导入

const router = useRouter();
const loading = ref(false);
const saving = ref(false);
const tenants = ref<any[]>([]);
const total = ref(0);
const limit = ref(20);
const offset = ref(0);
const search = ref("");
const statusFilter = ref("");

const showModal = ref(false);
const isEditing = ref(false);
const editingId = ref("");

const defaultForm = {
  name: "",
  email: "",
  phone: "",
  address: "",
  status: "active",
};
const form = ref({ ...defaultForm });

const getStatusLabel = (status: string) => {
  const map: any = { active: "啟用中", inactive: "已停用", suspended: "已暫停" };
  return map[status] || status;
};

const getStatusStyle = (status: string) => {
  const map: any = {
    active: { background: "#c8e6c9", padding: "4px 8px", borderRadius: "4px", color: "#2e7d32" },
    inactive: { background: "#ffcdd2", padding: "4px 8px", borderRadius: "4px", color: "#c62828" },
    suspended: { background: "#ffecb3", padding: "4px 8px", borderRadius: "4px", color: "#f57f17" },
  };
  return map[status] || {};
};

const formatDate = (date: string) => {
  if (!date) return "-";
  const d = new Date(date);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
};

const fetchTenants = async () => {
  loading.value = true;
  try {
    // 获取诊所列表
    const res = await adminTenantApi.getList({
      search: search.value || undefined,
      status: statusFilter.value || undefined,
      limit: limit.value,
      offset: offset.value,
    });
    const data = await res.json();
    if (res.ok) {
      const tenantList = data.data?.data || [];
      
      // 获取所有诊所的用量
      const usageRes = await apiFetch(`/api/admin/monitor/tenant-usage?year_month=${new Date().toISOString().slice(0, 7)}`);
      const usageData = await usageRes.json();
      const usageMap = new Map();
      if (usageRes.ok && usageData.success) {
        usageData.data.forEach((item: any) => {
          usageMap.set(item.tenant_id, { sent: item.sent, failed: item.failed, total: item.total });
        });
      }
      
      // 合并用量到租户
      tenants.value = tenantList.map((t: any) => ({
        ...t,
        usage: usageMap.get(t.id) || { sent: 0, failed: 0 },
      }));
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

const openEditModal = (tenant: any) => {
  isEditing.value = true;
  editingId.value = tenant.id;
  form.value = {
    name: tenant.name,
    email: tenant.email,
    phone: tenant.phone || "",
    address: tenant.address || "",
    status: tenant.status || "active",
  };
  showModal.value = true;
};

const closeModal = () => {
  showModal.value = false;
};

const saveTenant = async () => {
  if (!form.value.name || !form.value.email) {
    alert("請填寫診所名稱和 Email");
    return;
  }

  saving.value = true;
  try {
    const res = isEditing.value
      ? await adminTenantApi.update(editingId.value, form.value)
      : await adminTenantApi.create(form.value);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "儲存失敗");
    showModal.value = false;
    await fetchTenants();
  } catch (err: any) {
    alert(err.message);
  } finally {
    saving.value = false;
  }
};

const deleteTenant = async (id: string) => {
  if (!confirm("確定要停用此診所嗎？")) return;
  try {
    const res = await adminTenantApi.delete(id);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "操作失敗");
    alert(data.message || "診所已停用");
    await fetchTenants();
  } catch (err: any) {
    alert(err.message);
  }
};

const prevPage = () => {
  if (offset.value > 0) {
    offset.value -= limit.value;
    fetchTenants();
  }
};

const nextPage = () => {
  if (offset.value + limit.value < total.value) {
    offset.value += limit.value;
    fetchTenants();
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
    fetchTenants();
  }
};

onMounted(() => {
  fetchTenants();
  document.addEventListener('visibilitychange', handleVisibilityChange);
});

onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange);
});
</script>