import { AuthState, AuthContext, AuthResult, AuthStorage, AuthRole } from "./types.js";

// =============================================
// 狀態機核心
// =============================================

let currentState: AuthState = "INIT";
let loginLock = false;
let storage: AuthStorage = {
  token: null,
  role: null,
  tenantId: null,
  userId: null,
  name: null,
};

// 從 localStorage 載入
export function loadAuthFromStorage(): void {
  storage.token = localStorage.getItem("auth_token");
  storage.role = localStorage.getItem("auth_role") as AuthRole | null;
  storage.tenantId = localStorage.getItem("auth_tenant_id");
  storage.userId = localStorage.getItem("auth_user_id");
  storage.name = localStorage.getItem("auth_user_name");
}

// 儲存到 localStorage
export function saveAuthToStorage(data: Partial<AuthStorage>): void {
  if (data.token !== undefined) {
    storage.token = data.token;
    localStorage.setItem("auth_token", data.token || "");
  }
  if (data.role !== undefined) {
    storage.role = data.role;
    localStorage.setItem("auth_role", data.role || "");
  }
  if (data.tenantId !== undefined) {
    storage.tenantId = data.tenantId;
    localStorage.setItem("auth_tenant_id", data.tenantId || "");
  }
  if (data.userId !== undefined) {
    storage.userId = data.userId;
    localStorage.setItem("auth_user_id", data.userId || "");
  }
  if (data.name !== undefined) {
    storage.name = data.name;
    localStorage.setItem("auth_user_name", data.name || "");
  }
}

export function clearAuth(): void {
  storage = { token: null, role: null, tenantId: null, userId: null, name: null };
  localStorage.removeItem("auth_token");
  localStorage.removeItem("auth_role");
  localStorage.removeItem("auth_tenant_id");
  localStorage.removeItem("auth_user_id");
  localStorage.removeItem("auth_user_name");
}

export function getAuthState(): AuthState {
  return currentState;
}

export function getAuthStorage(): AuthStorage {
  return { ...storage };
}

export function isLoggedIn(): boolean {
  return !!storage.token;
}

// =============================================
// 初始化 Auth（唯一入口）
// =============================================

export async function initAuth(context?: AuthContext): Promise<AuthResult> {
  console.log(`🔐 [Auth] 當前狀態: ${currentState}`);

  // 1. 從 localStorage 載入
  loadAuthFromStorage();

  // 2. 如果已有 token，直接回傳
  if (storage.token) {
    currentState = "LOGGED_IN";
    console.log("✅ [Auth] 已有 token，直接登入");
    return {
      success: true,
      state: "LOGGED_IN",
      token: storage.token,
      role: storage.role || undefined,
      tenantId: storage.tenantId || undefined,
      userId: storage.userId || undefined,
      name: storage.name || undefined,
    };
  }

  // 3. 檢查 URL 是否有 code（OAuth 回調）
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const errorParam = url.searchParams.get("error");

  if (errorParam) {
    currentState = "ERROR";
    console.error(`❌ [Auth] LINE 授權錯誤: ${errorParam}`);
    return { success: false, state: "ERROR", error: errorParam };
  }

  if (code) {
    console.log("🔄 [Auth] 偵測到授權碼 (code)，進入 CALLBACK 模式");
    // 清除 URL 中的 code
    window.history.replaceState({}, "", window.location.pathname);

    currentState = "CALLBACK";
    const result = await handleCallback(code, context);
    if (result.success) {
      currentState = "LOGGED_IN";
    } else {
      currentState = "ERROR";
    }
    return result;
  }

  // 4. 無 token 也無 code → 需要登入
  console.log("🔐 [Auth] 無 token 無 code，準備登入");
  return await startLogin(context);
}

// =============================================
// 開始登入（觸發 LINE 授權）
// =============================================

async function startLogin(context?: AuthContext): Promise<AuthResult> {
  // 防止重複登入
  if (loginLock) {
    console.log("⏳ [Auth] 登入進行中，跳過重複請求");
    return { success: false, state: "REDIRECTING", error: "登入進行中" };
  }

  loginLock = true;
  currentState = "REDIRECTING";

  const liff = (window as any).liff;

  if (!liff) {
    loginLock = false;
    currentState = "ERROR";
    console.error("❌ [Auth] LIFF SDK 未載入");
    return { success: false, state: "ERROR", error: "LIFF SDK 未載入" };
  }

  const liffId = import.meta.env.VITE_LIFF_ID || "2010483308-6Rrz3GPm";

  return new Promise((resolve) => {
    console.log("🔐 [Auth] 初始化 LIFF...");
    liff.init(
      { liffId },
      () => {
        console.log("✅ [Auth] LIFF 初始化成功");
        if (liff.isLoggedIn()) {
          console.log("✅ [Auth] 用戶已登入 LINE，取得 idToken");
          const idToken = liff.getIDToken();
          if (idToken) {
            // 用 idToken 換 token
            handleIdToken(idToken, context).then((result) => {
              loginLock = false;
              if (result.success) {
                currentState = "LOGGED_IN";
              } else {
                currentState = "ERROR";
              }
              resolve(result);
            });
            return;
          }
        }

        // 未登入 → 觸發 LINE 登入（會跳轉到 LINE 授權頁面）
        console.log("🔐 [Auth] 觸發 LINE 登入...");
        // 使用 redirectUri 確保回到正確頁面
        const redirectUri = context?.redirectUri || window.location.origin + "/";
        liff.login({ redirectUri });
        loginLock = false;
        currentState = "REDIRECTING";
        resolve({
          success: false,
          state: "REDIRECTING",
          error: "正在跳轉至 LINE 授權頁面",
        });
      },
      (err: any) => {
        console.error("❌ [Auth] LIFF 初始化失敗:", err);
        loginLock = false;
        currentState = "ERROR";
        resolve({ success: false, state: "ERROR", error: err.message });
      }
    );
  });
}

// =============================================
// 處理 idToken（直接登入）
// =============================================

async function handleIdToken(idToken: string, context?: AuthContext): Promise<AuthResult> {
  try {
    console.log("🔐 [Auth] 發送 idToken 到後端...");
    const res = await fetch("/api/auth/line", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id_token: idToken,
        role: context?.role,
        tenant_id: context?.tenantId,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "登入失敗");

    saveAuthToStorage({
      token: data.data.token,
      role: data.data.user?.role || "patient",
      tenantId: data.data.user?.tenant_id || null,
      userId: data.data.user?.id || null,
      name: data.data.user?.name || "使用者",
    });

    console.log("✅ [Auth] 登入成功");
    return {
      success: true,
      state: "LOGGED_IN",
      token: data.data.token,
      role: data.data.user?.role || "patient",
      tenantId: data.data.user?.tenant_id,
      userId: data.data.user?.id,
      name: data.data.user?.name,
    };
  } catch (err: any) {
    console.error("❌ [Auth] idToken 處理失敗:", err);
    return { success: false, state: "ERROR", error: err.message };
  }
}

// =============================================
// 處理 OAuth 回調（code → token）
// =============================================

async function handleCallback(code: string, context?: AuthContext): Promise<AuthResult> {
  try {
    console.log("🔄 [Auth] 用 code 換取 token...");
    const res = await fetch("/api/auth/line/callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        redirect_uri: context?.redirectUri || window.location.origin + "/",
        role: context?.role,
        tenant_id: context?.tenantId,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "換取 token 失敗");

    saveAuthToStorage({
      token: data.data.token,
      role: data.data.user?.role || "patient",
      tenantId: data.data.user?.tenant_id || null,
      userId: data.data.user?.id || null,
      name: data.data.user?.name || "使用者",
    });

    console.log("✅ [Auth] callback 處理成功");
    return {
      success: true,
      state: "LOGGED_IN",
      token: data.data.token,
      role: data.data.user?.role || "patient",
      tenantId: data.data.user?.tenant_id,
      userId: data.data.user?.id,
      name: data.data.user?.name,
    };
  } catch (err: any) {
    console.error("❌ [Auth] callback 處理失敗:", err);
    return { success: false, state: "ERROR", error: err.message };
  }
}

// =============================================
// 登出
// =============================================

export function logout(): void {
  clearAuth();
  currentState = "INIT";
  loginLock = false;
  console.log("👋 [Auth] 已登出");
}
