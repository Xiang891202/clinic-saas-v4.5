<template>
  <div style="max-width: 500px; margin: 60px auto; padding: 24px; font-family: Arial, sans-serif; background: #f9f9f9; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.1);">
    <h2 style="text-align: center; margin-bottom: 24px;">📋 個人資料</h2>
    <p style="text-align: center; color: #666; margin-bottom: 20px;">第一次使用，請先完成個人資料設定</p>

    <div style="margin-bottom: 16px;">
      <label style="display: block; font-weight: bold; margin-bottom: 4px;">姓氏 *</label>
      <input type="text" v-model="form.name_family" placeholder="請輸入姓氏" style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px;" />
    </div>

    <div style="margin-bottom: 16px;">
      <label style="display: block; font-weight: bold; margin-bottom: 4px;">名字 *</label>
      <input type="text" v-model="form.name_given" placeholder="請輸入名字" style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px;" />
    </div>

    <div style="margin-bottom: 16px;">
      <label style="display: block; font-weight: bold; margin-bottom: 4px;">手機號碼 *</label>
      <input type="tel" v-model="form.telecom_phone" placeholder="請輸入手機號碼" style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px;" />
    </div>

    <div style="margin-bottom: 16px;">
      <label style="display: block; font-weight: bold; margin-bottom: 4px;">性別</label>
      <select v-model="form.gender" style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px;">
        <option value="">請選擇</option>
        <option value="male">男</option>
        <option value="female">女</option>
        <!-- <option value="other">其他</option> -->
      </select>
    </div>

    <div style="margin-bottom: 24px;">
      <label style="display: block; font-weight: bold; margin-bottom: 4px;">出生日期</label>
      <input type="date" v-model="form.birth_date" style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px;" />
    </div>

    <button @click="saveProfile" :disabled="saving" style="width: 100%; padding: 14px; background: #4CAF50; color: white; border: none; border-radius: 4px; font-size: 16px; cursor: pointer;">
      {{ saving ? '儲存中...' : '儲存並繼續' }}
    </button>

    <div v-if="error" style="color: red; margin-top: 12px; text-align: center;">{{ error }}</div>
    <div v-if="success" style="color: green; margin-top: 12px; text-align: center;">✅ 儲存成功！</div>

    <div style="margin-top: 16px; text-align: center; font-size: 14px; color: #999;">
      儲存後將自動進入首頁
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";

const router = useRouter();
const saving = ref(false);
const error = ref("");
const success = ref(false);

const form = ref({
  name_family: "",
  name_given: "",
  telecom_phone: "",
  gender: "",
  birth_date: "",
});

// ========== 載入目前資料 ==========
const loadProfile = async () => {
  try {
    const token = localStorage.getItem("auth_token");
    const res = await fetch("/api/patient/profile", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) {
      form.value.name_family = data.data.name_family || "";
      form.value.name_given = data.data.name_given || "";
      form.value.telecom_phone = data.data.telecom_phone || "";
      form.value.gender = data.data.gender || "";
      form.value.birth_date = data.data.birth_date || "";
    }
  } catch (err) {
    console.error("載入資料失敗:", err);
  }
};

// ========== 儲存資料 ==========
const saveProfile = async () => {
  // ✅ 基本驗證
  if (!form.value.name_family || !form.value.name_given || !form.value.telecom_phone) {
    error.value = "請填寫完整資料（姓名和手機為必填）";
    return;
  }

  saving.value = true;
  error.value = "";
  success.value = false;

  try {
    const token = localStorage.getItem("auth_token");
    const res = await fetch("/api/patient/profile", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(form.value),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "儲存失敗");

    success.value = true;
    localStorage.setItem("auth_user_name", form.value.name_given);

    // ✅ 延遲跳轉
    setTimeout(() => {
      router.replace("/patient-home");
    }, 800);
  } catch (err: any) {
    error.value = err.message;
  } finally {
    saving.value = false;
  }
};

onMounted(() => {
  loadProfile();
});
</script>