<template>
  <div style="max-width: 400px; margin: 80px auto; padding: 20px; font-family: Arial, sans-serif;">
    <h2 style="text-align: center;">🏥 診所後台登入</h2>
    <form @submit.prevent="handleLogin">
      <div style="margin-bottom: 16px;">
        <label style="display: block; font-weight: bold; margin-bottom: 4px;">Email</label>
        <input type="email" v-model="email" required style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px;" />
      </div>
      <div style="margin-bottom: 16px;">
        <label style="display: block; font-weight: bold; margin-bottom: 4px;">密碼</label>
        <input type="password" v-model="password" required style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px;" />
      </div>
      <button type="submit" style="width: 100%; padding: 12px; background: #4CAF50; color: white; border: none; border-radius: 4px; font-size: 16px; cursor: pointer;">
        登入
      </button>
      <div v-if="error" style="margin-top: 12px; color: red; text-align: center;">{{ error }}</div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";

const router = useRouter();
const email = ref("");
const password = ref("");
const error = ref("");

const handleLogin = async () => {
  error.value = "";
  try {
    const res = await fetch("/api/auth/clinic/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.value, password: password.value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "登入失敗");

    // ✅ 統一使用 auth_* 前綴
    localStorage.setItem("auth_token", data.data.token);
    localStorage.setItem("auth_role", data.data.user.role);
    localStorage.setItem("auth_tenant_id", data.data.user.tenant_id);
    localStorage.setItem("auth_user_id", data.data.user.id);
    localStorage.setItem("auth_user_name", data.data.user.email);

    // ✅ 診所端額外儲存（保留向後相容）
    localStorage.setItem("clinic_token", data.data.token);
    localStorage.setItem("clinic_tenant_id", data.data.user.tenant_id);

    router.push("/clinic/dashboard");
  } catch (err: any) {
    error.value = err.message;
  }
};
</script>