// frontend/src/router/index.ts
import { createRouter, createWebHistory } from "vue-router";

// ========== 頁面導入 ==========
import HomePage from "../pages/HomePage.vue";
import EmailLogin from "../pages/EmailLogin.vue";

// 角色首頁
import PatientHome from "../pages/patient/PatientHome.vue";
import PatientProfile from "../pages/patient/Profile.vue";
import PatientSettings from "../pages/patient/Settings.vue";
import DoctorHome from "../pages/docker/DoctorHome.vue";

//管理員
import AdminHome from "../pages/admin/AdminHome.vue";
import AdminLogin from "../pages/admin/AdminLogin.vue";
import AdminTenants from "../pages/admin/Tenants.vue";
import AdminContracts from "../pages/admin/Contracts.vue";
import AdminMonitor from "../pages/admin/Monitor.vue";

// 病人功能
import BookingPage from "../pages/patient/BookingPage.vue";
import MyAppointmentsPage from "../pages/patient/MyAppointmentsPage.vue";
import BookingEditPage from "../pages/patient/BookingEditPage.vue";

// 診所端
import ClinicLogin from "../pages/clinic/Login.vue";
import ClinicDashboard from "../pages/clinic/Dashboard.vue";
import ClinicAppointments from "../pages/clinic/Appointments.vue";
import ClinicSlots from "../pages/clinic/Slots.vue";
import ClinicServices from "../pages/clinic/Services.vue";
import ClinicPatients from "../pages/clinic/Patients.vue";
import ClinicNotificationLogs from "../pages/clinic/NotificationLogs.vue"

const routes = [
  { path: "/", component: HomePage },
  { path: "/email-login", component: EmailLogin },
  { path: "/clinic/login", component: ClinicLogin },

  // 角色首頁
  { path: "/patient-home", component: PatientHome, meta: { requiredRole: "patient" } },
  { path: "/patient/profile", component: PatientProfile, meta: { requiredRole: "patient", skipProfileCheck: true } },
  { path: "/patient/settings", component: PatientSettings, meta: { requiredRole: "patient" } },
  { path: "/doctor-home", component: DoctorHome, meta: { requiredRole: "doctor" } },

  //管理員
  { path: "/admin-home", component: AdminHome, meta: { requiredRole: "admin" } },
  { path: "/admin/login", component: AdminLogin },
  { path: "/admin/tenants", component: AdminTenants, meta: { requiredRole: "admin" } },
  { path: "/admin/contracts", component: AdminContracts, meta: { requiredRole: "admin" } },
  { path: "/admin/monitor", component: AdminMonitor, meta: { requiredRole: "admin" } },

  // 病人功能
  { path: "/booking", component: BookingPage, meta: { requiredRole: "patient" } },
  { path: "/my-appointments", component: MyAppointmentsPage, meta: { requiredRole: "patient" } },
  { path: "/booking/:id/edit", component: BookingEditPage, meta: { requiredRole: "patient" } },

  // 診所功能
  { path: "/clinic/dashboard", component: ClinicDashboard, meta: { requiredRole: "clinic_admin" } },
  { path: "/clinic/appointments", component: ClinicAppointments, meta: { requiredRole: "clinic_admin" } },
  { path: "/clinic/slots", component: ClinicSlots, meta: { requiredRole: "clinic_admin" } },
  { path: "/clinic/services", component: ClinicServices, meta: { requiredRole: "clinic_admin" } },
  { path: "/clinic/patients", component: ClinicPatients, meta: { requiredRole: "clinic_admin" } },
  { path: "/clinic/notificationLogs", component: ClinicNotificationLogs, meta: { requiredRole: "clinic_admin" } },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// ============================================================
// 🛡️ 路由守衛
// ============================================================
router.beforeEach((to, from) => {
  const token = localStorage.getItem("auth_token") || localStorage.getItem("clinic_token");
  const role = localStorage.getItem("auth_role") || "patient";

  // 公開頁面
  const publicPages = ["/", "/email-login", "/clinic/login", "/admin/login"];
  if (publicPages.includes(to.path)) {
    if (token) {
      const roleMap: Record<string, string> = {
        patient: "/patient-home",
        doctor: "/doctor-home",
        clinic_admin: "/clinic/dashboard",   // ✅ 正確路徑
        admin: "/admin-home",
      };
      return roleMap[role] || "/patient-home";
    }
    return true;
  }

  // 需要登入的頁面
  if (!token) {
    return "/";
  }

  // 檢查角色權限
  const requiredRole = to.meta.requiredRole as string | undefined;
  if (requiredRole && role !== requiredRole) {
    return "/";
  }

  // 檢查病人是否需補齊資料
  if (role === "patient" && to.path !== "/patient/profile") {
    const skipProfileCheck = to.meta.skipProfileCheck === true;
    if (!skipProfileCheck) {
      const userName = localStorage.getItem("auth_user_name");
      if (userName === "訪客" || userName === "使用者" || !userName) {
        return "/patient/profile";
      }
    }
  }

  return true;
});

export default router;