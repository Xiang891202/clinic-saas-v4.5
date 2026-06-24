// frontend/src/router/index.ts
import { createRouter, createWebHistory } from "vue-router";
import { getAuthStorage } from "@clinic/engine-auth";

// ========== 頁面導入 ==========
import HomePage from "../pages/HomePage.vue";
import EmailLogin from "../pages/EmailLogin.vue";

// 角色首頁
import PatientHome from "../pages/patient/PatientHome.vue";
import PatientProfile from "../pages/patient/Profile.vue";
import PatientSettings from "../pages/patient/Settings.vue";
import DoctorHome from "../pages/docker/DoctorHome.vue";
import AdminHome from "../pages/admin/AdminHome.vue";

// 病人功能
import BookingPage from "../pages/patient/BookingPage.vue";
import MyAppointmentsPage from "../pages/patient/MyAppointmentsPage.vue";

// 診所端
import ClinicLogin from "../pages/clinic/Login.vue";
import ClinicDashboard from "../pages/clinic/Dashboard.vue";
import ClinicAppointments from "../pages/clinic/Appointments.vue";
import ClinicSlots from "../pages/clinic/Slots.vue";
import ClinicServices from "../pages/clinic/Services.vue";
import ClinicPatients from "../pages/clinic/Patients.vue";

const routes = [
  { path: "/", component: HomePage },
  { path: "/email-login", component: EmailLogin },
  { path: "/clinic/login", component: ClinicLogin },

  // 角色首頁
  { path: "/patient-home", component: PatientHome, meta: { requiredRole: "patient" } },
  { path: "/patient/profile", component: PatientProfile, meta: { requiredRole: "patient", skipProfileCheck: true } },
  { path: "/patient/settings", component: PatientSettings, meta: { requiredRole: "patient" } },
  { path: "/doctor-home", component: DoctorHome, meta: { requiredRole: "doctor" } },
  { path: "/admin-home", component: AdminHome, meta: { requiredRole: "admin" } },

  // 病人功能
  { path: "/booking", component: BookingPage, meta: { requiredRole: "patient" } },
  { path: "/my-appointments", component: MyAppointmentsPage, meta: { requiredRole: "patient" } },

  // 診所功能
  { path: "/clinic/dashboard", component: ClinicDashboard, meta: { requiredRole: "clinic_admin" } },
  { path: "/clinic/appointments", component: ClinicAppointments, meta: { requiredRole: "clinic_admin" } },
  { path: "/clinic/slots", component: ClinicSlots, meta: { requiredRole: "clinic_admin" } },
  { path: "/clinic/services", component: ClinicServices, meta: { requiredRole: "clinic_admin" } },
  { path: "/clinic/patients", component: ClinicPatients, meta: { requiredRole: "clinic_admin" } },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// ============================================================
// 🛡️ 路由守衛（修正為 return 模式，不使用 next 回調）
// ============================================================
router.beforeEach((to, from) => {
  // ✅ 直接從 localStorage 讀取
  const token = localStorage.getItem("auth_token");
  const role = localStorage.getItem("auth_role") || "patient";

  // 1️⃣ 公開頁面
  const publicPages = ["/", "/email-login", "/clinic/login"];
  if (publicPages.includes(to.path)) {
    if (token) {
      const roleMap: Record<string, string> = {
        patient: "/patient-home",
        doctor: "/doctor-home",
        clinic_admin: "/clinic-dashboard",
        admin: "/admin-home",
      };
      return roleMap[role] || "/patient-home";
    }
    return true; // 允許訪問
  }

  // 2️⃣ 需要登入的頁面
  if (!token) {
    return "/";
  }

  // 3️⃣ 檢查角色權限
  const requiredRole = to.meta.requiredRole as string | undefined;
  if (requiredRole && role !== requiredRole) {
    return "/";
  }

  // 4️⃣ 檢查病人是否需補齊資料
  if (role === "patient" && to.path !== "/patient/profile") {
    const skipProfileCheck = to.meta.skipProfileCheck === true;
    if (!skipProfileCheck) {
      const userName = localStorage.getItem("auth_user_name");
      if (userName === "訪客" || userName === "使用者" || !userName) {
        return "/patient/profile";
      }
    }
  }

  return true; // 允許訪問
});

export default router;