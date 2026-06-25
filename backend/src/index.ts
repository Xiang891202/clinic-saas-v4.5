// backend/src/index.ts
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { createClient } from "@supabase/supabase-js";
import { Redis } from "ioredis";
import { BookingEngine } from "../../packages/engine-booking/src/index.js";
import { authRoutes } from "./routes/auth.js";
import { healthRoutes } from "./routes/health.js";
import { EmailAuthService } from "./services/emailAuth.js";
import { env } from "./config/env.js";
import { patientRoutes } from "./routes/patient.js";
import { adminMonitorRoutes } from "./routes/admin/monitor.js";

// 导入拆分后的路由
import {
  clinicAuthRoutes,
  clinicAppointmentRoutes,
  clinicDoctorRoutes,
  clinicPatientRoutes,
  clinicServiceRoutes,
  clinicSlotRoutes,
} from "./routes/clinic/index.js";

import {
  bookingSlotRoutes,
  bookingAppointmentRoutes,
} from "./routes/booking/index.js";

import {
  adminTenantRoutes,
  adminContractRoutes,
} from "./routes/admin/index.js";

import { adminAuthRoutes } from "./routes/admin/auth.js";
import { slotGenerationWorker } from "./workers/slotGenerationWorker.js";
import { scheduleSlotGeneration } from "./cron/slotGenerator.js";

// ========== 初始化連線 ==========
export const supabase = createClient(
  env.supabaseUrl,
  env.supabaseServiceRoleKey
);

export const redis = new Redis(env.redisUrl, {
  maxRetriesPerRequest: null,
});

// ========== 初始化服務 ==========
const emailAuthService = new EmailAuthService(
  supabase,
  redis,
  env.jwtSecret,
  {
    host: env.smtpHost || "",
    port: Number(env.smtpPort) || 587,
    user: env.smtpUser || "",
    pass: env.smtpPass || "",
  }
);

const bookingEngine = new BookingEngine(supabase, redis);

// ========== 建立 Fastify 伺服器 ==========
const fastify = Fastify({ logger: true });

// 挂载 bookingEngine 以便路由中使用
fastify.decorate("bookingEngine", bookingEngine);
fastify.decorate("supabase", supabase);
fastify.decorate("redis", redis);   // ✅ 添加这一行

// ========== 註冊 Middleware ==========
fastify.register(cors, { origin: true, credentials: true });
fastify.register(helmet);
fastify.register(rateLimit, { max: 100, timeWindow: "1 minute" });

// ========== 註冊路由 ==========

// 健康检查
fastify.register(async (instance) => {
  await healthRoutes(instance, supabase, redis);
});

// 病人 OTP 认证
fastify.register(async (instance) => {
  await authRoutes(instance, emailAuthService);
});

// 预约相关（拆分后）
fastify.register(async (instance) => {
  await bookingSlotRoutes(instance);
});

fastify.register(async (instance) => {
  await bookingAppointmentRoutes(instance);
});

// 病人管理
fastify.register(async (instance) => {
  await patientRoutes(instance);
});

// 诊所管理（拆分后）
fastify.register(async (instance) => {
  await clinicAuthRoutes(instance);
});

fastify.register(async (instance) => {
  await clinicAppointmentRoutes(instance);
});

fastify.register(async (instance) => {
  await clinicDoctorRoutes(instance);
});

fastify.register(async (instance) => {
  await clinicPatientRoutes(instance);
});

fastify.register(async (instance) => {
  await clinicServiceRoutes(instance);
});

fastify.register(async (instance) => {
  await clinicSlotRoutes(instance);
});

// 管理监控
fastify.register(async (instance) => {
  await adminMonitorRoutes(instance);
});

fastify.register(async (instance) => {
  await adminTenantRoutes(instance);
});

fastify.register(async (instance) => {
  await adminContractRoutes(instance);
});

fastify.register(async (instance) => {
  await adminAuthRoutes(instance);
});

// ========== 啟動伺服器 ==========
fastify.listen({ port: 3000, host: "0.0.0.0" }, (err) => {
  if (err) throw err;
  console.log("🚀 後端伺服器 (v4.6 Phase 1) 已啟動 -> http://localhost:3000");
  console.log("📌 測試時段查詢: http://localhost:3000/api/booking/slots?date=2026-07-01");
  console.log("📌 建立預約: POST http://localhost:3000/api/booking/appointments");
});