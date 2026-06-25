// backend/src/services/__tests__/slotService.test.ts
import { jest, describe, beforeEach, it, expect } from '@jest/globals';
import { SlotService } from "../slotService";
import { SupabaseClient } from "@supabase/supabase-js";

// Mock SupabaseClient
jest.mock("@supabase/supabase-js");

describe("SlotService", () => {
  let mockSupabase: jest.Mocked<SupabaseClient>;
  let slotService: SlotService;
  let mockChain: any;

  beforeEach(() => {
    // 创建一个完整的链式调用对象
    mockChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockReturnThis(),
    };

    // mockSupabase.from 返回这个链式对象
    mockSupabase = {
      from: jest.fn().mockReturnValue(mockChain),
    } as any;

    slotService = new SlotService(mockSupabase);
  });

  describe("getSlotsByMonth", () => {
    it("should return slots for a given month", async () => {
      const mockData = [
        { id: "1", slot_date: "2026-06-01", start_time: "09:00", doctors: { name: "Dr. A" } },
        { id: "2", slot_date: "2026-06-15", start_time: "10:00", doctors: { name: "Dr. B" } },
      ];

      // 让 order 方法返回一个带有数据的 Promise
      mockChain.order.mockResolvedValue({ data: mockData, error: null });

      const result = await slotService.getSlotsByMonth("tenant-123", 2026, 6);
      expect(result).toEqual(mockData);
      expect(mockSupabase.from).toHaveBeenCalledWith("slot_instances");
    });

    it("should throw error if Supabase returns error", async () => {
      const error = new Error("DB error");
      mockChain.order.mockResolvedValue({ data: null, error });

      await expect(slotService.getSlotsByMonth("tenant-123", 2026, 6)).rejects.toThrow("DB error");
    });
  });

  describe("createSlot", () => {
    it("should create a slot successfully", async () => {
      const payload = {
        slot_date: "2026-06-25",
        start_time: "14:00",
        end_time: "15:00",
        doctor_id: "doc-123",
        service_id: "svc-456",
        max_capacity: 2,
      };

      const mockExisting = null;
      const mockCreated = { id: "new-slot", ...payload };

      // 模拟查询冲突（无冲突）
      mockChain.maybeSingle.mockResolvedValue({ data: mockExisting, error: null });
      // 模拟插入成功
      mockChain.single.mockResolvedValue({ data: mockCreated, error: null });

      const result = await slotService.createSlot("tenant-123", payload);
      expect(result).toEqual(mockCreated);
    });

    it("should throw conflict error if slot already exists", async () => {
      const payload = {
        slot_date: "2026-06-25",
        start_time: "14:00",
        end_time: "15:00",
        doctor_id: "doc-123",
        service_id: "svc-456",
        max_capacity: 2,
      };

      const mockExisting = { id: "existing-slot" };
      mockChain.maybeSingle.mockResolvedValue({ data: mockExisting, error: null });

      await expect(slotService.createSlot("tenant-123", payload)).rejects.toThrow("該醫師在此時間已有時段");
    });
  });
});