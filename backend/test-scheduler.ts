// backend/test-scheduler.ts
import { redis } from "./src/config/redis.js";
import { supabase } from "./src/config/supabase.js";
import { SchedulerCoordinator } from "./src/scheduler/SchedulerCoordinator.js";
import { SlotGenerationService } from "./src/services/slotGenerationService.js";

const coordinator = new SchedulerCoordinator(redis, supabase);

async function testScheduler() {
  console.log("🧪 ====== 開始測試排程協調器 ======\n");

  const jobId = `test-job-${Date.now()}`;
  const queueName = "test-queue";

  // ========== 測試 1：第一次執行（應成功） ==========
  console.log("📌 測試 1：第一次執行（應成功）");
  const result1 = await coordinator.execute(
    jobId,
    queueName,
    async () => {
      console.log("   ✅ 任務執行中...");
      await new Promise(r => setTimeout(r, 1000));
      return { status: "success", data: "test-data" };
    },
    "manual"
  );

  if (result1.executed) {
    console.log(`   ✅ 執行完成:`, result1.result);
  } else {
    console.log(`   ⚠️ 執行被跳過: ${result1.error}`);
  }

  // 等待 1 秒讓鎖釋放（雖然協調器已自動釋放）
  await new Promise(r => setTimeout(r, 1000));

  // ========== 測試 2：第二次執行（應跳過，因 DB 記錄已完成） ==========
  console.log("\n📌 測試 2：第二次執行（應跳過，因 DB 記錄已完成）");
  const result2 = await coordinator.execute(
    jobId,
    queueName,
    async () => {
      console.log("   ⚠️ 不應執行到這裡");
      return { status: "should-not-run" };
    },
    "manual"
  );

  if (result2.executed) {
    console.log(`   ✅ 執行完成:`, result2.result);
  } else {
    console.log(`   ⏭️ 正確跳過: ${result2.error || "已在執行中"}`);
  }

  // 等待 1 秒
  await new Promise(r => setTimeout(r, 1000));

  // ========== 測試 3：不同 jobId（應成功） ==========
  const jobId3 = `test-job-${Date.now()}`;
  console.log(`\n📌 測試 3：不同 jobId (${jobId3})（應成功）`);
  const result3 = await coordinator.execute(
    jobId3,
    queueName,
    async () => {
      console.log("   ✅ 新任務執行中...");
      await new Promise(r => setTimeout(r, 500));
      return { status: "success", data: "different-job" };
    },
    "manual"
  );

  if (result3.executed) {
    console.log(`   ✅ 執行完成:`, result3.result);
  } else {
    console.log(`   ⚠️ 執行被跳過: ${result3.error}`);
  }

  // ========== 總結 ==========
  console.log("\n📊 ====== 測試總結 ======");
  console.log(`測試 1 (第一次執行): ${result1.executed ? "✅ 通過" : "❌ 失敗"}`);
  console.log(`測試 2 (重複執行): ${!result2.executed ? "✅ 通過 (跳過)" : "❌ 失敗 (不應執行)"}`);
  console.log(`測試 3 (不同 jobId): ${result3.executed ? "✅ 通過" : "❌ 失敗"}`);

  // 查詢 DB 記錄
  console.log("\n📋 資料庫記錄 (最後 3 筆):");
  const { data } = await supabase
    .from("schedule_coordination_logs")
    .select("job_id, queue_name, trigger_source, status, started_at, completed_at")
    .order("started_at", { ascending: false })
    .limit(3);
  console.table(data);

  console.log("\n✅ 測試完成！");
  process.exit(0);
}

testScheduler().catch(err => {
  console.error("❌ 測試失敗:", err);
  process.exit(1);
});