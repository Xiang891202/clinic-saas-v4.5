// backend/src/monitors/queueMonitor.ts
import { Redis } from "ioredis";
import { Queue, QueueOptions } from "bullmq"; // ✅ 引入 QueueOptions
import { ActionExecutor, PolicyEngine } from "../../../packages/engine-policy/src/index.js";

interface QueueMonitorConfig {
  queueName: string;
  threshold: number;        // 触发告警的阈值
  criticalThreshold: number; // 触发降级的阈值
  checkInterval: number;    // 检查间隔（秒）
}

export class QueueMonitor {
  private redis: Redis; // 用於原本的 redis.get / redis.setex 操作
  private connectionOptions: QueueOptions["connection"]; // ✅ 新增：用來存 BullMQ 專用連線配置
  private policyEngine: PolicyEngine;
  private executor: ActionExecutor;
  private configs: QueueMonitorConfig[];
  private isRunning: boolean = false;

  constructor(
    // ⚠️ 調整第一個參數：改成一個包含實例與配置的物件，完美相容現有架構
    redisSetup: { instance: Redis; config: QueueOptions["connection"] },
    policyEngine: PolicyEngine,
    executor: ActionExecutor,
    configs: QueueMonitorConfig[] = []
  ) {
    this.redis = redisSetup.instance;           // 儲存主實例供快取、趨勢檢測使用
    this.connectionOptions = redisSetup.config;  // ✅ 儲存配置物件供 BullMQ 使用
    this.policyEngine = policyEngine;
    this.executor = executor;
    this.configs = configs.length > 0 ? configs : [
      {
        queueName: "notification.queue",
        threshold: 30,    // 30 条告警
        criticalThreshold: 50, // 50 条降级
        checkInterval: 30,
      },
      {
        queueName: "billing.queue",
        threshold: 20,
        criticalThreshold: 40,
        checkInterval: 60,
      },
    ];
  }

  /**
   * 启动监控
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn("⚠️ Queue Monitor 已在运行");
      return;
    }

    this.isRunning = true;
    console.log(`🔄 Queue Monitor 已启动，监控 ${this.configs.length} 个队列`);

    // 立即执行一次
    await this.check();

    // 定时执行
    setInterval(async () => {
      await this.check();
    }, 10000); // 每 10 秒检查一次（各队列独立间隔在内部实现）
  }

  /**
   * 停止监控
   */
  stop(): void {
    this.isRunning = false;
    console.log("🛑 Queue Monitor 已停止");
  }

  /**
   * 执行一次检查
   */
  async check(): Promise<void> {
    if (!this.isRunning) return;

    try {
      for (const config of this.configs) {
        await this.checkQueue(config);
      }
    } catch (error: any) {
      console.error("❌ Queue Monitor 检查失败:", error.message);
    }
  }

  /**
   * 检查单个队列
   */
  private async checkQueue(config: QueueMonitorConfig): Promise<void> {
    try {
        // console.log('🔍 [QueueMonitor] connectionOptions:', JSON.stringify(this.connectionOptions, null, 2));
      // ✅ 修正：改用連線配置物件，BullMQ 會自己建立安全的雲端連線，絕不退回本地 IP
      const queue = new Queue(config.queueName, { connection: this.connectionOptions }); // ✅ 使用配置对象
      
      // 获取队列状态
      const counts = await queue.getJobCounts();
      const total = counts.waiting + counts.active + counts.delayed;
      
      // 更新上次检查状态（用于趋势检测）
      const lastKey = `queue:${config.queueName}:last_depth`;
      const lastDepth = parseInt((await this.redis.get(lastKey)) || "0", 10);
      await this.redis.setex(lastKey, 3600, String(total));

      // 判断是否需要触发事件
      if (total >= config.criticalThreshold) {
        // 严重：触发降级事件
        console.warn(`⚠️ 队列 ${config.queueName} 深度 ${total} 超过临界阈值 ${config.criticalThreshold}`);
        await this.triggerQueueEvent(config.queueName, total, config.criticalThreshold, "critical");
      } else if (total >= config.threshold) {
        // 警告：触发告警事件
        console.warn(`⚠️ 队列 ${config.queueName} 深度 ${total} 超过阈值 ${config.threshold}`);
        await this.triggerQueueEvent(config.queueName, total, config.threshold, "warning");
      } else if (total < config.threshold && lastDepth >= config.threshold) {
        // 已恢复正常，触发恢复事件
        console.log(`✅ 队列 ${config.queueName} 已恢复 (${total})`);
        await this.triggerRestoreEvent(config.queueName, "队列深度已恢复正常");
      }

      // 关闭队列连接
      await queue.close();
    } catch (error: any) {
      console.error(`❌ 检查队列 ${config.queueName} 失败:`, error.message);
    }
  }

  /**
   * 触发队列深度事件
   */
  private async triggerQueueEvent(
    queueName: string,
    depth: number,
    threshold: number,
    severity: "warning" | "critical"
  ): Promise<void> {
    const event = {
      type: "QUEUE_DEPTH_HIGH" as const,
      timestamp: new Date(),
      context: {
        queueName,
        depth,
        threshold,
        severity,
      },
    };

    const plan = this.policyEngine.evaluate(event);
    await this.executor.execute(plan);
  }

  /**
   * 触发恢复事件
   */
  private async triggerRestoreEvent(queueName: string, reason: string): Promise<void> {
    const event = {
      type: "SERVICE_RESTORE" as const,
      timestamp: new Date(),
      context: {
        serviceName: "queue",
        reason,
        source: "queue-monitor",
        queueName,
      },
    };

    const plan = this.policyEngine.evaluate(event);
    await this.executor.execute(plan);
  }

  /**
   * 手动检查特定队列
   */
  async checkQueueNow(queueName: string): Promise<{ total: number; threshold: number; criticalThreshold: number }> {
    const config = this.configs.find(c => c.queueName === queueName);
    if (!config) {
      throw new Error(`未找到队列配置: ${queueName}`);
    }

    // ✅ 修正：改用連線配置物件
    const queue = new Queue(queueName, { connection: this.connectionOptions }); // ✅ 使用配置对象
    const counts = await queue.getJobCounts();
    const total = counts.waiting + counts.active + counts.delayed;
    await queue.close();

    return {
      total,
      threshold: config.threshold,
      criticalThreshold: config.criticalThreshold,
    };
  }
}
