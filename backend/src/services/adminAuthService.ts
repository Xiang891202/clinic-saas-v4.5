// backend/src/services/adminAuthService.ts
import { SupabaseClient } from "@supabase/supabase-js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

export class AdminAuthService {
  constructor(private supabase: SupabaseClient) {}

  async login(email: string, password: string) {
    if (!email || !password) {
      throw new Error("Email 和密碼為必填");
    }

    // ✅ 查詢 role = 'admin' 的使用者
    const { data: user, error } = await this.supabase
      .from("users")
      .select("id, email, password_hash, role, tenant_id")
      .eq("email", email)
      .eq("role", "admin")
      .single();

    if (error || !user) {
      throw new Error("帳號或密碼錯誤");
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      throw new Error("帳號或密碼錯誤");
    }

    const token = jwt.sign(
      { userId: user.id, tenantId: user.tenant_id, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: "7d" }
    );

    return {
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          tenant_id: user.tenant_id,
        },
      },
    };
  }
}