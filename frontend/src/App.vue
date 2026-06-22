<template>
  <div id="app" style="font-family: Arial; padding: 20px;">
    <h1>🏥 前端測試 (v4.5)</h1>
    <p>後端 API 位址：<code>/api</code> (代理至 localhost:3000)</p>
    <button @click="testConnection">🔗 測試前後端串接</button>
    <div v-if="loading">載入中...</div>
    <pre v-if="result" style="background: #f4f4f4; padding: 15px; border-radius: 8px;">{{ JSON.stringify(result, null, 2) }}</pre>
    <div v-if="error" style="color: red;">❌ 錯誤：{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const loading = ref(false);
const result = ref(null);
const error = ref('');

const testConnection = async () => {
  loading.value = true;
  error.value = '';
  result.value = null;
  try {
    const res = await fetch('/api/test/db');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    result.value = data;
  } catch (err: any) {
    error.value = err.message || '連線失敗，請確認後端是否啟動 (npm run dev)';
  } finally {
    loading.value = false;
  }
};
</script>
