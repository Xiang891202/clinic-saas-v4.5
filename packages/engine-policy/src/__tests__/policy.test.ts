// packages/engine-policy/src/__tests__/policy.test.ts
import { describe, it, expect } from '@jest/globals';
import { PolicyEngine } from '../index.js';
import { NotificationFailureEvent, QueueDepthHighEvent, LoginAnomalyEvent } from '../types.js';

describe('PolicyEngine', () => {
  const engine = new PolicyEngine();

  it('should generate action plan for notification failure', () => {
    const event: NotificationFailureEvent = {
      type: 'NOTIFICATION_FAILURE',
      timestamp: new Date(),
      tenantId: 'tenant-123',
      context: {
        channel: 'email',
        bookingId: 'booking-123',
        error: 'SMTP timeout',
        retryCount: 4,
      },
    };

    const plan = engine.evaluate(event);
    expect(plan.actions.length).toBeGreaterThan(0);
    expect(plan.actions.some(a => a.type === 'DEGRADE_SERVICE')).toBe(true);
    expect(plan.actions.some(a => a.type === 'LOG_EVENT')).toBe(true);
    expect(plan.status).toBe('pending');
  });

  it('should not degrade if retry count low', () => {
    const event: NotificationFailureEvent = {
      type: 'NOTIFICATION_FAILURE',
      timestamp: new Date(),
      tenantId: 'tenant-123',
      context: {
        channel: 'email',
        bookingId: 'booking-123',
        error: 'Temporary error',
        retryCount: 1,
      },
    };

    const plan = engine.evaluate(event);
    expect(plan.actions.some(a => a.type === 'DEGRADE_SERVICE')).toBe(false);
    expect(plan.actions.some(a => a.type === 'LOG_EVENT')).toBe(true);
  });

  it('should handle queue depth high event', () => {
    const event: QueueDepthHighEvent = {
      type: 'QUEUE_DEPTH_HIGH',
      timestamp: new Date(),
      context: {
        queueName: 'notification.queue',
        depth: 75,
        threshold: 50,
      },
    };

    const plan = engine.evaluate(event);
    expect(plan.actions.some(a => a.type === 'DEGRADE_SERVICE' && a.target === 'queue')).toBe(true);
    expect(plan.actions.some(a => a.type === 'SEND_ALERT')).toBe(true);
  });

  it('should handle login anomaly', () => {
    const event: LoginAnomalyEvent = {
      type: 'LOGIN_ANOMALY',
      timestamp: new Date(),
      context: {
        email: 'admin@clinic.com',
        ip: '192.168.1.1',
        failedAttempts: 6,
      },
    };

    const plan = engine.evaluate(event);
    expect(plan.actions.some(a => a.type === 'SEND_ALERT' && a.severity === 'critical')).toBe(true);
    expect(plan.actions.some(a => a.type === 'LOG_EVENT')).toBe(true);
  });
});