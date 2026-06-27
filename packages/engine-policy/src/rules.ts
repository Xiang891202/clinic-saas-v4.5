// packages/engine-policy/src/rules.ts
import {
  PolicyEvent,
  Action,
  DegradeAction,
  SendAlertAction,
  LogEventAction,
  NotificationFailureEvent,
  QueueDepthHighEvent,
  ServiceDegradedEvent,
  LoginAnomalyEvent,
} from './types.js';

export type Rule = {
  name: string;
  condition: (event: PolicyEvent) => boolean;
  actions: (event: PolicyEvent) => Action[];
  priority: number; // 1-10，1 最高
};

// ============ 类型守卫（修正） ============
function isNotificationFailureEvent(event: PolicyEvent): event is NotificationFailureEvent {
  return event.type === 'NOTIFICATION_FAILURE';
}

function isQueueDepthHighEvent(event: PolicyEvent): event is QueueDepthHighEvent {
  return event.type === 'QUEUE_DEPTH_HIGH';
}

function isServiceDegradedEvent(event: PolicyEvent): event is ServiceDegradedEvent {
  return event.type === 'SERVICE_DEGRADED';
}

function isLoginAnomalyEvent(event: PolicyEvent): event is LoginAnomalyEvent {
  return event.type === 'LOGIN_ANOMALY';
}

// ============ 规则定义 ============
export const rules: Rule[] = [
  // 规则 1：通知失败 → 记录日志 + 降级（如果失败率过高）
  {
    name: 'notification-failure-handler',
    priority: 2,
    condition: (event) => isNotificationFailureEvent(event),
    actions: (event) => {
      const e = event as NotificationFailureEvent; // 类型断言
      const actions: Action[] = [
        {
          type: 'LOG_EVENT',
          priority: 10,
          level: 'error',
          message: `通知发送失败: ${e.context.error}`,
          metadata: e.context,
        } as LogEventAction,
      ];

      // 如果重试超过 3 次，降级 Email 服务
      if (e.context.retryCount >= 3 && e.context.channel === 'email') {
        actions.push({
          type: 'DEGRADE_SERVICE',
          priority: 1,
          target: 'email',
          reason: `Email 通知失败 ${e.context.retryCount} 次`,
          duration: 300, // 降级 5 分钟
        } as DegradeAction);
      }

      return actions;
    },
  },

  // 规则 2：Queue 深度过高 → 降级（限流）
  {
    name: 'queue-depth-high-handler',
    priority: 1,
    condition: (event) => isQueueDepthHighEvent(event) && event.context.depth > 50,
    actions: (event) => {
      const e = event as QueueDepthHighEvent;
      const actions: Action[] = [
        {
          type: 'LOG_EVENT',
          priority: 10,
          level: 'warn',
          message: `Queue 深度过高: ${e.context.depth} > ${e.context.threshold}`,
          metadata: e.context,
        } as LogEventAction,
        {
          type: 'DEGRADE_SERVICE',
          priority: 1,
          target: 'queue',
          reason: `Queue 深度 ${e.context.depth} 超过阈值 ${e.context.threshold}`,
          duration: 600, // 降级 10 分钟
        } as DegradeAction,
        {
          type: 'SEND_ALERT',
          priority: 5,
          channel: 'admin',
          severity: 'warning',
          message: `Queue 深度异常: ${e.context.queueName} 深度 ${e.context.depth}`,
        } as SendAlertAction,
      ];

      return actions;
    },
  },

  // 规则 3：服务降级事件（接收外部决策）
  {
    name: 'service-degraded-handler',
    priority: 2,
    condition: (event) => isServiceDegradedEvent(event),
    actions: (event) => {
      const e = event as ServiceDegradedEvent;
      return [
        {
          type: 'LOG_EVENT',
          priority: 10,
          level: 'warn',
          message: `服务 ${e.context.serviceName} 已降级，失败率 ${e.context.failureRate}%`,
          metadata: e.context,
        } as LogEventAction,
        {
          type: 'SEND_ALERT',
          priority: 5,
          channel: 'admin',
          severity: 'warning',
          message: `服务 ${e.context.serviceName} 降级告警`,
        } as SendAlertAction,
      ];
    },
  },

  // 规则 4：登入异常 → 通知管理员
  {
    name: 'login-anomaly-handler',
    priority: 3,
    condition: (event) => isLoginAnomalyEvent(event) && event.context.failedAttempts >= 5,
    actions: (event) => {
      const e = event as LoginAnomalyEvent;
      return [
        {
          type: 'LOG_EVENT',
          priority: 10,
          level: 'warn',
          message: `登入异常: ${e.context.email} 失败 ${e.context.failedAttempts} 次`,
          metadata: e.context,
        } as LogEventAction,
        {
          type: 'SEND_ALERT',
          priority: 5,
          channel: 'admin',
          severity: 'critical',
          message: `登入异常: ${e.context.email} 尝试失败 ${e.context.failedAttempts} 次，IP ${e.context.ip}`,
        } as SendAlertAction,
      ];
    },
  },
];