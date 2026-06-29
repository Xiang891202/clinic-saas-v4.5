// backend/src/index.ts
import './config/bullmq.js';  // 放在最顶部（在所有其他导入之前）
import { redis, redisConfig } from './config/redis.js';
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { supabase } from "./config/supabase.js";
import { BookingEngine } from "../../packages/engine-booking/src/index.ts";
import { authRoutes } from "./routes/auth.js";
import { healthRoutes } from "./routes/health.js";
import { EmailAuthService } from "./services/emailAuth.js";
import { env } from "./config/env.js";
import { patientRoutes } from "./routes/patient.js";
import { adminMonitorRoutes } from "./routes/admin/monitor.js";
import { adminPolicyRoutes } from "./routes/admin/policy.routes.js";
import { DegradationMonitor } from "./monitors/degradationMonitor.js";
import { QueueMonitor } from "./monitors/queueMonitor.js";
import { NotificationService } from './services/notificationService.js';
import { publicTenantRoutes } from "./routes/public/tenant.js";

// ========== 导入 Policy Engine ==========
import { PolicyEngine, ActionExecutor } from "../../packages/engine-policy/src/index.ts";

import { BillingEngine } from "../../packages/engine-billing/src/index.ts";
import { PaymentGatewayFactory } from "../../packages/shared/src/payment/index.ts";
import { paymentRoutes } from "./routes/payment.js";

// 导入拆分后的路由
import {
  clinicAuthRoutes,
  clinicAppointmentRoutes,
  clinicDoctorRoutes,
  clinicPatientRoutes,
  clinicServiceRoutes,
  clinicSlotRoutes,
} from "./routes/clinic/index.js";

import { clinicNotificationLogsRoutes } from "./routes/clinic/notification-logs.js";
import { clinicBusinessHoursRoutes } from "./routes/clinic/business-hours.js";
import { clinicNotificationRoutes } from "./routes/clinic/notification.js";

import {
  bookingSlotRoutes,
  bookingAppointmentRoutes,
} from "./routes/booking/index.js";

import {
  adminTenantRoutes,
  adminContractRoutes,
} from "./routes/admin/index.js";

import { adminAuthRoutes } from "./routes/admin/auth.js";
import { adminEmailTestRoutes } from "./routes/admin/email-test.js";

// ========== 初始化連線 ==========
// export const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);
export { supabase } from "./config/supabase.js";

// ========== 初始化 Policy Engine（必須在 EmailAuthService 之前） ==========
const policyEngine = new PolicyEngine();

// 创建 Action Executor（注入依赖）
const executor = new ActionExecutor({
  redis,
  supabase,
  sendEmail: async (to: string, subject: string, body: string) => {
    const transporter = (emailAuthService as any).transporter;
    if (transporter) {
      await transporter.sendMail({
        from: env.smtpUser,
        to,
        subject,
        text: body,
      });
    } else {
      console.warn('⚠️ SMTP 未配置，跳过邮件发送');
    }
  },
  log: (level: string, message: string, metadata?: any) => {
    const logMethod = level === 'error' ? console.error :
                       level === 'warn' ? console.warn :
                       console.log;
    logMethod(`[Policy] ${message}`, metadata || '');
  },
});

console.log("✅ Policy Engine 已初始化");
console.log("✅ Action Executor 已就绪");

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
  },
  policyEngine  // ✅ B-1: 傳入 PolicyEngine
);

const bookingEngine = new BookingEngine(supabase, redis);

// 创建通知服务
const notificationService = new NotificationService(supabase);

// 建立金流閘道工廠（暫時使用 Stripe，待補金鑰）
// 改為直接使用銀行轉帳（無需金鑰）：
import { ManualBankTransferAdapter } from "../../packages/shared/src/payment/ManualBankTransferAdapter.js";
const paymentGateway = new ManualBankTransferAdapter();
const billingEngine = new BillingEngine(supabase, paymentGateway);

// ========== ✅ 在 redis 就绪后创建队列和 Worker ==========
import { createSlotGenerationWorker } from "./workers/slotGenerationWorker.js";
import { scheduleSlotGeneration } from "./cron/slotGenerator.js";

const slotWorker = createSlotGenerationWorker(redisConfig);
scheduleSlotGeneration().catch(err => {
  console.error("❌ 时段生成调度启动失败:", err);
});

// ========== ✅ 启动 Degradation Monitor（必须在 Policy Engine 之后） ==========
const degradationMonitor = new DegradationMonitor(
  redis,
  supabase,
  policyEngine,
  executor,
  60 // 每 60 秒检查一次
);

degradationMonitor.start().catch((err) => {
  console.error("❌ Degradation Monitor 启动失败:", err);
});

console.log("✅ Degradation Monitor 已调度");

// ========== ✅ 启动 Queue Monitor（必须在 Policy Engine 之后） ==========
const queueMonitor = new QueueMonitor(
   { instance: redis, config: redisConfig },
   policyEngine,
   executor,
   [
     { queueName: "notification.queue", threshold: 30, criticalThreshold: 50, checkInterval: 30 },
     { queueName: "billing.queue", threshold: 20, criticalThreshold: 40, checkInterval: 60 },
     { queueName: "slot-generation", threshold: 10, criticalThreshold: 20, checkInterval: 60 },
   ]
 );

 queueMonitor.start().catch((err) => {
   console.error("❌ Queue Monitor 启动失败:", err);
 });

 console.log("✅ Queue Monitor 已调度");

// ========== 建立 Fastify 伺服器 ==========
const fastify = Fastify({ logger: true });

// 挂载服务到 fastify 实例
fastify.decorate("bookingEngine", bookingEngine);
fastify.decorate("supabase", supabase);
fastify.decorate("redis", redis);
fastify.decorate("policyEngine", policyEngine);
fastify.decorate("executor", executor);
fastify.decorate("queueMonitor", queueMonitor);
fastify.decorate('notificationService', notificationService);
fastify.decorate("billingEngine", billingEngine);

// ========== 註冊 Middleware ==========
fastify.register(cors, { origin: true, credentials: true });
fastify.register(helmet);
fastify.register(rateLimit, { 
  max: 100, 
  timeWindow: "1 minute",
  redis: redis
});

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

// ✅ B-6: 公開診所列表 API
fastify.register(async (instance) => {
  await publicTenantRoutes(instance);
});

// 病人管理
fastify.register(async (instance) => {
  await patientRoutes(instance);
});

// 诊所管理（拆分后）
fastify.register(async (instance) => {
  await clinicAuthRoutes(instance, emailAuthService);  // ✅ 傳入 emailAuthService
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

fastify.register(async (instance) => {
  await clinicNotificationLogsRoutes(instance);
});

fastify.register(async (instance) => {
  await clinicBusinessHoursRoutes(instance);
});

fastify.register(async (instance) => {
  await clinicNotificationRoutes(instance);
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

fastify.register(async (instance) => {
  await adminPolicyRoutes(instance);
});

fastify.register(async (instance) => {
  await adminEmailTestRoutes(instance);
});

fastify.register(async (instance) => {
  await paymentRoutes(instance);
});

// ========== 啟動伺服器 ==========
fastify.listen({ port: 3000, host: "0.0.0.0" }, (err) => {
  if (err) throw err;
  console.log("🚀 後端伺服器 (v4.6 Phase 2) 已啟動 -> http://localhost:3000");
  console.log("📌 Policy Engine API: http://localhost:3000/api/admin/policy/evaluate");
  console.log("📌 降级状态: http://localhost:3000/api/admin/policy/degraded-services");
  console.log("📌 告警历史: http://localhost:3000/api/admin/policy/alerts");
  console.log("📌 測試時段查詢: http://localhost:3000/api/booking/slots?date=2026-07-01");
  console.log("📌 建立預約: POST http://localhost:3000/api/booking/appointments");
  console.log("📌 公開診所列表: GET http://localhost:3000/api/public/clinics"); // ✅ B-6
});