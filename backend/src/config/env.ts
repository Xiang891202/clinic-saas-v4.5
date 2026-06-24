// backend/src/config/env.ts
import dotenv from "dotenv";

dotenv.config();

// ========== 環境變數驗證 ==========
const requiredEnv = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "REDIS_URL",
  "JWT_SECRET",
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`❌ 缺少環境變數: ${key}`);
    process.exit(1);
  }
}

// ========== 導出環境變數 ==========
export const env = {
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  redisUrl: process.env.REDIS_URL!,
  jwtSecret: process.env.JWT_SECRET!,
  smtpHost: process.env.SMTP_HOST,
  smtpPort: process.env.SMTP_PORT,
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS,
  lineChannelSecret: process.env.LINE_CHANNEL_SECRET,
  lineChannelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  lineLoginChannelId: process.env.LINE_LOGIN_CHANNEL_ID,
  lineLoginChannelSecret: process.env.LINE_LOGIN_CHANNEL_SECRET,
  liffId: process.env.LIFF_ID,
};