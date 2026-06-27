// packages/engine-policy/src/executor.ts
import {
  Action,
  ActionPlan,
  DegradeAction,
  RestoreAction,
  SendAlertAction,
  LogEventAction,
  NotifyAdminAction,
} from './types.js';

export interface ExecutorDependencies {
  redis: any;          // Redis 实例
  supabase: any;       // Supabase 客户端
  sendEmail: (to: string, subject: string, body: string) => Promise<void>;
  log: (level: string, message: string, metadata?: any) => void;
}

export class ActionExecutor {
  private deps: ExecutorDependencies;

  constructor(deps: ExecutorDependencies) {
    this.deps = deps;
  }

  /**
   * 执行完整的 ActionPlan
   */
  async execute(plan: ActionPlan): Promise<ActionPlan> {
    plan.status = 'executing';

    try {
      for (const action of plan.actions) {
        await this.executeAction(action);
      }
      plan.status = 'completed';
      plan.executedAt = new Date();
    } catch (error: any) {
      plan.status = 'failed';
      plan.error = error.message;
      this.deps.log('error', `ActionPlan 执行失败: ${error.message}`, { planId: plan.id });
    }

    return plan;
  }

  /**
   * 执行单个 Action（改为 public 以便测试）
   */
  public async executeAction(action: Action): Promise<void> {
    switch (action.type) {
      case 'DEGRADE_SERVICE':
        await this.executeDegrade(action as DegradeAction);
        break;
      case 'RESTORE_SERVICE':
        await this.executeRestore(action as RestoreAction);
        break;
      case 'SEND_ALERT':
        await this.executeSendAlert(action as SendAlertAction);
        break;
      case 'LOG_EVENT':
        await this.executeLogEvent(action as LogEventAction);
        break;
      case 'NOTIFY_ADMIN':
        await this.executeNotifyAdmin(action as NotifyAdminAction);
        break;
      default:
        // 所有类型均已覆盖，此处保留以防万一
        this.deps.log('warn', `未知 Action 类型: ${(action as any).type}`);
    }
  }

  // ============================================
  // 1. DEGRADE_SERVICE - 服务降级
  // ============================================
  private async executeDegrade(action: DegradeAction): Promise<void> {
    const { target, reason, duration } = action;

    // 存储降级状态到 Redis（TTL = duration）
    const key = `degraded:${target}`;
    const value = JSON.stringify({
      target,
      reason,
      degradedAt: new Date().toISOString(),
      duration: duration || 0,
    });

    if (duration) {
      await this.deps.redis.setex(key, duration, value);
    } else {
      await this.deps.redis.set(key, value);
    }

    // 记录到数据库（持久化降级事件）
    await this.deps.supabase
      .from('service_degradation')
      .insert({
        service_name: target,
        status: 'degraded',
        degraded_reason: reason,
        degraded_at: new Date().toISOString(),
        duration_seconds: duration || null,
      });

    this.deps.log('warn', `服务降级: ${target} - ${reason}`, { duration });

    // 如果是 queue 降级，需要额外处理
    if (target === 'queue') {
      // TODO: 通知 Worker 降低并发
      this.deps.log('info', `Queue 降级: 建议降低 Worker 并发`);
    }
  }

  // ============================================
  // 2. RESTORE_SERVICE - 服务恢复
  // ============================================
  private async executeRestore(action: RestoreAction): Promise<void> {
    const { target, reason } = action;

    // 从 Redis 删除降级标记
    const key = `degraded:${target}`;
    await this.deps.redis.del(key);

    // 更新数据库状态
    await this.deps.supabase
      .from('service_degradation')
      .update({
        status: 'restored',
        restored_at: new Date().toISOString(),
        restored_reason: reason,
      })
      .eq('service_name', target)
      .eq('status', 'degraded')
      .is('restored_at', null);

    this.deps.log('info', `服务恢复: ${target} - ${reason}`);
  }

  // ============================================
  // 3. SEND_ALERT - 发送告警
  // ============================================
  private async executeSendAlert(action: SendAlertAction): Promise<void> {
    const { channel, severity, message, metadata } = action;

    // 1. 记录到 alert_history
    await this.deps.supabase
      .from('alert_history')
      .insert({
        channel,
        severity,
        message,
        metadata: metadata || {},
        created_at: new Date().toISOString(),
        is_dismissed: false,
      });

    // 2. 根据 channel 发送告警
    switch (channel) {
      case 'admin':
        await this.sendAdminAlert(severity, message, metadata);
        break;
      case 'tenant':
        // 发送给诊所管理员（如果 tenantId 存在）
        if (metadata?.tenantId) {
          await this.sendTenantAlert(metadata.tenantId, severity, message);
        }
        break;
      case 'system':
        // 系统日志已经记录
        this.deps.log('warn', `[ALERT] ${severity}: ${message}`, metadata);
        break;
      default:
        this.deps.log('warn', `未知告警渠道: ${channel}`);
    }
  }

  private async sendAdminAlert(severity: string, message: string, metadata?: any): Promise<void> {
    // 获取管理员邮箱列表
    const { data: admins } = await this.deps.supabase
      .from('users')
      .select('email')
      .eq('role', 'admin')
      .eq('is_active', true);

    if (!admins || admins.length === 0) {
      this.deps.log('warn', '没有找到管理员邮箱，跳过告警邮件');
      return;
    }

    const emails = admins.map((a: any) => a.email);
    const subject = `[${severity.toUpperCase()}] Clinic SaaS 告警通知`;
    const body = `
系统告警
严重程度: ${severity}
消息: ${message}
时间: ${new Date().toISOString()}
${metadata ? `\n额外信息: ${JSON.stringify(metadata, null, 2)}` : ''}
    `;

    for (const email of emails) {
      try {
        await this.deps.sendEmail(email, subject, body);
      } catch (err) {
        this.deps.log('error', `发送告警邮件给 ${email} 失败:`, err);
      }
    }
  }

  private async sendTenantAlert(tenantId: string, severity: string, message: string): Promise<void> {
    // 获取诊所管理员
    const { data: admins } = await this.deps.supabase
      .from('users')
      .select('email')
      .eq('tenant_id', tenantId)
      .eq('role', 'clinic_admin')
      .eq('is_active', true);

    if (!admins || admins.length === 0) return;

    const emails = admins.map((a: any) => a.email);
    const subject = `[${severity.toUpperCase()}] 诊所通知`;
    const body = `诊所: ${tenantId}\n消息: ${message}\n时间: ${new Date().toISOString()}`;

    for (const email of emails) {
      try {
        await this.deps.sendEmail(email, subject, body);
      } catch (err) {
        this.deps.log('error', `发送诊所告警给 ${email} 失败:`, err);
      }
    }
  }

  // ============================================
  // 4. LOG_EVENT - 记录事件日志
  // ============================================
  private async executeLogEvent(action: LogEventAction): Promise<void> {
    const { level, message, metadata } = action;

    // 写入 audit_logs（不可修改）
    await this.deps.supabase
      .from('audit_logs')
      .insert({
        action: 'policy_event',
        level,
        message,
        metadata: metadata || {},
        created_at: new Date().toISOString(),
      });

    // 同时写入应用日志
    this.deps.log(level, `[PolicyEvent] ${message}`, metadata);
  }

  // ============================================
  // 5. NOTIFY_ADMIN - 通知管理员
  // ============================================
  private async executeNotifyAdmin(action: NotifyAdminAction): Promise<void> {
    const { email, subject, body } = action;

    try {
      await this.deps.sendEmail(email, subject, body);
      this.deps.log('info', `通知管理员邮件已发送: ${email}`);
    } catch (err) {
      this.deps.log('error', `发送管理员通知失败: ${email}`, err);
      throw err;
    }
  }
}