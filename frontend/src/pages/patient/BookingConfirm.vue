<!-- frontend/src/pages/patient/BookingConfirm.vue -->
<template>
  <div v-if="booking.requiresDeposit">
    <p>訂金金額：{{ booking.depositAmount }} 元</p>
    <button @click="payDeposit">支付訂金</button>
  </div>
</template>

<script setup>
const payDeposit = async () => {
  const res = await fetch('/api/payment/deposit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bookingId: bookingId.value,
      amount: depositAmount.value,
    }),
  });
  const data = await res.json();
  if (data.success) {
    // 跳轉至金流付款頁面
    window.location.href = data.data.paymentUrl;
  }
};
</script>