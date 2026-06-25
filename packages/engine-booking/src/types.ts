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
  doctor_id: string;
  service_name: string;
  service_id: string;
  max_capacity: number;
  booked_count: number;
}

export interface SlotInstance {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  max_capacity: number;
  booked_count: number;
  doctors: { id: string; name: string };
  services: { id: string; name: string; strict_cooldown_days: number };
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

export interface ModifyAppointmentDTO {
  slot_instance_id?: string;
  service_id?: string;
  doctor_id?: string;
  location_id?: string;
}

export interface IBookingEngine {
  getAvailableSlots(tenantId: string, filters: SlotFilters): Promise<AvailableSlot[]>;
  createAppointment(tenantId: string, dto: CreateAppointmentDTO): Promise<AppointmentResponse>;
  modifyAppointment(tenantId: string, appointmentId: string, dto: ModifyAppointmentDTO): Promise<AppointmentResponse>;
  cancelAppointment(tenantId: string, appointmentId: string): Promise<void>;
  getAppointmentById(appointmentId: string): Promise<AppointmentResponse>;
}