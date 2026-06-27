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
    smtpConfig: { host: string; port: number; user: string; pass: string }
  ) {
    this.supabase = supabase;
    this.redis = redis;
    this.jwtSecret = jwtSecret;
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
  async verifyOtp(email: string, otp: string): Promise<{
    success: boolean;
    token: string;
    user: { id: string; role: string; tenant_id: string; name: string };
    needsProfile: boolean;
  }> {
    if (!email || !otp) {
      throw new Error("Email 和驗證碼為必填");
    }

    const data = await this.redis.get(`otp:${email}`);
    if (!data) {
      throw new Error("驗證碼已過期或無效");
    }

    const { otp: storedOtp } = JSON.parse(data);
    if (storedOtp !== otp) {
      throw new Error("驗證碼錯誤");
    }

    // 查詢或建立病人
    let { data: patient, error } = await this.supabase
      .from("patients")
      .select("*")
      .eq("telecom_email", email)
      .maybeSingle();

    if (!patient) {
      const { data: newPatient, error: insertError } = await this.supabase
        .from("patients")
        .insert({
          tenant_id: "550e8400-e29b-41d4-a716-446655440000",
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
    }

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

  // ========== ✅ 新增：診所管理員登入（含安全防護） ==========
  async login(email: string, password: string, ip: string): Promise<{
    success: boolean;
    token: string;
    user: { id: string; email: string; role: string; tenant_id: string };
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
      // 查無此人 → 記錄失敗（但無法識別 email，用 email 當識別）
      await accountLocker.recordFailedAttempt(identifier);
      throw new Error("帳號或密碼錯誤");
    }

    // 4. 驗證密碼
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      const { isLocked } = await accountLocker.recordFailedAttempt(identifier);
      if (isLocked) {
        throw new Error("失敗次數過多，帳號已鎖定 15 分鐘");
      }
      throw new Error("帳號或密碼錯誤");
    }

    // 5. 成功 → 清除失敗記錄，產生 Token
    await accountLocker.clearFailedAttempts(identifier);

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
      },
    };
  }
}