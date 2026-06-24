<template>
  <div style="max-width: 400px; margin: 80px auto; padding: 20px; text-align: center;">
    <h2>🔵 LINE 登入</h2>
    <div v-if="loading">⏳ 載入中...</div>
    <div v-if="error" style="color: red; margin-top: 12px;">❌ {{ error }}</div>
    <div v-if="!loading && !error">
      <p>LINE 帳號驗證中...</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";

const router = useRouter();
const loading = ref(true);
const error = ref("");

const handleLineLogin = async () => {
  try {
    // 1️⃣ 先檢查是否已經有 token
    const token = localStorage.getItem("auth_token");
    if (token) {
      router.replace("/patient-home");
      return;
    }

    // 2️⃣ 檢查網址是否帶有 LINE 回傳的授權碼（code）
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");
    const errorParam = urlParams.get("error");

    if (errorParam) {
      throw new Error(`LINE 授權錯誤: ${errorParam}`);
    }

    // ✅ 如果有 code 參數，表示剛從 LINE 授權回來，直接向後端換 token
    if (code) {
      console.log("🔄 偵測到授權碼，向後端換取 token...");

      // 清除 URL 中的 code 參數，避免重整時重複使用
      window.history.replaceState({}, "", window.location.pathname);

      const response = await fetch("/api/auth/line/callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code,
          redirect_uri: window.location.origin + "/patient-home",
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "換取 Token 失敗");

      // 儲存登入資訊
      localStorage.setItem("auth_token", result.data.token);
      localStorage.setItem("auth_role", result.data.user?.role || "patient");
      localStorage.setItem("auth_tenant_id", result.data.user?.tenant_id || "");
      localStorage.setItem("auth_user_id", result.data.user?.id || "");
      localStorage.setItem("auth_user_name", result.data.user?.name || "使用者");

      // 導向病人首頁
      router.replace("/patient-home");
      return;
    }

    // 3️⃣ 沒有 code 也沒有 token → 使用 LIFF 自動登入
    console.log("🔐 嘗試使用 LIFF 自動登入...");

    // 載入 LIFF SDK
    const script = document.createElement("script");
    script.src = "https://static.line-scdn.net/liff/edge/2.1/sdk.js";
    script.onload = () => {
      const liff = (window as any).liff;
      const liffId = "2010483308-6Rrz3GPm";

      liff.init({ liffId }, () => {
        if (liff.isLoggedIn()) {
          // 已登入 LINE，取得 id_token 交給後端
          const idToken = liff.getIDToken();
          if (idToken) {
            fetch("/api/auth/line", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id_token: idToken }),
            })
              .then((res) => res.json())
              .then((data) => {
                if (!data.success) throw new Error(data.error);
                localStorage.setItem("auth_token", data.data.token);
                localStorage.setItem("auth_role", data.data.user?.role || "patient");
                localStorage.setItem("auth_tenant_id", data.data.user?.tenant_id || "");
                localStorage.setItem("auth_user_id", data.data.user?.id || "");
                localStorage.setItem("auth_user_name", data.data.user?.name || "使用者");
                router.replace("/patient-home");
              })
              .catch((err) => {
                error.value = err.message;
                loading.value = false;
              });
            return;
          }
        }
        // 未登入 LINE → 觸發登入（會跳轉到 LINE 授權頁面）
        liff.login();
      });
    };
    document.head.appendChild(script);
  } catch (err: any) {
    console.error("LINE 登入錯誤:", err);
    error.value = err.message || "登入失敗";
    loading.value = false;
  }
};

onMounted(() => {
  handleLineLogin();
});
</script>