import { SupabaseClient } from "@supabase/supabase-js";
import { Redis } from "ioredis";
import { RedisLock } from "../../shared/src/redis-lock.js";
import {
  IBookingEngine,
  SlotFilters,
  AvailableSlot,
  CreateAppointmentDTO,
  AppointmentResponse,
  SlotInstance,
  RecentBooking,
  ModifyAppointmentDTO,  // ✅ 新增
} from "./types.js";

interface BookingWithSlot {
  slot_instances: {
    id: string;
    slot_date: string;
    start_time: string;
    end_time: string;
    booked_count: number;
    version: number;
  } | null;
}

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

    const { data: slots, error } = await query as { data: SlotInstance[] | null; error: any };
    if (error) throw new Error(`Failed to fetch slots: ${error.message}`);
    if (!slots || slots.length === 0) return [];

    let availableSlots = slots.filter(
      (slot: SlotInstance) => slot.booked_count < slot.max_capacity
    );

    // 1️⃣ 冷卻期過濾
    if (filters.patient_id && availableSlots.length > 0) {
      availableSlots = await this.filterByCooldown(
        availableSlots,
        filters.patient_id,
        filters.date,
        tenantId
      );
    }

    // 2️⃣ ✅ 過濾已預約時段（病人已預約的時段不顯示）
    if (filters.patient_id && availableSlots.length > 0) {
      const { data: bookedSlots, error: bookedError } = await this.supabase
        .from("booking_events")
        .select("slot_instance_id")
        .eq("patient_id", filters.patient_id)
        .in("status", ["booked", "arrived"])
        .eq("tenant_id", tenantId);

      if (!bookedError && bookedSlots && bookedSlots.length > 0) {
        const bookedSlotIds = new Set(bookedSlots.map(b => b.slot_instance_id));
        availableSlots = availableSlots.filter(
          (slot: SlotInstance) => !bookedSlotIds.has(slot.id)
        );
      }
    }

    return availableSlots.map((slot: SlotInstance) => ({
      id: slot.id,
      slot_date: slot.slot_date,
      start_time: slot.start_time,
      end_time: slot.end_time,
      // ✅ 改成 `?.[0]?.` 的形式获取数组里的第一项
      doctor_name: slot.doctors?.[0]?.name || "未知醫師", 
      doctor_id: slot.doctors?.[0]?.id || "",
      service_name: slot.services?.[0]?.name || "未知服務",
      service_id: slot.services?.[0]?.id || "",
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
    const svc = slot.services?.[0];   // ✅ 取陣列中的第一個元素
    if (svc?.id) {
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
      const svc = slot.services?.[0];
      if (!svc?.id) return true;
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

  // ========== 建立預約（含防重複檢查 + Redis 鎖） ==========
  async createAppointment(tenantId: string, dto: CreateAppointmentDTO): Promise<AppointmentResponse> {
    const lockKey = `lock:slot:${dto.slot_instance_id}`;

    return this.withLock(lockKey, async () => {
      // ✅ 1. 防重複檢查（在鎖內執行）
      const { data: existingBooking, error: checkError } = await this.supabase
        .from("booking_events")
        .select("id")
        .eq("slot_instance_id", dto.slot_instance_id)
        .eq("patient_id", dto.patient_id)
        .in("status", ["booked", "arrived"])
        .maybeSingle();

      if (checkError) throw new Error(`檢查預約失敗: ${checkError.message}`);
      if (existingBooking) {
        throw new Error("您已預約此時段，請勿重複預約");
      }

      // 2. 查詢時段
      const { data: slot, error: fetchError } = await this.supabase
        .from("slot_instances")
        .select("id, booked_count, max_capacity, status, version, slot_date, start_time")
        .eq("id", dto.slot_instance_id)
        .eq("tenant_id", tenantId)
        .single();

      if (fetchError || !slot) {
        throw new Error(`時段不存在: ${fetchError?.message}`);
      }

      // 3. 檢查是否為過去的時段
      const now = new Date();
      const slotDateTime = new Date(`${slot.slot_date}T${slot.start_time}`);
      if (slotDateTime < now) {
        throw new Error("無法預約過去的時段，請選擇其他時間");
      }

      // 4. 樂觀鎖更新
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

      // 5. 建立預約記錄
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

  // ========== 修改預約（含 30 分鐘鎖定 + 時段驗證） ==========
  async modifyAppointment(tenantId: string, appointmentId: string, dto: ModifyAppointmentDTO): Promise<AppointmentResponse> {
    // 1. 查詢原預約（包含時段的完整資訊）
    const { data: booking, error: fetchError } = await this.supabase
      .from("booking_events")
      .select(`
        *,
        slot_instances ( 
          id, 
          slot_date, 
          start_time, 
          end_time,
          booked_count,
          version
        )
      `)
      .eq("id", appointmentId)
      .eq("tenant_id", tenantId)
      .single();

    if (fetchError || !booking) {
      throw new Error(`預約不存在: ${fetchError?.message}`);
    }

    // 檢查 booking.slot_instances 是否存在
    const oldSlot = booking.slot_instances;
    if (!oldSlot) {
      throw new Error("原時段資訊缺失，請聯繫管理員");
    }

    // 2. ✅ 檢查 30 分鐘鎖定
    const now = new Date();
    const slotDateTime = new Date(`${oldSlot.slot_date}T${oldSlot.start_time}`);
    const minutesUntilAppointment = (slotDateTime.getTime() - now.getTime()) / (1000 * 60);
    if (minutesUntilAppointment < 30) {
      throw new Error("預約時間已臨近（30 分鐘內），無法修改，請聯繫診所");
    }

    // 3. ✅ 確定新時段
    let newSlotInstanceId = dto.slot_instance_id;

    // 如果前端只傳了日期和時間，沒有傳 slot_instance_id，需要查找對應的時段
    if (!newSlotInstanceId && dto.slot_date && dto.start_time) {
      const { data: foundSlot, error: findError } = await this.supabase
        .from("slot_instances")
        .select("id, booked_count, max_capacity, status, version")
        .eq("tenant_id", tenantId)
        .eq("slot_date", dto.slot_date)
        .eq("start_time", dto.start_time)
        .eq("status", "open")
        .maybeSingle();

      if (findError || !foundSlot) {
        throw new Error("該時段不存在或已關閉，請選擇其他時段");
      }
      if (foundSlot.booked_count >= foundSlot.max_capacity) {
        throw new Error("該時段已額滿，請選擇其他時段");
      }
      newSlotInstanceId = foundSlot.id;
    }

    // 4. 如果沒有變更時段，只需更新其他欄位
    if (!newSlotInstanceId || newSlotInstanceId === booking.slot_instance_id) {
      const updateData: any = { updated_at: new Date().toISOString() };
      if (dto.service_id) updateData.service_id = dto.service_id;
      if (dto.doctor_id) updateData.doctor_id = dto.doctor_id;
      if (dto.location_id) updateData.location_id = dto.location_id;

      const { data: updated, error: updateError } = await this.supabase
        .from("booking_events")
        .update(updateData)
        .eq("id", appointmentId)
        .eq("tenant_id", tenantId)
        .select()
        .single();

      if (updateError) throw new Error(`修改預約失敗: ${updateError.message}`);
      return updated as AppointmentResponse;
    }

    // 5. ✅ 更換時段（含鎖 + 容量轉移）
    const lockKey = `lock:slot:${newSlotInstanceId}`;
    const acquired = await this.lock.acquire(lockKey, 10000);
    if (!acquired) {
      throw new Error("CONFLICT: 該時段正在被其他使用者預約中，請稍後再試");
    }

    try {
      // 檢查新時段狀態
      const { data: newSlot, error: slotError } = await this.supabase
        .from("slot_instances")
        .select("booked_count, max_capacity, status, version")
        .eq("id", newSlotInstanceId)
        .eq("tenant_id", tenantId)
        .single();

      if (slotError || !newSlot) throw new Error("新時段不存在");
      if (newSlot.status !== "open") throw new Error("該時段已關閉");
      if (newSlot.booked_count >= newSlot.max_capacity) throw new Error("該時段已額滿");

      // ✅ 先更新預約記錄
      const updateData: any = {
        slot_instance_id: newSlotInstanceId,
        updated_at: new Date().toISOString(),
      };
      if (dto.service_id) updateData.service_id = dto.service_id;
      if (dto.doctor_id) updateData.doctor_id = dto.doctor_id;
      if (dto.location_id) updateData.location_id = dto.location_id;

      const { error: updateBookingError } = await this.supabase
        .from("booking_events")
        .update(updateData)
        .eq("id", appointmentId)
        .eq("tenant_id", tenantId);

      if (updateBookingError) {
        throw new Error(`更新預約記錄失敗: ${updateBookingError.message}`);
      }

      // ✅ 再調整容量（新時段 +1，原時段 -1）
      // 加入除錯日誌
      console.log(`🔍 原時段 ID: ${oldSlot.id}, booked_count: ${oldSlot.booked_count}, version: ${oldSlot.version}`);
      console.log(`🔍 新時段 ID: ${newSlot.id}, booked_count: ${newSlot.booked_count}, version: ${newSlot.version}`);

      // 分別執行，確保錯誤訊息明確
      // 更新新時段（+1）
      const { error: newSlotError } = await this.supabase
        .from("slot_instances")
        .update({
          booked_count: newSlot.booked_count + 1,
          version: newSlot.version + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", newSlotInstanceId)
        .eq("version", newSlot.version);

      if (newSlotError) {
        throw new Error(`更新新時段容量失敗: ${newSlotError.message}`);
      }

      // 更新原時段（-1）
      const { error: oldSlotError } = await this.supabase
        .from("slot_instances")
        .update({
          booked_count: Math.max(0, oldSlot.booked_count - 1),
          version: oldSlot.version + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", oldSlot.id)
        .eq("version", oldSlot.version);

      if (oldSlotError) {
        // ⚠️ 如果原時段更新失敗，需要將新時段的 booked_count 還原
        console.error(`❌ 原時段更新失敗: ${oldSlotError.message}`);
        // 嘗試還原新時段（補償）
        await this.supabase
          .from("slot_instances")
          .update({
            booked_count: newSlot.booked_count,
            version: newSlot.version + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", newSlotInstanceId)
          .eq("version", newSlot.version + 1);
        throw new Error(`更新原時段容量失敗: ${oldSlotError.message}`);
      }

      // 查詢更新後的預約回傳
      const { data: updated, error: fetchError } = await this.supabase
        .from("booking_events")
        .select()
        .eq("id", appointmentId)
        .single();

      if (fetchError) throw new Error(`查詢更新後預約失敗: ${fetchError.message}`);
      return updated as AppointmentResponse;

    } catch (err: any) {
      // 確保在錯誤發生時釋放鎖
      throw err;
    } finally {
      await this.lock.release(lockKey);
    }
  }

  // packages/engine-booking/src/index.ts
  async cancelAppointment(tenantId: string, appointmentId: string): Promise<void> {
    // 1. 查詢預約（含時段資訊）
    const { data: booking, error: fetchError } = await this.supabase
      .from("booking_events")
      .select(`
        *,
        slot_instances ( id, booked_count, version, slot_date, start_time )
      `)
      .eq("id", appointmentId)
      .eq("tenant_id", tenantId)
      .single();

    if (fetchError || !booking) {
      throw new Error(`預約不存在: ${fetchError?.message}`);
    }

    // 2. 狀態檢查
    if (booking.status === "cancelled") {
      throw new Error("預約已取消");
    }
    if (booking.status === "completed" || booking.status === "noshow") {
      throw new Error("已完成或未到的預約無法取消");
    }

    // 3. 檢查 30 分鐘鎖定
    const now = new Date();
    const slotDateTime = new Date(`${booking.slot_instances?.slot_date}T${booking.slot_instances?.start_time}`);
    const minutesUntilAppointment = (slotDateTime.getTime() - now.getTime()) / (1000 * 60);
    if (minutesUntilAppointment < 30) {
      throw new Error("預約時間已臨近（30 分鐘內），無法取消，請聯繫診所");
    }

    // 4. ✅ 先更新預約狀態（避免其他操作干擾）
    const { error: updateError } = await this.supabase
      .from("booking_events")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", appointmentId)
      .eq("tenant_id", tenantId);

    if (updateError) {
      throw new Error(`取消預約失敗: ${updateError.message}`);
    }

    // 5. ✅ 再更新時段容量（-1）
    const slot = booking.slot_instances;
    if (slot) {
      const { error: updateSlotError } = await this.supabase
        .from("slot_instances")
        .update({
          booked_count: Math.max(0, slot.booked_count - 1),
          version: slot.version + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", slot.id)
        .eq("version", slot.version);

      if (updateSlotError) {
        // 記錄錯誤，但不影響預約取消（可由 Reconciliation 修復）
        console.error("更新時段容量失敗:", updateSlotError);
      }
    }

    // 6. 觸發取消通知（Worker）
    console.log(`📧 [Phase 1] 預約 ${appointmentId} 已取消，待串接通知系統`);
  }

  async getAppointmentById(tenantId: string, appointmentId: string): Promise<AppointmentResponse | null> {
    const { data, error } = await this.supabase
      .from("booking_events")
      .select("*")
      .eq("id", appointmentId)
      .eq("tenant_id", tenantId)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null; // 找不到记录
      throw new Error(`查詢預約失敗: ${error.message}`);
    }
    return data as AppointmentResponse;
  }
}