// packages/engine-policy/src/types.ts

// ============ 事件类型 ============
export type PolicyEvent =
  | NotificationFailureEvent
  | QueueDepthHighEvent
  | ServiceDegradedEvent
  | LoginAnomalyEvent;

export interface BaseEvent {
  type: string;
  timestamp: Date;
  tenantId?: string;
  context: Record<string, any>;
}

export interface NotificationFailureEvent extends BaseEvent {
  type: 'NOTIFICATION_FAILURE';
  context: {
    channel: 'email' | 'line';
    bookingId: string;
    error: string;
    retryCount: number;
  };
}

export interface QueueDepthHighEvent extends BaseEvent {
  type: 'QUEUE_DEPTH_HIGH';
  context: {
    queueName: string;
    depth: number;
    threshold: number;
  };
}

export interface ServiceDegradedEvent extends BaseEvent {
  type: 'SERVICE_DEGRADED';
  context: {
    serviceName: string;
    failureRate: number;
    duration: number; // 持续秒数
  };
}

export interface LoginAnomalyEvent extends BaseEvent {
  type: 'LOGIN_ANOMALY';
  context: {
    email: string;
    ip: string;
    failedAttempts: number;
  };
}

// ============ Action 类型 ============
export type Action = DegradeAction | RestoreAction | SendAlertAction | LogEventAction | NotifyAdminAction;

export interface BaseAction {
  type: string;
  priority: number; // 1-10, 1 最高
}

export interface DegradeAction extends BaseAction {
  type: 'DEGRADE_SERVICE';
  target: 'email' | 'line' | 'queue' | 'all';
  reason: string;
  duration?: number; // 降级持续时间（秒），不填则持续直到手动恢复
}

export interface RestoreAction extends BaseAction {
  type: 'RESTORE_SERVICE';
  target: 'email' | 'line' | 'queue' | 'all';
  reason: string;
}

export interface SendAlertAction extends BaseAction {
  type: 'SEND_ALERT';
  channel: 'admin' | 'tenant' | 'system';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  metadata?: Record<string, any>;
}

export interface LogEventAction extends BaseAction {
  type: 'LOG_EVENT';
  level: 'info' | 'warn' | 'error';
  message: string;
  metadata?: Record<string, any>;
}

export interface NotifyAdminAction extends BaseAction {
  type: 'NOTIFY_ADMIN';
  email: string;
  subject: string;
  body: string;
}

// ============ ActionPlan ============
export interface ActionPlan {
  id: string;
  event: PolicyEvent;
  actions: Action[];
  executedAt?: Date;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  error?: string;
}