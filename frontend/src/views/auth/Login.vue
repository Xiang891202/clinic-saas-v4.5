<template>
  <div class="login-container">
    <div class="login-card">
      <h1>診所預約系統</h1>
      <p class="subtitle">請選擇診所並登入</p>

      <!-- 診所選擇 -->
      <div class="form-group">
        <label for="clinicSelect">診所</label>
        <select
          id="clinicSelect"
          v-model="selectedClinicId"
          :disabled="isLoading || isSendingOtp"
          @change="onClinicChange"
        >
          <option value="">— 請選擇診所 —</option>
          <option
            v-for="clinic in clinics"
            :key="clinic.id"
            :value="clinic.public_code"
          >
            {{ clinic.name }}
          </option>
        </select>
        <p v-if="clinicError" class="error-text">{{ clinicError }}</p>
      </div>

      <!-- Email 輸入 -->
      <div class="form-group">
        <label for="email">Email</label>
        <input
          id="email"
          v-model="email"
          type="email"
          placeholder="請輸入 Email"
          :disabled="!selectedClinicId || isSendingOtp"
          @keyup.enter="sendOtp"
        />
      </div>

      <!-- 發送 OTP -->
      <button
        class="btn-primary"
        :disabled="!selectedClinicId || !email || isSendingOtp"
        @click="sendOtp"
      >
        {{ isSendingOtp ? '發送中...' : '發送驗證碼' }}
      </button>

      <!-- OTP 輸入區（發送後顯示） -->
      <div v-if="otpSent" class="otp-section">
        <div class="form-group">
          <label for="otp">驗證碼</label>
          <input
            id="otp"
            v-model="otp"
            type="text"
            placeholder="請輸入 6 位數驗證碼"
            maxlength="6"
            @keyup.enter="verifyOtp"
          />
        </div>
        <button
          class="btn-secondary"
          :disabled="!otp || isVerifying"
          @click="verifyOtp"
        >
          {{ isVerifying ? '驗證中...' : '驗證登入' }}
        </button>
        <p v-if="otpError" class="error-text">{{ otpError }}</p>
        <button class="btn-resend" @click="resendOtp">重新發送驗證碼</button>
      </div>

      <!-- 全域錯誤 -->
      <p v-if="globalError" class="error-text global-error">{{ globalError }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useClinic } from '../../composables/useClinic.js';

const router = useRouter();
const { clinics, selectedClinic, isLoading, error: clinicError, getClinicCode } = useClinic();

// 狀態
const selectedClinicId = ref<string>('');
const email = ref('');
const otp = ref('');
const otpSent = ref(false);
const isSendingOtp = ref(false);
const isVerifying = ref(false);
const otpError = ref<string | null>(null);
const globalError = ref<string | null>(null);

const API_BASE = import.meta.env.VITE_API_BASE || '';

// 診所變更時清除錯誤
const onClinicChange = () => {
  globalError.value = null;
  otpError.value = null;
};

// 發送 OTP
const sendOtp = async () => {
  if (!selectedClinicId.value || !email.value) return;

  isSendingOtp.value = true;
  globalError.value = null;
  otpError.value = null;

  try {
    const response = await fetch(`${API_BASE}/api/auth/email/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.value,
        clinic_code: selectedClinicId.value,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || '發送驗證碼失敗');
    }

    otpSent.value = true;
    console.log('✅ OTP 已發送');
  } catch (err: any) {
    globalError.value = err.message;
  } finally {
    isSendingOtp.value = false;
  }
};

// 驗證 OTP
const verifyOtp = async () => {
  if (!otp.value || !email.value || !selectedClinicId.value) return;

  isVerifying.value = true;
  otpError.value = null;
  globalError.value = null;

  try {
    const response = await fetch(`${API_BASE}/api/auth/email/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.value,
        otp: otp.value,
        clinic_code: selectedClinicId.value,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || '驗證失敗');
    }

    // ✅ 登入成功
    console.log('✅ 登入成功', data);

    // 儲存 token 到 localStorage
    localStorage.setItem('auth_token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));

    // 導向首頁
    router.push('/');
  } catch (err: any) {
    otpError.value = err.message;
  } finally {
    isVerifying.value = false;
  }
};

// 重新發送 OTP
const resendOtp = () => {
  otp.value = '';
  otpSent.value = false;
  sendOtp();
};
</script>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: #f5f7fa;
}

.login-card {
  background: white;
  padding: 40px;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  width: 100%;
  max-width: 400px;
}

.login-card h1 {
  margin: 0 0 4px;
  font-size: 24px;
  color: #1a202c;
}

.subtitle {
  margin: 0 0 24px;
  color: #718096;
  font-size: 14px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 4px;
  font-size: 14px;
  font-weight: 500;
  color: #2d3748;
}

.form-group select,
.form-group input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 14px;
  transition: border-color 0.2s;
}

.form-group select:focus,
.form-group input:focus {
  outline: none;
  border-color: #4299e1;
  box-shadow: 0 0 0 3px rgba(66, 153, 225, 0.2);
}

.form-group select:disabled,
.form-group input:disabled {
  background: #f7fafc;
  cursor: not-allowed;
}

.btn-primary,
.btn-secondary {
  width: 100%;
  padding: 10px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-primary {
  background: #4299e1;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #3182ce;
}

.btn-primary:disabled {
  background: #bee3f8;
  cursor: not-allowed;
}

.btn-secondary {
  background: #48bb78;
  color: white;
  margin-top: 8px;
}

.btn-secondary:hover:not(:disabled) {
  background: #38a169;
}

.btn-secondary:disabled {
  background: #c6f6d5;
  cursor: not-allowed;
}

.btn-resend {
  background: none;
  border: none;
  color: #4299e1;
  cursor: pointer;
  font-size: 13px;
  margin-top: 8px;
  text-decoration: underline;
}

.btn-resend:hover {
  color: #2b6cb0;
}

.otp-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #e2e8f0;
}

.error-text {
  color: #e53e3e;
  font-size: 13px;
  margin-top: 4px;
}

.global-error {
  margin-top: 12px;
  padding: 8px 12px;
  background: #fed7d7;
  border-radius: 4px;
}
</style>