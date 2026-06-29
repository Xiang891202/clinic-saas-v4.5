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

const getClinicCode = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get('c') || '';
};

const sendOtp = async () => {
  sendError.value = "";
  sendSuccess.value = false;

  const clinicCode = getClinicCode();
  if (!clinicCode) {
    sendError.value = "請提供診所代碼（URL 需包含 ?c=xxx）";
    return;
  }

  if (!email.value) {
    sendError.value = "請輸入 Email";
    return;
  }

  sending.value = true;
  try {
    const res = await fetch("/api/auth/email/send-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.value,
        clinic_code: clinicCode,
      }),
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
  
  const clinicCode = getClinicCode();
  if (!clinicCode) {
    verifyError.value = "請提供診所代碼";
    return;
  }

  if (!otp.value) {
    verifyError.value = "請輸入驗證碼";
    return;
  }

  verifying.value = true;
  try {
    const res = await fetch("/api/auth/email/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.value,
        otp: otp.value,
        clinic_code: clinicCode,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "驗證失敗");

    // ✅ 兼容兩種格式
    const token = data.token || data.data?.token;
    const user = data.user || data.data?.user;
    if (!token || !user) throw new Error("登入回應格式錯誤");

    localStorage.setItem("auth_token", token);
    localStorage.setItem("auth_role", user.role || "patient");
    localStorage.setItem("auth_tenant_id", user.tenant_id || "");
    localStorage.setItem("auth_user_id", user.id || "");
    localStorage.setItem("auth_user_name", user.name || "使用者");

    const needsProfile = data.needsProfile !== undefined ? data.needsProfile : true;

    if (needsProfile) {
      router.push("/patient/profile");
    } else {
      router.push("/patient-home");
    }
  } catch (err: any) {
    console.error("❌ 驗證失敗:", err);
    verifyError.value = err.message;
  } finally {
    verifying.value = false;
  }
};
</script>