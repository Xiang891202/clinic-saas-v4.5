// backend/src/config/env.ts
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// 如果使用 ES Module，需获取 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 项目根目录（假设 env.ts 在 backend/src/config/ 下）
const rootDir = path.resolve(__dirname, "../../../");
const envPath = path.join(rootDir, ".env");

dotenv.config({ path: envPath });

// 可选：若仍未加载，尝试默认（兼容）
if (!process.env.REDIS_URL) {
  dotenv.config();
}

// 验证必需变量
const requiredEnv = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "REDIS_URL", "JWT_SECRET"];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`❌ 缺少環境變數: ${key}`);
    process.exit(1);
  }
}

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