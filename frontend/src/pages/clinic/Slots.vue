<template>
  <div style="padding: 20px; font-family: Arial, sans-serif; max-width: 1200px; margin: 0 auto;">
    <!-- 標題列 -->
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <div style="display: flex; align-items: center; gap: 16px;">
        <h2>🕐 時段管理</h2>
        <button @click="toggleView" style="padding: 4px 12px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;">
          {{ viewMode === 'month' ? '切換至年' : '切換至月' }}
        </button>
      </div>
      <button @click="logout" style="padding: 8px 16px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">登出</button>
    </div>

    <!-- 導航列 -->
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
      <button @click="prevPeriod" style="padding: 6px 16px; background: #e0e0e0; border: none; border-radius: 4px; cursor: pointer;">◀</button>
      <span style="font-size: 20px; font-weight: bold;">{{ displayTitle }}</span>
      <button @click="nextPeriod" style="padding: 6px 16px; background: #e0e0e0; border: none; border-radius: 4px; cursor: pointer;">▶</button>
    </div>

    <!-- 月曆 -->
    <div v-if="viewMode === 'month'">
      <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <thead>
          <tr style="background: #f5f5f5;">
            <th v-for="day in weekDays" :key="day" style="padding: 10px; text-align: center; font-weight: bold;">{{ day }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(week, weekIndex) in calendarData" :key="weekIndex">
            <td v-for="(day, dayIndex) in week" :key="dayIndex"
                @click="selectDate(day.date)"
                style="padding: 4px; border: 1px solid #eee; vertical-align: top; height: 80px; cursor: pointer;"
                :style="getDayStyle(day)">
              <div style="display: flex; flex-direction: column; height: 100%;">
                <span style="font-weight: bold; font-size: 14px;">{{ day.day }}</span>
                <div style="font-size: 11px; flex: 1; overflow: hidden; line-height: 1.4; margin-top: 2px;">
                  <div v-for="(slot, idx) in day.slots" :key="idx" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"
                       :title="`${slot.doctor_name} - ${slot.service_name} (${slot.max_capacity - slot.booked_count}人)`">
                    <span style="background: #e3f2fd; padding: 1px 4px; border-radius: 3px; font-size: 10px;">
                      {{ slot.start_time }} {{ slot.doctor_name }} {{ slot.service_name }}
                    </span>
                  </div>
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 年曆 -->
    <div v-else style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;">
      <div v-for="month in yearData" :key="month.month"
           style="background: white; border-radius: 8px; padding: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); cursor: pointer;"
           @click="switchToMonth(month.monthIndex)">
        <div style="font-weight: bold; text-align: center; margin-bottom: 8px;">{{ month.monthName }}</div>
        <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px;">
          <div v-for="d in month.days" :key="d.date"
               style="text-align: center; font-size: 12px; padding: 2px; border-radius: 3px;"
               :style="d.hasSlot ? { background: '#e3f2fd', fontWeight: 'bold' } : {}">
            {{ d.day }}
          </div>
        </div>
      </div>
    </div>

    <!-- 點擊日期後展開的時段詳情 -->
    <div v-if="selectedDate" style="margin-top: 24px; background: #f9f9f9; border-radius: 8px; padding: 16px; border: 1px solid #ddd;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <h3 style="margin: 0;">📅 {{ selectedDate }} 的時段</h3>
        <button @click="selectedDate = null" style="padding: 4px 12px; background: #999; color: white; border: none; border-radius: 4px; cursor: pointer;">關閉</button>
      </div>

      <!-- 新增時段表單 -->
      <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; align-items: end;">
        <div>
          <label style="font-size: 12px; display: block;">醫師</label>
          <select v-model="newSlot.doctor_id" style="padding: 6px 8px; border: 1px solid #ccc; border-radius: 4px; min-width: 120px;">
            <option value="">選擇醫師</option>
            <option v-for="d in doctors" :key="d.id" :value="d.id">{{ d.name }}</option>
          </select>
        </div>
        <div>
          <label style="font-size: 12px; display: block;">服務</label>
          <select v-model="newSlot.service_id" style="padding: 6px 8px; border: 1px solid #ccc; border-radius: 4px; min-width: 120px;">
            <option value="">選擇服務</option>
            <option v-for="s in services" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
        </div>
        <div>
          <label style="font-size: 12px; display: block;">開始</label>
          <input type="time" v-model="newSlot.start_time" style="padding: 6px 8px; border: 1px solid #ccc; border-radius: 4px;" />
        </div>
        <div>
          <label style="font-size: 12px; display: block;">結束</label>
          <input type="time" v-model="newSlot.end_time" style="padding: 6px 8px; border: 1px solid #ccc; border-radius: 4px;" />
        </div>
        <div>
          <label style="font-size: 12px; display: block;">容量</label>
          <input type="number" v-model="newSlot.max_capacity" style="padding: 6px 8px; border: 1px solid #ccc; border-radius: 4px; width: 60px;" />
        </div>
        <button @click="addSlot" style="padding: 6px 16px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">+ 新增</button>
      </div>

      <!-- 該天時段列表 -->
      <div v-if="selectedDateSlots.length === 0" style="color: #999; text-align: center; padding: 20px 0;">該天尚無時段</div>
      <div v-else style="display: flex; flex-wrap: wrap; gap: 8px;">
        <div v-for="slot in selectedDateSlots" :key="slot.id"
             style="background: white; border-radius: 6px; padding: 10px 14px; border: 1px solid #e0e0e0; display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
          <span style="font-weight: bold;">{{ slot.start_time }} - {{ slot.end_time }}</span>
          <span>👨‍⚕️ {{ slot.doctors?.name || '未知醫師' }}</span>
          <span>📋 {{ slot.services?.name || '未知服務' }}</span>
          <span>👤 {{ slot.max_capacity - slot.booked_count }}/{{ slot.max_capacity }}</span>
          <span :style="slot.status === 'open' ? { color: '#4CAF50' } : { color: '#f44336' }">
            {{ slot.status === 'open' ? '開放' : '關閉' }}
          </span>
          <button @click="deleteSlot(slot.id)" style="padding: 2px 10px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">刪除</button>
        </div>
      </div>
    </div>

    <div style="margin-top: 16px;">
      <router-link to="/clinic/dashboard" style="color: #2196F3;">← 回儀表板</router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { apiFetch } from "../../api/index";

const router = useRouter();
const loading = ref(false);
const viewMode = ref<'month' | 'year'>('month');
const currentDate = ref(new Date());
const selectedDate = ref<string | null>(null);

const slots = ref<any[]>([]);
const doctors = ref<any[]>([]);
const services = ref<any[]>([]);
const selectedDateSlots = ref<any[]>([]);

const newSlot = ref({
  doctor_id: "",
  service_id: "",
  start_time: "",
  end_time: "",
  max_capacity: 1,
});

const weekDays = ["日", "一", "二", "三", "四", "五", "六"];
const monthNames = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];

const displayTitle = computed(() => {
  const y = currentDate.value.getFullYear();
  const m = currentDate.value.getMonth();
  if (viewMode.value === 'month') {
    return `${y}年 ${monthNames[m]}`;
  }
  return `${y}年`;
});

const toggleView = () => {
  viewMode.value = viewMode.value === 'month' ? 'year' : 'month';
};

const prevPeriod = () => {
  if (viewMode.value === 'month') {
    currentDate.value = new Date(currentDate.value.getFullYear(), currentDate.value.getMonth() - 1, 1);
  } else {
    currentDate.value = new Date(currentDate.value.getFullYear() - 1, currentDate.value.getMonth(), 1);
  }
  loadSlots();
};

const nextPeriod = () => {
  if (viewMode.value === 'month') {
    currentDate.value = new Date(currentDate.value.getFullYear(), currentDate.value.getMonth() + 1, 1);
  } else {
    currentDate.value = new Date(currentDate.value.getFullYear() + 1, currentDate.value.getMonth(), 1);
  }
  loadSlots();
};

const switchToMonth = (monthIndex: number) => {
  currentDate.value.setMonth(monthIndex);
  viewMode.value = 'month';
  loadSlots();
};

const loadSlots = async () => {
  const tenantId = localStorage.getItem("clinic_tenant_id");
  if (!tenantId) {
    console.warn("⚠️ 缺少 tenant-id，跳转登录");
    router.push("/clinic/login");
    return;
  }

  loading.value = true;
  try {
    const year = currentDate.value.getFullYear();
    const month = currentDate.value.getMonth();
    const res = await apiFetch(`/api/clinic/slots?month=${month + 1}&year=${year}`);
    const data = await res.json();
    if (res.ok) {
      slots.value = data.data || [];
      if (selectedDate.value) {
        selectedDateSlots.value = slots.value.filter(s => s.slot_date === selectedDate.value);
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    loading.value = false;
  }
};

const loadDoctorsAndServices = async () => {
  const tenantId = localStorage.getItem("clinic_tenant_id");
  if (!tenantId) return;

  try {
    const [docRes, svcRes] = await Promise.all([
      apiFetch("/api/clinic/doctors"),
      apiFetch("/api/clinic/services"),
    ]);
    const docData = await docRes.json();
    const svcData = await svcRes.json();
    if (docRes.ok) doctors.value = docData.data || [];
    if (svcRes.ok) services.value = svcData.data || [];
  } catch (err) {
    console.error(err);
  }
};

// ========== 日曆資料計算（月） ==========
const calendarData = computed(() => {
  const year = currentDate.value.getFullYear();
  const month = currentDate.value.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const slotMap = new Map<string, any[]>();
  slots.value.forEach(s => {
    const key = s.slot_date;
    if (!slotMap.has(key)) slotMap.set(key, []);
    slotMap.get(key)!.push(s);
  });

  for (const [key, arr] of slotMap) {
    arr.sort((a, b) => a.start_time.localeCompare(b.start_time));
  }

  const weeks: any[][] = [];
  let currentWeek: any[] = [];

  for (let i = 0; i < firstDay; i++) {
    currentWeek.push({ day: "", date: null, isCurrentMonth: false, slots: [] });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const daySlots = slotMap.get(dateStr) || [];
    const isToday = dateStr === new Date().toISOString().split('T')[0];

    currentWeek.push({
      day: d,
      date: dateStr,
      isCurrentMonth: true,
      isToday,
      slots: daySlots,
      slotCount: daySlots.length,
    });

    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push({ day: "", date: null, isCurrentMonth: false, slots: [] });
    }
    weeks.push(currentWeek);
  }

  return weeks;
});

// ========== 年曆資料 ==========
const yearData = computed(() => {
  const year = currentDate.value.getFullYear();
  const result = [];

  for (let m = 0; m < 12; m++) {
    const daysInMonth = new Date(year, m + 1, 0).getDate();
    const days = [];
    const slotMap = new Map<string, any[]>();

    const monthSlots = slots.value.filter(s => {
      const d = new Date(s.slot_date);
      return d.getFullYear() === year && d.getMonth() === m;
    });
    monthSlots.forEach(s => {
      const key = s.slot_date;
      if (!slotMap.has(key)) slotMap.set(key, []);
      slotMap.get(key)!.push(s);
    });

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({
        day: d,
        date: dateStr,
        hasSlot: slotMap.has(dateStr) && slotMap.get(dateStr)!.length > 0,
      });
    }

    result.push({
      month: m,
      monthIndex: m,
      monthName: monthNames[m],
      days,
    });
  }

  return result;
});

// ========== 日期選取 ==========
const selectDate = (date: string | null) => {
  if (!date) return;
  selectedDate.value = date;
  selectedDateSlots.value = slots.value.filter(s => s.slot_date === date);
};

// ========== 取得日期樣式 ==========
const getDayStyle = (day: any) => {
  const style: any = {};
  if (day.isToday) {
    style.border = '2px solid #2196F3';
  }
  if (day.slotCount > 0) {
    style.backgroundColor = '#f0f7ff';
  }
  if (!day.isCurrentMonth) {
    style.color = '#ccc';
  }
  return style;
};

// ========== 新增時段 ==========
const addSlot = async () => {
  if (!selectedDate.value) return;
  if (!newSlot.value.doctor_id || !newSlot.value.service_id || !newSlot.value.start_time || !newSlot.value.end_time) {
    alert("請填寫完整資料");
    return;
  }

  const res = await apiFetch("/api/clinic/slots/date", {
    method: "POST",
    body: JSON.stringify({
      slot_date: selectedDate.value,
      start_time: newSlot.value.start_time,
      end_time: newSlot.value.end_time,
      max_capacity: Number(newSlot.value.max_capacity) || 1,
      doctor_id: newSlot.value.doctor_id,
      service_id: newSlot.value.service_id,
    }),
  });
  const data = await res.json();
  if (res.ok) {
    slots.value.push(data.data);
    selectedDateSlots.value.push(data.data);
    newSlot.value = { doctor_id: "", service_id: "", start_time: "", end_time: "", max_capacity: 1 };
    alert("時段新增成功");
  } else {
    alert(data.error || "新增失敗");
  }
};

// ========== 刪除時段 ==========
const deleteSlot = async (id: string) => {
  if (!confirm("確定刪除此時段？若有預約將改為關閉")) return;
  const res = await apiFetch(`/api/clinic/slots/date/${id}`, {
    method: "DELETE",
  });
  const data = await res.json();
  if (res.ok) {
    slots.value = slots.value.filter(s => s.id !== id);
    selectedDateSlots.value = selectedDateSlots.value.filter(s => s.id !== id);
    alert(data.message || "操作成功");
  } else {
    alert(data.error || "操作失敗");
  }
};

// ========== 登出 ==========
const logout = () => {
  localStorage.removeItem("clinic_token");
  localStorage.removeItem("clinic_tenant_id");
  router.push("/clinic/login");
};

// ========== 頁面激活刷新 ==========
const handleVisibilityChange = () => {
  if (document.visibilityState === 'visible') {
    console.log('🔄 页面激活，重新加载时段数据');
    loadSlots();
    loadDoctorsAndServices();
  }
};

// ========== 初始化 ==========
onMounted(async () => {
  await Promise.all([loadSlots(), loadDoctorsAndServices()]);
  document.addEventListener('visibilitychange', handleVisibilityChange);
});

onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange);
});
</script>