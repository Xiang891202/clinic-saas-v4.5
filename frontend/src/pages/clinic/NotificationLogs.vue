<template>
  <div class="notification-logs">
    <h2>📋 通知失敗清單</h2>

    <!-- 統計摘要 -->
    <div class="summary-cards">
      <div class="card">
        <span class="label">總計</span>
        <span class="value">{{ summary.total }}</span>
      </div>
      <div class="card failed">
        <span class="label">失敗</span>
        <span class="value">{{ summary.failed }}</span>
      </div>
      <div class="card sent">
        <span class="label">已發送</span>
        <span class="value">{{ summary.sent }}</span>
      </div>
      <div class="card pending">
        <span class="label">待處理</span>
        <span class="value">{{ summary.pending }}</span>
      </div>
    </div>

    <!-- 篩選欄 -->
    <div class="filters">
      <select v-model="filters.channel">
        <option value="">所有渠道</option>
        <option value="email">Email</option>
        <option value="line">LINE</option>
        <option value="queue">Queue</option>
      </select>
      <input type="date" v-model="filters.startDate" placeholder="開始日期" />
      <input type="date" v-model="filters.endDate" placeholder="結束日期" />
      <button @click="loadNotifications" class="btn-filter">篩選</button>
      <button @click="resetFilters" class="btn-reset">重設</button>
    </div>

    <!-- 列表 -->
    <div v-if="loading" class="loading">載入中...</div>
    <div v-else-if="notifications.length === 0" class="empty">✅ 目前沒有失敗通知</div>
    <table v-else class="table">
      <thead>
        <tr>
          <th><input type="checkbox" @change="toggleAll" v-model="selectAll" /></th>
          <th>病人</th>
          <th>渠道</th>
          <th>狀態</th>
          <th>錯誤訊息</th>
          <th>時間</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in notifications" :key="item.id" :class="{ acknowledged: item.acknowledged }">
          <td><input type="checkbox" v-model="selectedIds" :value="item.id" /></td>
          <td>{{ item.patient?.name || '未知' }}</td>
          <td>{{ item.channel }}</td>
          <td>
            <span :class="'badge ' + item.status">
              {{ item.status === 'failed' ? '❌ 失敗' : item.status }}
            </span>
          </td>
          <td class="error-msg">{{ item.detail?.error || '未知錯誤' }}</td>
          <td>{{ formatDate(item.createdAt) }}</td>
          <td>
            <button @click="acknowledge(item.id)" class="btn-ack" :disabled="item.acknowledged">
              {{ item.acknowledged ? '已確認' : '確認' }}
            </button>
            <button @click="retry(item.id)" class="btn-retry" 
                :disabled="item.status !== 'failed' || item.acknowledged">
                重試
            </button>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- 分頁 -->
    <div class="pagination">
      <button @click="prevPage" :disabled="offset === 0">上一頁</button>
      <span>第 {{ Math.floor(offset / limit) + 1 }} 頁</span>
      <button @click="nextPage" :disabled="notifications.length < limit">下一頁</button>
    </div>

    <!-- 批量操作 -->
    <div class="batch-actions" v-if="selectedIds.length > 0">
      <button @click="batchAcknowledge" class="btn-batch">
        批量標記已確認 ({{ selectedIds.length }})
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { apiFetch } from '../../api/index';

interface Notification {
  id: string;
  bookingId: string;
  channel: string;
  status: string;
  detail: any;
  createdAt: string;
  acknowledged: boolean;
  patient: { name: string; email: string; phone: string } | null;
}

const notifications = ref<Notification[]>([]);
const loading = ref(false);
const selectedIds = ref<string[]>([]);
const selectAll = ref(false);
const limit = 20;
const offset = ref(0);
const total = ref(0);

const summary = ref({
  total: 0,
  sent: 0,
  failed: 0,
  pending: 0,
});

const filters = ref({
  channel: '',
  startDate: '',
  endDate: '',
});

// 載入失敗通知
const loadNotifications = async () => {
  loading.value = true;
  try {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset.value),
      ...(filters.value.channel && { channel: filters.value.channel }),
      ...(filters.value.startDate && { startDate: filters.value.startDate }),
      ...(filters.value.endDate && { endDate: filters.value.endDate }),
    });
    const res = await apiFetch(`/api/clinic/notifications/failed?${params}`);
    const data = await res.json();
    if (data.success) {
      notifications.value = data.data.data;
      total.value = data.data.total;
    }
  } catch (err) {
    console.error('載入失敗:', err);
  } finally {
    loading.value = false;
  }
};

// 載入統計摘要
const loadSummary = async () => {
  try {
    const res = await apiFetch('/api/clinic/notifications/summary');
    const data = await res.json();
    if (data.success) {
      summary.value = data.data;
    }
  } catch (err) {
    console.error('載入摘要失敗:', err);
  }
};

// 標記為已確認
const acknowledge = async (id: string) => {
  try {
    const res = await apiFetch(`/api/clinic/notifications/${id}/acknowledge`, {
      method: 'PATCH',
    });
    const data = await res.json();
    if (data.success) {
      await loadNotifications();
      await loadSummary();
    }
  } catch (err) {
    console.error('標記失敗:', err);
  }
};

// 批量標記
const batchAcknowledge = async () => {
  if (selectedIds.value.length === 0) return;
  try {
    const res = await apiFetch('/api/clinic/notifications/batch-acknowledge', {
      method: 'POST',
      body: JSON.stringify({ ids: selectedIds.value }),
    });
    const data = await res.json();
    if (data.success) {
      selectedIds.value = [];
      selectAll.value = false;
      await loadNotifications();
      await loadSummary();
    }
  } catch (err) {
    console.error('批量標記失敗:', err);
  }
};

// 重試發送
const retry = async (id: string) => {
  try {
    const res = await apiFetch(`/api/clinic/notifications/${id}/retry`, {
      method: 'POST',
    });
    const data = await res.json();
    if (data.success) {
      await loadNotifications();
    }
  } catch (err) {
    console.error('重試失敗:', err);
  }
};

// 全選切換
const toggleAll = (e: Event) => {
  const checked = (e.target as HTMLInputElement).checked;
  if (checked) {
    selectedIds.value = notifications.value.map(n => n.id);
  } else {
    selectedIds.value = [];
  }
};

// 分頁
const prevPage = () => {
  if (offset.value > 0) {
    offset.value -= limit;
    loadNotifications();
  }
};

const nextPage = () => {
  if (notifications.value.length === limit) {
    offset.value += limit;
    loadNotifications();
  }
};

// 重設篩選
const resetFilters = () => {
  filters.value = { channel: '', startDate: '', endDate: '' };
  offset.value = 0;
  loadNotifications();
};

// 格式化日期
const formatDate = (date: string) => {
  return new Date(date).toLocaleString('zh-TW');
};

// 初始化
onMounted(() => {
  loadNotifications();
  loadSummary();
});
</script>

<style scoped>
.notification-logs {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}
.summary-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}
.card {
  background: #f5f7fa;
  padding: 16px;
  border-radius: 8px;
  text-align: center;
}
.card .label { display: block; font-size: 14px; color: #666; }
.card .value { display: block; font-size: 24px; font-weight: bold; margin-top: 4px; }
.card.failed .value { color: #e74c3c; }
.card.sent .value { color: #2ecc71; }
.card.pending .value { color: #f39c12; }

.filters {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
  align-items: center;
}
.filters select,
.filters input {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
}
.btn-filter {
  background: #3498db;
  color: white;
  border: none;
  padding: 8px 20px;
  border-radius: 4px;
  cursor: pointer;
}
.btn-reset {
  background: #95a5a6;
  color: white;
  border: none;
  padding: 8px 20px;
  border-radius: 4px;
  cursor: pointer;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
.table th,
.table td {
  padding: 10px 12px;
  border-bottom: 1px solid #eee;
  text-align: left;
}
.table th {
  background: #f8f9fa;
  font-weight: 600;
}
.table tr.acknowledged {
  opacity: 0.6;
}
.badge {
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}
.badge.failed { background: #fde8e8; color: #c0392b; }
.badge.sent { background: #e8f8ed; color: #27ae60; }
.badge.pending { background: #fef9e7; color: #f39c12; }

.error-msg {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn-ack,
.btn-retry {
  padding: 4px 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  margin-right: 4px;
}
.btn-ack { background: #2ecc71; color: white; }
.btn-ack:disabled { background: #bdc3c7; cursor: not-allowed; }
.btn-retry { background: #f39c12; color: white; }
.btn-retry:disabled { background: #bdc3c7; cursor: not-allowed; }

.pagination {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-top: 20px;
  align-items: center;
}
.pagination button {
  padding: 8px 16px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: white;
  cursor: pointer;
}
.pagination button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.batch-actions {
  margin-top: 16px;
  text-align: center;
}
.btn-batch {
  background: #8e44ad;
  color: white;
  border: none;
  padding: 10px 24px;
  border-radius: 4px;
  cursor: pointer;
}

.loading {
  text-align: center;
  padding: 40px;
  color: #666;
}
.empty {
  text-align: center;
  padding: 40px;
  font-size: 18px;
  color: #27ae60;
}
</style>