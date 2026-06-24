export type AuthRole = "patient" | "doctor" | "clinic_admin";

export type AuthState =
  | "INIT"          // 尚未開始
  | "CHECKING"      // 檢查中
  | "CALLBACK"      // 處理 OAuth 回調
  | "REDIRECTING"   // 跳轉到 LINE 授權
  | "LOGGED_IN"     // 已登入
  | "ERROR";        // 錯誤

export interface AuthContext {
  role?: AuthRole;
  tenantId?: string;
  redirectUri?: string;
}

export interface AuthResult {
  success: boolean;
  state: AuthState;
  token?: string;
  userId?: string;
  role?: AuthRole;
  tenantId?: string;
  name?: string;
  error?: string;
}

export interface AuthStorage {
  token: string | null;
  role: AuthRole | null;
  tenantId: string | null;
  userId: string | null;
  name: string | null;
}
