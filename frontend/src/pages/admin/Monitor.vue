<!-- frontend/src/pages/admin/Monitor.vue -->
<template>
  <div style="padding: 20px; font-family: Arial, sans-serif; max-width: 1200px; margin: 0 auto;">
    <!-- 标题栏 -->
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <h2>📊 系統監測</h2>
      <button @click="refreshAll" style="padding: 8px 16px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer;">
        🔄 重新整理
      </button>
    </div>

    <!-- 系统健康状态 -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px;">
      <div v-for="item in healthChecks" :key="item.key" style="background: white; padding: 16px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); text-align: center;">
        <div style="font-size: 14px; color: #666;">{{ item.label }}</div>
        <div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 8px;">
          <span :style="{
            display: 'inline-block',
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            background: item.status ? '#4CAF50' : '#f44336',
          }"></span>
          <span style="font-weight: bold;">{{ item.status ? '🟢 正常' : '🔴 異常' }}</span>
        </div>
      </div>
    </div>

    <!-- 统计卡片（仅 Email） -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; margin-bottom: 24px;">
      <div style="background: #e3f2fd; padding: 16px; border-radius: 8px; text-align: center;">
        <div style="font-size: 28px; font-weight: bold;">{{ stats.todaySent || 0 }}</div>
        <div style="color: #666; font-size: 14px;">📧 今日發送</div>
      </div>
      <div style="background: #ffcdd2; padding: 16px; border-radius: 8px; text-align: center;">
        <div style="font-size: 28px; font-weight: bold;">{{ stats.todayFailed || 0 }}</div>
        <div style="color: #666; font-size: 14px;">❌ 今日失敗</div>
      </div>
      <div style="background: #c8e6c9; padding: 16px; border-radius: 8px; text-align: center;">
        <div style="font-size: 28px; font-weight: bold;">{{ stats.successRate || 0 }}%</div>
        <div style="color: #666; font-size: 14px;">✅ 成功率</div>
      </div>
      <div style="background: #fff3e0; padding: 16px; border-radius: 8px; text-align: center;">
        <div style="font-size: 28px; font-weight: bold;">{{ stats.totalTenants || 0 }}</div>
        <div style="color: #666; font-size: 14px;">🏥 總診所</div>
      </div>
    </div>

    <!-- 趋势图 -->
    <div style="background: white; border-radius: 8px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); margin-bottom: 20px;">
      <h3 style="margin-top: 0; margin-bottom: 16px;">📈 近7日 Email 通知趨勢</h3>
      <div v-if="trendData.length === 0" style="color: #999; text-align: center; padding: 40px 0;">
        暫無數據
      </div>
      <div v-else style="display: flex; align-items: flex-end; gap: 12px; height: 200px; padding: 10px 0;">
        <div v-for="(item, index) in trendData" :key="index" style="flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%;">
          <div style="flex: 1; display: flex; flex-direction: column; justify-content: flex-end; width: 100%;">
            <div
              :style="{
                width: '100%',
                height: `${Math.max(5, (item.sent / maxTrendValue) * 100)}%`,
                background: '#4CAF50',
                borderRadius: '4px 4px 0 0',
                minHeight: '4px',
              }"
            ></div>
            <div
              v-if="item.failed > 0"
              :style="{
                width: '100%',
                height: `${Math.max(5, (item.failed / maxTrendValue) * 100)}%`,
                background: '#f44336',
                borderRadius: '4px 4px 0 0',
                minHeight: '4px',
                marginTop: '2px',
              }"
            ></div>
          </div>
          <div style="font-size: 11px; color: #999; margin-top: 6px;">{{ item.date.slice(5) }}</div>
          <div style="font-size: 10px; color: #666;">{{ item.sent }}/{{ item.failed }}</div>
        </div>
      </div>
      <div style="display: flex; gap: 16px; justify-content: center; margin-top: 8px; font-size: 12px;">
        <span><span style="display: inline-block; width: 12px; height: 12px; background: #4CAF50; border-radius: 2px; vertical-align: middle;"></span> 成功</span>
        <span><span style="display: inline-block; width: 12px; height: 12px; background: #f44336; border-radius: 2px; vertical-align: middle;"></span> 失敗</span>
      </div>
    </div>

    <!-- 最近 Email 失败记录 -->
    <div style="background: white; border-radius: 8px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
      <h3 style="margin-top: 0; margin-bottom: 16px;">❌ 最近 Email 發送失敗</h3>
      <div v-if="loading" style="text-align: center; padding: 20px;">載入中...</div>
      <div v-else-if="failedLogs.length === 0" style="color: #999; text-align: center; padding: 20px;">✅ 暫無失敗記錄</div>
      <table v-else style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <thead style="background: #f5f5f5;">
          <tr>
            <th style="padding: 10px; text-align: left;">時間</th>
            <th style="padding: 10px; text-align: left;">診所</th>
            <th style="padding: 10px; text-align: left;">錯誤訊息</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="log in failedLogs" :key="log.id" style="border-bottom: 1px solid #eee;">
            <td style="padding: 10px; font-size: 12px;">{{ formatTime(log.created_at) }}</td>
            <td style="padding: 10px;">{{ log.tenants?.name || '未知' }}</td>
            <td style="padding: 10px; font-size: 12px; color: #f44336;">{{ log.detail?.error || '未知錯誤' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 在各诊所用量区域 -->
    <div style="background: white; border-radius: 8px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); margin-top: 20px;">
    <h3 style="margin-top: 0; margin-bottom: 16px;">🏥 各診所 Email 用量</h3>
    <div v-if="tenantUsageLoading" style="text-align: center; padding: 20px;">載入中...</div>
    <table v-else style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <thead style="background: #f5f5f5;">
        <tr>
            <th style="padding: 10px; text-align: left;">診所</th>
            <th style="padding: 10px; text-align: left;">已發送</th>
            <th style="padding: 10px; text-align: left;">限額</th>
            <th style="padding: 10px; text-align: left;">使用率</th>
            <th style="padding: 10px; text-align: left;">狀態</th>
        </tr>
        </thead>
        <tbody>
        <tr v-for="item in tenantUsage" :key="item.tenant_id" style="border-bottom: 1px solid #eee;">
            <td style="padding: 10px; font-weight: bold;">{{ item.tenant_name }}</td>
            <td style="padding: 10px;">{{ item.sent }}</td>
            <td style="padding: 10px;">{{ item.email_limit || 0 }}</td>
            <td style="padding: 10px;">
            <div style="display: flex; align-items: center; gap: 8px;">
                <div style="flex: 1; height: 6px; background: #eee; border-radius: 3px; min-width: 60px;">
                <div :style="{
                    width: `${Math.min(100, item.usage_rate)}%`,
                    height: '100%',
                    background: item.usage_rate > 90 ? '#f44336' : item.usage_rate > 70 ? '#ff9800' : '#4CAF50',
                    borderRadius: '3px',
                }"></div>
                </div>
                <span style="font-size: 12px; color: #666;">{{ item.usage_rate }}%</span>
            </div>
            </td>
            <td style="padding: 10px;">
            <span :style="{
                padding: '2px 8px',
                borderRadius: '12px',
                fontSize: '11px',
                background: item.usage_rate > 90 ? '#ffcdd2' : '#c8e6c9',
                color: item.usage_rate > 90 ? '#c62828' : '#2e7d32',
            }">
                {{ item.usage_rate > 90 ? '接近上限' : '正常' }}
            </span>
            </td>
        </tr>
        </tbody>
    </table>
    </div>

    <div style="margin-top: 16px;">
      <router-link to="/admin-home" style="color: #2196F3;">← 回儀表板</router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { apiFetch } from "../../api/index";

const loading = ref(false);
const healthChecks = ref([
  { key: 'database', label: '資料庫', status: false },
  { key: 'redis', label: 'Redis', status: false },
  { key: 'queue', label: 'Queue', status: false },
]);

const stats = ref({
  todaySent: 0,
  todayFailed: 0,
  successRate: 0,
  totalTenants: 0,
});

const trendData = ref<{ date: string; sent: number; failed: number }[]>([]);
const failedLogs = ref<any[]>([]);
const maxTrendValue = ref(1);

const formatTime = (date: string) => {
  if (!date) return '-';
  const d = new Date(date);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
};

const fetchHealth = async () => {
  try {
    const res = await apiFetch('/api/admin/monitor/health');
    const data = await res.json();
    if (res.ok && data.success) {
      healthChecks.value = healthChecks.value.map(item => ({
        ...item,
        status: data.data.checks[item.key] || false,
      }));
    }
  } catch (err) {
    console.error('获取健康状态失败:', err);
  }
};

const fetchStats = async () => {
  try {
    const res = await apiFetch('/api/admin/monitor/notification-usage');
    const data = await res.json();
    if (res.ok && data.success) {
      const info = data.data;
      stats.value.todaySent = info?.total?.sent || 0;
      stats.value.todayFailed = info?.total?.failed || 0;
      stats.value.successRate = info?.total?.rate || 0;
      stats.value.totalTenants = info?.tenants?.length || 0;
    }
  } catch (err) {
    console.error('获取统计失败:', err);
  }
};

const fetchTrend = async () => {
  try {
    const res = await apiFetch('/api/admin/monitor/notifications/trend?days=7');
    const data = await res.json();
    if (res.ok && data.success) {
      trendData.value = data.data || [];
      const max = Math.max(...trendData.value.map(d => d.sent + d.failed), 1);
      maxTrendValue.value = max;
    }
  } catch (err) {
    console.error('获取趋势失败:', err);
  }
};

const fetchFailedLogs = async () => {
  loading.value = true;
  try {
    const res = await apiFetch('/api/admin/monitor/notification-logs?limit=20');
    const data = await res.json();
    if (res.ok && data.success) {
      failedLogs.value = data.data || [];
    }
  } catch (err) {
    console.error('获取失败日志失败:', err);
  } finally {
    loading.value = false;
  }
};

const tenantUsage = ref<any[]>([]);
const tenantUsageLoading = ref(false);

const fetchTenantUsage = async () => {
  tenantUsageLoading.value = true;
  try {
    const res = await apiFetch(`/api/admin/monitor/tenant-usage?year_month=${new Date().toISOString().slice(0, 7)}`);
    const data = await res.json();
    if (res.ok && data.success) {
      tenantUsage.value = data.data || [];
    }
  } catch (err) {
    console.error('获取诊所用量失败:', err);
  } finally {
    tenantUsageLoading.value = false;
  }
};


const refreshAll = () => {
  fetchHealth();
  fetchStats();
  fetchTrend();
  fetchFailedLogs();
  fetchTenantUsage();
};

const handleVisibilityChange = () => {
  if (document.visibilityState === 'visible') {
    refreshAll();
  }
};

onMounted(() => {
  refreshAll();
  document.addEventListener('visibilitychange', handleVisibilityChange);
});

onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange);
});
</script>