// packages/engine-policy/src/__tests__/executor.test.ts
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ActionExecutor } from '../executor.js';
import { DegradeAction, SendAlertAction } from '../types.js';

describe('ActionExecutor', () => {
  let mockRedis: any;
  let mockSupabase: any;
  let mockSendEmail: jest.Mock;
  let mockLog: jest.Mock;
  let executor: ActionExecutor;

  beforeEach(() => {
    mockRedis = {
      setex: jest.fn().mockResolvedValue('OK'),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };
    mockSupabase = {
      from: jest.fn().mockReturnValue({
        insert: jest.fn().mockReturnValue({
          then: jest.fn(),
        }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              is: jest.fn().mockReturnValue({
                then: jest.fn(),
              }),
            }),
          }),
        }),
      }),
    };
    mockSendEmail = jest.fn().mockResolvedValue(undefined);
    mockLog = jest.fn();

    executor = new ActionExecutor({
      redis: mockRedis,
      supabase: mockSupabase,
      sendEmail: mockSendEmail,
      log: mockLog,
    });
  });

  it('should execute degrade action', async () => {
    const action: DegradeAction = {
      type: 'DEGRADE_SERVICE',
      priority: 1,
      target: 'email',
      reason: '测试降级',
      duration: 300,
    };

    // executeAction 现为 public，可直接调用
    await expect(executor.executeAction(action)).resolves.not.toThrow();
    expect(mockRedis.setex).toHaveBeenCalledWith('degraded:email', 300, expect.any(String));
    expect(mockLog).toHaveBeenCalledWith('warn', '服务降级: email - 测试降级', expect.any(Object));
  });

  it('should execute send alert action', async () => {
    const action: SendAlertAction = {
      type: 'SEND_ALERT',
      priority: 5,
      channel: 'admin',
      severity: 'warning',
      message: '测试告警',
    };

    await expect(executor.executeAction(action)).resolves.not.toThrow();
    expect(mockSupabase.from).toHaveBeenCalledWith('alert_history');
  });
});