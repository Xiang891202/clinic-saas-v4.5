<!-- frontend/src/pages/admin/AdminHome.vue -->
<template>
  <div style="padding: 20px; font-family: Arial, sans-serif; max-width: 1200px; margin: 0 auto;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <h1>🛡️ 管理端儀表板</h1>
      <button @click="handleLogout" style="padding: 8px 16px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">登出</button>
    </div>

    <p style="color: #666; margin-bottom: 24px;">歡迎，{{ userName || '管理員' }}</p>

    <!-- 统计卡片 -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 30px;">
      <div style="background: #e3f2fd; padding: 20px; border-radius: 12px; text-align: center;">
        <div style="font-size: 32px; font-weight: bold;">{{ stats.totalTenants }}</div>
        <div style="color: #666; font-size: 14px;">總診所</div>
      </div>
      <div style="background: #c8e6c9; padding: 20px; border-radius: 12px; text-align: center;">
        <div style="font-size: 32px; font-weight: bold;">{{ stats.activeTenants }}</div>
        <div style="color: #666; font-size: 14px;">啟用中</div>
      </div>
      <div style="background: #fff3e0; padding: 20px; border-radius: 12px; text-align: center;">
        <div style="font-size: 32px; font-weight: bold;">{{ stats.totalContracts }}</div>
        <div style="color: #666; font-size: 14px;">總合約</div>
      </div>
      <div style="background: #ffcdd2; padding: 20px; border-radius: 12px; text-align: center;">
        <div style="font-size: 32px; font-weight: bold;">{{ stats.expiringSoon }}</div>
        <div style="color: #666; font-size: 14px;">即將到期 (30天內)</div>
      </div>
    
      <div style="background: #e3f2fd; padding: 20px; border-radius: 12px; text-align: center;">
        <div style="font-size: 32px; font-weight: bold;">{{ stats.emailSent || 0 }}</div>
        <div style="color: #666; font-size: 14px;">📧 本月 Email 發送</div>
      </div>
      <div style="background: #ffcdd2; padding: 20px; border-radius: 12px; text-align: center;">
        <div style="font-size: 32px; font-weight: bold;">{{ stats.emailFailed || 0 }}</div>
        <div style="color: #666; font-size: 14px;">❌ 本月 Email 失敗</div>
      </div>
    </div>

    <!-- 功能選單 -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px;">
      <router-link to="/admin/tenants" style="padding: 16px 24px; background: #9C27B0; color: white; text-decoration: none; border-radius: 8px; text-align: center; font-weight: bold; transition: opacity 0.2s;" @mouseenter="(e) => e.target.style.opacity = '0.85'" @mouseleave="(e) => e.target.style.opacity = '1'">
        🏢 診所管理
        <div style="font-size: 12px; font-weight: normal; opacity: 0.8; margin-top: 4px;">管理所有診所</div>
      </router-link>
      <router-link to="/admin/contracts" style="padding: 16px 24px; background: #FF9800; color: white; text-decoration: none; border-radius: 8px; text-align: center; font-weight: bold; transition: opacity 0.2s;" @mouseenter="(e) => e.target.style.opacity = '0.85'" @mouseleave="(e) => e.target.style.opacity = '1'">
        📄 合約管理
        <div style="font-size: 12px; font-weight: normal; opacity: 0.8; margin-top: 4px;">管理診所合約</div>
      </router-link>

      <router-link to="/admin/monitor" style="padding: 16px 24px; background: #607D8B; color: white; text-decoration: none; border-radius: 8px; text-align: center; font-weight: bold;">
        📊 系統監測
        <div style="font-size: 12px; font-weight: normal; opacity: 0.8; margin-top: 4px;">健康狀態與通知統計</div>
      </router-link>
    </div>

    <div style="margin-top: 40px; padding: 16px; background: #f5f5f5; border-radius: 8px; font-size: 14px; color: #666;">
      ⚡ 管理端功能 — 診所管理、合約管理
    </div>
    
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { adminTenantApi, adminContractApi } from "../../api/admin";

const router = useRouter();
const userName = ref("");
const stats = ref({
  totalTenants: 0,
  activeTenants: 0,
  totalContracts: 0,
  expiringSoon: 0,
  emailSent: 0,
  emailFailed: 0,
});

const fetchStats = async () => {
  try {
    // 获取租户列表
    const tenantRes = await adminTenantApi.getList({ limit: 100 });
    const tenantData = await tenantRes.json();
    const tenants = tenantData.data?.data || [];
    stats.value.totalTenants = tenants.length;
    stats.value.activeTenants = tenants.filter((t: any) => t.status === 'active').length;

    // 获取合约列表
    const contractRes = await adminContractApi.getList({ limit: 100 });
    const contractData = await contractRes.json();
    const contracts = contractData.data?.data || [];
    stats.value.totalContracts = contracts.length;

    // 计算即将到期的合约（30天内）
    const now = new Date();
    const thirtyDaysLater = new Date();
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
    stats.value.expiringSoon = contracts.filter((c: any) => {
      const endDate = new Date(c.end_date);
      return c.status === 'active' && endDate >= now && endDate <= thirtyDaysLater;
    }).length;
  } catch (err) {
    console.error("加载统计数据失败:", err);
  }
};

const checkAuth = () => {
  const name = localStorage.getItem("auth_user_name") || "管理員";
  userName.value = name;
};

const handleLogout = () => {
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
    fetchStats();
  }
};

onMounted(() => {
  checkAuth();
  fetchStats();
  document.addEventListener('visibilitychange', handleVisibilityChange);
});

onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange);
});
</script>