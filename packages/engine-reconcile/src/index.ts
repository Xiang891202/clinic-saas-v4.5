// packages/engine-reconcile/src/index.ts
import { SupabaseClient } from "@supabase/supabase-js";

export interface ReconcileResult {
  fixed: number;
  errors: string[];
}

export class ReconcileEngine {
  constructor(private supabase: SupabaseClient) {}

  /**
   * 修復所有時段的預約計數不一致問題
   * 比對 booking_events 實際預約數 vs slot_instances.booked_count
   */
  async fixSlotBookedCounts(tenantId?: string): Promise<ReconcileResult> {
    const result: ReconcileResult = { fixed: 0, errors: [] };

    try {
      // 1. 查詢所有有效預約（booked / arrived）
      let query = this.supabase
        .from("booking_events")
        .select("slot_instance_id, status")
        .in("status", ["booked", "arrived"]);

      if (tenantId) {
        query = query.eq("tenant_id", tenantId);
      }

      const { data: bookings, error: bErr } = await query;
      if (bErr) {
        result.errors.push(`查詢預約失敗: ${bErr.message}`);
        return result;
      }

      // 2. 統計每個時段的實際預約數
      const counts = new Map<string, number>();
      bookings?.forEach((b: any) => {
        if (b.slot_instance_id) {
          counts.set(b.slot_instance_id, (counts.get(b.slot_instance_id) || 0) + 1);
        }
      });

      // 3. 檢查每個時段的 booked_count 是否正確
      for (const [slotId, expectedCount] of counts) {
        const { data: slot, error: sErr } = await this.supabase
          .from("slot_instances")
          .select("booked_count, version")
          .eq("id", slotId)
          .single();

        if (sErr) {
          result.errors.push(`查詢時段 ${slotId} 失敗: ${sErr.message}`);
          continue;
        }

        if (slot && slot.booked_count !== expectedCount) {
          // 修復
          const { error: updateError } = await this.supabase
            .from("slot_instances")
            .update({
              booked_count: expectedCount,
              version: slot.version + 1,
              updated_at: new Date().toISOString(),
            })
            .eq("id", slotId)
            .eq("version", slot.version);

          if (updateError) {
            result.errors.push(`修復時段 ${slotId} 失敗: ${updateError.message}`);
          } else {
            result.fixed++;
            console.log(`✅ 修復時段 ${slotId}: ${slot.booked_count} → ${expectedCount}`);
          }
        }
      }

      return result;
    } catch (err: any) {
      result.errors.push(err.message);
      return result;
    }
  }

  /**
   * 修復指定預約的容量（當預約的 slot_instance_id 與時段計數不一致時）
   */
  async fixAppointmentSlotConsistency(appointmentId: string): Promise<ReconcileResult> {
    const result: ReconcileResult = { fixed: 0, errors: [] };

    try {
      // 查詢預約
      const { data: booking, error: bErr } = await this.supabase
        .from("booking_events")
        .select("id, slot_instance_id, tenant_id, status")
        .eq("id", appointmentId)
        .single();

      if (bErr || !booking) {
        result.errors.push(`查詢預約失敗: ${bErr?.message || "預約不存在"}`);
        return result;
      }

      if (!["booked", "arrived"].includes(booking.status)) {
        result.errors.push("預約狀態非有效狀態（booked/arrived）");
        return result;
      }

      // 統計該時段的實際預約數
      const { data: slotBookings, error: sErr } = await this.supabase
        .from("booking_events")
        .select("id")
        .eq("slot_instance_id", booking.slot_instance_id)
        .in("status", ["booked", "arrived"])
        .eq("tenant_id", booking.tenant_id);

      if (sErr) {
        result.errors.push(`統計時段預約失敗: ${sErr.message}`);
        return result;
      }

      const expectedCount = slotBookings?.length || 0;

      // 更新時段
      const { data: slot, error: slotErr } = await this.supabase
        .from("slot_instances")
        .select("booked_count, version")
        .eq("id", booking.slot_instance_id)
        .single();

      if (slotErr || !slot) {
        result.errors.push(`查詢時段失敗: ${slotErr?.message}`);
        return result;
      }

      if (slot.booked_count !== expectedCount) {
        const { error: updateError } = await this.supabase
          .from("slot_instances")
          .update({
            booked_count: expectedCount,
            version: slot.version + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", booking.slot_instance_id)
          .eq("version", slot.version);

        if (updateError) {
          result.errors.push(`修復失敗: ${updateError.message}`);
        } else {
          result.fixed++;
          console.log(`✅ 修復預約 ${appointmentId} 的時段容量: ${slot.booked_count} → ${expectedCount}`);
        }
      }

      return result;
    } catch (err: any) {
      result.errors.push(err.message);
      return result;
    }
  }
}