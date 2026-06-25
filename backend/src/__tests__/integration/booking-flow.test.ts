// backend/src/__tests__/integration/booking-flow.test.ts
import { jest, describe, beforeEach, it, expect } from '@jest/globals';

// ============================================================
// 1. 创建完整的 Mock 对象
// ============================================================

// 1.1 创建 Supabase 链式 Mock
const createSupabaseMock = () => {
  const chain: any = {
    // 查询方法
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    // 终结方法
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    // 批量返回
    then: undefined,
  };

  // from 方法返回链式对象
  const from = jest.fn().mockReturnValue(chain);
  
  return { from, chain };
};

// 1.2 创建 Redis Mock
const createRedisMock = () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  setex: jest.fn().mockResolvedValue('OK'),
  ping: jest.fn().mockResolvedValue('PONG'),
  quit: jest.fn().mockResolvedValue('OK'),
});

// 1.3 模拟 BookingEngine（如果需要完整模拟，也可以直接使用真实 BookingEngine + Mock 依赖）
// 这里我们使用真实的 BookingEngine，但传入 Mock 的 Supabase 和 Redis

// 导入真实的 BookingEngine（但依赖会被 Mock 替换）
import { BookingEngine } from '../../../../packages/engine-booking/src/index.js';

describe('Booking Flow Integration (Pure Mock)', () => {
  let mockSupabase: any;
  let mockRedis: any;
  let mockChain: any;
  let bookingEngine: BookingEngine;

  beforeEach(() => {
    // 重置所有 Mock
    jest.clearAllMocks();

    // 创建新的 Mock 对象
    const supabaseMock = createSupabaseMock();
    mockSupabase = supabaseMock;
    mockChain = supabaseMock.chain;
    mockRedis = createRedisMock();

    // 注入 Mock 依赖到 BookingEngine
    // 注意：BookingEngine 的构造函数接受 (supabase, redis)
    bookingEngine = new BookingEngine(mockSupabase as any, mockRedis as any);

    // ============================================================
    // 2. 设置默认返回数据（模拟正常业务流程）
    // ============================================================

    // 2.1 模拟 slot_instances 查询（getAvailableSlots）
    mockChain.single.mockImplementation(() => {
      return Promise.resolve({
        data: {
          id: 'slot-123',
          slot_date: '2026-07-01',
          start_time: '09:00:00',
          end_time: '10:00:00',
          max_capacity: 2,
          booked_count: 0,
          status: 'open',
          service_id: 'service-123',
          doctor_id: 'doctor-123',
          version: 1,
        },
        error: null,
      });
    });

    // 2.2 模拟 maybeSingle（检查冲突 - 返回 null 表示无冲突）
    mockChain.maybeSingle.mockResolvedValue({ data: null, error: null });

    // 2.3 模拟 insert 返回
    mockChain.insert.mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: {
            id: 'booking-123',
            status: 'booked',
            created_at: new Date().toISOString(),
            slot_instance_id: 'slot-123',
            patient_id: 'patient-123',
            service_id: 'service-123',
            doctor_id: 'doctor-123',
            source: 'web',
          },
          error: null,
        }),
      }),
    });

    // 2.4 模拟 update（用于取消预约）
    mockChain.update.mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          data: { status: 'cancelled' },
          error: null,
        }),
      }),
    });

    // 2.5 模拟 select（用于查询预约列表）
    mockChain.select.mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({
            data: [
              {
                id: 'booking-123',
                status: 'booked',
                created_at: new Date().toISOString(),
                slot_instances: {
                  slot_date: '2026-07-01',
                  start_time: '09:00:00',
                  end_time: '10:00:00',
                  doctors: { name: '测试医师' },
                  services: { name: '测试服务' },
                },
              },
            ],
            error: null,
          }),
        }),
      }),
    });
  });

  // ============================================================
  // 3. 测试用例
  // ============================================================

  describe('完整预约流程（Mock）', () => {
    it('应该模拟创建预约成功', async () => {
      const result = await bookingEngine.createAppointment('tenant-123', {
        slot_instance_id: 'slot-123',
        patient_id: 'patient-123',
        service_id: 'service-123',
        doctor_id: 'doctor-123',
        source: 'web',
      });

      // 验证返回数据
      expect(result).toBeDefined();
      expect(result.id).toBe('booking-123');
      expect(result.status).toBe('booked');

      // 验证调用了正确的方法
      expect(mockSupabase.from).toHaveBeenCalledWith('slot_instances');
      expect(mockChain.eq).toHaveBeenCalledWith('id', 'slot-123');
    });

    it('应该模拟取消预约成功', async () => {
      // 先创建预约
      const booking = await bookingEngine.createAppointment('tenant-123', {
        slot_instance_id: 'slot-123',
        patient_id: 'patient-123',
        service_id: 'service-123',
        doctor_id: 'doctor-123',
        source: 'web',
      });

      expect(booking.id).toBeDefined();

      // 取消预约
      await bookingEngine.cancelAppointment('tenant-123', booking.id);

      // 验证 update 被调用
      expect(mockSupabase.from).toHaveBeenCalledWith('booking_events');
    });

    it('应该模拟查询可用时段', async () => {
      const slots = await bookingEngine.getAvailableSlots('tenant-123', {
        date: '2026-07-01',
        patient_id: 'patient-123',
      });

      expect(slots).toBeDefined();
      expect(mockSupabase.from).toHaveBeenCalledWith('slot_instances');
    });

    it('应该模拟并发预约保护（Redis 锁）', async () => {
      // 模拟 Redis 锁获取成功
      mockRedis.set.mockResolvedValue('OK');

      // 模拟预约冲突（maybeSingle 返回已有记录）
      mockChain.maybeSingle.mockResolvedValueOnce({
        data: { id: 'existing-slot' },
        error: null,
      });

      // 尝试创建预约（应该失败，因为已被锁定）
      await expect(
        bookingEngine.createAppointment('tenant-123', {
          slot_instance_id: 'slot-123',
          patient_id: 'patient-123',
          service_id: 'service-123',
          doctor_id: 'doctor-123',
          source: 'web',
        })
      ).rejects.toThrow();

      // 验证 Redis 锁被尝试获取
      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('应该模拟创建预约后更新时段容量', async () => {
      // 模拟 slot_instances 查询（返回当前容量）
      mockChain.single.mockResolvedValue({
        data: {
          id: 'slot-123',
          slot_date: '2026-07-01',
          start_time: '09:00:00',
          end_time: '10:00:00',
          max_capacity: 2,
          booked_count: 0,
          status: 'open',
          service_id: 'service-123',
          doctor_id: 'doctor-123',
          version: 1,
        },
        error: null,
      });

      // 模拟更新容量
      mockChain.update.mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: { booked_count: 1 },
            error: null,
          }),
        }),
      });

      await bookingEngine.createAppointment('tenant-123', {
        slot_instance_id: 'slot-123',
        patient_id: 'patient-123',
        service_id: 'service-123',
        doctor_id: 'doctor-123',
        source: 'web',
      });

      // 验证 slot_instances 被查询和更新
      expect(mockSupabase.from).toHaveBeenCalledWith('slot_instances');
    });
  });

  // ============================================================
  // 4. 清理
  // ============================================================

  afterAll(() => {
    // 无需清理数据库，所有操作都在内存中
    console.log('✅ 纯 Mock 测试完成，无数据库污染');
  });
});