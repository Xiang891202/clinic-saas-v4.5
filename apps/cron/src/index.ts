import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import cron from "node-cron";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ... 其餘 cron 程式碼不變

// ========== 生成未來 N 天的 slot_instances ==========
async function generateSlots(daysAhead: number = 30) {
  console.log(`🔄 開始生成未來 ${daysAhead} 天的時段...`);

  // 1. 取得所有診所的 booking_slots 模板
  const { data: templates, error: tErr } = await supabase
    .from("booking_slots")
    .select("id, tenant_id, location_id, doctor_id, service_id, day_of_week, start_time, end_time, max_capacity");

  if (tErr) {
    console.error("❌ 取得模板失敗:", tErr);
    return;
  }

  const today = new Date();
  let totalCreated = 0;

  for (let i = 0; i <= daysAhead; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    const dayOfWeek = date.getDay();
    const dateStr = date.toISOString().split("T")[0];

    // 過濾出符合當天星期幾的模板
    const matchedTemplates = templates.filter((t) => t.day_of_week === dayOfWeek);

    for (const tmpl of matchedTemplates) {
      // 檢查是否已存在該日期的 slot_instances
      const { data: existing, error: eErr } = await supabase
        .from("slot_instances")
        .select("id")
        .eq("slot_date", dateStr)
        .eq("booking_slot_id", tmpl.id)
        .limit(1);

      if (eErr) {
        console.error("❌ 查詢 slot_instances 失敗:", eErr);
        continue;
      }

      if (existing && existing.length > 0) {
        continue; // 已存在，跳過
      }

      // 建立 slot_instances
      const { error: insertErr } = await supabase.from("slot_instances").insert({
        tenant_id: tmpl.tenant_id,
        booking_slot_id: tmpl.id,
        location_id: tmpl.location_id,
        slot_date: dateStr,
        start_time: tmpl.start_time,
        end_time: tmpl.end_time,
        max_capacity: tmpl.max_capacity,
        booked_count: 0,
        status: "open",
        version: 1,
      });

      if (insertErr) {
        console.error("❌ 插入 slot_instance 失敗:", insertErr);
      } else {
        totalCreated++;
      }
    }
  }

  console.log(`✅ 完成！共建立 ${totalCreated} 個時段`);
}

// ========== 每日凌晨 2:00 執行 ==========
cron.schedule("0 2 * * *", () => {
  console.log("⏰ 排程觸發：生成時段");
  generateSlots(30);
});

// ========== 立即執行一次（啟動時） ==========
generateSlots(7);

console.log("🕐 Cron 已啟動，每日 02:00 自動生成時段");