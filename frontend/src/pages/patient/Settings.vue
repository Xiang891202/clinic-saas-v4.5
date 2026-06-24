<template>
  <div style="max-width: 600px; margin: 60px auto; padding: 24px; font-family: Arial, sans-serif; background: #f9f9f9; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.1);">
    <h2 style="text-align: center; margin-bottom: 24px;">⚙️ 個人設定</h2>

    <div style="margin-bottom: 24px; padding: 16px; background: white; border-radius: 8px; border: 1px solid #eee;">
      <h3 style="font-size: 16px; margin-bottom: 12px;">📅 訂閱行事曆</h3>
      <p style="color: #666; font-size: 14px;">將此連結複製到手機行事曆應用程式，即可同步您的預約</p>
      <div style="display: flex; gap: 8px; margin-top: 8px;">
        <input
          type="text"
          :value="icalUrl"
          readonly
          style="flex: 1; padding: 8px; border: 1px solid #ccc; border-radius: 4px; background: #f5f5f5; font-size: 12px;"
        />
        <button @click="copyIcalUrl" style="padding: 8px 16px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; white-space: nowrap;">複製連結</button>
      </div>
      <div v-if="copySuccess" style="color: green; font-size: 14px; margin-top: 4px;">✅ 已複製</div>
    </div>

    <div style="margin-bottom: 24px; padding: 16px; background: white; border-radius: 8px; border: 1px solid #eee;">
      <h3 style="font-size: 16px; margin-bottom: 12px;">🔔 LINE 通知</h3>
      <p style="color: #666; font-size: 14px;">綁定 LINE 後，您將在預約成功或變更時收到通知</p>
      <div style="margin-top: 12px; display: flex; align-items: center; gap: 12px;">
        <span :style="lineBound ? { color: '#4CAF50' } : { color: '#999' }">
          {{ lineBound ? '✅ 已綁定 LINE 通知' : '❌ 尚未綁定' }}
        </span>
        <button
          v-if="!lineBound"
          @click="bindLine"
          style="padding: 8px 16px; background: #00b900; color: white; border: none; border-radius: 4px; cursor: pointer;"
        >
          🔗 綁定 LINE
        </button>
        <button
          v-else
          @click="unbindLine"
          style="padding: 8px 16px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;"
        >
          🔓 解除綁定
        </button>
      </div>
      <div v-if="lineError" style="color: red; font-size: 14px; margin-top: 4px;">{{ lineError }}</div>
    </div>

    <div style="margin-top: 16px; text-align: center;">
      <router-link to="/patient-home" style="color: #2196F3; text-decoration: none;">← 回首頁</router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";

const router = useRouter();
const icalUrl = ref("");
const lineBound = ref(false);
const copySuccess = ref(false);
const lineError = ref("");

const loadSettings = async () => {
  try {
    const token = localStorage.getItem("auth_token");
    const res = await fetch("/api/patient/settings", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) {
      icalUrl.value = data.data.ical_url || "";
      lineBound.value = !!data.data.line_user_id;
    }
  } catch (err) {
    console.error("載入設定失敗:", err);
  }
};

const copyIcalUrl = async () => {
  try {
    await navigator.clipboard.writeText(icalUrl.value);
    copySuccess.value = true;
    setTimeout(() => (copySuccess.value = false), 3000);
  } catch {
    // Fallback
    const input = document.createElement("input");
    input.value = icalUrl.value;
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    document.body.removeChild(input);
    copySuccess.value = true;
    setTimeout(() => (copySuccess.value = false), 3000);
  }
};

const bindLine = () => {
  // Phase 1: 引導到 LINE 綁定頁面（目前先顯示提示）
  // Phase 2 會完整實作 LINE Login 綁定
  alert("LINE 綁定功能將在下一階段開放，敬請期待！");
  // 未來實作：window.location.href = "/line-bind";
};

const unbindLine = () => {
  if (!confirm("確定要解除 LINE 綁定嗎？")) return;
  // Phase 2 實作
  alert("解除綁定功能將在下一階段開放");
};

onMounted(loadSettings);
</script>