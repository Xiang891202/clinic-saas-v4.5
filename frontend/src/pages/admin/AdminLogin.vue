<!-- frontend/src/pages/admin/AdminLogin.vue -->
<template>
  <div style="max-width: 400px; margin: 80px auto; padding: 20px; font-family: Arial, sans-serif;">
    <div style="text-align: center; margin-bottom: 24px;">
      <h2 style="margin: 0;">🛡️ 管理端登入</h2>
      <p style="color: #666; font-size: 14px;">請輸入管理員帳號密碼</p>
    </div>

    <form @submit.prevent="handleLogin">
      <div style="margin-bottom: 16px;">
        <label style="display: block; font-weight: bold; margin-bottom: 4px;">Email</label>
        <input
          type="email"
          v-model="email"
          placeholder="請輸入 Email"
          required
          style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 16px;"
        />
      </div>

      <div style="margin-bottom: 16px;">
        <label style="display: block; font-weight: bold; margin-bottom: 4px;">密碼</label>
        <input
          type="password"
          v-model="password"
          placeholder="請輸入密碼"
          required
          style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 16px;"
          @keyup.enter="handleLogin"
        />
      </div>

      <button
        type="submit"
        :disabled="loading"
        style="width: 100%; padding: 12px; background: #9C27B0; color: white; border: none; border-radius: 4px; font-size: 16px; cursor: pointer; transition: opacity 0.2s;"
        :style="loading ? { opacity: 0.7 } : {}"
      >
        {{ loading ? '登入中...' : '登入' }}
      </button>

      <div v-if="error" style="margin-top: 12px; color: red; text-align: center; background: #ffebee; padding: 10px; border-radius: 4px;">
        ❌ {{ error }}
      </div>

      <div style="margin-top: 16px; text-align: center; font-size: 14px; color: #999;">
        返回 <router-link to="/" style="color: #9C27B0; text-decoration: none;">首頁</router-link>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { apiFetch } from "../../api/index";

const router = useRouter();
const email = ref("");
const password = ref("");
const loading = ref(false);
const error = ref("");

const handleLogin = async () => {
  if (!email.value || !password.value) {
    error.value = "請輸入 Email 和密碼";
    return;
  }

  loading.value = true;
  error.value = "";

  try {
    const res = await apiFetch("/api/auth/admin/login", {
      method: "POST",
      skipTenant: true,  // 登录不需要 tenant-id
      body: JSON.stringify({
        email: email.value,
        password: password.value,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "登入失敗");
    }

    // ✅ 儲存登入資訊
    localStorage.setItem("auth_token", data.data.token);
    localStorage.setItem("auth_role", data.data.user.role);
    localStorage.setItem("auth_tenant_id", data.data.user.tenant_id || "");
    localStorage.setItem("auth_user_id", data.data.user.id);
    localStorage.setItem("auth_user_name", data.data.user.email);

    // ✅ 跳轉到管理儀表板
    router.push("/admin-home");
  } catch (err: any) {
    error.value = err.message || "登入失敗，請稍後再試";
  } finally {
    loading.value = false;
  }
};
</script>