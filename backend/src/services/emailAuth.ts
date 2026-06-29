// backend/src/services/emailAuth.ts
import { SupabaseClient } from "@supabase/supabase-js";
import { Redis as RedisClient } from "ioredis";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import bcrypt from "bcrypt";
import { AccountLocker } from '../../../packages/shared/src/security/accountLocker.ts';
import { IpRateLimiter } from '../../../packages/shared/src/security/ipRateLimiter.ts';

export class EmailAuthService {
  private supabase: SupabaseClient;
  private redis: RedisClient;
  private transporter: nodemailer.Transporter;
  private jwtSecret: string;

  constructor(
    supabase: SupabaseClient,
    redis: RedisClient,
    jwtSecret: string,
    smtpConfig: { host: string; port: number; user: string; pass: string },
    policyEngine: PolicyEngine  // ✅ 新增
  ) {
    this.supabase = supabase;
    this.redis = redis;
    this.jwtSecret = jwtSecret;
    this.policyEngine = policyEngine;
    this.transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: false,
      auth: {
        user: smtpConfig.user,
        pass: smtpConfig.pass,
      },
    });
  }

  // ========== 發送 OTP（既有方法） ==========
  async sendOtp(email: string): Promise<{ success: boolean; message: string }> {
    if (!email) {
      throw new Error("Email 為必填");
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await this.redis.setex(`otp:${email}`, 300, JSON.stringify({ otp }));

    try {
      await this.transporter.sendMail({
        from: process.env.SMTP_USER,
        to: email,
        subject: "[診所系統] 驗證碼",
        text: `您的驗證碼是：${otp}\n有效期限 5 分鐘。`,
      });
      return { success: true, message: "驗證碼已發送至信箱" };
    } catch (err) {
      throw new Error("發送驗證碼失敗");
    }
  }

  // ========== 驗證 OTP（既有方法） ==========
  async verifyOtp(
    email: string,
    otp: string,
    clinicCode?: string
  ): Promise<{
    success: boolean;
    token: string;
    user: { id: string; role: string; tenant_id: string; name: string };
    needsProfile: boolean;
  }> {
    if (!email || !otp) {
      throw new Error("Email 和驗證碼為必填");
    }

    // 1. 驗證 OTP
    const data = await this.redis.get(`otp:${email}`);
    if (!data) {
      throw new Error("驗證碼已過期或無效");
    }

    const { otp: storedOtp } = JSON.parse(data);
    if (storedOtp !== otp) {
      throw new Error("驗證碼錯誤");
    }

    // 2. ✅ 查詢診所（新增）
    if (!clinicCode) {
      throw new Error("請選擇診所");
    }

    const { data: tenant, error: tenantError } = await this.supabase
      .from("tenants")
      .select("id, status")
      .eq("public_code", clinicCode)
      .maybeSingle();

    if (tenantError || !tenant) {
      throw new Error("診所代碼無效，請確認後重新輸入");
    }

    if (tenant.status !== "active") {
      throw new Error("該診所目前未啟用，請聯繫管理員");
    }

    const tenantId = tenant.id;

    // 3. 查詢或建立病人
    let { data: patient, error } = await this.supabase
      .from("patients")
      .select("*")
      .eq("telecom_email", email)
      .maybeSingle();

    if (!patient) {
      const { data: newPatient, error: insertError } = await this.supabase
        .from("patients")
        .insert({
          tenant_id: tenantId,          // ✅ 使用查到的 tenantId
          name_given: "訪客",
          name_family: "使用者",
          telecom_email: email,
          email_verified: true,
        })
        .select()
        .single();

      if (insertError) {
        throw new Error("建立病人失敗: " + insertError.message);
      }
      patient = newPatient;
    } else {
      // ✅ 若病人已存在但 tenant_id 不同，更新為新的診所
      if (patient.tenant_id !== tenantId) {
        const { error: updateError } = await this.supabase
          .from("patients")
          .update({ tenant_id: tenantId })
          .eq("id", patient.id);

        if (updateError) {
          console.error("更新病人診所綁定失敗:", updateError);
        }
      }
    }

    // 4. 生成 JWT
    const token = jwt.sign(
      { patientId: patient.id, tenantId: patient.tenant_id },
      this.jwtSecret,
      { expiresIn: "7d" }
    );

    await this.redis.del(`otp:${email}`);

    const needsProfile =
      !patient.name_given ||
      !patient.name_family ||
      patient.name_given === "訪客" ||
      patient.name_family === "使用者" ||
      !patient.telecom_phone;

    return {
      success: true,
      token,
      user: {
        id: patient.id,
        role: "patient",
        tenant_id: patient.tenant_id,
        name: patient.name_given || "使用者",
      },
      needsProfile,
    };
  }

  // ========== ✅ 診所管理員登入（含安全防護 + Policy 事件） ==========
  async login(email: string, password: string, ip: string): Promise<{
    success: boolean;
    token: string;
    user: { id: string; email: string; role: string; tenant_id: string };
    hasFailedNotifications?: boolean;  // ✅ 新增
    failedNotificationCount?: number;  // ✅ 新增
  }> {
    // 1. IP 限流檢查
    const ipLimiter = new IpRateLimiter(this.redis);
    const { allowed } = await ipLimiter.checkAndRecord(ip);
    if (!allowed) {
      throw new Error("請求過於頻繁，請稍後再試");
    }

    const identifier = `email:${email}`;
    const accountLocker = new AccountLocker(this.redis);

    // 2. 帳號鎖定檢查
    if (await accountLocker.isLocked(identifier)) {
      throw new Error("帳號已被鎖定，請 15 分鐘後再試");
    }

    // 3. 查詢使用者（僅限 clinic_admin 或 admin）
    const { data: user, error } = await this.supabase
      .from("users")
      .select("id, email, password_hash, role, tenant_id")
      .eq("email", email)
      .in("role", ["clinic_admin", "admin"])
      .single();

    if (error || !user) {
      await accountLocker.recordFailedAttempt(identifier);
      throw new Error("帳號或密碼錯誤");
    }

    // 4. 驗證密碼
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      const { attempts, isLocked } = await accountLocker.recordFailedAttempt(identifier);
      if (isLocked) {
        // ✅ 觸發 Policy 事件：登入失敗超標
        await this.triggerPolicyEvent(
          'LOGIN_FAILURE_EXCEEDED',
          {
            email,
            ip,
            attempts,
            lockedAt: new Date(),
          },
          user.tenant_id
        );
        throw new Error('失敗次數過多，帳號已鎖定 15 分鐘');
      }
      throw new Error('帳號或密碼錯誤');
    }

    // 5. 成功 → 清除失敗記錄
    await accountLocker.clearFailedAttempts(identifier);
    

    // ✅ 檢查是否有未處理的失敗通知（觸發 CLINIC_LOGIN_ALERT）
    // ✅ 查詢未處理的失敗通知
    const { data: failedNotifications, count } = await this.supabase
      .from('notification_logs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', user.tenant_id)
      .eq('status', 'failed')
      .is('acknowledged', null)
      .limit(1);

    const hasFailedNotifications = (count || 0) > 0;

    if (failedNotifications && failedNotifications.length > 0) {
      await this.triggerPolicyEvent(
        'CLINIC_LOGIN_ALERT',
        {
          email,
          tenantId: user.tenant_id,
          failedNotifications: failedNotifications.map((n: any) => ({
            id: n.id,
            bookingId: n.booking_event_id,
            channel: n.channel,
            error: n.detail?.error || '未知錯誤',
            createdAt: n.created_at,
          })),
        },
        user.tenant_id
      );
    }

    // 6. 產生 Token
    const token = jwt.sign(
      { userId: user.id, tenantId: user.tenant_id, role: user.role },
      this.jwtSecret,
      { expiresIn: "7d" }
    );

    return {
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        tenant_id: user.tenant_id,
        hasFailedNotifications,      // ✅ 回傳
        failedNotificationCount: count || 0,  // ✅ 回傳
      },
    };
  }

  private async triggerPolicyEvent(
    type: string,
    context: Record<string, any>,
    tenantId?: string
  ): Promise<void> {
    try {
      const event = {
        type,
        timestamp: new Date(),
        tenantId,
        context,
      };
      // 需要注入 PolicyEngine 實例，或透過 Supabase/Redis 傳遞
      // 暫時使用 console 記錄，待整合 PolicyEngine
      console.log(`[Policy Event] ${type}`, event);
    } catch (error) {
      console.error('觸發 Policy 事件失敗:', error);
    }
  }
}