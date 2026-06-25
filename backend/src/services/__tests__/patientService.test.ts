// src/services/__tests__/patientService.test.ts
import { jest, describe, beforeEach, it, expect } from '@jest/globals';
import { PatientService } from '../patientService';

describe('PatientService', () => {
  let mockSupabase: any;
  let service: PatientService;
  let mockChain: any;

  beforeEach(() => {
    // ✅ 所有链式方法返回 mockChain 自身
    mockChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
    };

    mockSupabase = {
      from: jest.fn().mockReturnValue(mockChain),
    };

    service = new PatientService(mockSupabase);
  });

  describe('getPatients', () => {
    const tenantId = 'tenant-123';

    it('should return patients with appointment counts', async () => {
      const mockPatients = [
        { id: 'patient-1', name_given: '小明', name_family: '王' },
        { id: 'patient-2', name_given: '小華', name_family: '陳' },
      ];
      const mockCounts = [
        { patient_id: 'patient-1' },
        { patient_id: 'patient-1' },
        { patient_id: 'patient-2' },
      ];

      // ✅ 最后一个链式方法 range 返回最终结果
      mockChain.range.mockResolvedValue({ data: mockPatients, error: null, count: 2 });

      // 模拟预约次数查询（单独模拟，因为 service 内部会创建新的 supabase 查询）
      const mockSupabaseForCount = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            in: jest.fn().mockResolvedValue({ data: mockCounts, error: null }),
          }),
        }),
      };
      // 替换 service 的 supabase 实例
      (service as any).supabase = mockSupabaseForCount;

      const result = await service.getPatients(tenantId, undefined, 50, 0);

      expect(result.data).toHaveLength(2);
      expect(result.data[0].appointment_count).toBe(2);
      expect(result.data[1].appointment_count).toBe(1);
      expect(result.total).toBe(2);
    });

    it('should apply search filter', async () => {
      const mockSearch = '王';
      // ✅ or 方法返回的对象需要有 range 方法
      const orChain = {
        range: jest.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
      };
      mockChain.or.mockReturnValue(orChain);

      await service.getPatients(tenantId, mockSearch, 50, 0);

      expect(mockChain.or).toHaveBeenCalled();
      expect(orChain.range).toHaveBeenCalledWith(0, 49);
    });
  });
});