// packages/shared/src/tenant/tenantCode.ts

/**
 * 產生新的 public_code（格式：clinic_{8碼隨機}_{YYMMDD}）
 */
export function generatePublicCode(): string {
  const random = Math.random().toString(36).substring(2, 10);
  const date = new Date();
  const yy = String(date.getFullYear()).slice(2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `clinic_${random}_${yy}${mm}${dd}`;
}

/**
 * 驗證 public_code 格式（僅基本檢查）
 */
export function isValidPublicCode(code: string): boolean {
  return /^clinic_[a-z0-9]{8}_[0-9]{6}$/.test(code);
}