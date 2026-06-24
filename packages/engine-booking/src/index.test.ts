import { describe, it, expect, vi, beforeEach } from "vitest";
import { BookingEngine } from "./index";

describe("BookingEngine", () => {
  let mockSupabase: any;
  let mockRedis: any;
  let engine: BookingEngine;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
    };
    mockRedis = {
      set: vi.fn().mockResolvedValue("OK"),
      del: vi.fn().mockResolvedValue(1),
      get: vi.fn().mockResolvedValue(null),
      ping: vi.fn().mockResolvedValue("PONG"),
    };
    engine = new BookingEngine(mockSupabase as any, mockRedis as any);
  });

  it("應該被正確定義", () => {
    expect(engine).toBeInstanceOf(BookingEngine);
  });

  it("getAvailableSlots 應回傳空陣列當無資料時", async () => {
    mockSupabase.from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: vi.fn((cb) => cb({ data: null, error: null })),
    });

    const result = await engine.getAvailableSlots("test-tenant", {
      date: "2026-07-01",
    });
    expect(result).toEqual([]);
  });

  it("createAppointment 應拋出錯誤當時段已滿", async () => {
    mockSupabase.from = vi.fn().mockImplementation((table) => {
      if (table === "slot_instances") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: "slot-1", booked_count: 5, max_capacity: 5, status: "open", version: 1 },
            error: null,
          }),
        };
      }
      return {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
      };
    });

    await expect(
      engine.createAppointment("test-tenant", {
        slot_instance_id: "slot-1",
        patient_id: "patient-1",
        service_id: "service-1",
        doctor_id: "doctor-1",
      })
    ).rejects.toThrow("該時段已額滿");
  });

  it("應在 Redis 鎖失敗時拋出 CONFLICT 錯誤", async () => {
    mockRedis.set = vi.fn().mockResolvedValue(null);

    await expect(
      engine.createAppointment("test-tenant", {
        slot_instance_id: "slot-1",
        patient_id: "patient-1",
        service_id: "service-1",
        doctor_id: "doctor-1",
      })
    ).rejects.toThrow("CONFLICT");
  });

  // ✅ 修正版：正確模擬樂觀鎖更新衝突
  it("應在 version 衝突時拋出預約失敗錯誤", async () => {
    // 建立鏈式查詢的 mock
    const mockUpdateQuery = {
      eq: vi.fn().mockImplementation((key: string, value: any) => {
        // 當第二個 eq（即 version 比對）時返回錯誤
        if (key === "version") {
          return Promise.resolve({ error: { message: "Version mismatch" } });
        }
        // 其他情況返回自身以支援鏈式呼叫
        return mockUpdateQuery;
      }),
    };

    const mockSelectQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: "slot-1", booked_count: 3, max_capacity: 5, status: "open", version: 1 },
        error: null,
      }),
    };

    // 覆蓋 from 方法
    mockSupabase.from = vi.fn().mockImplementation((table: string) => {
      if (table === "slot_instances") {
        return {
          ...mockSelectQuery,
          update: vi.fn().mockReturnValue(mockUpdateQuery),
        };
      }
      return {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnThis(),
      };
    });

    await expect(
      engine.createAppointment("test-tenant", {
        slot_instance_id: "slot-1",
        patient_id: "patient-1",
        service_id: "service-1",
        doctor_id: "doctor-1",
      })
    ).rejects.toThrow("已被其他人搶先預約");
  });

  it("冷卻期應正確過濾時段", async () => {
    const mockSlots = [
      {
        id: "slot-1",
        slot_date: "2026-07-01",
        start_time: "09:00",
        end_time: "09:30",
        max_capacity: 5,
        booked_count: 0,
        doctors: { name: "王醫師" },
        services: { id: "11111111-1111-1111-1111-111111111111", name: "一般門診", strict_cooldown_days: 0 },
      },
      {
        id: "slot-3",
        slot_date: "2026-07-01",
        start_time: "14:00",
        end_time: "15:00",
        max_capacity: 5,
        booked_count: 0,
        doctors: { name: "王醫師" },
        services: { id: "22222222-2222-2222-2222-222222222222", name: "牙科洗牙", strict_cooldown_days: 30 },
      },
    ];

    mockSupabase.from = vi.fn().mockImplementation((table) => {
      if (table === "slot_instances") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          then: vi.fn((cb) => cb({ data: mockSlots, error: null })),
        };
      }
      if (table === "booking_events") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          then: vi.fn((cb) =>
            cb({
              data: [{ service_id: "22222222-2222-2222-2222-222222222222", created_at: "2026-06-20" }],
              error: null,
            })
          ),
        };
      }
      return { then: vi.fn((cb) => cb({ data: [], error: null })) };
    });

    const result = await engine.getAvailableSlots("test-tenant", {
      date: "2026-07-01",
      patient_id: "patient-1",
    });

    expect(result.length).toBe(1);
    expect(result[0].service_name).toBe("一般門診");
  });
});