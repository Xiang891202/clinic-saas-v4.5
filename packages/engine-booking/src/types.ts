import { SupabaseClient } from "@supabase/supabase-js";
import { RedisLock } from "../../shared/src/redis-lock";

export interface SlotFilters {
  date: string;
  service_id?: string;
  doctor_id?: string;
  location_id?: string;
  patient_id?: string;
}

export interface AvailableSlot {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  doctor_name: string;
  service_name: string;
  max_capacity: number;
  booked_count: number;
}

// ✅ 新增：內部使用的 SlotInstance 型別（含關聯資料）
export interface SlotInstance {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  max_capacity: number;
  booked_count: number;
  doctors: { id: string; name: string };  // 修改這裡
  services: { id: string; name: string; strict_cooldown_days: number };
}

// ✅ 新增：內部使用的 RecentBooking 型別
export interface RecentBooking {
  service_id: string;
  created_at: string;
}

export interface CreateAppointmentDTO {
  slot_instance_id: string;
  patient_id: string;
  service_id: string;
  doctor_id: string;
  location_id?: string;
  source?: "web" | "line" | "manual";
}

export interface AvailableSlot {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  doctor_name: string;
  doctor_id: string;      // ✅ 新增
  service_name: string;
  service_id: string;     // ✅ 新增
  max_capacity: number;
  booked_count: number;
}

export interface IBookingEngine {
  getAvailableSlots(tenantId: string, filters: SlotFilters): Promise<AvailableSlot[]>;
  createAppointment(tenantId: string, dto: CreateAppointmentDTO): Promise<AppointmentResponse>;
}