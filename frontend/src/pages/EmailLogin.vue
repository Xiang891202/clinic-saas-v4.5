<template>
  <div style="max-width: 400px; margin: 80px auto; padding: 20px;">
    <h2 style="text-align: center;">📧 Email 登入</h2>
    <div v-if="!step">
      <input
        type="email"
        v-model="email"
        placeholder="請輸入 Email"
        style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; margin-bottom: 12px;"
      />
      <button
        @click="sendOtp"
        :disabled="sending"
        style="width: 100%; padding: 12px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;"
      >
        {{ sending ? '發送中...' : '發送驗證碼' }}
      </button>
      <div v-if="sendError" style="color: red; margin-top: 8px;">{{ sendError }}</div>
      <div v-if="sendSuccess" style="color: green; margin-top: 8px;">驗證碼已發送</div>
    </div>
    <div v-else>
      <p>已發送驗證碼至 {{ email }}</p>
      <input
        type="text"
        v-model="otp"
        placeholder="請輸入 6 位數驗證碼"
        style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; margin-bottom: 12px;"
      />
      <button
        @click="verifyOtp"
        :disabled="verifying"
        style="width: 100%; padding: 12px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer;"
      >
        {{ verifying ? '驗證中...' : '驗證登入' }}
      </button>
      <div v-if="verifyError" style="color: red; margin-top: 8px;">{{ verifyError }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";

const router = useRouter();
const email = ref("");
const otp = ref("");
const step = ref(false);
const sending = ref(false);
const verifying = ref(false);
const sendError = ref("");
const sendSuccess = ref(false);
const verifyError = ref("");

const sendOtp = async () => {
  sendError.value = "";
  sendSuccess.value = false;
  sending.value = true;

  try {
    const res = await fetch("/api/auth/email/send-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "發送失敗");
    step.value = true;
    sendSuccess.value = true;
  } catch (err: any) {
    sendError.value = err.message;
  } finally {
    sending.value = false;
  }
};

// frontend/src/pages/EmailLogin.vue - verifyOtp 函數
const verifyOtp = async () => {
  verifyError.value = "";
  verifying.value = true;

  try {
    const res = await fetch("/api/auth/email/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.value,
        otp: otp.value,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "驗證失敗");

    // ✅ 儲存登入資訊
    localStorage.setItem("auth_token", data.data.token);
    localStorage.setItem("auth_role", data.data.user?.role || "patient");
    localStorage.setItem("auth_tenant_id", data.data.user?.tenant_id || "550e8400-e29b-41d4-a716-446655440000");
    localStorage.setItem("auth_user_id", data.data.user?.id || "");
    localStorage.setItem("auth_user_name", data.data.user?.name || "使用者");

    // ✅ 檢查是否需要補齊個人資料
    const needsProfile = data.data.needsProfile !== undefined ? data.data.needsProfile : true;

    console.log("✅ 登入成功，needsProfile:", needsProfile);

    // ✅ 根據需要跳轉
    if (needsProfile) {
      window.location.href = "/patient/profile";
    } else {
      window.location.href = "/patient-home";
    }
  } catch (err: any) {
    console.error("❌ 驗證失敗:", err);
    verifyError.value = err.message;
  } finally {
    verifying.value = false;
  }
};
</script>