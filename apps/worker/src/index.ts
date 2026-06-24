import { Worker, Queue } from "bullmq";
import Redis from "ioredis";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import path from "path";

// 從專案根目錄載入 .env
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

// ========== 初始化 Redis（設定 maxRetriesPerRequest: null） ==========
const redis = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
});

// ========== 初始化 Supabase ==========
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ========== 初始化 Email Transporter ==========
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// ========== Queue 定義與匯出 ==========
export const notificationQueue = new Queue("notification.queue", {
  connection: redis,
});

// ========== Worker 主要邏輯 ==========
async function startWorker() {
  let lineClient: any = null;

  // 動態載入 LINE（若有 Token）
  if (process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    try {
      // ✅ 修正：LINE v8+ 必須使用 messagingApi 模組
      const lineModule = await import("@line/bot-sdk");
      lineClient = new lineModule.messagingApi.MessagingApiClient({
        channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
      });
      console.log("✅ LINE 已啟用");
    } catch (err) {
      console.warn("⚠️ LINE 初始化失敗，僅使用 Email 通知", err);
    }
  } else {
    console.warn("⚠️ 未設定 LINE Token，僅使用 Email 通知");
  }

  const worker = new Worker(
    "notification.queue",
    async (job) => {
      const { type, booking_id } = job.data;
      console.log(`📩 處理通知: ${type}, 預約 ${booking_id}`);

      // 🛡️ 防禦性處理：跳過測試 UUID 字串，避免資料庫噴 22P02 語法錯誤
      if (booking_id === "test-uuid-placeholder") {
        console.log("🧪 收到測試任務預覽，跳過資料庫查詢與發送");
        return;
      }

      // 查詢預約詳細資料
      const { data: booking, error } = await supabase
        .from("booking_events")
        .select(`
          *,
          patients ( line_user_id, telecom_email, name_given, name_family ),
          slot_instances ( slot_date, start_time, end_time ),
          doctors ( name ),
          services ( name )
        `)
        .eq("id", booking_id)
        .single();

      if (error || !booking) {
        console.error(`❌ 預約 ${booking_id} 查詢失敗:`, error);
        return;
      }

      const patient = booking.patients;
      const slot = booking.slot_instances;

      const statusMap = {
        created: "預約成功",
        modified: "預約已修改",
        cancelled: "預約已取消",
      };
      const subject = statusMap[type as keyof typeof statusMap] || "預約通知";

      const text = `
親愛的 ${patient.name_family}${patient.name_given} 您好：

您的預約已${subject}：
- 服務：${booking.services?.name || "未知服務"}
- 醫師：${booking.doctors?.name || "未知醫師"}
- 日期：${slot?.slot_date}
- 時間：${slot?.start_time} - ${slot?.end_time}

如需修改或取消，請登入系統操作。

診所敬上
      `;

      // 發送 Email
      if (patient.telecom_email) {
        try {
          await transporter.sendMail({
            from: process.env.SMTP_USER,
            to: patient.telecom_email,
            subject: `[診所系統] ${subject}`,
            text: text,
          });
          console.log(`📧 Email 已發送至 ${patient.telecom_email}`);
          await logNotification(booking_id, "email", "sent");
        } catch (err) {
          console.error(`❌ Email 發送失敗:`, err);
          await logNotification(booking_id, "email", "failed", { error: String(err) });
        }
      } else {
        console.warn(`⚠️ 病人 ${booking.patient_id} 無 Email，跳過通知`);
      }

      // 發送 LINE
      if (lineClient && patient.line_user_id) {
        try {
          // ✅ 修正：LINE v8+ 的 pushMessage 傳參結構已改變，改為單一物件
          await lineClient.pushMessage({
            to: patient.line_user_id,
            messages: [{
              type: "text",
              text: text,
            }]
          });
          console.log(`💬 LINE 已發送至 ${patient.line_user_id}`);
          await logNotification(booking_id, "line", "sent");
        } catch (err) {
          console.error(`❌ LINE 發送失敗:`, err);
          await logNotification(booking_id, "line", "failed", { error: String(err) });
        }
      }
    },
    {
      connection: redis,
      concurrency: 5,
    }
  );

  async function logNotification(booking_id: string, channel: string, status: string, detail?: any) {
    await supabase.from("notification_logs").insert({
      booking_event_id: booking_id,
      channel,
      status,
      detail: detail || {},
    });
  }

  console.log("🚀 Worker 已啟動，監聽 notification.queue");

  // ===== 🧪 測試任務 =====
  setTimeout(async () => {
    try {
      // ✅ 修正：改用虛擬標記，並避免直接傳入非法 UUID 格式字串
      await notificationQueue.add("test", {
        type: "test",
        booking_id: "test-uuid-placeholder",
      });
      console.log("🧪 已加入測試任務到 notification.queue");
    } catch (err) {
      console.error("❌ 測試任務失敗:", err);
    }
  }, 2000);
}

// 啟動
startWorker().catch((err) => {
  console.error("❌ Worker 启动失败:", err);
  process.exit(1);
});
