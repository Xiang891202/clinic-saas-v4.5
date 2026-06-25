// src/services/__tests__/clinicAppointmentService.test.ts
import { jest, describe, beforeEach, it, expect } from '@jest/globals';
import { ClinicAppointmentService } from '../clinicAppointmentService';

describe('ClinicAppointmentService', () => {
  let mockSupabase: any;
  let service: ClinicAppointmentService;
  let mockChain: any;

  beforeEach(() => {
    // ✅ 关键修复：所有链式方法都返回 mockChain 自身
    mockChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
    };

    mockSupabase = {
      from: jest.fn().mockReturnValue(mockChain),
    };

    service = new ClinicAppointmentService(mockSupabase);
  });

  describe('getAppointments', () => {
    const tenantId = 'tenant-123';

    it('should return formatted appointments', async () => {
      const mockData = [
        {
          id: 'apt-1',
          status: 'booked',
          source: 'web',
          created_at: '2026-06-25T10:00:00Z',
          patient_id: 'patient-1',
          patients: { name_given: '小明', name_family: '王', telecom_phone: '0912345678', telecom_email: 'test@test.com' },
          slot_instances: {
            slot_date: '2026-06-25',
            start_time: '09:00',
            end_time: '10:00',
            doctors: { name: 'Dr. Wang' },
            services: { name: '一般門診' },
          },
        },
      ];

      // ✅ 最后一个链式方法 order 返回最终结果
      mockChain.order.mockResolvedValue({ data: mockData, error: null });

      const result = await service.getAppointments(tenantId, {});

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'apt-1',
        patient_name: '王小明',
        doctor_name: 'Dr. Wang',
        service_name: '一般門診',
      });
    });

    it('should apply filters', async () => {
      mockChain.order.mockResolvedValue({ data: [], error: null });

      await service.getAppointments(tenantId, {
        status: 'booked',
        date_from: '2026-06-01',
        date_to: '2026-06-30',
      });

      expect(mockChain.eq).toHaveBeenCalledWith('status', 'booked');
      expect(mockChain.gte).toHaveBeenCalledWith('slot_instances.slot_date', '2026-06-01');
      expect(mockChain.lte).toHaveBeenCalledWith('slot_instances.slot_date', '2026-06-30');
    });
  });

  describe('updateStatus', () => {
    const tenantId = 'tenant-123';
    const appointmentId = 'apt-123';

    it('should throw error for invalid status', async () => {
      await expect(service.updateStatus(tenantId, appointmentId, 'invalid'))
        .rejects.toThrow('無效的狀態值');
    });

    it('should update status successfully', async () => {
      // ✅ 关键：update 返回一个独立的链式对象，有自己的 eq 方法
      const updateChain = {
        eq: jest.fn().mockResolvedValue({ error: null }),
      };
      // mockChain.update 返回这个独立对象，而不是 mockChain 本身
      mockChain.update.mockReturnValue(updateChain);

      const result = await service.updateStatus(tenantId, appointmentId, 'completed');

      expect(result).toEqual({ success: true, message: '預約狀態已更新為 completed' });
      // 验证 updateChain.eq 被调用了两次（id 和 tenant_id）
      expect(updateChain.eq).toHaveBeenCalledTimes(2);
      expect(updateChain.eq).toHaveBeenNthCalledWith(1, 'id', appointmentId);
      expect(updateChain.eq).toHaveBeenNthCalledWith(2, 'tenant_id', tenantId);
    });
  });
});