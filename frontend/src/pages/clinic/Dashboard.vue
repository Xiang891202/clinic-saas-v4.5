<template>
  <div style="padding: 20px; font-family: Arial, sans-serif;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <h2>📊 診所儀表板</h2>
      <button @click="logout" style="padding: 8px 16px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">登出</button>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; margin-bottom: 24px;">
      <div style="background: #e3f2fd; padding: 16px; border-radius: 8px; text-align: center;">
        <div style="font-size: 28px; font-weight: bold;">{{ stats.total }}</div>
        <div style="color: #666;">總預約</div>
      </div>
      <div style="background: #c8e6c9; padding: 16px; border-radius: 8px; text-align: center;">
        <div style="font-size: 28px; font-weight: bold;">{{ stats.completed }}</div>
        <div style="color: #666;">已完成</div>
      </div>
      <div style="background: #ffecb3; padding: 16px; border-radius: 8px; text-align: center;">
        <div style="font-size: 28px; font-weight: bold;">{{ stats.booked }}</div>
        <div style="color: #666;">待看診</div>
      </div>
      <div style="background: #ffcdd2; padding: 16px; border-radius: 8px; text-align: center;">
        <div style="font-size: 28px; font-weight: bold;">{{ stats.noshow }}</div>
        <div style="color: #666;">未到</div>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-top: 20px;">
      <router-link to="/clinic/appointments" style="padding: 14px 20px; background: #2196F3; color: white; text-decoration: none; border-radius: 8px; text-align: center; font-weight: bold;">
        📋 預約管理
      </router-link>
      <router-link to="/clinic/slots" style="padding: 14px 20px; background: #FF9800; color: white; text-decoration: none; border-radius: 8px; text-align: center; font-weight: bold;">
        🕐 時段管理
      </router-link>
      <router-link to="/clinic/services" style="padding: 14px 20px; background: #4CAF50; color: white; text-decoration: none; border-radius: 8px; text-align: center; font-weight: bold;">
        📋 服務管理
      </router-link>
      <router-link to="/clinic/patients" style="padding: 14px 20px; background: #9C27B0; color: white; text-decoration: none; border-radius: 8px; text-align: center; font-weight: bold;">
        👥 病人列表
      </router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { apiFetch } from "../../api/index";

const router = useRouter();
const stats = ref({ total: 0, completed: 0, booked: 0, noshow: 0 });

const logout = () => {
  localStorage.removeItem("auth_token");
  localStorage.removeItem("auth_role");
  localStorage.removeItem("auth_tenant_id");
  localStorage.removeItem("auth_user_id");
  localStorage.removeItem("auth_user_name");
  localStorage.removeItem("clinic_token");
  localStorage.removeItem("clinic_tenant_id");
  localStorage.removeItem("patient_token");
  localStorage.removeItem("patient_id");
  localStorage.removeItem("patient_name");
  router.push("/clinic/login");
};

const fetchStats = async () => {
  const tenantId = localStorage.getItem("clinic_tenant_id") || localStorage.getItem("auth_tenant_id");
  if (!tenantId) return router.push("/clinic/login");

  try {
    const res = await apiFetch("/api/clinic/appointments");
    const data = await res.json();
    if (data.data) {
      const total = data.data.filter((a: any) => a.status !== "cancelled").length;
      const completed = data.data.filter((a: any) => a.status === "completed").length;
      const booked = data.data.filter((a: any) => a.status === "booked" || a.status === "arrived").length;
      const noshow = data.data.filter((a: any) => a.status === "noshow").length;
      stats.value = { total, completed, booked, noshow };
    }
  } catch (err) {
    console.error(err);
  }
};

const handleVisibilityChange = () => {
  if (document.visibilityState === 'visible') {
    console.log('🔄 页面激活，重新加载统计数据');
    fetchStats();
  }
};

onMounted(() => {
  fetchStats();
  document.addEventListener('visibilitychange', handleVisibilityChange);
});

onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange);
});
</script>