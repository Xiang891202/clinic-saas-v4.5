import { SupabaseClient } from "@supabase/supabase-js";
// 🟢 修复点 1：补上后缀 .js（配合你的 NodeNext 模块解析）
import { RedisLock } from "../../shared/src/redis-lock.js";

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
  doctor_id: string;
  service_name: string;
  service_id: string;
  max_capacity: number;
  booked_count: number;
}

// types.ts
export interface SlotInstance {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  max_capacity: number;
  booked_count: number;
  status: string;          // ✅ 新增
  version: number;         // ✅ 新增
  doctors: { id: string; name: string; }[];   // ✅ 移除 null
  services: { id: string; name: string; strict_cooldown_days: number; }[]; // ✅ 移除 null
}

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

export interface AppointmentResponse {
  id: string;
  tenant_id: string;
  slot_instance_id: string;
  patient_id: string;
  service_id: string;
  doctor_id: string;
  status: string;
  created_at: string;
  updated_at?: string;
}

// 🟢 修复点 4：ModifyAppointmentDTO 补充代码中用到的字段
export interface ModifyAppointmentDTO {
  slot_instance_id?: string;
  service_id?: string;
  doctor_id?: string;
  location_id?: string;
  slot_date?: string;    // 新增
  start_time?: string;   // 新增
}

// 🟢 修复点 5：IBookingEngine 接口签名必须和类完全一致
export interface IBookingEngine {
  getAvailableSlots(tenantId: string, filters: SlotFilters): Promise<AvailableSlot[]>;
  createAppointment(tenantId: string, dto: CreateAppointmentDTO): Promise<AppointmentResponse>;
  modifyAppointment(tenantId: string, appointmentId: string, dto: ModifyAppointmentDTO): Promise<AppointmentResponse>;
  cancelAppointment(tenantId: string, appointmentId: string): Promise<void>;
  // ✅ 补上 tenantId，并允许返回 null（因为代码中写了 try catch 返回 null）
  getAppointmentById(tenantId: string, appointmentId: string): Promise<AppointmentResponse | null>;
}