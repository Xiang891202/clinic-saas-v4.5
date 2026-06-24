// backend/src/index.ts
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { createClient } from "@supabase/supabase-js";
import { Redis } from "ioredis";
import { BookingEngine } from "../../packages/engine-booking/src/index.js";
import { bookingRoutes } from "./routes/booking.js";
import { clinicRoutes } from "./routes/clinic.js";
import { authRoutes } from "./routes/auth.js";
import { healthRoutes } from "./routes/health.js";
import { EmailAuthService } from "./services/emailAuth.js";
import { env } from "./config/env.js";
import { patientRoutes } from "./routes/patient.js";



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

// ========== 註冊 Middleware ==========
fastify.register(cors, { origin: true, credentials: true });
fastify.register(helmet);
fastify.register(rateLimit, { max: 100, timeWindow: "1 minute" });

fastify.decorate("supabase", supabase);

// ========== 註冊路由 ==========
fastify.register(async (instance) => {
  await healthRoutes(instance, supabase, redis);
});

fastify.register(async (instance) => {
  await authRoutes(instance, emailAuthService);
});

fastify.register(async (instance) => {
  await bookingRoutes(instance, bookingEngine);
});

fastify.register(async (instance) => {
  await clinicRoutes(instance);
});

fastify.register(async (instance) => {
  await patientRoutes(instance);
});

// ========== 啟動伺服器 ==========
fastify.listen({ port: 3000, host: "0.0.0.0" }, (err) => {
  if (err) throw err;
  console.log("🚀 後端伺服器 (v4.6 Phase 1) 已啟動 -> http://localhost:3000");
  console.log("📌 測試時段查詢: http://localhost:3000/api/booking/slots?date=2026-07-01");
  console.log("📌 建立預約: POST http://localhost:3000/api/booking/appointments");
});