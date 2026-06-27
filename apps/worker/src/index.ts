// apps/worker/src/index.ts
import { Worker, Queue } from "bullmq";
import Redis from "ioredis";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import path from "path";
import ical from "ical-generator";

// ========== 导入 Policy Engine ==========
import { PolicyEngine, ActionExecutor } from "../../../packages/engine-policy/src/index.ts";

// ========== 导入冪等性守衛 ==========
import { IdempotencyGuard } from '../../../packages/shared/src/idempotency/index.ts';

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

// 1. 解析環境變數中的 Upstash URL 物件
const url = new URL(process.env.REDIS_URL!);

// 2. 建立給 BullMQ 專用的配置物件（強制帶有 TLS）
const bullmqConnectionConfig = {
  host: url.hostname,
  port: parseInt(url.port) || 6379,
  username: url.username,
  password: url.password,
  tls: {}, // 👈 最關鍵：Upstash 強制要求 TLS 加密連線
  maxRetriesPerRequest: null,
};

// 3. 建立給主程式（如 Policy Engine）共用的獨立實例
const redis = new Redis(bullmqConnectionConfig);

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

// ========== 初始化 Policy Engine ==========
const policyEngine = new PolicyEngine();
const executor = new ActionExecutor({
  redis,
  supabase,
  sendEmail: async (to: string, subject: string, body: string) => {
    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to,
      subject,
      text: body,
    });
  },
  log: (level: string, message: string, metadata?: any) => {
    const logMethod = level === "error" ? console.error : console.log;
    logMethod(`[Policy] ${message}`, metadata || "");
  },
});

// 4. ✅ 修正 Queue 的初始化：改為傳入配置物件，不傳入實例
export const notificationQueue = new Queue("notification.queue", {
  connection: bullmqConnectionConfig,
});

// ========== 通知用量记录 ==========
async function recordUsage(tenantId: string, channel: string, status: "sent" | "failed") {
  const yearMonth = new Date().toISOString().slice(0, 7);
  const field = status === "sent" ? "sent_count" : "failed_count";
  const { error } = await supabase
    .from("notification_usage")
    .upsert({
      tenant_id: tenantId,
      year_month: yearMonth,
      channel,
      [field]: 1,
      updated_at: new Date().toISOString(),
    });
  if (error) console.error("❌ 記錄通知用量失敗:", error);
}

// ========== 触发 Policy 事件 ==========
async function triggerPolicyEvent(
  type: string,
  context: Record<string, any>,
  tenantId?: string
): Promise<void> {
  try {
    const event = {
      type,
      timestamp: new Date(),
      tenantId,
      context,
    };

    const plan = policyEngine.evaluate(event);
    await executor.execute(plan);
  } catch (error) {
    console.error("❌ Policy 事件触发失败:", error);
  }
}

// ========== 生成 .ics 行事曆 ==========
function generateICS(booking: any, type: "created" | "modified" | "cancelled"): string {
  const slot = booking.slot_instances;
  const startTime = new Date(`${slot.slot_date}T${slot.start_time}`);
  const endTime = new Date(`${slot.slot_date}T${slot.end_time}`);
  const uid = `booking-${booking.id}@clinic-saas.com`;
  const sequence = type === "modified" 
    ? Math.floor(new Date(booking.updated_at).getTime() / 1000) 
    : 0;

  let method: "REQUEST" | "CANCEL" = "REQUEST";
  let status: "CONFIRMED" | "CANCELLED" = "CONFIRMED";
  let summary = `診所預約 - ${booking.services?.name || "看診"}`;
  let description = `醫師：${booking.doctors?.name || "未知醫師"}\n服務：${booking.services?.name || "未知服務"}`;
  let location = "診所地址";
  let alarms: { trigger: number; action: string; description: string }[] = [];

  if (type === "cancelled") {
    method = "CANCEL";
    status = "CANCELLED";
    summary = "❌ 預約已取消";
    description = "此預約已被取消，請從行事曆中移除。";
    location = "";
  } else {
    alarms = [{ trigger: 30 * 60, action: "DISPLAY", description: "預約時間快到了！" }];
  }

  const calendar = ical({
    name: "診所預約系統",
    timezone: "Asia/Taipei",
    method: method,
    prodId: { company: "Clinic SaaS", product: "Appointment" },
  });

  calendar.createEvent({
    uid: uid,
    sequence: sequence,
    start: startTime,
    end: endTime,
    summary: summary,
    description: description,
    location: location,
    status: status,
    alarms: alarms,
    organizer: {
      name: "診所預約系統",
      email: process.env.SMTP_USER,
    },
    ...(type === "cancelled" ? { "X-METHOD": "CANCEL", "X-CANCELLED": "TRUE" } : {}),
  });

  return calendar.toString();
}

// ========== 日志记录 ==========
async function logNotification(
  booking_id: string,
  channel: string,
  status: string,
  detail?: any
) {
  await supabase.from("notification_logs").insert({
    booking_event_id: booking_id,
    channel,
    status,
    detail: detail || {},
  });
}

// ========== Worker 主逻辑 ==========
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
  }

  // ✅ 初始化冪等性守衛（Worker 外部，避免每次 job 重新建立）
  const idempotencyGuard = new IdempotencyGuard(redis, supabase);

  const worker = new Worker(
    "notification.queue",
    async (job) => {
      const { type, booking_id, tenant_id } = job.data;
      console.log(`📩 處理通知: ${type}, 預約 ${booking_id}`);

      if (booking_id === "test-uuid-placeholder") {
        console.log("🧪 收到測試任務預覽，跳過");
        return;
      }

      // ========== ✅ 新增：冪等性檢查 ==========
      const idempotencyKey = `notification:${booking_id}:${type}`;
      const { exists } = await idempotencyGuard.check(
        idempotencyKey,
        'notification_logs',
        'idempotency_key'
      );
      if (exists) {
        console.log(`⏭️ 通知 ${idempotencyKey} 已處理，跳過重複執行`);
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
- 日期：${booking.slot_instances?.slot_date}
- 時間：${booking.slot_instances?.start_time} - ${booking.slot_instances?.end_time}

如需修改或取消，請登入系統操作。

診所敬上
      `;

      let emailSent = false;
      let emailRetryCount = 0;
      const maxRetries = 3;

      // ===== 發送 Email（含 .ics，帶重試） =====
      if (patient.telecom_email) {
        while (emailRetryCount < maxRetries) {
          try {
            const icsContent = generateICS(booking, type);
            let filename = "預約提醒.ics";
            if (type === "cancelled") filename = "預約取消.ics";
            else if (type === "modified") filename = "預約更新.ics";

            await transporter.sendMail({
              from: process.env.SMTP_USER,
              to: patient.telecom_email,
              subject: `[診所系統] ${subject}`,
              text: text,
              attachments: [
                {
                  filename: filename,
                  content: icsContent,
                  contentType: "text/calendar; charset=utf-8; method=" + (type === "cancelled" ? "CANCEL" : "REQUEST"),
                  contentDisposition: "inline",
                },
              ],
            });
            console.log(`📧 Email（含 .ics）已發送至 ${patient.telecom_email}`);
            await logNotification(booking_id, "email", "sent");
            await recordUsage(targetTenantId, "email", "sent");
            emailSent = true;

            // ✅ 記錄 Email 冪等性
            await idempotencyGuard.record(
              idempotencyKey,
              { status: 'sent', channel: 'email', booking_id },
              'notification_logs',
              'idempotency_key'
            );
            break; // 发送成功，跳出重试循环
          } catch (err: any) {
            emailRetryCount++;
            console.error(`❌ Email 發送失敗 (嘗試 ${emailRetryCount}/${maxRetries}):`, err.message);
            
            if (emailRetryCount >= maxRetries) {
              await logNotification(booking_id, "email", "failed", { error: err.message, retryCount: emailRetryCount });
              await recordUsage(targetTenantId, "email", "failed");
              
              // ✅ 触发 Policy 事件：通知失败
              await triggerPolicyEvent(
                "NOTIFICATION_FAILURE",
                {
                  channel: "email",
                  bookingId: booking_id,
                  error: err.message,
                  retryCount: emailRetryCount,
                },
                targetTenantId
              );
            } else {
              // 等待后重试
              await new Promise(resolve => setTimeout(resolve, 1000 * emailRetryCount));
            }
          }
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

          // ✅ 記錄 LINE 冪等性（使用不同的 key，避免與 Email 衝突）
          await idempotencyGuard.record(
            `notification:${booking_id}:line`,
            { status: 'sent', channel: 'line', booking_id },
            'notification_logs',
            'idempotency_key'
          );
        } catch (err: any) {
          console.error(`❌ LINE 發送失敗:`, err);
          await logNotification(booking_id, "line", "failed", { error: err.message });
          await recordUsage(targetTenantId, "line", "failed");
          
          // ✅ 触发 Policy 事件：LINE 通知失败
          await triggerPolicyEvent(
            "NOTIFICATION_FAILURE",
            {
              channel: "line",
              bookingId: booking_id,
              error: err.message,
              retryCount: 1,
            },
            targetTenantId
          );
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

  // ========== Worker 事件监听 ==========
  worker.on("completed", (job) => {
    console.log(`✅ 任务完成: ${job.id}`);
  });

  worker.on("failed", async (job, err) => {
    console.error(`❌ 任务失败: ${job?.id}`, err.message);
    
    // ✅ 触发 Policy 事件：Worker 任务失败
    if (job) {
      await triggerPolicyEvent(
        "WORKER_JOB_FAILED",
        {
          jobId: job.id,
          queueName: job.queueName,
          data: job.data,
          error: err.message,
        },
        job.data?.tenant_id
      );
    }
  });

  console.log("🚀 Worker 已啟動，監聽 notification.queue");
  console.log("✅ Policy Engine 已集成到 Worker");
}

startWorker().catch((err) => {
  console.error("❌ Worker 启动失败:", err);
  process.exit(1);
});