import { Worker, Queue } from "bullmq";
import Redis from "ioredis";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import path from "path";
import ical from 'ical-generator';

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const redis = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
});

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export const notificationQueue = new Queue("notification.queue", {
  connection: redis,
});

// ========== 通知用量記錄 ==========
// apps/worker/src/index.ts

async function recordUsage(tenantId: string, channel: string, status: "sent" | "failed") {
  const yearMonth = new Date().toISOString().slice(0, 7);

  // 先查询当前记录
  const { data: existing } = await supabase
    .from("notification_usage")
    .select("sent_count, failed_count")
    .eq("tenant_id", tenantId)
    .eq("year_month", yearMonth)
    .eq("channel", channel)
    .maybeSingle();

  const newSent = (existing?.sent_count || 0) + (status === "sent" ? 1 : 0);
  const newFailed = (existing?.failed_count || 0) + (status === "failed" ? 1 : 0);

  const { error } = await supabase
    .from("notification_usage")
    .upsert(
      {
        tenant_id: tenantId,
        year_month: yearMonth,
        channel: channel,
        sent_count: newSent,
        failed_count: newFailed,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "tenant_id, year_month, channel",
      }
    );

  if (error) {
    console.error("❌ 記錄通知用量失敗:", error);
  }
}

// ========== ✅ 產生 .ics 行事曆內容（支援新增/修改/取消） ==========
function generateICS(booking: any, type: 'created' | 'modified' | 'cancelled'): string {
  const slot = booking.slot_instances;
  const startTime = new Date(`${slot.slot_date}T${slot.start_time}`);
  const endTime = new Date(`${slot.slot_date}T${slot.end_time}`);
  
  // ✅ 使用預約 ID 作為 UID（永遠不變）
  const uid = `booking-${booking.id}@clinic-saas.com`;
  
  // ✅ SEQUENCE：每次修改時遞增（用 updated_at 時間戳作為版本）
  const sequence = type === 'modified' 
    ? Math.floor(new Date(booking.updated_at).getTime() / 1000) 
    : 0;

  // ✅ 根據類型決定 METHOD
  let method: 'REQUEST' | 'CANCEL' = 'REQUEST';
  let status: 'CONFIRMED' | 'CANCELLED' = 'CONFIRMED';
  let summary = `診所預約 - ${booking.services?.name || '看診'}`;
  let description = `醫師：${booking.doctors?.name || '未知醫師'}\n服務：${booking.services?.name || '未知服務'}`;
  let location = '診所地址';
  let alarms: { trigger: number; action: string; description: string }[] = [];

  if (type === 'cancelled') {
    method = 'CANCEL';
    status = 'CANCELLED';
    summary = '❌ 預約已取消';
    description = '此預約已被取消，請從行事曆中移除。';
    location = '';
    // 取消時不發送提醒
  } else {
    // 新增或修改時，加入 30 分鐘提醒
    alarms = [{ trigger: 30 * 60, action: 'DISPLAY', description: '預約時間快到了！' }];
  }

  const calendar = ical({
    name: '診所預約系統',
    timezone: 'Asia/Taipei',
    method: method,  // ✅ 關鍵！
    prodId: { company: 'Clinic SaaS', product: 'Appointment' },
  });

  calendar.createEvent({
    uid: uid,                    // ✅ 唯一識別碼
    sequence: sequence,          // ✅ 版本號
    start: startTime,
    end: endTime,
    summary: summary,
    description: description,
    location: location,
    status: status,
    alarms: alarms,
    organizer: {
      name: '診所預約系統',
      email: process.env.SMTP_USER,
    },
    ...(type === 'cancelled' ? { 
      'X-METHOD': 'CANCEL', 
      'X-CANCELLED': 'TRUE' 
    } : {}),
  });

  return calendar.toString();
}

// ========== Worker 主要邏輯 ==========
async function startWorker() {
  let lineClient: any = null;

  if (process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    try {
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
      const { type, booking_id, tenant_id } = job.data;
      console.log(`📩 處理通知: ${type}, 預約 ${booking_id}`);

      if (booking_id === "test-uuid-placeholder") {
        console.log("🧪 收到測試任務預覽，跳過");
        return;
      }

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
      const targetTenantId = tenant_id || booking.tenant_id;

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

      let emailSent = false;

      // ===== 發送 Email（含 .ics） =====
      if (patient.telecom_email) {
        try {
          // ✅ 使用新的 generateICS 函數，傳入 type 參數
          const icsContent = generateICS(booking, type);

          // ✅ 根據類型決定檔案名稱
          let filename = '預約提醒.ics';
          if (type === 'cancelled') filename = '預約取消.ics';
          else if (type === 'modified') filename = '預約更新.ics';

          await transporter.sendMail({
            from: process.env.SMTP_USER,
            to: patient.telecom_email,
            subject: `[診所系統] ${subject}`,
            text: text,
            attachments: [
              {
                filename: filename,
                content: icsContent,
                contentType: 'text/calendar; charset=utf-8; method=' + (type === 'cancelled' ? 'CANCEL' : 'REQUEST'),
                contentDisposition: 'inline',
              },
            ],
          });
          console.log(`📧 Email（含 .ics）已發送至 ${patient.telecom_email}`);
          await logNotification(booking_id, 'email', 'sent');
          await recordUsage(targetTenantId, 'email', 'sent');
          await recordUsage(targetTenantId, 'email', 'sent');  // ✅ 成功时记录
          emailSent = true;
        } catch (err) {
          console.error(`❌ Email 發送失敗:`, err);
          await logNotification(booking_id, 'email', 'failed', { error: String(err) });
          await recordUsage(targetTenantId, 'email', 'failed');
          await recordUsage(targetTenantId, 'email', 'failed');  // ✅ 失败时也记录
        }
      }

      // ===== 發送 LINE =====
      if (lineClient && patient.line_user_id) {
        try {
          await lineClient.pushMessage({
            to: patient.line_user_id,
            messages: [{ type: "text", text: text }]
          });
          console.log(`💬 LINE 已發送至 ${patient.line_user_id}`);
          await logNotification(booking_id, "line", "sent");
          await recordUsage(targetTenantId, "line", "sent");
        } catch (err) {
          console.error(`❌ LINE 發送失敗:`, err);
          await logNotification(booking_id, "line", "failed", { error: String(err) });
          await recordUsage(targetTenantId, "line", "failed");
        }
      }

      if (!emailSent && !patient.line_user_id) {
        console.warn(`⚠️ 預約 ${booking_id} 無任何通知管道可用`);
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

  setTimeout(async () => {
    try {
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

startWorker().catch((err) => {
  console.error("❌ Worker 启动失败:", err);
  process.exit(1);
});