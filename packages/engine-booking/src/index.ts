import { SupabaseClient } from "@supabase/supabase-js";
import { Redis } from "ioredis";
import { RedisLock } from "../../shared/src/redis-lock";
import {
  IBookingEngine,
  SlotFilters,
  AvailableSlot,
  CreateAppointmentDTO,
  AppointmentResponse,
  SlotInstance,
  RecentBooking,
} from "./types";

export class BookingEngine implements IBookingEngine {
  private lock: RedisLock;

  constructor(
    private supabase: SupabaseClient,
    private redis: Redis
  ) {
    this.lock = new RedisLock(redis);
  }

  // ========== 查詢時段（含冷卻期過濾） ==========
  async getAvailableSlots(tenantId: string, filters: SlotFilters): Promise<AvailableSlot[]> {
    let query = this.supabase
      .from("slot_instances")
      .select(`
        id,
        slot_date,
        start_time,
        end_time,
        max_capacity,
        booked_count,
        doctors ( id, name ),
        services ( id, name, strict_cooldown_days )
      `)
      .eq("tenant_id", tenantId)
      .eq("status", "open")
      .eq("slot_date", filters.date);

    if (filters.service_id) query = query.eq("service_id", filters.service_id);
    if (filters.doctor_id) query = query.eq("doctor_id", filters.doctor_id);
    if (filters.location_id) query = query.eq("location_id", filters.location_id);

    const { data: slots, error } = await query;
    if (error) throw new Error(`Failed to fetch slots: ${error.message}`);
    if (!slots || slots.length === 0) return [];

    // ✅ 使用明確型別過濾
    let availableSlots = slots.filter(
      (slot: SlotInstance) => slot.booked_count < slot.max_capacity
    );

    // ✅ 改用輔助方法（冷卻期過濾）
    if (filters.patient_id && availableSlots.length > 0) {
      availableSlots = await this.filterByCooldown(
        availableSlots,
        filters.patient_id,
        filters.date,
        tenantId
      );
    }

    return availableSlots.map((slot: SlotInstance) => ({
      id: slot.id,
      slot_date: slot.slot_date,
      start_time: slot.start_time,
      end_time: slot.end_time,
      doctor_name: slot.doctors?.name || "未知醫師",
      doctor_id: slot.doctors?.id || "",    // 新增
      service_name: slot.services?.name || "未知服務",
      service_id: slot.services?.id || "",  // 已有，但確認有值
      max_capacity: slot.max_capacity,
      booked_count: slot.booked_count,
    }));
  }

  // ========== 冷卻期過濾（獨立輔助方法） ==========
  private async filterByCooldown(
    slots: SlotInstance[],
    patientId: string,
    date: string,
    tenantId: string
  ): Promise<SlotInstance[]> {
    const cooldownMap = new Map<string, number>();
    slots.forEach((slot) => {
      const svc = slot.services;
      if (svc && svc.id) {
        cooldownMap.set(svc.id, svc.strict_cooldown_days || 0);
      }
    });

    const maxCooldown = Math.max(...Array.from(cooldownMap.values()), 0);
    if (maxCooldown === 0) return slots;

    const startDate = new Date(date);
    startDate.setDate(startDate.getDate() - maxCooldown);
    const startDateStr = startDate.toISOString().split("T")[0];

    const { data: recentBookings } = await this.supabase
      .from("booking_events")
      .select("service_id, created_at")
      .eq("tenant_id", tenantId)
      .eq("patient_id", patientId)
      .in("status", ["booked", "completed"])
      .gte("created_at", startDateStr);

    if (!recentBookings || recentBookings.length === 0) return slots;

    const cooldownServiceIds = new Set(
      recentBookings.map((b: RecentBooking) => b.service_id)
    );

    return slots.filter((slot) => {
      const svc = slot.services;
      if (!svc || !svc.id) return true;
      const cd = cooldownMap.get(svc.id) || 0;
      return !(cd > 0 && cooldownServiceIds.has(svc.id));
    });
  }

  // ========== withLock 輔助方法 ==========
  private async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const acquired = await this.lock.acquire(key, 10000);
    if (!acquired) {
      throw new Error("CONFLICT: 該時段正在被其他使用者預約中，請稍後再試");
    }
    try {
      return await fn();
    } finally {
      await this.lock.release(key);
    }
  }

  // ========== 建立預約（✅ 改用 withLock） ==========
  async createAppointment(tenantId: string, dto: CreateAppointmentDTO): Promise<AppointmentResponse> {
    const lockKey = `lock:slot:${dto.slot_instance_id}`;

    return this.withLock(lockKey, async () => {
      // 查詢時段
      const { data: slot, error: fetchError } = await this.supabase
        .from("slot_instances")
        .select("id, booked_count, max_capacity, status, version, slot_date, start_time")
        .eq("id", dto.slot_instance_id)
        .eq("tenant_id", tenantId)
        .single();

      if (fetchError || !slot) {
        throw new Error(`時段不存在: ${fetchError?.message}`);
      }

      // ✅ 檢查是否為過去的時段
      const now = new Date();
      const slotDateTime = new Date(`${slot.slot_date}T${slot.start_time}`);
      if (slotDateTime < now) {
        throw new Error("無法預約過去的時段，請選擇其他時間");
      }

      // 樂觀鎖更新
      const newBookedCount = slot.booked_count + 1;
      const newVersion = slot.version + 1;

      const { error: updateError } = await this.supabase
        .from("slot_instances")
        .update({
          booked_count: newBookedCount,
          version: newVersion,
          updated_at: new Date().toISOString(),
        })
        .eq("id", dto.slot_instance_id)
        .eq("version", slot.version);

      if (updateError) {
        throw new Error("預約失敗，時段已被其他人搶先預約，請重新查詢");
      }

      // 建立預約記錄
      const { data: booking, error: insertError } = await this.supabase
        .from("booking_events")
        .insert({
          tenant_id: tenantId,
          slot_instance_id: dto.slot_instance_id,
          patient_id: dto.patient_id,
          service_id: dto.service_id,
          doctor_id: dto.doctor_id,
          location_id: dto.location_id || null,
          status: "booked",
          source: dto.source || "web",
        })
        .select()
        .single();

      if (insertError) {
        throw new Error(`建立預約記錄失敗: ${insertError.message}`);
      }

      console.log(`📧 [Phase 1] 預約 ${booking.id} 建立成功，待串接通知系統`);
      return booking as AppointmentResponse;
    });
  }
}